import L, { type Layer, type Map as LeafletMap } from 'leaflet';

import type { PublicSearchExtent } from '../data/beta02-model';
import { FAERUN_COORDINATE_BOUNDS } from '../domain/mapCoordinates';

export interface MapSearchTarget {
  readonly searchExtent: PublicSearchExtent | null;
  readonly label: string;
}

interface SearchFocusState {
  highlight: Layer | null;
  timeoutId: number | null;
  metadataElement: HTMLElement | null;
}

const SEARCH_HIGHLIGHT_DURATION_MS = 3000;
const SEARCH_AREA_PANE = 'searchFocusPane';
const stateByMap = new WeakMap<LeafletMap, SearchFocusState>();

function stateFor(map: LeafletMap): SearchFocusState {
  const existing = stateByMap.get(map);
  if (existing) return existing;
  const state: SearchFocusState = { highlight: null, timeoutId: null, metadataElement: null };
  stateByMap.set(map, state);
  return state;
}

function ensureSearchAreaPane(map: LeafletMap): void {
  const pane = map.getPane(SEARCH_AREA_PANE) ?? map.createPane(SEARCH_AREA_PANE);
  pane.classList.add('geographic-search-area-pane');
  pane.style.zIndex = '450';
  pane.style.pointerEvents = 'none';
}

function rasterBounds(): L.LatLngBounds {
  return L.latLngBounds(
    [FAERUN_COORDINATE_BOUNDS.minY, FAERUN_COORDINATE_BOUNDS.minX],
    [FAERUN_COORDINATE_BOUNDS.maxY, FAERUN_COORDINATE_BOUNDS.maxX],
  );
}

function extentBounds(extent: PublicSearchExtent): L.LatLngBounds {
  return L.latLngBounds([extent.minY, extent.minX], [extent.maxY, extent.maxX]);
}

function clearMetadata(element: HTMLElement | null): void {
  if (!element) return;
  delete element.dataset.searchHighlight;
  delete element.dataset.searchHighlightKind;
  delete element.dataset.searchHighlightLabel;
  delete element.dataset.searchHighlightBounds;
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

  clearMetadata(state.metadataElement);
  clearMetadata(map.getContainer());
  state.metadataElement = null;
}

function scheduleClear(map: LeafletMap): void {
  const state = stateFor(map);
  state.timeoutId = window.setTimeout(() => clearSearchFocus(map), SEARCH_HIGHLIGHT_DURATION_MS);
}

function announce(root: ParentNode, message: string): void {
  const status = root.querySelector<HTMLElement>('[data-map-search-status]');
  if (status) status.textContent = message;
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

  const state = stateFor(map);
  state.highlight = rectangle;
  state.metadataElement =
    root.querySelector<HTMLElement>('[data-map-shell]') ?? map.getContainer();

  state.metadataElement.dataset.searchHighlight = 'true';
  state.metadataElement.dataset.searchHighlightKind = 'area';
  state.metadataElement.dataset.searchHighlightLabel = target.label;
  state.metadataElement.dataset.searchHighlightBounds = [
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
  if (!target.searchExtent) return;

  map.fitBounds(extentBounds(target.searchExtent), {
    animate: false,
    padding: [24, 24],
    maxZoom: map.getMaxZoom(),
  });
  map.panInsideBounds(rasterBounds(), { animate: false });
  showAreaFocus(map, root, target);
}

export function clearMapSearchFocus(map: LeafletMap): void {
  clearSearchFocus(map);
}
