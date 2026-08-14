import type { LatLng, LatLngBounds, LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';

function createCenteredSafeBounds(bounds: LatLngBounds, center: LatLng): LatLngBoundsExpression {
  const latitudeRadius = Math.max(
    0,
    Math.min(center.lat - bounds.getSouth(), bounds.getNorth() - center.lat),
  );
  const longitudeRadius = Math.max(
    0,
    Math.min(center.lng - bounds.getWest(), bounds.getEast() - center.lng),
  );

  return [
    [center.lat - latitudeRadius, center.lng - longitudeRadius],
    [center.lat + latitudeRadius, center.lng + longitudeRadius],
  ];
}

function getFullMapZoom(map: LeafletMap, bounds: LatLngBounds, maxZoom: number): number {
  return Math.min(map.getBoundsZoom(bounds, false), maxZoom);
}

/**
 * Re-synchronizes Leaflet after expanding the CSS layout without resetting navigation state.
 * Center has priority: when the resized viewport cannot keep the saved center at the saved
 * zoom inside maxBounds, zoom is raised only as far as necessary before Leaflet can clamp it.
 */
export function synchronizeMapAfterLayoutChange(
  map: LeafletMap,
  bounds: LatLngBounds,
  center: LatLng,
  zoom: number,
  maxZoom: number,
): number {
  map.invalidateSize({ animate: false, pan: false });

  const fitZoom = getFullMapZoom(map, bounds, maxZoom);
  const centerSafeZoom = Math.min(
    map.getBoundsZoom(createCenteredSafeBounds(bounds, center), true),
    maxZoom,
  );
  const targetZoom = Math.min(maxZoom, Math.max(zoom, fitZoom, centerSafeZoom));

  map.setMinZoom(fitZoom);
  map.setView(center, targetZoom, { animate: false });
  map.panInsideBounds(bounds, { animate: false });

  return targetZoom;
}

/**
 * Re-synchronizes Leaflet after restoring the normal layout and deliberately returns to the
 * complete-map view that was available before expansion. The normal layout minimum is captured
 * when expansion begins so the expanded viewport cannot leak its higher minimum zoom back.
 */
export function synchronizeMapAfterLayoutRestore(
  map: LeafletMap,
  bounds: LatLngBounds,
  normalMinZoom: number,
  maxZoom: number,
): number {
  map.invalidateSize({ animate: false, pan: false });

  const targetZoom = Math.min(normalMinZoom, maxZoom);
  map.setMinZoom(targetZoom);
  map.fitBounds(bounds, { animate: false });
  map.setZoom(targetZoom, { animate: false });

  return targetZoom;
}
