import { describe, expect, it } from 'vitest';

import { GEOGRAPHIC_COVERAGE_MANIFEST } from './geographicCoverageManifest.js';
import {
  GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST,
  MAP041_GEOGRAPHIC_REVIEW_COUNTS,
  MAP041_GEOGRAPHIC_REVIEW_COUNT,
  MAP041_PUBLISHED_SEARCH_EXTENTS,
  geographicCoverageSemanticFingerprint,
} from './geographicSearchExtentManifest.js';

describe('MAP-041 geographic search extent review manifest', () => {
  it('classifies exactly the MAP-039 universe and fails closed through its semantic fingerprint', () => {
    expect(GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST).toHaveLength(MAP041_GEOGRAPHIC_REVIEW_COUNT);
    expect(GEOGRAPHIC_COVERAGE_MANIFEST).toHaveLength(MAP041_GEOGRAPHIC_REVIEW_COUNT);
    expect(new Set(GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.map(({ id }) => id))).toEqual(
      new Set(GEOGRAPHIC_COVERAGE_MANIFEST.map(({ id }) => id)),
    );
    expect(geographicCoverageSemanticFingerprint()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('publishes a conservative representative sample and leaves the rest fail-closed', () => {
    expect(MAP041_GEOGRAPHIC_REVIEW_COUNTS).toEqual({ point: 87, extent: 13, unverified: 113 });
    expect(MAP041_PUBLISHED_SEARCH_EXTENTS).toHaveLength(13);
    expect(MAP041_PUBLISHED_SEARCH_EXTENTS.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'geo-sword-coast',
        'geo-cormyr',
        'geo-forest-of-tethir',
        'geo-the-high-ice',
        'geo-the-dalelands',
        'geo-high-forest',
        'geo-the-shining-plains',
        'geo-sea-of-swords',
        'geo-moonshae-isles',
      ]),
    );
  });

  it('keeps Waterdeep point-only and gives Sword Coast the reviewed approximate extent', () => {
    expect(
      GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.find(({ id }) => id === 'geo-waterdeep'),
    ).toMatchObject({ status: 'point', searchExtent: null });
    expect(
      GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.find(({ id }) => id === 'geo-sword-coast'),
    ).toMatchObject({
      status: 'extent',
      searchExtent: { minX: 1380, maxX: 1710, minY: 750, maxY: 1500 },
    });
  });
});
