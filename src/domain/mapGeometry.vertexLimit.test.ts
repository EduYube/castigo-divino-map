import { describe, expect, it } from 'vitest';

import { MAP_POLYGON_MAX_VERTICES, normalizeMapEntityGeometry } from './mapGeometry';

describe('MAP-060 polygon vertex limit', () => {
  it('rejects polygons above the canonical 64-vertex backend contract', () => {
    const vertices = Array.from({ length: MAP_POLYGON_MAX_VERTICES + 1 }, (_, index) => ({
      x: index,
      y: 100,
    }));

    expect(() =>
      normalizeMapEntityGeometry('location', {
        kind: 'polygon',
        vertices,
      }),
    ).toThrow(`cannot exceed ${MAP_POLYGON_MAX_VERTICES} vertices`);
  });
});
