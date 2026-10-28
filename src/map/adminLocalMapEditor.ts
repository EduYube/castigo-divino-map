import L, { type Map as LeafletMap, type Marker } from 'leaflet';
import type { MapEntityGeometry } from '../domain/mapGeometry';
import type { LocalMapContext } from '../domain/adminLocalMaps';
import { isLocalCoordinateInBounds } from '../domain/adminLocalMaps';

type Coordinate = { readonly x: number; readonly y: number };
export interface LocalMapEditor {
  setGeometry(geometry: MapEntityGeometry | null): void;
  setKind(kind: 'point' | 'polygon'): void;
  getGeometry(): MapEntityGeometry | null;
  destroy(): void;
}
export function mountAdminLocalMapEditor(
  container: HTMLElement,
  context: LocalMapContext,
  initial: MapEntityGeometry | null,
  onChange: (geometry: MapEntityGeometry | null) => void,
): LocalMapEditor {
  const bounds = L.latLngBounds([0, 0], [context.height, context.width]);
  const map: LeafletMap = L.map(container, {
    crs: L.CRS.Simple,
    zoomControl: true,
    attributionControl: false,
    keyboard: true,
    minZoom: -5,
    maxZoom: 5,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    doubleClickZoom: false,
    scrollWheelZoom: false,
  });
  map.fitBounds(bounds, { animate: false });
  let geometry: MapEntityGeometry | null = initial;
  let pointMarker: Marker | null = null;
  let vertexMarkers: Marker[] = [];
  let polygonLayer: L.Polygon | null = null;
  let overlay: L.ImageOverlay | null = null;
  let frame: number | undefined;
  const toLatLng = (p: Coordinate): L.LatLng => L.latLng(p.y, p.x);
  const toCoordinate = (latLng: L.LatLng): Coordinate => ({ x: latLng.lng, y: latLng.lat });
  const pointIcon = L.divIcon({
    className: 'local-map__marker',
    html: '<span aria-hidden="true">●</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const vertexIcon = L.divIcon({
    className: 'local-map__vertex',
    html: '<span aria-hidden="true">◆</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  function notify(): void {
    onChange(geometry);
  }
  function clear(): void {
    pointMarker?.remove();
    pointMarker = null;
    vertexMarkers.forEach((v) => v.remove());
    vertexMarkers = [];
    polygonLayer?.remove();
    polygonLayer = null;
  }
  function keyMove(event: KeyboardEvent, index: number | null): void {
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -1, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: 1, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: 1 }
            : event.key === 'ArrowDown'
              ? { x: 0, y: -1 }
              : null;
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    if (index === null && geometry?.kind === 'point') {
      const current = geometry.coordinates;
      const next = { x: current.x + delta.x * step, y: current.y + delta.y * step };
      if (isLocalCoordinateInBounds(next.x, next.y, context)) {
        geometry = { kind: 'point', coordinates: next };
        render();
        notify();
        pointMarker?.getElement()?.focus();
      }
    } else if (index !== null && geometry?.kind === 'polygon') {
      const current = geometry.vertices[index];
      if (!current) return;
      const next = { x: current.x + delta.x * step, y: current.y + delta.y * step };
      if (isLocalCoordinateInBounds(next.x, next.y, context)) {
        geometry = {
          kind: 'polygon',
          vertices: geometry.vertices.map((v, i) => (i === index ? next : v)),
        };
        render();
        notify();
        vertexMarkers[index]?.getElement()?.focus();
      }
    }
  }
  function render(): void {
    clear();
    if (!geometry) return;
    if (geometry.kind === 'point') {
      pointMarker = L.marker(toLatLng(geometry.coordinates), {
        draggable: true,
        keyboard: true,
        icon: pointIcon,
        title: 'Punto local',
      });
      pointMarker.on('dragend', () => {
        if (!pointMarker || geometry?.kind !== 'point') return;
        const next = toCoordinate(pointMarker.getLatLng());
        if (isLocalCoordinateInBounds(next.x, next.y, context)) {
          geometry = { kind: 'point', coordinates: next };
          notify();
        } else render();
      });
      pointMarker.on('add', () => {
        const el = pointMarker?.getElement();
        if (!el) return;
        el.setAttribute('role', 'button');
        el.setAttribute(
          'aria-label',
          'Punto local. Usa flechas para mover, Mayúsculas para diez unidades.',
        );
        el.addEventListener('keydown', (e) => keyMove(e, null));
      });
      pointMarker.addTo(map);
      return;
    }
    const vertices = geometry.vertices;
    if (vertices.length >= 2) {
      polygonLayer = L.polygon(vertices.map(toLatLng), {
        color: '#7153a7',
        weight: 3,
        fillOpacity: vertices.length >= 3 ? 0.15 : 0,
        interactive: false,
      }).addTo(map);
    }
    vertexMarkers = vertices.map((vertex, index) => {
      const marker = L.marker(toLatLng(vertex), {
        draggable: true,
        keyboard: true,
        icon: vertexIcon,
        title: 'Vértice ' + (index + 1),
      });
      marker.on('dragend', () => {
        if (geometry?.kind !== 'polygon') return;
        const next = toCoordinate(marker.getLatLng());
        if (!isLocalCoordinateInBounds(next.x, next.y, context)) {
          render();
          return;
        }
        geometry = {
          kind: 'polygon',
          vertices: geometry.vertices.map((v, i) => (i === index ? next : v)),
        };
        render();
        notify();
      });
      marker.on('add', () => {
        const el = marker.getElement();
        if (!el) return;
        el.setAttribute('role', 'button');
        el.setAttribute(
          'aria-label',
          'Vértice ' + (index + 1) + '. Flechas para mover, Suprimir para eliminar.',
        );
        el.addEventListener('keydown', (e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && geometry?.kind === 'polygon') {
            e.preventDefault();
            geometry = {
              kind: 'polygon',
              vertices: geometry.vertices.filter((_, i) => i !== index),
            };
            render();
            notify();
            return;
          }
          keyMove(e, index);
        });
      });
      marker.addTo(map);
      return marker;
    });
  }
  const onClick = (event: L.LeafletMouseEvent): void => {
    const next = toCoordinate(event.latlng);
    if (!isLocalCoordinateInBounds(next.x, next.y, context)) return;
    if (geometry?.kind === 'polygon') {
      if (geometry.vertices.length >= 64) return;
      geometry = { kind: 'polygon', vertices: [...geometry.vertices, next] };
    } else geometry = { kind: 'point', coordinates: next };
    render();
    notify();
  };
  map.on('click', onClick);
  if (context.imageUri && context.loadingStrategy) {
    overlay = L.imageOverlay(context.imageUri, bounds, {
      alt: context.attribution || context.name,
      interactive: false,
    }).addTo(map);
  }
  render();
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (frame !== undefined) window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
        });
  observer?.observe(container);
  return {
    setGeometry(next): void {
      geometry = next;
      render();
    },
    setKind(kind): void {
      if (kind === 'point' && geometry?.kind !== 'point') geometry = null;
      if (kind === 'polygon' && geometry?.kind !== 'polygon')
        geometry = { kind: 'polygon', vertices: [] };
      render();
      notify();
    },
    getGeometry(): MapEntityGeometry | null {
      return geometry;
    },
    destroy(): void {
      observer?.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      map.off('click', onClick);
      clear();
      overlay?.remove();
      map.remove();
    },
  };
}
