import L, { type Layer, type Map as LeafletMap, type Marker } from 'leaflet';

import type { PublicCoordinate, PublicSearchExtent } from '../data/beta02-model';
import { DEFAULT_MAP_VIEW, MAP_CONFIG } from './config';

export interface MapSearchTarget {
  readonly coordinates: PublicCoordinate;
  readonly searchExtent: PublicSearchExtent | null;
  readonly recommendedZoom: number | null;
  readonly label: string;
}

interface SearchFocusState {
  highlight: Layer | null;
  timeoutId: number | null;
}

const SEARCH_HIGHLIGHT_DURATION_MS = 3000;
const SEARCH_AREA_PANE = 'searchFocusPane';
const stateByMap = new WeakMap<LeafletMap, SearchFocusState>();

function stateFor(map: LeafletMap): SearchFocusState {
  const existing = stateByMap.get(map);
  if (existing) return existing;
  const state: SearchFocusState = { highlight: null, timeoutId: null };
  stateByMap.set(map, state);
  return state;
}

function createSearchHighlightIcon(): L.DivIcon {
  return L.divIcon({
    className: 'geographic-search-highlight',
    html: '<span class="geographic-search-highlight__symbol" aria-hidden="true">◎</span>',
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

function ensureSearchAreaPane(map: LeafletMap): void {
  const pane = map.getPane(SEARCH_AREA_PANE) ?? map.createPane(SEARCH_AREA_PANE);
  pane.classList.add('geographic-search-area-pane');
  pane.style.zIndex = '450';
  pane.style.pointerEvents = 'none';
}

function rasterBounds(): L.LatLngBounds {
  return L.latLngBounds(
    [MAP_CONFIG.coordinateBounds.minY, MAP_CONFIG.coordinateBounds.minX],
    [MAP_CONFIG.coordinateBounds.maxY, MAP_CONFIG.coordinateBounds.maxX],
  );
}

function extentBounds(extent: PublicSearchExtent): L.LatLngBounds {
  return L.latLngBounds([extent.minY, extent.minX], [extent.maxY, extent.maxX]);
}

function clearSearchFocus(map: LeafletMap): void {
  const state = stateFor(map);
  if (state.timeoutId !== null) {
    window.clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
  if (state.highlight) {
    map.removeLayer(state.highlight);
    state.highlight = null;
  }

  const container = map.getContainer();
  delete container.dataset.searchHighlight;
  delete container.dataset.searchHighlightKind;
  delete container.dataset.searchHighlightLabel;
  delete container.dataset.searchHighlightBounds;
}

function scheduleClear(map: LeafletMap): void {
  const state = stateFor(map);
  state.timeoutId = window.setTimeout(() => clearSearchFocus(map), SEARCH_HIGHLIGHT_DURATION_MS);
}

function announce(root: ParentNode, message: string): void {
  const status = root.querySelector<HTMLElement>('[data-map-search-status]');
  if (status) status.textContent = message;
}

function showPointFocus(map: LeafletMap, root: ParentNode, target: MapSearchTarget): void {
  const coordinate = L.latLng(target.coordinates.y, target.coordinates.x);
  const marker: Marker = L.marker(coordinate, {
    icon: createSearchHighlightIcon(),
    interactive: false,
    keyboard: false,
    zIndexOffset: 2000,
  }).addTo(map);
  const state = stateFor(map);
  state.highlight = marker;

  const container = map.getContainer();
  container.dataset.searchHighlight = 'true';
  container.dataset.searchHighlightKind = 'point';
  container.dataset.searchHighlightLabel = target.label;
  announce(root, `Mapa centrado en ${target.label}; posición resaltada.`);
  scheduleClear(map);
}

function showAreaFocus(map: LeafletMap, root: ParentNode, target: MapSearchTarget): void {
  const extent = target.searchExtent;
  if (!extent) return;

  ensureSearchAreaPane(map);
  const rectangle = L.rectangle(extentBounds(extent), {
    pane: SEARCH_AREA_PANE,
    className: 'geographic-search-area-highlight',
    interactive: false,
    bubblingMouseEvents: false,
    stroke: true,
    weight: 3,
    opacity: 0.92,
    dashArray: '10 8',
    fill: true,
    fillOpacity: 0.08,
  }).addTo(map);
  stateFor(map).highlight = rectangle;

  const container = map.getContainer();
  container.dataset.searchHighlight = 'true';
  container.dataset.searchHighlightKind = 'area';
  container.dataset.searchHighlightLabel = target.label;
  container.dataset.searchHighlightBounds = [
    extent.minX,
    extent.maxX,
    extent.minY,
    extent.maxY,
  ].join(',');
  announce(root, `Mapa encuadrado en ${target.label}; extensión aproximada de búsqueda resaltada.`);
  scheduleClear(map);
}

export function locateMapSearchTarget(
  map: LeafletMap,
  root: ParentNode,
  target: MapSearchTarget,
): void {
  clearSearchFocus(map);

  if (target.searchExtent) {
    map.fitBounds(extentBounds(target.searchExtent), {
      animate: false,
      padding: [24, 24],
      maxZoom: map.getMaxZoom(),
    });
    map.panInsideBounds(rasterBounds(), { animate: false });
    showAreaFocus(map, root, target);
    return;
  }

  const coordinate = L.latLng(target.coordinates.y, target.coordinates.x);
  map.setView(coordinate, target.recommendedZoom ?? DEFAULT_MAP_VIEW.zoom, { animate: false });
  map.panInsideBounds(rasterBounds(), { animate: false });
  showPointFocus(map, root, target);
}

export function clearMapSearchFocus(map: LeafletMap): void {
  clearSearchFocus(map);
}
