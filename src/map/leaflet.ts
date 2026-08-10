import L, {
  type DivIcon,
  type LatLngBoundsExpression,
  type Layer,
  type Map as LeafletMap,
  type Marker,
} from 'leaflet';

import type { PlaceId } from '../data/model';
import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import { getPinTypeVisual } from '../domain/pinVisualSystem';
import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';
import { clearMapSearchFocus, locateMapSearchTarget } from './searchFocus';

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
  locatePlace(placeId: PlaceId): void;
  locateSearchTarget(target: MapSearchTarget): void;
  setActivePlace(placeId: PlaceId | null): void;
  setMatchingPlaces(placeIds: ReadonlySet<PlaceId>): void;
  setMarkers(markers: readonly AtlasPinMarkerModel[]): void;
  clearSupplementalPinSelection(): void;
  focusMarker(placeId: PlaceId): void;
  destroy(): void;
}

interface FaerunMapElements {
  readonly shell: HTMLElement;
  readonly canvas: HTMLElement;
  readonly fallback: HTMLElement;
  readonly retry: HTMLButtonElement;
  readonly searchStatus: HTMLElement;
}

interface MountFaerunMapOptions {
  readonly imageUrl?: string;
  readonly markers?: readonly AtlasPinMarkerModel[];
  readonly onPinActivate?: (pin: AtlasPinMarkerModel) => void;
}

type FilterMatchState = 'true' | 'false' | 'mixed';

interface MarkerDomListener {
  readonly element: HTMLElement;
  readonly type: 'click' | 'keydown';
  readonly listener: EventListener;
}

const SEARCH_HIGHLIGHT_DURATION_MS = 3000;

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`No se encontró el elemento requerido ${selector}.`);
  return element;
}

function getMapElements(root: ParentNode): FaerunMapElements {
  return {
    shell: getRequiredElement(root, '[data-map-shell]'),
    canvas: getRequiredElement(root, '[data-map-canvas]'),
    fallback: getRequiredElement(root, '[data-map-fallback]'),
    retry: getRequiredElement<HTMLButtonElement>(root, '[data-map-retry]'),
    searchStatus: getRequiredElement(root, '[data-map-search-status]'),
  };
}

function setLoadState(elements: FaerunMapElements, state: 'loading' | 'ready' | 'error'): void {
  elements.shell.dataset.mapState = state;
  elements.shell.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  elements.fallback.hidden = state !== 'error';
}

function createMapImageLayer(imageUrl: string, bounds: LatLngBoundsExpression): Layer {
  return L.imageOverlay(imageUrl, bounds, {
    interactive: false,
    opacity: 1,
    crossOrigin: true,
  });
}

function constrainViewport(map: LeafletMap, bounds: L.LatLngBounds, fitIfNeeded = false): void {
  const container = map.getContainer();
  if (!container.clientWidth || !container.clientHeight) return;

  map.invalidateSize({ animate: false, pan: false });
  const fitZoom = map.getBoundsZoom(bounds, false, [0, 0]);
  const nextMinZoom = Math.min(FAERUN_MAP_CONFIG.maxZoom, Math.max(fitZoom, -2));
  map.setMinZoom(nextMinZoom);

  if (fitIfNeeded || map.getZoom() < nextMinZoom) {
    map.fitBounds(bounds, { animate: false });
  }

  map.panInsideBounds(bounds, { animate: false });
}

function synchronizeViewDataset(map: LeafletMap, shell: HTMLElement): void {
  const center = map.getCenter();
  shell.dataset.mapCenter = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
  shell.dataset.mapZoom = String(map.getZoom());
}

function normalizeMarkerKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function groupPinsByCoordinate<T extends AtlasPinMarkerModel>(
  markers: readonly T[],
): readonly (readonly T[])[] {
  const grouped = new Map<string, T[]>();
  markers.forEach((marker) => {
    const [lat, lng] = marker.coordinate;
    const key = normalizeMarkerKey(lat, lng);
    const bucket = grouped.get(key) ?? [];
    bucket.push(marker);
    grouped.set(key, bucket);
  });
  return Array.from(grouped.values());
}

function describePin(pin: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(pin.entityType).label;
  return `${pin.name}, ${type.toLocaleLowerCase('es')}.`;
}

function describeLegacyMarkerName(pin: AtlasPinMarkerModel): string {
  return pin.name;
}

function describePinSemantics(pin: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(pin.entityType).label;
  return `${pin.name}, ${type.toLocaleLowerCase('es')}.`;
}

function createSearchHighlightIcon(): DivIcon {
  return L.divIcon({
    className: 'geographic-search-highlight',
    html: '<span class="geographic-search-highlight__symbol" aria-hidden="true">◎</span>',
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

function createSinglePinIcon(pin: AtlasPinMarkerModel): DivIcon {
  const visual = getPinTypeVisual(pin.entityType);
  return L.divIcon({
    className: 'campaign-marker-wrapper',
    html: `<span class="campaign-marker-icon"><span class="pin-visual pin-visual--${visual.modifier}" aria-hidden="true"><span class="pin-visual__glyph">${visual.glyph}</span></span></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createCoincidentPinIcon(pins: readonly AtlasPinMarkerModel[]): DivIcon {
  return L.divIcon({
    className: 'campaign-marker-wrapper',
    html: `<span class="campaign-marker-icon campaign-marker-icon--coincident"><span class="pin-visual pin-visual--coincident" aria-hidden="true"><span class="pin-visual__glyph">${pins.length}</span></span></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createGroupMarkerIcon(pins: readonly AtlasPinMarkerModel[]): DivIcon {
  return pins.length === 1 ? createSinglePinIcon(pins[0]) : createCoincidentPinIcon(pins);
}

function createCoincidentPopupContent(
  pins: readonly AtlasPinMarkerModel[],
  onActivate: (pin: AtlasPinMarkerModel) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'coincident-pin-list';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', `${pins.length} pines coincidentes`);

  const heading = document.createElement('p');
  heading.className = 'coincident-pin-list__heading';
  heading.textContent = `${pins.length} pines coinciden en esta coordenada`;
  container.append(heading);

  pins.forEach((pin) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'coincident-pin-list__item';
    button.textContent = `${pin.name} · ${getPinTypeVisual(pin.entityType).label}`;
    button.addEventListener('click', () => onActivate(pin));
    container.append(button);
  });

  return container;
}

function bindImageLifecycle(
  layer: Layer,
  elements: FaerunMapElements,
  map: LeafletMap,
  bounds: L.LatLngBounds,
): void {
  layer.on('load', () => {
    constrainViewport(map, bounds, true);
    synchronizeViewDataset(map, elements.shell);
    setLoadState(elements, 'ready');
  });
  layer.on('error', () => setLoadState(elements, 'error'));
}

function nameZoomControls(control: L.Control.Zoom): void {
  const container = control.getContainer();
  container?.querySelector('.leaflet-control-zoom-in')?.setAttribute('aria-label', 'Acercar mapa');
  container?.querySelector('.leaflet-control-zoom-out')?.setAttribute('aria-label', 'Alejar mapa');
}

export function mountFaerunMap(
  root: ParentNode,
  options: MountFaerunMapOptions = {},
): FaerunMapController {
  const elements = getMapElements(root);
  const bounds = createSimpleImageBounds();
  const imageUrl = options.imageUrl ?? OFFICIAL_MAP_URL;
  let imageLayer = createMapImageLayer(imageUrl, bounds);

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
    delete elements.shell.dataset.searchHighlightKind;
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
    elements.shell.dataset.searchHighlightKind = 'point';
    elements.shell.dataset.searchHighlightLabel = target.label;
    elements.searchStatus.textContent = `Mapa centrado en ${target.label}; posición resaltada.`;
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
      openCoincidentList();
    };

    const handleClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      openCoincidentList();
    };

    const target = element;
    markerDomListeners.push({ element: target, type: 'keydown', listener: handleKeyDown });
    markerDomListeners.push({ element: target, type: 'click', listener: handleClick });
    target.addEventListener('keydown', handleKeyDown);
    target.addEventListener('click', handleClick);
    updateGroupPresentation(leafletMarker, pins);
  };

  const clearRenderedMarkers = (): void => {
    markerDomListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    markerDomListeners.length = 0;
    groupMarkers.forEach((marker) => marker.removeFrom(map));
    groupMarkers.clear();
    groupMarkerByPinId.clear();
    pinIdByLegacyPlaceId.clear();
  };

  const renderMarkerGroup = (pins: CoordinatePinGroup<AtlasPinMarkerModel>): void => {
    const [lat, lng] = pins[0].coordinate;
    const marker = L.marker([lat, lng], {
      icon: createGroupMarkerIcon(pins),
      keyboard: false,
      riseOnHover: true,
      zIndexOffset: 200,
    }).addTo(map);

    groupMarkers.add(marker);
    pins.forEach((pin) => {
      groupMarkerByPinId.set(pin.id, marker);
      if (pin.legacyPlaceId) pinIdByLegacyPlaceId.set(pin.legacyPlaceId, pin.id);
    });

    const openCoincidentList = (): void => {
      if (pins.length === 1) {
        activatePin(pins[0]);
        return;
      }

      const content = createCoincidentPopupContent(pins, (pin) => {
        map.closePopup();
        activatePin(pin);
      });
      marker.bindPopup(content, { closeButton: true, maxWidth: 320 }).openPopup();
      const markerElement = marker.getElement();
      markerElement?.setAttribute('aria-expanded', 'true');
      marker.once('popupclose', () => markerElement?.setAttribute('aria-expanded', 'false'));
    };

    marker.once('add', () => decorateGroupMarker(marker, pins, openCoincidentList));
    if (marker.getElement()) decorateGroupMarker(marker, pins, openCoincidentList);
  };

  const setMarkers = (markers: readonly AtlasPinMarkerModel[]): void => {
    clearRenderedMarkers();
    renderedMarkers = markers;
    groupPinsByCoordinate(markers).forEach(renderMarkerGroup);
  };

  setMarkers(options.markers ?? []);

  bindImageLifecycle(imageLayer, elements, map, bounds);
  imageLayer.addTo(map);

  const retryLoad = (): void => {
    imageLayer.removeFrom(map);
    imageLayer = createMapImageLayer(imageUrl, bounds);
    bindImageLifecycle(imageLayer, elements, map, bounds);
    imageLayer.addTo(map);
    setLoadState(elements, 'loading');
  };

  elements.retry.addEventListener('click', retryLoad);

  const handleResize = (): void => {
    constrainViewport(map, bounds);
    synchronizeViewDataset(map, elements.shell);
  };
  window.addEventListener('resize', handleResize);

  const synchronizeView = (): void => synchronizeViewDataset(map, elements.shell);
  map.on('moveend', synchronizeView);
  map.on('zoomend', synchronizeView);

  return {
    map,
    locatePlace(placeId: PlaceId): void {
      const pinId = pinIdByLegacyPlaceId.get(placeId);
      if (!pinId) return;
      locatePin(pinId);
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
    setActivePlace(placeId: PlaceId | null): void {
      activeSupplementalPinId = null;
      activePlaceId = placeId;
      groupMarkers.forEach((marker) => {
        const pins = renderedMarkers.filter(({ id }) => groupMarkerByPinId.get(id) === marker);
        updateGroupPresentation(marker, pins);
      });
    },
    setMatchingPlaces(placeIds: ReadonlySet<PlaceId>): void {
      matchingPlaceIds = new Set(placeIds);
      groupMarkers.forEach((marker) => {
        const pins = renderedMarkers.filter(({ id }) => groupMarkerByPinId.get(id) === marker);
        updateGroupPresentation(marker, pins);
      });
    },
    setMarkers,
    clearSupplementalPinSelection(): void {
      activeSupplementalPinId = null;
      groupMarkers.forEach((marker) => {
        const pins = renderedMarkers.filter(({ id }) => groupMarkerByPinId.get(id) === marker);
        updateGroupPresentation(marker, pins);
      });
    },
    focusMarker(placeId: PlaceId): void {
      const pinId = pinIdByLegacyPlaceId.get(placeId);
      if (!pinId) return;
      groupMarkerByPinId.get(pinId)?.getElement()?.focus({ preventScroll: true });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearSearchHighlight();
      clearMapSearchFocus(map);
      clearRenderedMarkers();
      window.removeEventListener('resize', handleResize);
      elements.retry.removeEventListener('click', retryLoad);
      map.off('moveend', synchronizeView);
      map.off('zoomend', synchronizeView);
      map.remove();
    },
  };
}
