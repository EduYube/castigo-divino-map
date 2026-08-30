import L, { type LatLngBounds, type Map as LeafletMap, type Marker, type Polyline } from 'leaflet';

import type { PlaceId } from '../data/model';
import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import {
  createSpiderfyPoints,
  groupPinsByScreenDistance,
  PIN_CLUSTER_DISTANCE_PX,
  PIN_INTERACTION_TARGET_PX,
  type ProximityPinGroup,
  type ScreenPoint,
} from '../domain/pinProximity';
import {
  createPlayerDispositionVisuals,
  describePlayerDispositions,
  getPinTypeVisual,
} from '../domain/pinVisualSystem';
import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';
import { mountExpandedMapLayout } from './expandedMapLayout';
import { clearMapSearchFocus, locateMapSearchTarget } from './searchFocus';
import '../styles/pin-proximity.css';

export type MapLoadState = 'loading' | 'ready' | 'error';
export type PinMatchingSemantics = 'search-and-filters' | 'filters-only';

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

export interface FaerunMapMarkerUpdateOptions {
  /** Portraits that changed during a catalog refresh and should be re-materialized immediately. */
  readonly eagerPortraitPinIds?: ReadonlySet<string>;
}

export interface FaerunMapController {
  readonly map: LeafletMap;
  setMarkers(markers: readonly AtlasPinMarkerModel[], options?: FaerunMapMarkerUpdateOptions): void;
  setActivePlace(placeId: PlaceId | null): void;
  clearSupplementalPinSelection(): void;
  setMatchingPins(pinIds: ReadonlySet<string>, semantics?: PinMatchingSemantics): void;
  locatePlace(placeId: PlaceId): void;
  locateSearchTarget(target: MapSearchTarget): void;
  clearSearchFocus(): void;
  focusMarker(placeId: PlaceId): void;
  destroy(): void;
}

export interface FaerunMapOptions {
  readonly markers?: readonly AtlasPinMarkerModel[];
  readonly onPinActivate?: (pin: AtlasPinMarkerModel) => void;
  /** MAP-045 authorized thumbnail loader. Returning null keeps the standard pin. */
  readonly loadPortrait?: (pin: AtlasPinMarkerModel, signal: AbortSignal) => Promise<string | null>;
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

interface RenderedPinGroup {
  readonly pins: readonly [AtlasPinMarkerModel, ...AtlasPinMarkerModel[]];
  readonly marker: Marker;
  readonly center: ScreenPoint;
}

interface SpiderfyState {
  readonly group: RenderedPinGroup;
  readonly memberMarkers: readonly Marker[];
  readonly legs: readonly Polyline[];
}

type FilterMatchState = 'true' | 'false' | 'mixed';

const stateMessages: Record<Exclude<MapLoadState, 'ready'>, string> = {
  loading: 'Cargando la cartografía oficial de Faerûn…',
  error:
    'No se ha podido cargar la cartografía oficial. Se muestra una superficie neutra y la navegación permanece disponible.',
};

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

function createSinglePinMarkup(marker: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(marker.entityType);
  return `<span class="pin-visual ${type.className}"><span class="pin-visual__type-symbol" aria-hidden="true">${type.symbol}</span><span class="pin-visual__dispositions" aria-hidden="true">${createDispositionMarkup(marker)}</span></span>`;
}

function createSinglePinIcon(marker: AtlasPinMarkerModel): L.DivIcon {
  return L.divIcon({
    className: 'campaign-marker-icon',
    html: createSinglePinMarkup(marker),
    iconSize: [PIN_INTERACTION_TARGET_PX, PIN_INTERACTION_TARGET_PX],
    iconAnchor: [PIN_INTERACTION_TARGET_PX / 2, PIN_INTERACTION_TARGET_PX / 2],
  });
}

function createClusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: 'campaign-marker-icon campaign-marker-icon--cluster',
    html: `<span class="pin-visual pin-visual--cluster"><span class="pin-visual__type-symbol" aria-hidden="true"></span><span class="pin-visual__count" aria-hidden="true">${count}</span></span>`,
    iconSize: [PIN_INTERACTION_TARGET_PX, PIN_INTERACTION_TARGET_PX],
    iconAnchor: [PIN_INTERACTION_TARGET_PX / 2, PIN_INTERACTION_TARGET_PX / 2],
  });
}

function preservedPinVisualClasses(element: HTMLElement): readonly string[] {
  const current = element.querySelector<HTMLElement>('.pin-visual');
  return ['pin-visual--master', 'pin-visual--active', 'pin-visual--dimmed'].filter((className) =>
    current?.classList.contains(className),
  );
}

function restoreStandardPin(element: HTMLElement, marker: AtlasPinMarkerModel): void {
  const preservedClasses = preservedPinVisualClasses(element);
  element.innerHTML = createSinglePinMarkup(marker);
  element.querySelector<HTMLElement>('.pin-visual')?.classList.add(...preservedClasses);
  delete element.dataset.portraitMarker;
}

function applyPortraitPin(
  element: HTMLElement,
  marker: AtlasPinMarkerModel,
  url: string,
  onDecodeFailure: () => void,
): void {
  const visual = document.createElement('span');
  const image = document.createElement('img');
  const dispositions = document.createElement('span');

  const preservedClasses = preservedPinVisualClasses(element);
  visual.className = 'pin-visual pin-visual--character pin-visual--portrait';
  visual.classList.add(...preservedClasses);
  image.className = 'pin-visual__portrait';
  image.src = url;
  image.alt = '';
  image.width = 36;
  image.height = 36;
  image.decoding = 'async';
  image.setAttribute('aria-hidden', 'true');
  dispositions.className = 'pin-visual__dispositions';
  dispositions.setAttribute('aria-hidden', 'true');
  dispositions.innerHTML = createDispositionMarkup(marker);
  image.addEventListener('error', onDecodeFailure, { once: true });
  visual.append(image, dispositions);
  element.replaceChildren(visual);
  element.dataset.portraitMarker = 'true';
}

function describePin(marker: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(marker.entityType);
  const dispositions = describePlayerDispositions(marker.dispositions);

  return `${marker.name}. ${type.label}. Relación con los personajes: ${dispositions}. Categoría: ${marker.categoryName}.`;
}

function describeLegacyMarkerName(marker: AtlasPinMarkerModel): string {
  return `${marker.name}. Categoría: ${marker.categoryName}.`;
}

function describePinSemantics(marker: AtlasPinMarkerModel): string {
  const type = getPinTypeVisual(marker.entityType);
  return `${type.label}. Relación con los personajes: ${describePlayerDispositions(marker.dispositions)}.`;
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

function searchTargetMatchesPin(target: MapSearchTarget, pin: AtlasPinMarkerModel): boolean {
  const sameCoordinate =
    pin.coordinate[0] === target.coordinates.y && pin.coordinate[1] === target.coordinates.x;
  if (!sameCoordinate) return false;

  const normalizedLabel = target.label.trim().toLocaleLowerCase('es');
  const normalizedName = pin.name.trim().toLocaleLowerCase('es');

  return (
    normalizedLabel === normalizedName ||
    normalizedLabel.startsWith(`${normalizedName},`) ||
    normalizedLabel.startsWith(`${normalizedName}.`)
  );
}

function targetIsEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
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
  const expandedMapLayout = mountExpandedMapLayout(root, map, bounds, FAERUN_MAP_CONFIG.maxZoom);

  const groupMarkers = new Set<Marker>();
  const renderedGroups = new Set<RenderedPinGroup>();
  const groupMarkerByPinId = new Map<string, Marker>();
  const renderedGroupByPinId = new Map<string, RenderedPinGroup>();
  const pinIdByLegacyPlaceId = new Map<PlaceId, string>();
  const markerDomListeners: MarkerDomListener[] = [];
  const portraitAbortControllers = new Set<AbortController>();
  const portraitQueue: Array<() => Promise<void>> = [];
  const scheduledPortraitPinIds = new Set<string>();
  const MAX_CONCURRENT_PORTRAITS = 6;
  let activePortraitLoads = 0;
  let portraitGeneration = 0;
  let renderedMarkers: readonly AtlasPinMarkerModel[] = [];
  let activePlaceId: PlaceId | null = null;
  let activeSupplementalPinId: string | null = null;
  let matchingPinIds = new Set<string>();
  let matchingSemantics: PinMatchingSemantics = 'search-and-filters';
  let activeSpiderfy: SpiderfyState | null = null;
  let destroyed = false;

  const isPinActive = (pin: AtlasPinMarkerModel): boolean =>
    pin.legacyPlaceId !== null
      ? pin.legacyPlaceId === activePlaceId
      : pin.id === activeSupplementalPinId;

  const isPinMatching = (pin: AtlasPinMarkerModel): boolean => matchingPinIds.has(pin.id);

  const getGroupFilterState = (pins: readonly AtlasPinMarkerModel[]): FilterMatchState => {
    const matches = pins.map(isPinMatching);
    if (matches.every(Boolean)) return 'true';
    if (matches.every((match) => !match)) return 'false';
    return 'mixed';
  };

  const describeFilterState = (filterState: FilterMatchState): string => {
    if (matchingSemantics === 'filters-only') {
      switch (filterState) {
        case 'true':
          return 'Disponible con los filtros explícitos actuales.';
        case 'false':
          return 'No coincide con los filtros explícitos actuales, pero sigue disponible.';
        case 'mixed':
          return 'Contiene pines con estados distintos respecto a los filtros explícitos; todos siguen disponibles.';
      }
    }

    switch (filterState) {
      case 'true':
        return 'Coincide con la búsqueda y los filtros aplicables.';
      case 'false':
        return 'No coincide con la búsqueda y los filtros actuales, pero sigue disponible.';
      case 'mixed':
        return 'Contiene pines coincidentes y atenuados; todos siguen disponibles.';
    }
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
        : `${pins.length} pines agrupados por proximidad visual. `;
    const activeDescription = isActive
      ? isLegacySingle
        ? 'Lugar activo. '
        : pins.length === 1
          ? 'Pin activo. '
          : 'Contiene el pin activo. '
      : '';
    const expandedDescription =
      pins.length > 1 && activeSpiderfy?.group.marker === leafletMarker
        ? 'Opciones desplegadas alrededor del grupo. '
        : pins.length > 1
          ? 'Activa el grupo para desplegar sus opciones. '
          : '';
    const accessibleState = `${semanticDescription}${activeDescription}${expandedDescription}${describeFilterState(filterState)}`;

    element.classList.toggle('campaign-marker-icon--active', isActive);
    element.classList.toggle('campaign-marker-icon--matching', filterState !== 'false');
    element.classList.toggle('campaign-marker-icon--dimmed', filterState === 'false');
    inner?.classList.toggle('pin-visual--active', isActive);
    inner?.classList.toggle('pin-visual--dimmed', filterState === 'false');
    element.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    element.setAttribute('aria-description', accessibleState);
    element.dataset.accessibleState = accessibleState;
    element.dataset.filterMatch = filterState;
    element.dataset.matchingSemantics = matchingSemantics;
    leafletMarker.setZIndexOffset(isActive ? 1000 : filterState === 'false' ? 0 : 200);
  };

  const removeMarkerDomListener = (element: HTMLElement): void => {
    for (let index = markerDomListeners.length - 1; index >= 0; index -= 1) {
      const listener = markerDomListeners[index];
      if (listener?.element !== element) continue;
      listener.element.removeEventListener('keydown', listener.handler);
      markerDomListeners.splice(index, 1);
    }
  };

  let refreshPortraitMarkers: (eagerPortraitPinIds?: ReadonlySet<string>) => void = () => undefined;
  let openSpiderfy: (
    group: RenderedPinGroup,
    focusPinId?: string,
    focusFirst?: boolean,
  ) => void = () => undefined;
  let collapseSpiderfy: (restoreFocus?: boolean) => void = () => undefined;
  let renderMarkers: (
    markers: readonly AtlasPinMarkerModel[],
    eagerPortraitPinIds?: ReadonlySet<string>,
  ) => void = () => undefined;
  let locatePin: (pinId: string, revealGrouped?: boolean) => void = () => undefined;

  const activatePin = (pin: AtlasPinMarkerModel): void => {
    const originGroup = renderedGroupByPinId.get(pin.id);
    collapseSpiderfy(false);
    map.closePopup();
    options.onPinActivate?.(pin);

    if (pin.legacyPlaceId === null) {
      activeSupplementalPinId = pin.id;
      activePlaceId = null;
      locatePin(pin.id, false);
      if (originGroup && originGroup.pins.length > 1) {
        const clusterElement = renderedGroupByPinId.get(pin.id)?.marker.getElement();
        if (clusterElement) {
          clusterElement.dataset.markerLat = String(pin.coordinate[0]);
          clusterElement.dataset.markerLng = String(pin.coordinate[1]);
        }
      }
      elements.searchStatus.textContent = `${pin.name}, ${getPinTypeVisual(pin.entityType).label.toLocaleLowerCase('es')}, seleccionado en el mapa.`;
      renderedGroups.forEach(({ marker, pins }) => updateGroupPresentation(marker, pins));
      refreshPortraitMarkers();
    }
  };

  const decoratePinMarker = (leafletMarker: Marker, pin: AtlasPinMarkerModel): void => {
    const element = leafletMarker.getElement();
    if (!element) return;

    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-pressed', 'false');
    element.setAttribute('aria-keyshortcuts', 'Enter Space');
    element.setAttribute(
      'aria-label',
      pin.legacyPlaceId ? describeLegacyMarkerName(pin) : describePin(pin),
    );
    element.setAttribute('data-testid', pin.legacyPlaceId ? 'place-marker' : 'entity-pin');
    element.dataset.pinId = pin.id;
    element.dataset.entityType = pin.entityType;
    element.dataset.categoryId = pin.categoryId;
    element.dataset.categorySlug = pin.categorySlug;
    element.dataset.markerLat = String(pin.coordinate[0]);
    element.dataset.markerLng = String(pin.coordinate[1]);
    if (pin.legacyPlaceId) element.dataset.placeId = pin.legacyPlaceId;
    if (pin.entityId) element.dataset.entityId = pin.entityId;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      activatePin(pin);
    };

    element.addEventListener('keydown', handleKeyDown);
    markerDomListeners.push({ element, handler: handleKeyDown });
    updateGroupPresentation(leafletMarker, [pin]);
  };

  const decorateClusterMarker = (group: RenderedPinGroup): void => {
    const element = group.marker.getElement();
    if (!element) return;

    const { pins } = group;
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-pressed', 'false');
    element.setAttribute('aria-keyshortcuts', 'Enter Space');
    element.setAttribute('aria-label', `${pins.length} pines agrupados`);
    element.setAttribute('aria-haspopup', 'true');
    element.setAttribute('aria-expanded', 'false');
    element.setAttribute('data-testid', 'coincident-pin');
    element.dataset.proximityCluster = 'true';
    element.dataset.pinCount = String(pins.length);
    element.dataset.clusterThresholdPx = String(PIN_CLUSTER_DISTANCE_PX);
    element.dataset.markerLat = String(group.marker.getLatLng().lat);
    element.dataset.markerLng = String(group.marker.getLatLng().lng);

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      openSpiderfy(group, undefined, true);
    };

    element.addEventListener('keydown', handleKeyDown);
    markerDomListeners.push({ element, handler: handleKeyDown });
    updateGroupPresentation(group.marker, pins);
  };

  const drainPortraitQueue = (): void => {
    while (activePortraitLoads < MAX_CONCURRENT_PORTRAITS && portraitQueue.length > 0) {
      const task = portraitQueue.shift();
      if (!task) return;
      activePortraitLoads += 1;
      void task().finally(() => {
        activePortraitLoads -= 1;
        drainPortraitQueue();
      });
    }
  };

  const schedulePortrait = (
    leafletMarker: Marker,
    pin: AtlasPinMarkerModel,
    generation: number,
  ): void => {
    if (
      !options.loadPortrait ||
      pin.entityType !== 'character' ||
      !pin.portraitPath ||
      scheduledPortraitPinIds.has(pin.id)
    ) {
      return;
    }
    scheduledPortraitPinIds.add(pin.id);
    portraitQueue.push(async () => {
      if (destroyed || generation !== portraitGeneration) return;
      const request = new AbortController();
      portraitAbortControllers.add(request);
      try {
        const url = await options.loadPortrait?.(pin, request.signal);
        if (!url || request.signal.aborted || destroyed || generation !== portraitGeneration)
          return;
        const element = leafletMarker.getElement();
        if (!element || groupMarkerByPinId.get(pin.id) !== leafletMarker) return;
        const fallback = (): void => {
          if (groupMarkerByPinId.get(pin.id) !== leafletMarker) return;
          restoreStandardPin(element, pin);
          updateGroupPresentation(leafletMarker, [pin]);
        };
        applyPortraitPin(element, pin, url, fallback);
        updateGroupPresentation(leafletMarker, [pin]);
      } catch {
        // Portraits are enhancement-only. The standard pin remains authoritative.
      } finally {
        portraitAbortControllers.delete(request);
      }
    });
    drainPortraitQueue();
  };

  refreshPortraitMarkers = (eagerPortraitPinIds: ReadonlySet<string> = new Set()): void => {
    if (!options.loadPortrait || destroyed) return;
    const visibleBounds = map.getBounds().pad(0.08);
    const generation = portraitGeneration;

    for (const pin of renderedMarkers) {
      if (pin.entityType !== 'character' || !pin.portraitPath) continue;
      const leafletMarker = groupMarkerByPinId.get(pin.id);
      const element = leafletMarker?.getElement();
      if (!leafletMarker || !element || element.dataset.pinId !== pin.id) continue;
      if (
        !eagerPortraitPinIds.has(pin.id) &&
        !isPinActive(pin) &&
        !visibleBounds.contains(leafletMarker.getLatLng())
      ) {
        continue;
      }
      schedulePortrait(leafletMarker, pin, generation);
    }
  };

  const mapControlRects = (): readonly DOMRect[] => {
    const mapRect = elements.canvas.getBoundingClientRect();
    return Array.from(elements.canvas.querySelectorAll<HTMLElement>('.leaflet-control'))
      .filter((control) => {
        const style = window.getComputedStyle(control);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return new DOMRect(
          rect.left - mapRect.left,
          rect.top - mapRect.top,
          rect.width,
          rect.height,
        );
      });
  };

  const keepSpiderPointClearOfControls = (point: ScreenPoint): ScreenPoint => {
    const half = PIN_INTERACTION_TARGET_PX / 2;
    const padding = 6;
    const size = map.getSize();
    let next = { ...point };

    for (const control of mapControlRects()) {
      const targetLeft = next.x - half;
      const targetRight = next.x + half;
      const targetTop = next.y - half;
      const targetBottom = next.y + half;
      const intersects =
        targetRight > control.left - padding &&
        targetLeft < control.right + padding &&
        targetBottom > control.top - padding &&
        targetTop < control.bottom + padding;
      if (!intersects) continue;

      const candidates = [
        { x: control.left - padding - half, y: next.y },
        { x: control.right + padding + half, y: next.y },
        { x: next.x, y: control.top - padding - half },
        { x: next.x, y: control.bottom + padding + half },
      ].filter(
        (candidate) =>
          candidate.x >= half &&
          candidate.x <= size.x - half &&
          candidate.y >= half &&
          candidate.y <= size.y - half,
      );

      const candidate = candidates.sort(
        (left, right) =>
          Math.hypot(left.x - next.x, left.y - next.y) -
          Math.hypot(right.x - next.x, right.y - next.y),
      )[0];
      if (candidate) next = candidate;
    }

    return next;
  };

  collapseSpiderfy = (restoreFocus = false): void => {
    const state = activeSpiderfy;
    if (!state) return;
    activeSpiderfy = null;

    for (const [index, memberMarker] of state.memberMarkers.entries()) {
      const pin = state.group.pins[index];
      const element = memberMarker.getElement();
      if (element) removeMarkerDomListener(element);
      memberMarker.removeFrom(map);
      if (pin) {
        scheduledPortraitPinIds.delete(pin.id);
        groupMarkerByPinId.set(pin.id, state.group.marker);
      }
    }
    state.legs.forEach((leg) => leg.removeFrom(map));

    const clusterElement = state.group.marker.getElement();
    if (clusterElement) {
      clusterElement.style.visibility = '';
      clusterElement.style.pointerEvents = '';
      clusterElement.removeAttribute('aria-hidden');
      clusterElement.tabIndex = 0;
      clusterElement.setAttribute('aria-expanded', 'false');
    }
    updateGroupPresentation(state.group.marker, state.group.pins);

    if (restoreFocus && clusterElement?.isConnected) {
      window.requestAnimationFrame(() => {
        if (clusterElement.isConnected) {
          clusterElement.focus({ preventScroll: true });
        }
      });
    }
  };

  openSpiderfy = (group: RenderedPinGroup, focusPinId?: string, focusFirst = false): void => {
    if (group.pins.length < 2 || destroyed) return;
    if (activeSpiderfy?.group === group) {
      const index = focusPinId
        ? group.pins.findIndex(({ id }) => id === focusPinId)
        : focusFirst
          ? 0
          : -1;
      if (index >= 0) {
        activeSpiderfy.memberMarkers[index]?.getElement()?.focus({ preventScroll: true });
      }
      return;
    }

    collapseSpiderfy(false);
    clearMapSearchFocus(map);

    const originLatLng = group.marker.getLatLng();
    const originPoint = map.latLngToContainerPoint(originLatLng);
    const size = map.getSize();
    const spiderPoints = createSpiderfyPoints(
      { x: originPoint.x, y: originPoint.y },
      group.pins.length,
      { width: size.x, height: size.y },
    ).map(keepSpiderPointClearOfControls);
    const memberMarkers: Marker[] = [];
    const legs: Polyline[] = [];

    for (const [index, pin] of group.pins.entries()) {
      const point = spiderPoints[index];
      if (!point) continue;
      const targetLatLng = map.containerPointToLatLng(L.point(point.x, point.y));
      const leg = L.polyline([originLatLng, targetLatLng], {
        className: 'pin-spider-leg',
        interactive: false,
        bubblingMouseEvents: false,
      }).addTo(map);
      const memberMarker = L.marker(targetLatLng, {
        icon: createSinglePinIcon(pin),
        keyboard: true,
        riseOnHover: true,
        bubblingMouseEvents: false,
        title: `${pin.name} — ${getPinTypeVisual(pin.entityType).label}`,
        zIndexOffset: 900 + index,
      });

      memberMarker.on('click', () => activatePin(pin));
      memberMarker.on('add', () => {
        const element = memberMarker.getElement();
        element?.classList.add('campaign-marker-icon--spiderfied');
        if (element) element.dataset.spiderfied = 'true';
        decoratePinMarker(memberMarker, pin);
      });
      memberMarker.addTo(map);
      memberMarkers.push(memberMarker);
      legs.push(leg);
      groupMarkerByPinId.set(pin.id, memberMarker);
    }

    activeSpiderfy = { group, memberMarkers, legs };
    const clusterElement = group.marker.getElement();
    if (clusterElement) {
      clusterElement.setAttribute('aria-expanded', 'true');
      clusterElement.setAttribute('aria-hidden', 'true');
      clusterElement.style.visibility = 'hidden';
      clusterElement.style.pointerEvents = 'none';
      clusterElement.tabIndex = -1;
    }
    updateGroupPresentation(group.marker, group.pins);
    refreshPortraitMarkers(new Set(group.pins.map(({ id }) => id)));

    const focusIndex = focusPinId
      ? group.pins.findIndex(({ id }) => id === focusPinId)
      : focusFirst
        ? 0
        : -1;
    if (focusIndex >= 0) {
      window.requestAnimationFrame(() => {
        memberMarkers[focusIndex]?.getElement()?.focus({ preventScroll: true });
      });
    }
  };

  const clearRenderedMarkers = (): void => {
    collapseSpiderfy(false);
    portraitGeneration += 1;
    portraitQueue.splice(0);
    scheduledPortraitPinIds.clear();
    portraitAbortControllers.forEach((controller) => controller.abort());
    portraitAbortControllers.clear();
    markerDomListeners.splice(0).forEach(({ element, handler }) => {
      element.removeEventListener('keydown', handler);
    });
    groupMarkers.forEach((marker) => marker.removeFrom(map));
    groupMarkers.clear();
    renderedGroups.clear();
    groupMarkerByPinId.clear();
    renderedGroupByPinId.clear();
    pinIdByLegacyPlaceId.clear();
  };

  const createScreenGroups = (
    markers: readonly AtlasPinMarkerModel[],
  ): readonly ProximityPinGroup<AtlasPinMarkerModel>[] =>
    groupPinsByScreenDistance(markers, (pin) => {
      const projected = map.latLngToLayerPoint(L.latLng(pin.coordinate[0], pin.coordinate[1]));
      return { x: projected.x, y: projected.y };
    });

  renderMarkers = (
    markers: readonly AtlasPinMarkerModel[],
    eagerPortraitPinIds: ReadonlySet<string> = new Set(),
  ): void => {
    clearRenderedMarkers();
    renderedMarkers = markers;
    if (activeSupplementalPinId && !markers.some(({ id }) => id === activeSupplementalPinId)) {
      activeSupplementalPinId = null;
    }

    for (const pin of markers) {
      if (pin.legacyPlaceId) {
        pinIdByLegacyPlaceId.set(pin.legacyPlaceId, pin.id);
      }
    }

    for (const proximityGroup of createScreenGroups(markers)) {
      const pins = proximityGroup.pins;
      const singleton = pins.length === 1;
      const firstPin = pins[0];
      const markerLatLng = singleton
        ? L.latLng(firstPin.coordinate[0], firstPin.coordinate[1])
        : map.layerPointToLatLng(L.point(proximityGroup.center.x, proximityGroup.center.y));
      const leafletMarker = L.marker(markerLatLng, {
        icon: singleton ? createSinglePinIcon(firstPin) : createClusterIcon(pins.length),
        keyboard: true,
        riseOnHover: true,
        bubblingMouseEvents: false,
        title: singleton
          ? `${firstPin.name} — ${getPinTypeVisual(firstPin.entityType).label}`
          : `${pins.length} pines agrupados`,
      });
      const group: RenderedPinGroup = {
        pins,
        marker: leafletMarker,
        center: proximityGroup.center,
      };

      const handleClick = (): void => {
        if (singleton) activatePin(firstPin);
        else openSpiderfy(group, undefined, false);
      };

      leafletMarker.on('click', handleClick);
      leafletMarker.on('add', () => {
        if (singleton) decoratePinMarker(leafletMarker, firstPin);
        else decorateClusterMarker(group);
      });
      leafletMarker.on('remove', () => {
        leafletMarker.off('click', handleClick);
      });
      leafletMarker.addTo(map);
      groupMarkers.add(leafletMarker);
      renderedGroups.add(group);
      for (const pin of pins) {
        groupMarkerByPinId.set(pin.id, leafletMarker);
        renderedGroupByPinId.set(pin.id, group);
      }
    }

    refreshPortraitMarkers(eagerPortraitPinIds);
  };

  const refreshMarkerPresentation = (): void => {
    renderedGroups.forEach(({ marker, pins }) => updateGroupPresentation(marker, pins));
    const spiderfy = activeSpiderfy;
    if (spiderfy) {
      spiderfy.memberMarkers.forEach((memberMarker, index) => {
        const pin = spiderfy.group.pins[index];
        if (pin) updateGroupPresentation(memberMarker, [pin]);
      });
    }
  };

  const preserveVisiblePortraitPinIds = (): ReadonlySet<string> => {
    const eager = new Set<string>();
    for (const pin of renderedMarkers) {
      const element = groupMarkerByPinId.get(pin.id)?.getElement();
      if (element?.dataset.portraitMarker === 'true') eager.add(pin.id);
    }
    return eager;
  };

  const reclusterAtCurrentZoom = (): void => {
    if (destroyed) return;
    const eagerPortraitPinIds = preserveVisiblePortraitPinIds();
    renderMarkers(renderedMarkers, eagerPortraitPinIds);
    refreshMarkerPresentation();
  };

  const revealPin = (pinId: string, focus: boolean): void => {
    const group = renderedGroupByPinId.get(pinId);
    if (!group) return;

    if (group.pins.length > 1) {
      openSpiderfy(group, pinId, focus);
      return;
    }

    const marker = group.marker;
    if (focus) {
      window.requestAnimationFrame(() => marker.getElement()?.focus({ preventScroll: true }));
    }
  };

  locatePin = (pinId: string, revealGrouped = true): void => {
    const pin = renderedMarkers.find(({ id }) => id === pinId);
    if (!pin) return;

    collapseSpiderfy(false);
    clearMapSearchFocus(map);
    const targetZoom = Math.min(
      FAERUN_MAP_CONFIG.maxZoom,
      Math.max(map.getZoom(), map.getMinZoom() + 1),
    );
    map.setView(L.latLng(pin.coordinate[0], pin.coordinate[1]), targetZoom, {
      animate: false,
    });
    map.panInsideBounds(bounds, { animate: false });
    synchronizeViewDataset(map, elements.shell);
    reclusterAtCurrentZoom();
    if (revealGrouped) revealPin(pinId, false);
  };

  matchingPinIds = new Set((options.markers ?? []).map(({ id }) => id));
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
  const handleZoomStart = (): void => collapseSpiderfy(false);
  const handleMoveStart = (): void => collapseSpiderfy(false);
  const handleZoomEnd = (): void => {
    synchronizeView();
    reclusterAtCurrentZoom();
  };
  const handleMoveEnd = (): void => {
    synchronizeView();
    refreshPortraitMarkers();
  };
  const handleMapClick = (): void => collapseSpiderfy(false);
  const interactionRoot = root instanceof HTMLElement ? root : null;
  const handleRootPointerDown = (event: PointerEvent): void => {
    if (!activeSpiderfy || !(event.target instanceof Element)) return;
    if (event.target.closest('[data-spiderfied="true"]')) return;
    collapseSpiderfy(false);
  };
  interactionRoot?.addEventListener('pointerdown', handleRootPointerDown);

  map.on('zoomstart', handleZoomStart);
  map.on('movestart', handleMoveStart);
  map.on('zoomend', handleZoomEnd);
  map.on('moveend', handleMoveEnd);
  map.on('click', handleMapClick);
  synchronizeView();

  const handleMapKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !activeSpiderfy || targetIsEditable(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    collapseSpiderfy(true);
  };
  elements.canvas.addEventListener('keydown', handleMapKeyDown);

  let resizeFrame: number | undefined;
  const handleResize = (): void => {
    if (expandedMapLayout.isResizeSynchronizationPending()) return;
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (destroyed) return;
      collapseSpiderfy(false);
      const wasAtMinimumZoom = Math.abs(map.getZoom() - map.getMinZoom()) < 0.01;
      map.invalidateSize({ animate: false, pan: false });
      constrainViewport(map, bounds, wasAtMinimumZoom);
      synchronizeView();
      reclusterAtCurrentZoom();
    });
  };
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(handleResize);
  if (resizeObserver) resizeObserver.observe(elements.canvas);
  else window.addEventListener('resize', handleResize);

  return {
    map,
    setMarkers(markers, updateOptions = {}): void {
      const eagerPortraitPinIds = new Set(updateOptions.eagerPortraitPinIds ?? []);
      for (const pin of renderedMarkers) {
        const element = groupMarkerByPinId.get(pin.id)?.getElement();
        if (element?.dataset.portraitMarker === 'true') {
          eagerPortraitPinIds.add(pin.id);
        }
      }
      renderMarkers(markers, eagerPortraitPinIds);
      refreshMarkerPresentation();
    },
    setActivePlace(placeId: PlaceId | null): void {
      const selectedPinId = placeId === null ? null : pinIdByLegacyPlaceId.get(placeId);
      if (
        activeSpiderfy &&
        (!selectedPinId || !activeSpiderfy.group.pins.some(({ id }) => id === selectedPinId))
      ) {
        collapseSpiderfy(false);
      }
      activePlaceId = placeId;
      if (placeId !== null) activeSupplementalPinId = null;
      refreshMarkerPresentation();
      refreshPortraitMarkers();
    },
    clearSupplementalPinSelection(): void {
      if (
        activeSpiderfy &&
        activeSupplementalPinId &&
        activeSpiderfy.group.pins.some(({ id }) => id === activeSupplementalPinId)
      ) {
        collapseSpiderfy(false);
      }
      activeSupplementalPinId = null;
      refreshMarkerPresentation();
    },
    setMatchingPins(pinIds, semantics = 'search-and-filters'): void {
      matchingPinIds = new Set(pinIds);
      matchingSemantics = semantics;
      refreshMarkerPresentation();
    },
    locatePlace(placeId: PlaceId): void {
      const pinId = pinIdByLegacyPlaceId.get(placeId);
      if (pinId) locatePin(pinId);
    },
    locateSearchTarget(target: MapSearchTarget): void {
      collapseSpiderfy(false);
      locateMapSearchTarget(map, root, target);
      synchronizeView();
      reclusterAtCurrentZoom();

      const pin =
        renderedMarkers.find((candidate) => searchTargetMatchesPin(target, candidate)) ??
        renderedMarkers.find(
          (candidate) =>
            candidate.coordinate[0] === target.coordinates.y &&
            candidate.coordinate[1] === target.coordinates.x,
        );
      if (pin) revealPin(pin.id, true);
      refreshPortraitMarkers();
    },
    clearSearchFocus(): void {
      clearMapSearchFocus(map);
    },
    focusMarker(placeId: PlaceId): void {
      const pinId = pinIdByLegacyPlaceId.get(placeId);
      if (pinId) revealPin(pinId, true);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearMapSearchFocus(map);
      clearRenderedMarkers();
      imageOverlay.off('load', handleImageLoad);
      imageOverlay.off('error', handleImageError);
      map.off('zoomstart', handleZoomStart);
      map.off('movestart', handleMoveStart);
      map.off('zoomend', handleZoomEnd);
      map.off('moveend', handleMoveEnd);
      map.off('click', handleMapClick);
      elements.canvas.removeEventListener('keydown', handleMapKeyDown);
      interactionRoot?.removeEventListener('pointerdown', handleRootPointerDown);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      expandedMapLayout.destroy();
      map.remove();
    },
  };
}
