import { describe, expect, it } from 'vitest';

import type { PublicGeographicNameAlias } from '../../data/beta02-model';
import { parseGeographicNameWithExtent } from './geographicSearchExtentRows';

const aliases = new Map<string, readonly PublicGeographicNameAlias[]>();

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'geo-sword-coast',
    slug: 'sword-coast',
    name: 'Sword Coast',
    language: 'en',
    x: 1450,
    y: 1049,
    recommended_zoom: 0.5,
    entity_id: null,
    search_min_x: null,
    search_max_x: null,
    search_min_y: null,
    search_max_y: null,
    ...overrides,
  };
}

describe('MAP-041 geographic extent row codec', () => {
  it('accepts a point target without bounds', () => {
    expect(parseGeographicNameWithExtent(row(), 0, aliases as never)).toMatchObject({
      id: 'geo-sword-coast',
      coordinates: { x: 1450, y: 1049 },
      searchExtent: null,
    });
  });

  it('accepts a canonical coordinate together with valid representative bounds', () => {
    expect(
      parseGeographicNameWithExtent(
        row({ search_min_x: 1380, search_max_x: 1710, search_min_y: 750, search_max_y: 1500 }),
        0,
        aliases as never,
      ),
    ).toMatchObject({
      coordinates: { x: 1450, y: 1049 },
      searchExtent: { minX: 1380, maxX: 1710, minY: 750, maxY: 1500 },
    });
  });

  it.each([
    [{ search_min_x: 1710, search_max_x: 1380, search_min_y: 750, search_max_y: 1500 }, 'search_min_x < search_max_x'],
    [{ search_min_x: 1380, search_max_x: 1380, search_min_y: 750, search_max_y: 1500 }, 'search_min_x < search_max_x'],
    [{ search_min_x: 1380, search_max_x: 1710, search_min_y: 1500, search_max_y: 750 }, 'search_min_y < search_max_y'],
    [{ search_min_x: 1380, search_max_x: 1710, search_min_y: 750, search_max_y: 750 }, 'search_min_y < search_max_y'],
    [{ search_min_x: -1, search_max_x: 1710, search_min_y: 750, search_max_y: 1500 }, '0 y 3600'],
    [{ search_min_x: 1380, search_max_x: 3601, search_min_y: 750, search_max_y: 1500 }, '0 y 3600'],
    [{ search_min_x: 1380, search_max_x: 1710, search_min_y: -1, search_max_y: 1500 }, '0 y 2329'],
    [{ search_min_x: 1380, search_max_x: 1710, search_min_y: 750, search_max_y: 2330 }, '0 y 2329'],
  ])('rejects invalid bounds %j', (bounds, message) => {
    expect(() => parseGeographicNameWithExtent(row(bounds), 0, aliases as never)).toThrow(message);
  });

  it('rejects partial extents instead of silently repairing them', () => {
    expect(() =>
      parseGeographicNameWithExtent(row({ search_min_x: 1380 }), 0, aliases as never),
    ).toThrow('cuatro bounds');
  });

  it('rejects an extent that does not contain the canonical coordinate', () => {
    expect(() =>
      parseGeographicNameWithExtent(
        row({ search_min_x: 0, search_max_x: 100, search_min_y: 0, search_max_y: 100 }),
        0,
        aliases as never,
      ),
    ).toThrow('coordenada canónica');
  });

  it('rejects non-finite bounds', () => {
    expect(() =>
      parseGeographicNameWithExtent(
        row({ search_min_x: Number.NaN, search_max_x: 1710, search_min_y: 750, search_max_y: 1500 }),
        0,
        aliases as never,
      ),
    ).toThrow('número finito');
  });
});
