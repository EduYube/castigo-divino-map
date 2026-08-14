import { describe, expect, it, vi } from 'vitest';
import type { LatLng, LatLngBounds, Map as LeafletMap } from 'leaflet';

import { synchronizeMapAfterLayoutChange } from './layoutSync';

function createBounds(): LatLngBounds {
  return {
    getSouth: () => -2329,
    getNorth: () => 0,
    getWest: () => 0,
    getEast: () => 3600,
  } as unknown as LatLngBounds;
}

function createMapDouble(fitZoom: number, centerSafeZoom = fitZoom) {
  const map = {
    invalidateSize: vi.fn(),
    getBoundsZoom: vi.fn((_bounds: unknown, inside?: boolean) =>
      inside ? centerSafeZoom : fitZoom,
    ),
    setMinZoom: vi.fn(),
    setView: vi.fn(),
    panInsideBounds: vi.fn(),
  };

  return map;
}

describe('synchronizeMapAfterLayoutChange', () => {
  it('invalidates once and preserves center/zoom when the saved view remains compatible', () => {
    const map = createMapDouble(1.5, 2);
    const center = { lat: -812, lng: 1450 } as LatLng;
    const bounds = createBounds();

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
    expect(map.getBoundsZoom).toHaveBeenCalledWith(
      [
        [-1624, 0],
        [0, 2900],
      ],
      true,
    );
    expect(map.setMinZoom).toHaveBeenCalledWith(1.5);
    expect(map.setView).toHaveBeenCalledWith(center, 2.75, { animate: false });
    expect(map.panInsideBounds).toHaveBeenCalledWith(bounds, { animate: false });
  });

  it('raises zoom rather than moving the saved center when the wider viewport needs more margin', () => {
    const map = createMapDouble(1.5, 3.25);
    const center = { lat: -640, lng: 1800 } as LatLng;
    const bounds = createBounds();

    const targetZoom = synchronizeMapAfterLayoutChange(
      map as unknown as LeafletMap,
      bounds,
      center,
      2.5,
      5,
    );

    expect(targetZoom).toBe(3.25);
    expect(map.invalidateSize).toHaveBeenCalledTimes(1);
    expect(map.setMinZoom).toHaveBeenCalledWith(1.5);
    expect(map.setView).toHaveBeenCalledWith(center, 3.25, { animate: false });
  });

  it('still raises zoom to the full-map minimum when that is the stricter constraint', () => {
    const map = createMapDouble(3.25, 2.75);
    const center = { lat: -1164.5, lng: 1800 } as LatLng;
    const bounds = createBounds();

    const targetZoom = synchronizeMapAfterLayoutChange(
      map as unknown as LeafletMap,
      bounds,
      center,
      2.5,
      5,
    );

    expect(targetZoom).toBe(3.25);
    expect(map.setMinZoom).toHaveBeenCalledWith(3.25);
    expect(map.setView).toHaveBeenCalledWith(center, 3.25, { animate: false });
  });
});
