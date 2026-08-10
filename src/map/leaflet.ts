import L, { type LatLngBounds, type Map as LeafletMap, type Marker } from 'leaflet';

import type { PlaceId } from '../data/model';
import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import {
  createPlayerDispositionVisuals,
  describePlayerDispositions,
  getPinTypeVisual,
  groupPinsByCoordinate,
  type CoordinatePinGroup,
} from '../domain/pinVisualSystem';
import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';
import { clearMapSearchFocus, locateMapSearchTarget } from './searchFocus';

export type MapLoadState = 'loading' | 'ready' | 'error';

export interface MapSearchTarget {
  readonly coordinates: {
    readonly x: number;
    readonly y: number;
  };
  readonly searchExtent: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  } | null;
  readonly recommendedZoom: number | null;
  readonly label: string;
}

export interface FaerunMapController {
  readonly map: LeafletMap;
  setMarkers(markers: readonly AtlasPinMarkerModel[]): void;
  setActivePlace(placeId: PlaceId | null): void;
  clearSupplementalPinSelection(): void;
  setMatchingPlaces(placeIds: ReadonlySet<PlaceId>): void;
  locatePlace(placeId: PlaceId): void;
  locateSearchTarget(target: MapSearchTarget): void;
  focusMarker(placeId: PlaceId): void;
  destroy(): void;
}

export interface FaerunMapOptions {
  readonly markers?: readonly AtlasPinMarkerModel[];
  readonly onPinActivate?: (pin: AtlasPinMarkerModel) => void;
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

type FilterMatchState = 'true' | 'false' | 'mixed';

const stateMessages: Record<Exclude<MapLoadState, 'ready'>, string> = {
  loading: 'Cargando la cartografía oficial de Faerûn…',
  error:
    'No se ha podido cargar la cartografía oficial. Se muestra una superficie neutra y la navegación permanece disponible.',
};

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

function createDispositionMarkup(marker: AtlasPinMarkerModel): string {
  return createPlayerDispositionVisuals(marker.dispositions)
    .map(
      ({ symbol, className }) =>
        `<span class="pin-disposition ${className}" aria-hidden="true">${symbol}</span>`,
    )
    .join('');
}

function createSinglePinIcon(marker: AtlasPinMarkerModel): L.DivIcon {
  const type = getPinTypeVisual(marker.entityType);

  return L.divIcon({
    className: 'campaign-marker-icon',
    html: `<span class="pin-visual ${type.className}"><span class="pin-visual__type-symbol" aria-hidden="true">${type.symbol}</span><span class="pin-visual__dispositions" aria-hidden="true">${createDispositionMarkup(marker)}</span></span>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

function createCoincidentPinIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: 'campaign-marker-icon campaign-marker-icon--coincident',
    html: `<span class="pin-visual pin-visual--coincident"><span class="pin-visual__type-symbol" aria-hidden="true">≡</span><span class="pin-visual__count" aria-hidden="true">${count}</span></span>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
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

function describePin(marker: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(marker.entityType);
  const dispositions = describePlayerDispositions(marker.dispositions);

  return `${marker.name}. ${type.label}. Disposición por jugador: ${dispositions}. Categoría: ${marker.categoryName}.`;
}

function describeLegacyMarkerName(marker: AtlasPinMarkerModel): string {
  return `${marker.name}. Categoría: ${marker.categoryName}.`;
}

function describePinSemantics(marker: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(marker.entityType);
  return `${type.label}. Disposición por jugador: ${describePlayerDispositions(marker.dispositions)}.`;
}

function createCoincidentPopup(
  markers: readonly AtlasPinMarkerModel[],
  activatePin: (marker: AtlasPinMarkerModel) => void,
): HTMLElement {
  const container = document.createElement('section');
  const heading = document.createElement('p');
  const list = document.createElement('ul');

  container.className = 'pin-coincident-popup';
  container.setAttribute('aria-label', 'Pines coincidentes');
  heading.textContent = `${markers.length} entidades comparten esta coordenada. Elige una:`;
  list.className = 'pin-coincident-list';
  list.setAttribute('role', 'list');

  for (const marker of markers) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const mini = document.createElement('span');
    const miniSymbol = document.createElement('span');
    const text = document.createElement('span');
    const type = getPinTypeVisual(marker.entityType);

    button.type = 'button';
    button.className = 'pin-coincident-list__button';
    button.setAttribute('data-testid', 'coincident-pin-option');
    button.dataset.pinId = marker.id;
    button.dataset.entityType = marker.entityType;
    button.setAttribute('aria-label', describePin(marker));
    mini.className = `pin-coincident-list__mini pin-coincident-list__mini--${marker.entityType}`;
    mini.setAttribute('aria-hidden', 'true');
    miniSymbol.textContent = type.symbol;
    mini.append(miniSymbol);
    text.textContent = `${marker.name} — ${type.label} — ${describePlayerDispositions(marker.dispositions)}`;
    button.append(mini, text);
    button.addEventListener('click', () => activatePin(marker));
    item.append(button);
    list.append(item);
  }

  container.append(heading, list);
  return container;
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

  const groupMarkers = new Set<Marker>();
  const groupMarkerByPinId = new Map<string, Marker>();
  const pinIdByLegacyPlaceId = new Map<PlaceId, string>();
  const markerDomListeners: MarkerDomListener[] = [];
  let renderedMarkers: readonly AtlasPinMarkerModel[] = [];
  let activePlaceId: PlaceId | null = null;
  let activeSupplementalPinId: string | null = null;
  let matchingPlaceIds = new Set<PlaceId>();
  let searchHighlight: Marker | null = null;
  let searchHighlightTimeout: number | undefined;
  let destroyed = false;

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

  const isPinActive = (pin: AtlasPinMarkerModel): boolean =>
    pin.legacyPlaceId !== null
      ? pin.legacyPlaceId === activePlaceId
      : pin.id === activeSupplementalPinId;

  const isPinMatching = (pin: AtlasPinMarkerModel): boolean =>
    pin.legacyPlaceId === null || matchingPlaceIds.has(pin.legacyPlaceId);

  const getGroupFilterState = (pins: readonly AtlasPinMarkerModel[]): FilterMatchState => {
    const matches = pins.map(isPinMatching);
    if (matches.every(Boolean)) return 'true';
    if (matches.every((match) => !match)) return 'false';
    return 'mixed';
  };

  const locatePin = (pinId: string): void => {
    const marker = groupMarkerByPinId.get(pinId);
    if (!marker) return;

    clearSearchHighlight();
    clearMapSearchFocus(map);
    const targetZoom = Math.min(
      FAERUN_MAP_CONFIG.maxZoom,
      Math.max(map.getZoom(), map.getMinZoom() + 1),
    );
    map.setView(marker.getLatLng(), targetZoom, { animate: false });
    map.panInsideBounds(bounds, { animate: false });
    synchronizeViewDataset(map, elements.shell);
  };

  const updateGroupPresentation = (
    leafletMarker: Marker,
    pins: readonly AtlasPinMarkerModel[],
  ): void => {
    const element = leafletMarker.getElement();
    const firstPin = pins[0];
    if (!element || !firstPin) return;

    const isActive = pins.some(isPinActive);
    const filterState = getGroupFilterState(pins);
    const inner = element.querySelector<HTMLElement>('.pin-visual');
    const isLegacySingle = pins.length === 1 && firstPin.legacyPlaceId !== null;
    const semanticDescription =
      pins.length === 1
        ? `${describePinSemantics(firstPin)} `
        : `${pins.length} entidades comparten esta coordenada. `;
    const activeDescription = isActive
      ? isLegacySingle
        ? 'Lugar activo. '
        : 'Contiene el pin activo. '
      : '';
    const filterDescription =
      filterState === 'true'
        ? 'Coincide con los filtros aplicables.'
        : filterState === 'false'
          ? 'No coincide con la búsqueda y los filtros actuales, pero sigue disponible.'
          : 'Contiene pines coincidentes con estados de filtro distintos; todos siguen disponibles.';
    const accessibleState = `${semanticDescription}${activeDescription}${filterDescription}`;

    element.classList.toggle('campaign-marker-icon--active', isActive);
    element.classList.toggle('campaign-marker-icon--matching', filterState !== 'false');
    element.classList.toggle('campaign-marker-icon--dimmed', filterState === 'false');
    inner?.classList.toggle('pin-visual--active', isActive);
    inner?.classList.toggle('pin-visual--dimmed', filterState === 'false');
    element.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    element.setAttribute('aria-description', accessibleState);
    element.dataset.accessibleState = accessibleState;
    element.dataset.filterMatch = filterState;
    leafletMarker.setZIndexOffset(isActive ? 1000 : filterState === 'false' ? 0 : 200);
  };

  const activatePin = (pin: AtlasPinMarkerModel): void => {
    map.closePopup();
    options.onPinActivate?.(pin);

    if (pin.legacyPlaceId === null) {
      activeSupplementalPinId = pin.id;
      activePlaceId = null;
      locatePin(pin.id);
      elements.searchStatus.textContent = `${pin.name}, ${getPinTypeVisual(pin.entityType).label.toLocaleLowerCase('es')}, seleccionado en el mapa. No existe todavía una ficha de compatibilidad Beta 0.1.`;
      groupMarkers.forEach((marker) => {
        const pinsForMarker = renderedMarkers.filter(
          ({ id }) => groupMarkerByPinId.get(id) === marker,
        );
        updateGroupPresentation(marker, pinsForMarker);
      });
    }
  };

  const decorateGroupMarker = (
    leafletMarker: Marker,
    pins: CoordinatePinGroup<AtlasPinMarkerModel>,
    openCoincidentList: () => void,
  ): void => {
    const element = leafletMarker.getElement();
    if (!element) return;

    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-pressed', 'false');
    element.setAttribute('aria-keyshortcuts', 'Enter Space');
    element.dataset.markerLat = String(pins[0].coordinate[0]);
    element.dataset.markerLng = String(pins[0].coordinate[1]);

    if (pins.length === 1) {
      const pin = pins[0];
      element.setAttribute(
        'aria-label',
        pin.legacyPlaceId ? describeLegacyMarkerName(pin) : describePin(pin),
      );
      element.setAttribute('data-testid', pin.legacyPlaceId ? 'place-marker' : 'entity-pin');
      element.dataset.pinId = pin.id;
      element.dataset.entityType = pin.entityType;
      element.dataset.categoryId = pin.categoryId;
      element.dataset.categorySlug = pin.categorySlug;
      if (pin.legacyPlaceId) element.dataset.placeId = pin.legacyPlaceId;
      if (pin.entityId) element.dataset.entityId = pin.entityId;
    } else {
      element.setAttribute(
        'aria-label',
        `${pins.length} pines coincidentes. ${pins.map(describePin).join(' ')}`,
      );
      element.setAttribute('aria-haspopup', 'true');
      element.setAttribute('aria-expanded', 'false');
      element.setAttribute('data-testid', 'coincident-pin');
      element.dataset.pinCount = String(pins.length);
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (pins.length === 1) activatePin(pins[0]);
      else openCoincidentList();
    };

    element.addEventListener('keydown', handleKeyDown);
    markerDomListeners.push({ element, handler: handleKeyDown });
    updateGroupPresentation(leafletMarker, pins);
  };

  const clearRenderedMarkers = (): void => {
    markerDomListeners.splice(0).forEach(({ element, handler }) => {
      element.removeEventListener('keydown', handler);
    });
    groupMarkers.forEach((marker) => marker.removeFrom(map));
    groupMarkers.clear();
    groupMarkerByPinId.clear();
    pinIdByLegacyPlaceId.clear();
  };

  const renderMarkers = (markers: readonly AtlasPinMarkerModel[]): void => {
    clearRenderedMarkers();
    renderedMarkers = markers;
    if (activeSupplementalPinId && !markers.some(({ id }) => id === activeSupplementalPinId)) {
      activeSupplementalPinId = null;
    }

    for (const pin of markers) {
      if (pin.legacyPlaceId) pinIdByLegacyPlaceId.set(pin.legacyPlaceId, pin.id);
    }

    for (const pins of groupPinsByCoordinate(markers)) {
      const coordinate = pins[0].coordinate;
      const leafletMarker = L.marker(L.latLng(coordinate[0], coordinate[1]), {
        icon:
          pins.length === 1 ? createSinglePinIcon(pins[0]) : createCoincidentPinIcon(pins.length),
        keyboard: true,
        riseOnHover: true,
        title:
          pins.length === 1
            ? `${pins[0].name} — ${getPinTypeVisual(pins[0].entityType).label}`
            : `${pins.length} pines coincidentes`,
      });

      const openCoincidentList = (): void => {
        if (pins.length === 1) return;
        const content = createCoincidentPopup(pins, activatePin);
        L.popup({
          closeButton: true,
          autoPan: true,
          className: 'pin-coincident-leaflet-popup',
          minWidth: 220,
        })
          .setLatLng(leafletMarker.getLatLng())
          .setContent(content)
          .openOn(map);
        const element = leafletMarker.getElement();
        element?.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => {
          content.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        });
      };

      const handleClick = (): void => {
        if (pins.length === 1) activatePin(pins[0]);
        else openCoincidentList();
      };
      const handlePopupClose = (): void => {
        leafletMarker.getElement()?.setAttribute('aria-expanded', 'false');
      };

      leafletMarker.on('click', handleClick);
      leafletMarker.on('add', () => decorateGroupMarker(leafletMarker, pins, openCoincidentList));
      map.on('popupclose', handlePopupClose);
      leafletMarker.on('remove', () => {
        leafletMarker.off('click', handleClick);
        map.off('popupclose', handlePopupClose);
      });
      leafletMarker.addTo(map);
      groupMarkers.add(leafletMarker);
      for (const pin of pins) groupMarkerByPinId.set(pin.id, leafletMarker);
    }
  };

  matchingPlaceIds = new Set(
    (options.markers ?? [])
      .map(({ legacyPlaceId }) => legacyPlaceId)
      .filter((placeId): placeId is PlaceId => placeId !== null),
  );
  renderMarkers(options.markers ?? []);

  const imageOverlay = L.imageOverlay(OFFICIAL_MAP_URL, bounds, {
    alt: 'Mapa oficial de la Costa de la Espada y el noroeste de Faerûn',
    className: 'faerun-map__image',
    interactive: false,
  });

  const handleImageLoad = (): void => {
    if (!destroyed) setLoadState(elements, 'ready');
  };

  const handleImageError = (): void => {
    if (destroyed) return;
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
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (destroyed) return;
      const wasAtMinimumZoom = Math.abs(map.getZoom() - map.getMinZoom()) < 0.01;
      map.invalidateSize({ animate: false, pan: false });
      constrainViewport(map, bounds, wasAtMinimumZoom);
      synchronizeView();
    });
  };
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(handleResize);
  if (resizeObserver) resizeObserver.observe(elements.canvas);
  else window.addEventListener('resize', handleResize);

  const refreshMarkerPresentation = (): void => {
    groupMarkers.forEach((marker) => {
      const pins = renderedMarkers.filter(({ id }) => groupMarkerByPinId.get(id) === marker);
      updateGroupPresentation(marker, pins);
    });
  };

  return {
    map,
    setMarkers(markers): void {
      const previousMatching = matchingPlaceIds;
      const legacyIds = markers
        .map(({ legacyPlaceId }) => legacyPlaceId)
        .filter((placeId): placeId is PlaceId => placeId !== null);
      if (previousMatching.size === 0) matchingPlaceIds = new Set(legacyIds);
      renderMarkers(markers);
      refreshMarkerPresentation();
    },
    setActivePlace(placeId: PlaceId | null): void {
      activePlaceId = placeId;
      if (placeId !== null) activeSupplementalPinId = null;
      refreshMarkerPresentation();
    },
    clearSupplementalPinSelection(): void {
      activeSupplementalPinId = null;
      refreshMarkerPresentation();
    },
    setMatchingPlaces(placeIds: ReadonlySet<PlaceId>): void {
      matchingPlaceIds = new Set(placeIds);
      refreshMarkerPresentation();
    },
    locatePlace(placeId: PlaceId): void {
      const pinId = pinIdByLegacyPlaceId.get(placeId);
      if (pinId) locatePin(pinId);
    },
    locateSearchTarget(target: MapSearchTarget): void {
      clearSearchHighlight();
      clearMapSearchFocus(map);

      if (target.searchExtent) {
        locateMapSearchTarget(map, root, target);
        synchronizeView();
        return;
      }

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
      const pinId = pinIdByLegacyPlaceId.get(placeId);
      if (pinId) groupMarkerByPinId.get(pinId)?.getElement()?.focus({ preventScroll: true });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearSearchHighlight();
      clearMapSearchFocus(map);
      clearRenderedMarkers();
      imageOverlay.off('load', handleImageLoad);
      imageOverlay.off('error', handleImageError);
      map.off('zoomend', synchronizeView);
      map.off('moveend', synchronizeView);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      map.remove();
    },
  };
}
