import L, { type LatLngBounds, type Map as LeafletMap, type Marker } from 'leaflet';

import { fromLeafletSimpleCoordinate, toLeafletSimpleCoordinate } from '../data/coordinates';
import type { CampaignCoordinate } from '../data/model';
import type { MapEntityType } from '../domain/adminMapEntities';
import { isMapCoordinateWithinBounds } from '../domain/mapCoordinates';
import {
  createPlayerDispositionVisuals,
  describePlayerDispositions,
  getPinTypeVisual,
  type PinPlayerDispositionInput,
} from '../domain/pinVisualSystem';
import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';

export interface AdminEntityEditorMapController {
  setCoordinate(coordinate: CampaignCoordinate): void;
  setVisual(entityType: MapEntityType, dispositions: readonly PinPlayerDispositionInput[]): void;
  focusMarker(): void;
  destroy(): void;
}

export interface AdminEntityEditorMapOptions {
  readonly coordinate: CampaignCoordinate | null;
  readonly entityType?: MapEntityType;
  readonly dispositions?: readonly PinPlayerDispositionInput[];
  readonly onCoordinateChange: (coordinate: CampaignCoordinate) => void;
  readonly onImageStateChange?: (state: 'loading' | 'ready' | 'error') => void;
}

function createBounds(): LatLngBounds {
  const [[south, west], [north, east]] = createSimpleImageBounds();
  return L.latLngBounds([south, west], [north, east]);
}

function createEditorIcon(
  entityType: MapEntityType,
  dispositions: readonly PinPlayerDispositionInput[],
): L.DivIcon {
  const type = getPinTypeVisual(entityType);
  const dispositionMarkup = createPlayerDispositionVisuals(dispositions)
    .map(
      ({ symbol, className }) =>
        `<span class="pin-disposition ${className}" aria-hidden="true">${symbol}</span>`,
    )
    .join('');

  return L.divIcon({
    className: 'admin-map-entity__marker campaign-marker-icon',
    html: `<span class="pin-visual ${type.className}"><span class="pin-visual__type-symbol" aria-hidden="true">${type.symbol}</span><span class="pin-visual__dispositions" aria-hidden="true">${dispositionMarkup}</span></span>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

function coordinateFromMarker(marker: Marker): CampaignCoordinate {
  const latLng = marker.getLatLng();
  return fromLeafletSimpleCoordinate([latLng.lat, latLng.lng]);
}

function constrainViewport(map: LeafletMap, bounds: LatLngBounds, fit: boolean): void {
  const fitZoom = Math.min(map.getBoundsZoom(bounds, false), FAERUN_MAP_CONFIG.maxZoom);
  map.setMinZoom(fitZoom);
  if (fit || map.getZoom() < fitZoom) {
    map.fitBounds(bounds, { animate: false });
  } else {
    map.panInsideBounds(bounds, { animate: false });
  }
}

export function mountAdminEntityEditorMap(
  canvas: HTMLElement,
  options: AdminEntityEditorMapOptions,
): AdminEntityEditorMapController {
  const bounds = createBounds();
  const map = L.map(canvas, {
    crs: L.CRS.Simple,
    attributionControl: false,
    zoomControl: true,
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
  });

  map.fitBounds(bounds, { animate: false });
  constrainViewport(map, bounds, true);

  let destroyed = false;
  let marker: Marker | null = null;
  let currentEntityType = options.entityType ?? 'location';
  let currentDispositions = options.dispositions ?? [];

  const applyMarkerAccessibility = (): void => {
    const element = marker?.getElement();
    if (!element) return;
    const type = getPinTypeVisual(currentEntityType);
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute(
      'aria-label',
      `Coordenada seleccionada. ${type.label}. Disposición por jugador: ${describePlayerDispositions(currentDispositions)}. Puedes arrastrarla con un puntero o editar X e Y en el formulario.`,
    );
    element.setAttribute('data-testid', 'admin-coordinate-marker');
    element.dataset.entityType = currentEntityType;
  };

  const applyMarkerVisual = (): void => {
    marker?.setIcon(createEditorIcon(currentEntityType, currentDispositions));
    applyMarkerAccessibility();
  };

  const ensureMarker = (coordinate: CampaignCoordinate): Marker => {
    const simple = toLeafletSimpleCoordinate(coordinate);
    if (!marker) {
      marker = L.marker(L.latLng(simple[0], simple[1]), {
        icon: createEditorIcon(currentEntityType, currentDispositions),
        draggable: true,
        keyboard: true,
        riseOnHover: true,
        title: 'Coordenada en edición',
      });
      marker.on('dragend', () => {
        if (!marker) return;
        const next = coordinateFromMarker(marker);
        if (!isMapCoordinateWithinBounds(next)) return;
        options.onCoordinateChange(next);
      });
      marker.on('add', applyMarkerAccessibility);
      marker.addTo(map);
    } else {
      marker.setLatLng(L.latLng(simple[0], simple[1]));
    }
    applyMarkerAccessibility();
    return marker;
  };

  if (options.coordinate && isMapCoordinateWithinBounds(options.coordinate)) {
    ensureMarker(options.coordinate);
  }

  const handleMapClick = (event: L.LeafletMouseEvent): void => {
    const next = fromLeafletSimpleCoordinate([event.latlng.lat, event.latlng.lng]);
    if (!isMapCoordinateWithinBounds(next)) return;
    ensureMarker(next);
    options.onCoordinateChange(next);
  };
  map.on('click', handleMapClick);

  const imageOverlay = L.imageOverlay(OFFICIAL_MAP_URL, bounds, {
    alt: 'Mapa oficial de la Costa de la Espada y el noroeste de Faerûn',
    className: 'admin-map-entity__image',
    interactive: false,
  });
  options.onImageStateChange?.('loading');
  const handleImageLoad = (): void => {
    if (!destroyed) options.onImageStateChange?.('ready');
  };
  const handleImageError = (): void => {
    if (destroyed) return;
    imageOverlay.removeFrom(map);
    options.onImageStateChange?.('error');
  };
  imageOverlay.once('load', handleImageLoad);
  imageOverlay.once('error', handleImageError);
  imageOverlay.addTo(map);

  let resizeFrame: number | undefined;
  const handleResize = (): void => {
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (destroyed) return;
      const atMinimum = Math.abs(map.getZoom() - map.getMinZoom()) < 0.01;
      map.invalidateSize({ animate: false, pan: false });
      constrainViewport(map, bounds, atMinimum);
    });
  };
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(handleResize);
  if (resizeObserver) resizeObserver.observe(canvas);
  else window.addEventListener('resize', handleResize);

  return {
    setCoordinate(coordinate): void {
      if (!isMapCoordinateWithinBounds(coordinate)) return;
      ensureMarker(coordinate);
    },
    setVisual(entityType, dispositions): void {
      currentEntityType = entityType;
      currentDispositions = dispositions;
      applyMarkerVisual();
    },
    focusMarker(): void {
      marker?.getElement()?.focus({ preventScroll: true });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      map.off('click', handleMapClick);
      imageOverlay.off('load', handleImageLoad);
      imageOverlay.off('error', handleImageError);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      map.remove();
      marker = null;
    },
  };
}
