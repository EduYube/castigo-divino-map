import L, { type LatLngBounds, type Map as LeafletMap, type Marker, type Polygon } from 'leaflet';

import { fromLeafletSimpleCoordinate, toLeafletSimpleCoordinate } from '../data/coordinates';
import type { CampaignCoordinate } from '../data/model';
import type { MapEntityType } from '../domain/adminMapEntities';
import { isMapCoordinateWithinBounds } from '../domain/mapCoordinates';
import {
  MAP_POLYGON_MAX_VERTICES,
  createPointMapGeometry,
  type MapEntityGeometry,
} from '../domain/mapGeometry';
import {
  createPlayerDispositionVisuals,
  describePlayerDispositions,
  getPinTypeVisual,
  type PinPlayerDispositionInput,
} from '../domain/pinVisualSystem';
import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';

export interface AdminEntityEditorMapController {
  setCoordinate(coordinate: CampaignCoordinate): void;
  setGeometry(geometry: MapEntityGeometry): void;
  setGeometryKind(kind: MapEntityGeometry['kind']): void;
  getGeometry(): MapEntityGeometry | null;
  setVisual(entityType: MapEntityType, dispositions: readonly PinPlayerDispositionInput[]): void;
  focusMarker(): void;
  focusGeometry(): void;
  destroy(): void;
}

export interface AdminEntityEditorMapOptions {
  readonly coordinate: CampaignCoordinate | null;
  readonly geometry?: MapEntityGeometry | null;
  readonly entityType?: MapEntityType;
  readonly dispositions?: readonly PinPlayerDispositionInput[];
  readonly onCoordinateChange: (coordinate: CampaignCoordinate) => void;
  readonly onGeometryChange?: (geometry: MapEntityGeometry) => void;
  readonly onImageStateChange?: (state: 'loading' | 'ready' | 'error') => void;
}

const POLYGON_PANE = 'adminGeometryPane';
const VERTEX_PANE = 'adminGeometryVertexPane';

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

function createVertexIcon(index: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: `admin-map-entity__vertex${selected ? ' admin-map-entity__vertex--selected' : ''}`,
    html: `<span aria-hidden="true">${index + 1}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
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

function starterPolygon(coordinate: CampaignCoordinate): MapEntityGeometry {
  const radius = 36;
  const x0 = Math.max(0, coordinate.x - radius);
  const x1 = Math.min(3600, coordinate.x + radius);
  const y0 = Math.max(0, coordinate.y - radius);
  const y1 = Math.min(2329, coordinate.y + radius);
  return {
    kind: 'polygon',
    vertices: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
}

function polygonRepresentative(vertices: readonly CampaignCoordinate[]): CampaignCoordinate | null {
  if (vertices.length < 3) return null;
  const xs = vertices.map(({ x }) => x);
  const ys = vertices.map(({ y }) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function polygonLatLngs(vertices: readonly CampaignCoordinate[]): L.LatLng[] {
  return vertices.map((coordinate) => {
    const [lat, lng] = toLeafletSimpleCoordinate(coordinate);
    return L.latLng(lat, lng);
  });
}

function distanceSquaredToSegment(
  point: CampaignCoordinate,
  start: CampaignCoordinate,
  end: CampaignCoordinate,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  const x = start.x + t * dx;
  const y = start.y + t * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function insertionIndex(
  vertices: readonly CampaignCoordinate[],
  point: CampaignCoordinate,
): number {
  if (vertices.length < 2) return vertices.length;
  let bestIndex = vertices.length;
  let bestDistance = Number.POSITIVE_INFINITY;
  vertices.forEach((start, index) => {
    const end = vertices[(index + 1) % vertices.length]!;
    const distance = distanceSquaredToSegment(point, start, end);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index + 1;
    }
  });
  return bestIndex;
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
    doubleClickZoom: false,
    boxZoom: true,
  });

  const polygonPane = map.createPane(POLYGON_PANE);
  polygonPane.style.zIndex = '430';
  polygonPane.style.pointerEvents = 'none';
  const vertexPane = map.createPane(VERTEX_PANE);
  vertexPane.style.zIndex = '620';

  const removeVertexButton = document.createElement('button');
  removeVertexButton.type = 'button';
  removeVertexButton.className = 'admin-map-entity__button admin-map-entity__vertex-delete';
  removeVertexButton.textContent = 'Eliminar vértice seleccionado';
  removeVertexButton.setAttribute('data-testid', 'admin-polygon-delete-vertex');
  removeVertexButton.hidden = true;
  canvas.insertAdjacentElement('afterend', removeVertexButton);

  map.fitBounds(bounds, { animate: false });
  constrainViewport(map, bounds, true);

  let destroyed = false;
  let marker: Marker | null = null;
  let polygon: Polygon | null = null;
  let vertexMarkers: Marker[] = [];
  let selectedVertexIndex: number | null = null;
  let currentEntityType = options.entityType ?? 'location';
  let currentDispositions = options.dispositions ?? [];
  let currentGeometry: MapEntityGeometry | null =
    options.geometry ??
    (options.coordinate && isMapCoordinateWithinBounds(options.coordinate)
      ? createPointMapGeometry(options.coordinate)
      : null);

  const synchronizeVertexAction = (): void => {
    const polygonGeometry = currentGeometry?.kind === 'polygon' ? currentGeometry : null;
    const vertexCount = polygonGeometry?.vertices.length ?? 0;
    removeVertexButton.hidden = polygonGeometry === null;
    removeVertexButton.disabled = selectedVertexIndex === null || vertexCount <= 3;
    removeVertexButton.setAttribute(
      'aria-label',
      selectedVertexIndex === null
        ? 'Selecciona un vértice para poder eliminarlo'
        : vertexCount <= 3
          ? 'La región necesita al menos tres vértices'
          : `Eliminar vértice ${selectedVertexIndex + 1} de ${vertexCount}`,
    );
  };

  const emitGeometry = (): void => {
    if (!currentGeometry) return;
    options.onGeometryChange?.(currentGeometry);
    if (currentGeometry.kind === 'point') {
      options.onCoordinateChange(currentGeometry.coordinates);
      return;
    }
    const representative = polygonRepresentative(currentGeometry.vertices);
    if (representative) options.onCoordinateChange(representative);
  };

  const applyMarkerAccessibility = (): void => {
    const element = marker?.getElement();
    if (!element) return;
    const type = getPinTypeVisual(currentEntityType);
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute(
      'aria-label',
      `Punto seleccionado. ${type.label}. Relación con los personajes: ${describePlayerDispositions(currentDispositions)}. Puedes arrastrarlo con un puntero o editar X e Y en el formulario.`,
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
        title: 'Punto en edición',
      });
      marker.on('dragend', () => {
        if (!marker) return;
        const next = coordinateFromMarker(marker);
        if (!isMapCoordinateWithinBounds(next)) return;
        currentGeometry = createPointMapGeometry(next);
        emitGeometry();
      });
      marker.on('add', applyMarkerAccessibility);
      marker.addTo(map);
    } else {
      marker.setLatLng(L.latLng(simple[0], simple[1]));
    }
    applyMarkerAccessibility();
    return marker;
  };

  const removePointMarker = (): void => {
    marker?.removeFrom(map);
    marker = null;
  };

  const removePolygonLayers = (clearSelection = true): void => {
    polygon?.removeFrom(map);
    polygon = null;
    vertexMarkers.forEach((vertex) => vertex.removeFrom(map));
    vertexMarkers = [];
    if (clearSelection) selectedVertexIndex = null;
  };

  const setSelectedVertex = (index: number | null): void => {
    selectedVertexIndex = index;
    vertexMarkers.forEach((vertex, vertexIndex) => {
      vertex.setIcon(createVertexIcon(vertexIndex, vertexIndex === selectedVertexIndex));
      const element = vertex.getElement();
      if (element)
        element.setAttribute('aria-pressed', String(vertexIndex === selectedVertexIndex));
    });
    synchronizeVertexAction();
  };

  const removeVertex = (index: number): void => {
    if (currentGeometry?.kind !== 'polygon' || currentGeometry.vertices.length <= 3) return;
    currentGeometry = {
      kind: 'polygon',
      vertices: currentGeometry.vertices.filter((_, vertexIndex) => vertexIndex !== index),
    };
    selectedVertexIndex = Math.min(index, currentGeometry.vertices.length - 1);
    renderGeometry();
    emitGeometry();
  };

  const updateVertex = (index: number, coordinate: CampaignCoordinate): void => {
    if (currentGeometry?.kind !== 'polygon' || !isMapCoordinateWithinBounds(coordinate)) return;
    currentGeometry = {
      kind: 'polygon',
      vertices: currentGeometry.vertices.map((vertex, vertexIndex) =>
        vertexIndex === index ? coordinate : vertex,
      ),
    };
    selectedVertexIndex = index;
    renderGeometry();
    emitGeometry();
  };

  const addPolygonVertex = (coordinate: CampaignCoordinate): void => {
    if (currentGeometry?.kind !== 'polygon') return;
    if (currentGeometry.vertices.length >= MAP_POLYGON_MAX_VERTICES) return;
    const index = insertionIndex(currentGeometry.vertices, coordinate);
    const vertices = [...currentGeometry.vertices];
    vertices.splice(index, 0, coordinate);
    currentGeometry = { kind: 'polygon', vertices };
    selectedVertexIndex = index;
    renderGeometry();
    emitGeometry();
  };

  function renderGeometry(): void {
    if (!currentGeometry) {
      removePointMarker();
      removePolygonLayers();
      delete canvas.dataset.geometryKind;
      synchronizeVertexAction();
      return;
    }

    if (currentGeometry.kind === 'point') {
      removePolygonLayers();
      ensureMarker(currentGeometry.coordinates);
      canvas.dataset.geometryKind = 'point';
      synchronizeVertexAction();
      return;
    }

    removePointMarker();
    const preservedSelection = selectedVertexIndex;
    removePolygonLayers(false);
    selectedVertexIndex =
      preservedSelection === null
        ? null
        : Math.min(preservedSelection, Math.max(0, currentGeometry.vertices.length - 1));
    canvas.dataset.geometryKind = 'polygon';
    if (currentGeometry.vertices.length >= 2) {
      polygon = L.polygon(polygonLatLngs(currentGeometry.vertices), {
        pane: POLYGON_PANE,
        className: 'admin-map-entity__polygon-preview',
        interactive: false,
        stroke: true,
        weight: 3,
        opacity: 0.95,
        dashArray: '10 5',
        fill: currentGeometry.vertices.length >= 3,
        fillOpacity: 0.06,
      }).addTo(map);
      polygon.getElement()?.setAttribute('aria-hidden', 'true');
    }

    vertexMarkers = currentGeometry.vertices.map((coordinate, index) => {
      const simple = toLeafletSimpleCoordinate(coordinate);
      const vertex = L.marker(L.latLng(simple[0], simple[1]), {
        pane: VERTEX_PANE,
        icon: createVertexIcon(index, index === selectedVertexIndex),
        draggable: true,
        keyboard: true,
        riseOnHover: true,
        title: `Vértice ${index + 1}`,
      });
      vertex.on('click', () => setSelectedVertex(index));
      vertex.on('dragstart', () => setSelectedVertex(index));
      vertex.on('dragend', () => updateVertex(index, coordinateFromMarker(vertex)));
      vertex.on('add', () => {
        const element = vertex.getElement();
        if (!element) return;
        element.setAttribute('role', 'button');
        element.setAttribute('data-testid', `admin-polygon-vertex-${index}`);
        element.setAttribute('aria-pressed', String(index === selectedVertexIndex));
        element.setAttribute(
          'aria-label',
          `Vértice ${index + 1} de ${currentGeometry?.kind === 'polygon' ? currentGeometry.vertices.length : 0}. Arrastra para mover. Usa las flechas para ajustar; Suprimir elimina el vértice cuando queden al menos tres.`,
        );
        element.addEventListener('keydown', (event) => {
          if (currentGeometry?.kind !== 'polygon') return;
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            removeVertex(index);
            return;
          }
          const step = event.shiftKey ? 10 : 1;
          const current = currentGeometry.vertices[index];
          if (!current) return;
          const delta =
            event.key === 'ArrowLeft'
              ? { x: -step, y: 0 }
              : event.key === 'ArrowRight'
                ? { x: step, y: 0 }
                : event.key === 'ArrowUp'
                  ? { x: 0, y: step }
                  : event.key === 'ArrowDown'
                    ? { x: 0, y: -step }
                    : null;
          if (!delta) return;
          event.preventDefault();
          updateVertex(index, { x: current.x + delta.x, y: current.y + delta.y });
          window.requestAnimationFrame(() => vertexMarkers[index]?.getElement()?.focus());
        });
      });
      vertex.addTo(map);
      return vertex;
    });
    setSelectedVertex(selectedVertexIndex);
  }

  const handleRemoveSelectedVertex = (): void => {
    if (selectedVertexIndex === null) return;
    removeVertex(selectedVertexIndex);
    window.requestAnimationFrame(() => removeVertexButton.focus());
  };
  removeVertexButton.addEventListener('click', handleRemoveSelectedVertex);

  const handleMapClick = (event: L.LeafletMouseEvent): void => {
    const next = fromLeafletSimpleCoordinate([event.latlng.lat, event.latlng.lng]);
    if (!isMapCoordinateWithinBounds(next)) return;
    if (currentGeometry?.kind === 'polygon') {
      addPolygonVertex(next);
      return;
    }
    currentGeometry = createPointMapGeometry(next);
    renderGeometry();
    emitGeometry();
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

  renderGeometry();

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
      currentGeometry = createPointMapGeometry(coordinate);
      renderGeometry();
      emitGeometry();
    },
    setGeometry(geometry): void {
      currentGeometry = geometry;
      renderGeometry();
      emitGeometry();
    },
    setGeometryKind(kind): void {
      if (kind === 'point') {
        if (currentGeometry?.kind === 'polygon') {
          const representative = polygonRepresentative(currentGeometry.vertices);
          currentGeometry = representative ? createPointMapGeometry(representative) : null;
        }
      } else if (currentGeometry?.kind !== 'polygon') {
        currentGeometry =
          currentGeometry?.kind === 'point'
            ? starterPolygon(currentGeometry.coordinates)
            : { kind: 'polygon', vertices: [] };
      }
      renderGeometry();
      emitGeometry();
    },
    getGeometry(): MapEntityGeometry | null {
      return currentGeometry;
    },
    setVisual(entityType, dispositions): void {
      currentEntityType = entityType;
      currentDispositions = dispositions;
      applyMarkerVisual();
    },
    focusMarker(): void {
      marker?.getElement()?.focus({ preventScroll: true });
    },
    focusGeometry(): void {
      if (currentGeometry?.kind === 'polygon') {
        vertexMarkers[0]?.getElement()?.focus({ preventScroll: true });
      } else {
        marker?.getElement()?.focus({ preventScroll: true });
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      map.off('click', handleMapClick);
      imageOverlay.off('load', handleImageLoad);
      imageOverlay.off('error', handleImageError);
      removeVertexButton.removeEventListener('click', handleRemoveSelectedVertex);
      removeVertexButton.remove();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      map.remove();
      marker = null;
      polygon = null;
      vertexMarkers = [];
    },
  };
}
