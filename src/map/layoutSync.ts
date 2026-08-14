import type { LatLng, LatLngBounds, Map as LeafletMap } from 'leaflet';

/**
 * Re-synchronizes Leaflet after a CSS layout change without resetting navigation state.
 * The saved zoom is only adjusted when the resized viewport makes it incompatible with
 * the map bounds/minimum zoom contract.
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
  const targetZoom = Math.min(maxZoom, Math.max(zoom, fitZoom));

  map.setMinZoom(fitZoom);
  map.setView(center, targetZoom, { animate: false });
  map.panInsideBounds(bounds, { animate: false });

  return targetZoom;
}
