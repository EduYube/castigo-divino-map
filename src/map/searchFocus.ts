import L, { type Layer, type Map as LeafletMap } from 'leaflet';

import type { PublicCoordinate, PublicSearchExtent } from '../data/beta02-model';
import { FAERUN_COORDINATE_BOUNDS } from '../domain/mapCoordinates';

export interface MapSearchTarget {
  readonly coordinates: PublicCoordinate;
  readonly searchExtent: PublicSearchExtent | null;
  readonly recommendedZoom: number | null;
  readonly label: string;
}

interface SearchFocusState {
  highlight: Layer | null;
  timeoutId: number | null;
  metadataElement: HTMLElement | null;
}

const SEARCH_HIGHLIGHT_DURATION_MS = 3000;
const SEARCH_FOCUS_PANE = 'searchFocusPane';
const stateByMap = new WeakMap<LeafletMap, SearchFocusState>();

function stateFor(map: LeafletMap): SearchFocusState {
  const existing = stateByMap.get(map);
  if (existing) return existing;
  const state: SearchFocusState = {
    highlight: null,
    timeoutId: null,
    metadataElement: null,
  };
  stateByMap.set(map, state);
  return state;
}

function ensureSearchFocusPane(map: LeafletMap): void {
  const pane = map.getPane(SEARCH_FOCUS_PANE) ?? map.createPane(SEARCH_FOCUS_PANE);
  pane.classList.add('geographic-search-area-pane', 'geographic-search-focus-pane');
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

function setHighlightElementAccessibility(layer: L.Path): void {
  const element = layer.getElement();
  if (!element) return;
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('focusable', 'false');
  element.removeAttribute('tabindex');
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

function metadataElement(map: LeafletMap, root: ParentNode): HTMLElement {
  return root.querySelector<HTMLElement>('[data-map-shell]') ?? map.getContainer();
}

function showPointFocus(map: LeafletMap, root: ParentNode, target: MapSearchTarget): void {
  ensureSearchFocusPane(map);
  const coordinate = L.latLng(target.coordinates.y, target.coordinates.x);
  const ring = L.circleMarker(coordinate, {
    pane: SEARCH_FOCUS_PANE,
    className: 'geographic-search-highlight',
    interactive: false,
    bubblingMouseEvents: false,
    radius: 24,
    stroke: true,
    weight: 4,
    opacity: 0.96,
    dashArray: '8 6',
    fill: false,
  }).addTo(map);
  setHighlightElementAccessibility(ring);

  const state = stateFor(map);
  state.highlight = ring;
  state.metadataElement = metadataElement(map, root);
  state.metadataElement.dataset.searchHighlight = 'true';
  state.metadataElement.dataset.searchHighlightKind = 'point';
  state.metadataElement.dataset.searchHighlightLabel = target.label;
  announce(root, `Mapa centrado en ${target.label}; posición resaltada.`);
  scheduleClear(map);
}

function showAreaFocus(map: LeafletMap, root: ParentNode, target: MapSearchTarget): void {
  const extent = target.searchExtent;
  if (!extent) return;

  ensureSearchFocusPane(map);
  const rectangle = L.rectangle(extentBounds(extent), {
    pane: SEARCH_FOCUS_PANE,
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
  setHighlightElementAccessibility(rectangle);

  const state = stateFor(map);
  state.highlight = rectangle;
  state.metadataElement = metadataElement(map, root);

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
  const fallbackZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), map.getMinZoom() + 1));
  const targetZoom =
    target.recommendedZoom === null
      ? fallbackZoom
      : Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), target.recommendedZoom));

  map.setView(coordinate, targetZoom, { animate: false });
  map.panInsideBounds(rasterBounds(), { animate: false });
  showPointFocus(map, root, target);
}

export function clearMapSearchFocus(map: LeafletMap): void {
  clearSearchFocus(map);
}
