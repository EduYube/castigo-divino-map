import { describe, expect, it } from 'vitest';

import { FAERUN_MAP_SIZE, calculateFitZoom, createSimpleImageBounds } from './config';

describe('Faerûn map configuration', () => {
  it('creates CRS.Simple bounds with latitude mapped to image height', () => {
    expect(createSimpleImageBounds()).toEqual([
      [0, 0],
      [2329, 3600],
    ]);
  });

  it('calculates zoom zero for a viewport matching the source resolution', () => {
    expect(calculateFitZoom(FAERUN_MAP_SIZE)).toBe(0);
  });

  it('calculates a two-level zoom out for a quarter-scale viewport', () => {
    expect(
      calculateFitZoom({
        width: FAERUN_MAP_SIZE.width / 4,
        height: FAERUN_MAP_SIZE.height / 4,
      }),
    ).toBeCloseTo(-2);
  });

  it('rejects invalid map dimensions', () => {
    expect(() => createSimpleImageBounds({ width: 0, height: 2329 })).toThrow(RangeError);
  });
});
