import L, { type LatLngBounds, type Map as LeafletMap, type Marker } from 'leaflet';

import type { PlaceId } from '../data/model';
import type { PlaceMarkerModel } from '../data/placeDetails';
import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';

export type MapLoadState = 'loading' | 'ready' | 'error';

export interface MapSearchTarget {
  readonly coordinates: {
    readonly x: number;
    readonly y: number;
  };
  readonly recommendedZoom: number | null;
  readonly label: string;
}

export interface FaerunMapController {
  readonly map: LeafletMap;
  setActivePlace(placeId: PlaceId | null): void;
  setMatchingPlaces(placeIds: ReadonlySet<PlaceId>): void;
  locatePlace(placeId: PlaceId): void;
  locateSearchTarget(target: MapSearchTarget): void;
  focusMarker(placeId: PlaceId): void;
  destroy(): void;
}

export interface FaerunMapOptions {
  readonly markers?: readonly PlaceMarkerModel[];
  readonly onPlaceActivate?: (placeId: PlaceId) => void;
}

interface MapElements {
  readonly shell: HTMLElement;
  readonly canvas: HTMLElement;
  readonly status: HTMLElement;
  readonly searchStatus: HTMLElement;
}

interface MarkerDomListener {
  readonly element: HTMLElement;
  readonly handler: (event: KeyboardEvent) => void;
}

const stateMessages: Record<Exclude<MapLoadState, 'ready'>, string> = {
  loading: 'Cargando la cartografía oficial de Faerûn…',
  error:
    'No se ha podido cargar la cartografía oficial. Se muestra una superficie neutra y la navegación permanece disponible.',
};

const markerSymbols = ['◆', '▲', '●', '✦'] as const;
const SEARCH_HIGHLIGHT_DURATION_MS = 3000;

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required map element: ${selector}`);
  }

  return element;
}

function resolveMapElements(root: ParentNode): MapElements {
  return {
    shell: getRequiredElement(root, '[data-map-shell]'),
    canvas: getRequiredElement(root, '[data-map-canvas]'),
    status: getRequiredElement(root, '[data-map-status]'),
    searchStatus: getRequiredElement(root, '[data-map-search-status]'),
  };
}

function setLoadState(elements: MapElements, state: MapLoadState): void {
  elements.shell.dataset.mapState = state;
  elements.shell.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');

  if (state === 'ready') {
    elements.status.hidden = true;
    return;
  }

  elements.status.hidden = false;
  elements.status.setAttribute('role', state === 'error' ? 'alert' : 'status');
  elements.status.textContent = stateMessages[state];
}

function createLeafletBounds(): LatLngBounds {
  const [[south, west], [north, east]] = createSimpleImageBounds();

  return L.latLngBounds([south, west], [north, east]);
}

function synchronizeViewDataset(map: LeafletMap, shell: HTMLElement): void {
  const center = map.getCenter();

  shell.dataset.mapZoom = map.getZoom().toFixed(2);
  shell.dataset.mapCenter = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
}

function constrainViewport(
  map: LeafletMap,
  bounds: LatLngBounds,
  shouldKeepFullMapVisible: boolean,
): void {
  const fitZoom = Math.min(map.getBoundsZoom(bounds, false), FAERUN_MAP_CONFIG.maxZoom);

  map.setMinZoom(fitZoom);

  if (shouldKeepFullMapVisible || map.getZoom() < fitZoom) {
    map.fitBounds(bounds, { animate: false });
    return;
  }

  map.panInsideBounds(bounds, { animate: false });
}

function createMarkerIcon(marker: PlaceMarkerModel): L.DivIcon {
  const variant = marker.categoryIndex % markerSymbols.length;
  const symbol = markerSymbols[variant];

  return L.divIcon({
    className: `campaign-marker-icon campaign-marker-icon--variant-${variant}`,
    html: `<span class="campaign-marker-icon__symbol" aria-hidden="true">${symbol}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function createSearchHighlightIcon(): L.DivIcon {
  return L.divIcon({
    className: 'geographic-search-highlight',
    html: '<span class="geographic-search-highlight__symbol" aria-hidden="true">◎</span>',
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

function decorateMarkerElement(
  leafletMarker: Marker,
  marker: PlaceMarkerModel,
  activate: () => void,
  domListeners: MarkerDomListener[],
): void {
  const element = leafletMarker.getElement();

  if (!element) {
    return;
  }

  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `${marker.name}. Categoría: ${marker.categoryName}.`);
  element.setAttribute('aria-pressed', 'false');
  element.setAttribute('aria-keyshortcuts', 'Enter Space');
  element.setAttribute('data-testid', 'place-marker');
  element.dataset.placeId = marker.id;
  element.dataset.categoryId = marker.categoryId;
  element.dataset.categorySlug = marker.categorySlug;
  element.dataset.markerLat = String(marker.coordinate[0]);
  element.dataset.markerLng = String(marker.coordinate[1]);

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activate();
  };

  element.addEventListener('keydown', handleKeyDown);
  domListeners.push({ element, handler: handleKeyDown });
}

function nameZoomControls(control: L.Control.Zoom): void {
  const container = control.getContainer();

  container?.querySelectorAll<HTMLAnchorElement>('a[title]').forEach((anchor) => {
    const title = anchor.title;

    if (title) {
      anchor.setAttribute('aria-label', title);
    }
  });
}

export function mountFaerunMap(
  root: ParentNode = document,
  options: FaerunMapOptions = {},
): FaerunMapController {
  const elements = resolveMapElements(root);
  const bounds = createLeafletBounds();

  setLoadState(elements, 'loading');

  const map = L.map(elements.canvas, {
    crs: L.CRS.Simple,
    attributionControl: false,
    zoomControl: false,
    minZoom: FAERUN_MAP_CONFIG.initialMinZoom,
    maxZoom: FAERUN_MAP_CONFIG.maxZoom,
    zoomSnap: FAERUN_MAP_CONFIG.zoomSnap,
    zoomDelta: FAERUN_MAP_CONFIG.zoomDelta,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    bounceAtZoomLimits: false,
    worldCopyJump: false,
    keyboard: true,
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    wheelPxPerZoomLevel: 80,
  });

  const zoomControl = L.control
    .zoom({
      position: 'topright',
      zoomInTitle: 'Acercar',
      zoomOutTitle: 'Alejar',
    })
    .addTo(map);

  nameZoomControls(zoomControl);
  map.fitBounds(bounds, { animate: false });
  constrainViewport(map, bounds, true);

  const markerByPlaceId = new Map<PlaceId, Marker>();
  const markerModelByPlaceId = new Map<PlaceId, PlaceMarkerModel>();
  const markerClickHandlers = new Map<PlaceId, () => void>();
  const markerDomListeners: MarkerDomListener[] = [];
  let activePlaceId: PlaceId | null = null;
  let matchingPlaceIds = new Set<PlaceId>((options.markers ?? []).map(({ id }) => id));
  let searchHighlight: Marker | null = null;
  let searchHighlightTimeout: number | undefined;

  const clearSearchHighlight = (): void => {
    if (searchHighlightTimeout !== undefined) {
      window.clearTimeout(searchHighlightTimeout);
      searchHighlightTimeout = undefined;
    }

    searchHighlight?.removeFrom(map);
    searchHighlight = null;
    delete elements.shell.dataset.searchHighlight;
    delete elements.shell.dataset.searchHighlightLabel;
  };

  const showSearchHighlight = (target: MapSearchTarget): void => {
    clearSearchHighlight();
    const coordinate = L.latLng(target.coordinates.y, target.coordinates.x);

    searchHighlight = L.marker(coordinate, {
      icon: createSearchHighlightIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 2000,
    }).addTo(map);
    elements.shell.dataset.searchHighlight = 'true';
    elements.shell.dataset.searchHighlightLabel = target.label;
    elements.searchStatus.textContent = `Mapa centrado en ${target.label}. La posición está resaltada temporalmente con un símbolo circular.`;
    searchHighlightTimeout = window.setTimeout(clearSearchHighlight, SEARCH_HIGHLIGHT_DURATION_MS);
  };

  const updateMarkerPresentation = (placeId: PlaceId): void => {
    const marker = markerByPlaceId.get(placeId);
    const markerModel = markerModelByPlaceId.get(placeId);
    const element = marker?.getElement();

    if (!marker || !markerModel || !element) {
      return;
    }

    const isActive = placeId === activePlaceId;
    const isMatching = matchingPlaceIds.has(placeId);
    const accessibleState = isMatching
      ? isActive
        ? 'Lugar activo. Coincide con la búsqueda y los filtros actuales.'
        : 'Coincide con la búsqueda y los filtros actuales.'
      : isActive
        ? 'Lugar activo. No coincide con la búsqueda y los filtros actuales, pero sigue disponible.'
        : 'No coincide con la búsqueda y los filtros actuales, pero sigue disponible.';

    element.classList.toggle('campaign-marker-icon--active', isActive);
    element.classList.toggle('campaign-marker-icon--matching', isMatching);
    element.classList.toggle('campaign-marker-icon--dimmed', !isMatching);
    element.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    element.setAttribute('aria-description', accessibleState);
    element.dataset.accessibleState = accessibleState;
    element.dataset.filterMatch = isMatching ? 'true' : 'false';
    marker.setZIndexOffset(isActive ? 1000 : isMatching ? 200 : 0);
  };

  options.markers?.forEach((marker) => {
    const activate = (): void => options.onPlaceActivate?.(marker.id);
    const leafletMarker = L.marker(L.latLng(marker.coordinate[0], marker.coordinate[1]), {
      icon: createMarkerIcon(marker),
      keyboard: true,
      riseOnHover: true,
      title: `${marker.name} — ${marker.categoryName}`,
    });

    leafletMarker.on('click', activate);
    leafletMarker.on('add', () => {
      decorateMarkerElement(leafletMarker, marker, activate, markerDomListeners);
      updateMarkerPresentation(marker.id);
    });
    markerByPlaceId.set(marker.id, leafletMarker);
    markerModelByPlaceId.set(marker.id, marker);
    markerClickHandlers.set(marker.id, activate);
    leafletMarker.addTo(map);
  });

  const imageOverlay = L.imageOverlay(OFFICIAL_MAP_URL, bounds, {
    alt: 'Mapa oficial de la Costa de la Espada y el noroeste de Faerûn',
    className: 'faerun-map__image',
    interactive: false,
  });

  let destroyed = false;

  const handleImageLoad = (): void => {
    if (!destroyed) {
      setLoadState(elements, 'ready');
    }
  };

  const handleImageError = (): void => {
    if (destroyed) {
      return;
    }

    imageOverlay.removeFrom(map);
    setLoadState(elements, 'error');
  };

  imageOverlay.once('load', handleImageLoad);
  imageOverlay.once('error', handleImageError);
  imageOverlay.addTo(map);

  const synchronizeView = (): void => synchronizeViewDataset(map, elements.shell);

  map.on('zoomend', synchronizeView);
  map.on('moveend', synchronizeView);
  synchronizeView();

  let resizeFrame: number | undefined;

  const handleResize = (): void => {
    if (resizeFrame !== undefined) {
      window.cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;

      if (destroyed) {
        return;
      }

      const wasAtMinimumZoom = Math.abs(map.getZoom() - map.getMinZoom()) < 0.01;

      map.invalidateSize({ animate: false, pan: false });
      constrainViewport(map, bounds, wasAtMinimumZoom);
      synchronizeView();
    });
  };

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(handleResize);

  if (resizeObserver) {
    resizeObserver.observe(elements.canvas);
  } else {
    window.addEventListener('resize', handleResize);
  }

  return {
    map,
    setActivePlace(placeId: PlaceId | null): void {
      activePlaceId = placeId;
      markerByPlaceId.forEach((_marker, markerPlaceId) => updateMarkerPresentation(markerPlaceId));
    },
    setMatchingPlaces(placeIds: ReadonlySet<PlaceId>): void {
      matchingPlaceIds = new Set(placeIds);
      markerByPlaceId.forEach((_marker, markerPlaceId) => updateMarkerPresentation(markerPlaceId));
    },
    locatePlace(placeId: PlaceId): void {
      const marker = markerByPlaceId.get(placeId);

      if (!marker) {
        return;
      }

      clearSearchHighlight();
      const targetZoom = Math.min(
        FAERUN_MAP_CONFIG.maxZoom,
        Math.max(map.getZoom(), map.getMinZoom() + 1),
      );

      map.setView(marker.getLatLng(), targetZoom, { animate: false });
      map.panInsideBounds(bounds, { animate: false });
      synchronizeView();
    },
    locateSearchTarget(target: MapSearchTarget): void {
      const coordinate = L.latLng(target.coordinates.y, target.coordinates.x);
      const fallbackZoom = Math.min(
        FAERUN_MAP_CONFIG.maxZoom,
        Math.max(map.getZoom(), map.getMinZoom() + 1),
      );
      const targetZoom =
        target.recommendedZoom === null
          ? fallbackZoom
          : Math.min(FAERUN_MAP_CONFIG.maxZoom, Math.max(map.getMinZoom(), target.recommendedZoom));

      map.setView(coordinate, targetZoom, { animate: false });
      map.panInsideBounds(bounds, { animate: false });
      synchronizeView();
      showSearchHighlight(target);
    },
    focusMarker(placeId: PlaceId): void {
      markerByPlaceId.get(placeId)?.getElement()?.focus({ preventScroll: true });
    },
    destroy(): void {
      destroyed = true;
      clearSearchHighlight();
      imageOverlay.off('load', handleImageLoad);
      imageOverlay.off('error', handleImageError);
      map.off('zoomend', synchronizeView);
      map.off('moveend', synchronizeView);
      markerByPlaceId.forEach((marker, placeId) => {
        const clickHandler = markerClickHandlers.get(placeId);

        if (clickHandler) {
          marker.off('click', clickHandler);
        }
      });
      markerDomListeners.forEach(({ element, handler }) => {
        element.removeEventListener('keydown', handler);
      });
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);

      if (resizeFrame !== undefined) {
        window.cancelAnimationFrame(resizeFrame);
      }

      map.remove();
    },
  };
}
