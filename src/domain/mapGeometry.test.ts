import { describe, expect, it } from 'vitest';

import { mapGeometryRepresentativePoint, normalizeMapEntityGeometry } from './mapGeometry';

describe('MAP-060 map geometry', () => {
  it('canonicalizes equivalent polygons deterministically', () => {
    const expected = {
      kind: 'polygon',
      vertices: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 250 },
        { x: 100, y: 250 },
      ],
    } as const;

    expect(
      normalizeMapEntityGeometry('location', {
        kind: 'polygon',
        vertices: [
          { x: 300, y: 250 },
          { x: 300, y: 100 },
          { x: 100, y: 100 },
          { x: 100, y: 250 },
        ],
      }),
    ).toEqual(expected);
    expect(
      normalizeMapEntityGeometry('location', {
        kind: 'polygon',
        vertices: [
          { x: 300, y: 100 },
          { x: 300, y: 250 },
          { x: 100, y: 250 },
          { x: 100, y: 100 },
        ],
      }),
    ).toEqual(expected);
  });

  it('derives a deterministic bounding-box representative point', () => {
    const geometry = normalizeMapEntityGeometry('location', {
      kind: 'polygon',
      vertices: [
        { x: 100, y: 100 },
        { x: 450, y: 120 },
        { x: 300, y: 500 },
      ],
    });

    expect(mapGeometryRepresentativePoint(geometry)).toEqual({ x: 275, y: 300 });
  });

  it.each([
    [
      'fewer than three vertices',
      {
        kind: 'polygon',
        vertices: [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ],
      },
    ],
    [
      'out-of-bounds coordinates',
      {
        kind: 'polygon',
        vertices: [
          { x: -1, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ],
      },
    ],
    [
      'zero-area polygons',
      {
        kind: 'polygon',
        vertices: [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
          { x: 300, y: 300 },
        ],
      },
    ],
    [
      'self intersections',
      {
        kind: 'polygon',
        vertices: [
          { x: 100, y: 100 },
          { x: 300, y: 300 },
          { x: 100, y: 300 },
          { x: 300, y: 100 },
        ],
      },
    ],
  ])('rejects %s', (_label, geometry) => {
    expect(() => normalizeMapEntityGeometry('location', geometry)).toThrow();
  });

  it('rejects polygon geometry for characters', () => {
    expect(() =>
      normalizeMapEntityGeometry('character', {
        kind: 'polygon',
        vertices: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ],
      }),
    ).toThrow(/Characters must use point geometry/);
  });
});
