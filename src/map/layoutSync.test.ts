import { describe, expect, it, vi } from 'vitest';
import type { LatLng, LatLngBounds, Map as LeafletMap } from 'leaflet';

import { synchronizeMapAfterLayoutChange } from './layoutSync';

function createMapDouble(fitZoom: number) {
  const map = {
    invalidateSize: vi.fn(),
    getBoundsZoom: vi.fn(() => fitZoom),
    setMinZoom: vi.fn(),
    setView: vi.fn(),
    panInsideBounds: vi.fn(),
  };

  return map;
}

describe('synchronizeMapAfterLayoutChange', () => {
  it('invalidates once and preserves center/zoom when the saved zoom remains compatible', () => {
    const map = createMapDouble(1.5);
    const center = { lat: -812, lng: 1450 } as LatLng;
    const bounds = {} as LatLngBounds;

    const targetZoom = synchronizeMapAfterLayoutChange(
      map as unknown as LeafletMap,
      bounds,
      center,
      2.75,
      5,
    );

    expect(targetZoom).toBe(2.75);
    expect(map.invalidateSize).toHaveBeenCalledTimes(1);
    expect(map.invalidateSize).toHaveBeenCalledWith({ animate: false, pan: false });
    expect(map.getBoundsZoom).toHaveBeenCalledWith(bounds, false);
    expect(map.setMinZoom).toHaveBeenCalledWith(1.5);
    expect(map.setView).toHaveBeenCalledWith(center, 2.75, { animate: false });
    expect(map.panInsideBounds).toHaveBeenCalledWith(bounds, { animate: false });
  });

  it('only raises the saved zoom when resized bounds make it incompatible', () => {
    const map = createMapDouble(3.25);
    const center = { lat: -640, lng: 1800 } as LatLng;
    const bounds = {} as LatLngBounds;

    const targetZoom = synchronizeMapAfterLayoutChange(
      map as unknown as LeafletMap,
      bounds,
      center,
      2.5,
      5,
    );

    expect(targetZoom).toBe(3.25);
    expect(map.invalidateSize).toHaveBeenCalledTimes(1);
    expect(map.setMinZoom).toHaveBeenCalledWith(3.25);
    expect(map.setView).toHaveBeenCalledWith(center, 3.25, { animate: false });
  });
});
