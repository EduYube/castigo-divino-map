import L, {type Map as LeafletMap, type Marker} from 'leaflet';
import type {PublicCatalogSnapshotV2,EntityId} from '../data/beta02-model';
import type {AtlasPinMarkerModel} from '../data/pinMarkers';
import {createAtlasPinMarkerModels} from '../data/pinMarkers';
import type {CampaignCatalog} from '../data/model';
import {ALL_MAP_LAYER_STATE, filterAtlasMarkersByLayers, type MapLayerState} from '../domain/mapLayers';
import {createSinglePinIcon} from '../map/leafletBase';
import {mountCampaignRegions,type CampaignRegionController,type AtlasRegionMarkerModel} from '../map/campaignRegions';
import type {LocalMapContext} from './localMapNavigation';
import {
  EMPTY_PUBLIC_LOCAL_DATA,
  mergePublicLocalCatalog,
  projectPublicLocalSurface,
  SupabasePublicLocalMapRepository,
  type PublicLocalMapData,
} from '../infrastructure/supabase/publicLocalMapRepository';

const EMPTY_LEGACY:CampaignCatalog={categories:[],tags:[],places:[],notes:[]};
const REQUEST_TIMEOUT_MS=14000;
const RETRY_DELAY_MS=700;

export interface PublicLocalMapRuntime {
  update(campaignId:string|null,world:PublicCatalogSnapshotV2|null,backendState:string):void;
  setAuthorizedContexts(contexts:readonly LocalMapContext[]):void;
  setSurface(context:LocalMapContext|null,map:LeafletMap|null):void;
  setLayers(layers:MapLayerState):void;
  getSearchCatalog(world:PublicCatalogSnapshotV2|null):PublicCatalogSnapshotV2|null;
  getLocalOnlyIds():ReadonlySet<EntityId>;
  getContextsForEntity(id:EntityId):readonly {slug:string;name:string;id:string}[];
  hasPlacementInActiveContext(id:EntityId):boolean;
  focusEntity(id:EntityId):boolean;
  getCurrentSurfaceCatalog():PublicCatalogSnapshotV2|null;
  purge():void;
}

export interface PublicLocalMapRuntimeOptions {
  readonly onDataChange:()=>void;
  readonly onPinActivate:(pin:AtlasPinMarkerModel)=>void;
  readonly onSurfaceClosed:()=>void;
}

export function mountPublicLocalMapRuntime(
  root:ParentNode,
  options:PublicLocalMapRuntimeOptions,
):PublicLocalMapRuntime {
  const test=import.meta.env.DEV?window.__MAP016_PUBLIC_DATA_TEST_CONFIG__:undefined;
  let repository:SupabasePublicLocalMapRepository|null=null;
  try {
    repository=new SupabasePublicLocalMapRepository({
      projectUrl:test?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '',
      publishableKey:test?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      allowLocalProject:import.meta.env.DEV,
    });
  } catch {
    // The remote public reader is authoritative. No local results without it.
  }
  let campaignId:string|null=null;
  let world:PublicCatalogSnapshotV2|null=null;
  let backendState='checking';
  let localData:PublicLocalMapData|null=null;
  let authorizedContexts:readonly LocalMapContext[]=[];
  let generation=0;
  let controller:AbortController|null=null;
  let surface:{context:LocalMapContext;map:LeafletMap}|null=null;
  let surfaceCatalog:PublicCatalogSnapshotV2|null=null;
  let layerState:MapLayerState=ALL_MAP_LAYER_STATE;
  let pointLayer:L.LayerGroup|null=null;
  let regionLayer:CampaignRegionController|null=null;
  let pointMarkers=new Map<EntityId,Marker>();
  let activeId:EntityId|null=null;

  const clearMap=():void=>{
    regionLayer?.destroy();
    regionLayer=null;
    pointLayer?.clearLayers();
    pointLayer?.remove();
    pointLayer=null;
    pointMarkers=new Map();
    surfaceCatalog=null;
    activeId=null;
  };

  const render=():void=>{
    clearMap();
    const current=surface;
    const data=localData;
    if(!current||!data||!world||data.campaignId!==campaignId||
       backendState!=='connected')return;
    if(!data.contexts.some(({id})=>id===current.context.id))return;
    const projected=projectPublicLocalSurface(world,data,current.context.id);
    surfaceCatalog=projected;
    const models=filterAtlasMarkersByLayers(
      createAtlasPinMarkerModels(EMPTY_LEGACY,projected),layerState,
    );
    const points=models.filter((pin)=>pin.mapPresentation?.kind!=='polygon');
    const polygons=models.filter((pin):pin is AtlasRegionMarkerModel=>
      pin.mapPresentation?.kind==='polygon');
    const group=L.layerGroup().addTo(current.map);
    pointLayer=group;
    // Exact overlaps are represented by one operable marker with an accessible
    // choice list rather than inaccessible stacked Leaflet controls.
    const groups=new Map<string,AtlasPinMarkerModel[]>();
    for(const pin of points){
      const key=pin.coordinate.join(',');
      const members=groups.get(key)??[];
      members.push(pin);
      groups.set(key,members);
    }
    for(const pins of groups.values()){
      const first=pins[0]!;
      const overlapping=pins.length>1;
      const icon=overlapping
        ? L.divIcon({
            className:'campaign-marker-icon campaign-marker-icon--cluster',
            html:'<span class="pin-visual pin-visual--cluster"><span class="pin-visual__type-symbol" aria-hidden="true"></span><span class="pin-visual__count" aria-hidden="true">'+pins.length+'</span></span>',
            iconSize:[44,44],iconAnchor:[22,22],
          })
        : createSinglePinIcon(first);
      const marker=L.marker(L.latLng(first.coordinate[0],first.coordinate[1]),{icon,keyboard:true,bubblingMouseEvents:false,
        title:overlapping?pins.length+' pines agrupados':first.name});
      marker.on('click',()=>{
        if(!overlapping){
          activeId=first.entityId;
          options.onPinActivate(first);
          return;
        }
        const panel=document.createElement('div');
        panel.className='local-map-pin-choices';
        const heading=document.createElement('p');
        heading.textContent=pins.length+' entidades en la misma posición';
        panel.append(heading);
        for(const pin of pins){
          const button=document.createElement('button');
          button.type='button';
          button.textContent=pin.name;
          button.addEventListener('click',()=>{
            current.map.closePopup();
            activeId=pin.entityId;
            options.onPinActivate(pin);
          });
          panel.append(button);
        }
        L.popup({autoClose:true,closeButton:true}).setLatLng(L.latLng(first.coordinate[0],first.coordinate[1]))
          .setContent(panel).openOn(current.map);
      });
      marker.on('add',()=>{
        const element=marker.getElement();
        if(!element)return;
        element.dataset.markerLat=String(first.coordinate[0]);
        element.dataset.markerLng=String(first.coordinate[1]);
        if(!overlapping&&first.entityId)element.dataset.entityId=first.entityId;
        element.setAttribute('aria-label',overlapping
          ? pins.length+' entidades agrupadas. Pulsa Intro para elegir.'
          : first.name+', pin en '+current.context.name+'. Pulsa Intro para abrir su ficha.');
      });
      group.addLayer(marker);
      for(const pin of pins){if(pin.entityId)pointMarkers.set(pin.entityId,marker);}
    }
    regionLayer=mountCampaignRegions(root,current.map,{
      regions:polygons,
      onActivate(pin){
        activeId=pin.entityId;
        regionLayer?.setActiveRegion(pin.id);
        options.onPinActivate(pin);
      },
    });
    // Retain the surface CRS and its local image-space bounds unchanged.
  };

  const purge=():void=>{
    controller?.abort();
    controller=null;
    generation+=1;
    localData=null;
    clearMap();
    options.onDataChange();
  };

  const fetchLocal=():void=>{
    controller?.abort();
    controller=null;
    generation+=1;
    const currentGeneration=generation;
    localData=null;
    clearMap();
    options.onDataChange();
    if(!campaignId||!world||backendState!=='connected'||!repository)return;
    if(authorizedContexts.length===0){
      localData=EMPTY_PUBLIC_LOCAL_DATA(campaignId);
      options.onDataChange();
      return;
    }
    const request=new AbortController();
    controller=request;
    const timeout=window.setTimeout(()=>request.abort(),REQUEST_TIMEOUT_MS);
    const attempt=async(retry:boolean):Promise<void>=>{
      try{
        const data=await repository!.load({
          campaignId:campaignId!,signal:request.signal,authorizedContexts,
        });
        if(request.signal.aborted||currentGeneration!==generation||
           data.campaignId!==campaignId||backendState!=='connected')return;
        localData=data;
        controller=null;
        render();
        options.onDataChange();
      }catch{
        if(request.signal.aborted||currentGeneration!==generation)return;
        if(retry&&navigator.onLine){
          await new Promise<void>((resolve)=>window.setTimeout(resolve,RETRY_DELAY_MS));
          if(!request.signal.aborted&&currentGeneration===generation)await attempt(false);
          return;
        }
        // Fail closed: the world snapshot remains operational, local data does not.
        controller=null;
        localData=null;
        clearMap();
        options.onDataChange();
      }finally{
        if(currentGeneration===generation && (localData !== null || !retry)) {
          window.clearTimeout(timeout);
        }
      }
    };
    void attempt(true);
  };

  window.addEventListener('atlas:campaign-will-change',()=>{
    purge();
    surface=null;
    options.onSurfaceClosed();
  });
  window.addEventListener('atlas:public-data-status',(event)=>{
    const next=(event as CustomEvent<{backendState?:string}>).detail?.backendState;
    if(next==='degraded'||next==='offline'){
      backendState=next;
      purge();
      options.onSurfaceClosed();
    }
    if(next==='connected'&&backendState!=='connected'){
      backendState='connected';
      fetchLocal();
    }
  });

  return {
    setAuthorizedContexts(contexts):void{
      authorizedContexts=contexts;
      fetchLocal();
    },
    update(nextCampaign,nextWorld,nextBackend):void{
      const changed=campaignId!==nextCampaign||world!==nextWorld||
        (backendState!=='connected'&&nextBackend==='connected')||
        (backendState==='connected'&&nextBackend!=='connected');
      campaignId=nextCampaign;
      world=nextWorld;
      backendState=nextBackend;
      if(changed)fetchLocal();
    },
    setSurface(context,map):void{
      const changing=surface?.context.id!==context?.id || surface?.map!==map;
      clearMap();
      surface=context&&map?{context,map}:null;
      if(changing&&surface===null)options.onSurfaceClosed();
      render();
    },
    setLayers(next):void{layerState=next;render();},
    getSearchCatalog(currentWorld):PublicCatalogSnapshotV2|null{
      if(!currentWorld)return null;
      return localData&&localData.campaignId===campaignId&&backendState==='connected'
        ? mergePublicLocalCatalog(currentWorld,localData):currentWorld;
    },
    getLocalOnlyIds():ReadonlySet<EntityId>{
      return new Set(localData?.localOnlyEntities.map(({id})=>id)??[]);
    },
    getContextsForEntity(id):readonly {slug:string;name:string;id:string}[]{
      if(!localData||backendState!=='connected')return [];
      const ids=new Set(localData.placements
        .filter((placement)=>placement.entityId===id).map(({contextId})=>contextId));
      return localData.contexts.filter((context)=>ids.has(context.id))
        .map(({id,slug,name})=>({id,slug,name}));
    },
    hasPlacementInActiveContext(id):boolean{
      return Boolean(surface&&localData?.placements.some(
        (placement)=>placement.entityId===id&&placement.contextId===surface?.context.id,
      ));
    },
    focusEntity(id):boolean{
      if(!surface||!surfaceCatalog)return false;
      const marker=pointMarkers.get(id);
      if(marker){
        surface.map.panTo(marker.getLatLng(),{animate:false});
        marker.getElement()?.focus({preventScroll:true});
        const pin=createAtlasPinMarkerModels(EMPTY_LEGACY,surfaceCatalog)
          .find(({entityId})=>entityId===id);
        if(pin){activeId=id;options.onPinActivate(pin);return true;}
      }
      const pin=createAtlasPinMarkerModels(EMPTY_LEGACY,surfaceCatalog)
        .find(({entityId})=>entityId===id&&entityTypeIsPolygon(surfaceCatalog,entityId));
      if(pin&&regionLayer){
        regionLayer.locateRegion(pin.id);
        regionLayer.focusRegion(pin.id);
        regionLayer.setActiveRegion(pin.id);
        activeId=id;
        options.onPinActivate(pin);
        return true;
      }
      return false;
    },
    getCurrentSurfaceCatalog():PublicCatalogSnapshotV2|null{return surfaceCatalog;},
    purge,
  };
}

function entityTypeIsPolygon(catalog:PublicCatalogSnapshotV2,id:EntityId):boolean{
  return catalog.entities.find((entity)=>entity.id===id)?.geometry?.kind==='polygon';
}
