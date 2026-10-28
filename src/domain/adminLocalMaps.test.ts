import { describe, expect, it } from 'vitest';
import {
  validateLocalContext, validateLocalGeometry, localContextDescendants,
  isLocalCoordinateInBounds, type LocalMapContext,
} from './adminLocalMaps';
import { parseLocalContext, AdminLocalMapError } from '../infrastructure/supabase/adminLocalMapRepository';

const context:LocalMapContext={
  id:'map-test',slug:'test',name:'Mapa sintético',parentId:null,
  width:2048,height:1582,publicationStatus:'draft',
  imageUri:null,loadingStrategy:null,sourceUrl:null,rightsHolder:null,
  attribution:null,licenseNotes:null,updatedAt:'2026-10-28T10:00:00Z',
};
const draft=()=>({...context});
describe('MAP-078 context validation',()=>{
  it('accepts a global map with no image and no provenance',()=>{
    expect(validateLocalContext(draft(),null,[],false)).toEqual({});
  });
  it('requires real provenance for either image strategy',()=>{
    const invalid={...draft(),imageUri:'/map.png',loadingStrategy:'bundled' as const};
    const errors=validateLocalContext(invalid,null,[],false);
    expect(errors.sourceUrl).toBeTruthy();expect(errors.rightsHolder).toBeTruthy();
    expect(errors.licenseNotes).toBeTruthy();
    const valid={...invalid,sourceUrl:'https://example.org/source',rightsHolder:'Test Rights',
      licenseNotes:'Synthetic test-only rights note'};
    expect(validateLocalContext(valid,null,[],false)).toEqual({});
    expect(validateLocalContext({...valid,loadingStrategy:'remote'},null,[],false)).toEqual({});
    expect(validateLocalContext({...valid,imageUri:null},null,[],false).loadingStrategy).toBeTruthy();
  });
  it('refuses to edit stable ID/slug',()=>{
    expect(validateLocalContext({...draft(),slug:'changed'},context,[context],false).id).toBeTruthy();
    expect(validateLocalContext({...draft(),id:'changed'},context,[context],false).id).toBeTruthy();
    expect(validateLocalContext({...draft(),id:'NOT VALID'},null,[],false).id).toBeTruthy();
  });
  it('prevents a resize with placements but permits it without placements',()=>{
    const resized={...draft(),width:1600};
    expect(validateLocalContext(resized,context,[context],true).width).toBeTruthy();
    expect(validateLocalContext(resized,context,[context],false)).toEqual({});
  });
  it('prevents self-parent, ancestor cycles and unpublished parents',()=>{
    const child={...context,id:'map-child',slug:'child',parentId:'map-test'};
    expect(validateLocalContext({...draft(),parentId:context.id},context,[context],false).parentId).toBeTruthy();
    expect(localContextDescendants([context,child],context.id).has('map-child')).toBe(true);
    expect(validateLocalContext({...draft(),parentId:child.id},context,[context,child],false).parentId).toBeTruthy();
    expect(validateLocalContext({...draft(),publicationStatus:'published',parentId:child.id},null,[child],false).parentId).toBeTruthy();
  });
  it('disallows archival with published descendants',()=>{
    const published={...context,publicationStatus:'published' as const};
    const child={...published,id:'map-child',slug:'child',parentId:context.id};
    expect(validateLocalContext({...published,publicationStatus:'archived'},published,[published,child],false).publicationStatus).toBeTruthy();
  });
});
describe('MAP-078 CRS.Simple geometry',()=>{
  it('checks bounds against chosen map dimensions rather than Faerun',()=>{
    expect(isLocalCoordinateInBounds(2048,1582,context)).toBe(true);
    expect(isLocalCoordinateInBounds(2049,100,context)).toBe(false);
    expect(()=>validateLocalGeometry({kind:'point',coordinates:{x:2049,y:10}},'character',context)).toThrow();
    expect(validateLocalGeometry({kind:'point',coordinates:{x:2048,y:1582}},'character',context)).toEqual({
      kind:'point',coordinates:{x:2048,y:1582},
    });
  });
  it.each(['character','mission','hazard','location'] as const)('accepts %s point',entityType=>{
    expect(validateLocalGeometry({kind:'point',coordinates:{x:123,y:456}},entityType,context).kind).toBe('point');
  });
  it('accepts location polygon and rejects non-location polygons',()=>{
    const polygon={kind:'polygon',vertices:[{x:0,y:0},{x:200,y:0},{x:100,y:100}]};
    expect(validateLocalGeometry(polygon,'location',context).kind).toBe('polygon');
    for(const entityType of ['character','mission','hazard'] as const)
      expect(()=>validateLocalGeometry(polygon,entityType,context)).toThrow();
  });
  it('rejects organizations, self-crossings and out of bounds',()=>{
    expect(()=>validateLocalGeometry({kind:'point',coordinates:{x:1,y:1}},'organization',context)).toThrow();
    expect(()=>validateLocalGeometry({kind:'polygon',vertices:[
      {x:0,y:0},{x:200,y:200},{x:200,y:0},{x:0,y:200},
    ]},'location',context)).toThrow();
    expect(()=>validateLocalGeometry({kind:'polygon',vertices:[
      {x:0,y:0},{x:200,y:0},{x:0,y:1583},
    ]},'location',context)).toThrow();
  });
  it('supports maps larger than the world map',()=>{
    const large={width:7000,height:9000};
    expect(validateLocalGeometry({kind:'point',coordinates:{x:6500,y:8000}},'mission',large)).toEqual({
      kind:'point',coordinates:{x:6500,y:8000}
    });
  });
});
describe('MAP-078 Supabase row mapping',()=>{
  it('maps Neverwinter with no image',()=>{
    const parsed=parseLocalContext({
      id:'map-neverwinter',slug:'neverwinter',name:'Neverwinter',parent_id:null,
      width:2048,height:1582,publication_status:'published',image_uri:null,loading_strategy:null,
      source_url:null,rights_holder:null,attribution:null,
      license_notes:'RIGHTS_METADATA_PENDING',updated_at:'2026-10-28T10:00:00Z'
    });
    expect(parsed.imageUri).toBeNull();
    expect(parsed.loadingStrategy).toBeNull();
    expect(parsed.licenseNotes).toContain('RIGHTS_METADATA_PENDING');
  });
  it('refuses unknown strategy and malformed dimensions',()=>{
    const row={
      id:'map-x',slug:'x',name:'X',parent_id:null,width:2048,height:1582,
      publication_status:'draft',image_uri:null,loading_strategy:'tiled',
      source_url:null,rights_holder:null,attribution:null,license_notes:null,updated_at:'2026-10-28'
    };
    expect(()=>parseLocalContext(row)).toThrow(AdminLocalMapError);
    expect(()=>parseLocalContext({...row,loading_strategy:null,width:Infinity})).toThrow(AdminLocalMapError);
  });
});
