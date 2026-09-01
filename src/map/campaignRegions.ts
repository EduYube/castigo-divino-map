import L, { type Map as LeafletMap, type Polygon } from 'leaflet';

import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import '../styles/campaign-regions.css';

export type RegionMatchingSemantics = 'search-and-filters' | 'filters-only';
export type AtlasRegionMarkerModel = AtlasPinMarkerModel & {
  readonly mapPresentation: Extract<
    AtlasPinMarkerModel['mapPresentation'],
    { readonly kind: 'polygon' }
  >;
};

export interface CampaignRegionController {
  setRegions(regions: readonly AtlasRegionMarkerModel[]): void;
  setActiveRegion(regionId: string | null): void;
  setMatchingRegions(regionIds: ReadonlySet<string>, semantics?: RegionMatchingSemantics): void;
  locateRegion(regionId: string, label?: string): boolean;
  announceRegion(regionId: string, message: string): void;
  clearAnnouncement(validRegionIds?: ReadonlySet<string>): void;
  focusRegion(regionId: string): void;
  destroy(): void;
}

export interface CampaignRegionOptions {
  readonly regions?: readonly AtlasRegionMarkerModel[];
  readonly onActivate?: (region: AtlasRegionMarkerModel) => void;
}

interface RenderedRegion {
  readonly model: AtlasRegionMarkerModel;
  readonly polygon: Polygon;
  keydown?: (event: KeyboardEvent) => void;
}

interface RegionAnnouncement {
  readonly regionId: string;
  readonly message: string;
}

const REGION_PANE = 'campaignRegionsPane';

function ensureRegionPane(map: LeafletMap): void {
  const pane = map.getPane(REGION_PANE) ?? map.createPane(REGION_PANE);
  pane.classList.add('campaign-regions-pane');
  // Raster/image overlays live at 400; MAP-041 search focus is 450 and markers at 600.
  pane.style.zIndex = '430';
  pane.style.pointerEvents = 'auto';
}

function regionBounds(region: AtlasRegionMarkerModel): L.LatLngBounds {
  const { bounds } = region.mapPresentation;
  return L.latLngBounds([bounds.minY, bounds.minX], [bounds.maxY, bounds.maxX]);
}

function polygonLatLngs(region: AtlasRegionMarkerModel): L.LatLng[] {
  return region.mapPresentation.vertices.map(([lat, lng]) => L.latLng(lat, lng));
}

function polygonElement(polygon: Polygon): HTMLElement | null {
  return polygon.getElement() as HTMLElement | null;
}

export function mountCampaignRegions(
  root: ParentNode,
  map: LeafletMap,
  options: CampaignRegionOptions = {},
): CampaignRegionController {
  ensureRegionPane(map);

  const rendered = new Map<string, RenderedRegion>();
  let regions = options.regions ?? [];
  let activeRegionId: string | null = null;
  let matchingRegionIds = new Set(regions.map(({ id }) => id));
  let matchingSemantics: RegionMatchingSemantics = 'search-and-filters';
  let announcedStatus: RegionAnnouncement | null = null;
  let destroyed = false;

  const announceRegion = (regionId: string, message: string): void => {
    const status = root.querySelector<HTMLElement>('[data-map-search-status]');
    if (!status) return;
    status.textContent = message;
    announcedStatus = { regionId, message };
  };

  const clearAnnouncement = (validRegionIds?: ReadonlySet<string>): void => {
    const announcement = announcedStatus;
    if (!announcement) return;
    if (validRegionIds?.has(announcement.regionId)) return;

    const status = root.querySelector<HTMLElement>('[data-map-search-status]');
    // Do not erase a newer public/point announcement that replaced the region message.
    if (status?.textContent === announcement.message) status.textContent = '';
    announcedStatus = null;
  };

  const describeMatching = (matches: boolean): string => {
    if (matchingSemantics === 'filters-only') {
      return matches
        ? 'Disponible con los filtros explícitos actuales.'
        : 'No coincide con los filtros explícitos actuales, pero sigue disponible.';
    }
    return matches
      ? 'Coincide con la búsqueda y los filtros aplicables.'
      : 'No coincide con la búsqueda y los filtros actuales, pero sigue disponible.';
  };

  const updatePresentation = (entry: RenderedRegion): void => {
    const element = polygonElement(entry.polygon);
    if (!element) return;
    const active = entry.model.id === activeRegionId;
    const matches = matchingRegionIds.has(entry.model.id);
    element.classList.toggle('campaign-region--active', active);
    element.classList.toggle('campaign-region--dimmed', !matches);
    element.dataset.regionId = entry.model.id;
    if (entry.model.entityId) element.dataset.regionEntityId = entry.model.entityId;
    element.dataset.regionMatch = String(matches);
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-keyshortcuts', 'Enter Space');
    element.setAttribute('aria-pressed', String(active));
    element.setAttribute(
      'aria-label',
      `${entry.model.name}. Región de campaña. Categoría: ${entry.model.categoryName}. ${describeMatching(matches)} Pulsa Intro o Espacio para abrir su ficha.`,
    );
  };

  const removeRendered = (): void => {
    for (const entry of rendered.values()) {
      const element = polygonElement(entry.polygon);
      if (element && entry.keydown) element.removeEventListener('keydown', entry.keydown);
      entry.polygon.removeFrom(map);
    }
    rendered.clear();
  };

  const render = (): void => {
    removeRendered();
    if (destroyed) return;

    for (const model of regions) {
      const polygon = L.polygon(polygonLatLngs(model), {
        pane: REGION_PANE,
        className: 'campaign-region',
        interactive: true,
        bubblingMouseEvents: false,
        stroke: true,
        weight: 3,
        opacity: 0.92,
        dashArray: '12 6',
        lineCap: 'round',
        lineJoin: 'round',
        fill: true,
        fillOpacity: 0.045,
      });
      const entry: RenderedRegion = { model, polygon };
      polygon.on('click', () => options.onActivate?.(model));
      polygon.on('add', () => {
        const element = polygonElement(polygon);
        if (!element) return;
        const keydown = (event: KeyboardEvent): void => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          options.onActivate?.(model);
        };
        entry.keydown = keydown;
        element.addEventListener('keydown', keydown);
        updatePresentation(entry);
      });
      polygon.addTo(map);
      rendered.set(model.id, entry);
      updatePresentation(entry);
    }
  };

  render();

  return {
    setRegions(nextRegions): void {
      const previousIds = new Set(regions.map(({ id }) => id));
      regions = nextRegions;
      const validIds = new Set(regions.map(({ id }) => id));
      if (activeRegionId && !validIds.has(activeRegionId)) activeRegionId = null;
      matchingRegionIds = new Set(
        regions
          .map(({ id }) => id)
          .filter((regionId) => !previousIds.has(regionId) || matchingRegionIds.has(regionId)),
      );
      render();
    },
    setActiveRegion(regionId): void {
      activeRegionId = regionId;
      for (const entry of rendered.values()) updatePresentation(entry);
    },
    setMatchingRegions(regionIds, semantics = 'search-and-filters'): void {
      matchingRegionIds = new Set(regionIds);
      matchingSemantics = semantics;
      for (const entry of rendered.values()) updatePresentation(entry);
    },
    locateRegion(regionId, label): boolean {
      const entry = rendered.get(regionId);
      if (!entry) return false;
      map.fitBounds(regionBounds(entry.model), {
        animate: false,
        padding: [24, 24],
        maxZoom: map.getMaxZoom(),
      });
      const container = map.getContainer();
      const { bounds } = entry.model.mapPresentation;
      container.dataset.regionFocusBounds = [
        bounds.minX,
        bounds.maxX,
        bounds.minY,
        bounds.maxY,
      ].join(',');
      announceRegion(
        regionId,
        `Mapa encuadrado en ${label ?? entry.model.name}; región de campaña.`,
      );
      return true;
    },
    announceRegion,
    clearAnnouncement,
    focusRegion(regionId): void {
      const entry = rendered.get(regionId);
      if (!entry) return;
      polygonElement(entry.polygon)?.focus({ preventScroll: true });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearAnnouncement();
      removeRendered();
      map.getPane(REGION_PANE)?.remove();
      delete map.getContainer().dataset.regionFocusBounds;
    },
  };
}
