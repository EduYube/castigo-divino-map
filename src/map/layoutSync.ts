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

/**
 * Re-synchronizes Leaflet after a CSS layout change without resetting navigation state.
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

  const fitZoom = Math.min(map.getBoundsZoom(bounds, false), maxZoom);
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
