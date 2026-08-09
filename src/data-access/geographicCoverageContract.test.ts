import { describe, expect, it } from 'vitest';

import {
  assertGeographicSearchCoverage,
  REQUIRED_GEOGRAPHIC_NAMES,
} from './geographicCoverageContract.js';

const REQUIRED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'the-evermoors': ['Evermoors'],
  'the-fields-of-the-dead': ['Fields of the Dead'],
  'the-high-forest': ['High Forest'],
  'the-high-moor': ['High Moor'],
  waterdeep: ['City of Splendors'],
};

function createValidContent() {
  return {
    geographicNames: REQUIRED_GEOGRAPHIC_NAMES.map(([slug, name]) => ({
      slug,
      name,
      language: 'en',
      aliases: (REQUIRED_ALIASES[slug] ?? []).map((value) => ({ value })),
      coordinates: slug === 'waterdeep' ? { x: 1626, y: 1465 } : { x: 1000, y: 1000 },
      recommendedZoom: slug === 'waterdeep' ? 0.75 : 0.5,
    })),
  };
}

describe('geographic search coverage contract', () => {
  it('accepts the complete MAP-032 baseline', () => {
    expect(() => assertGeographicSearchCoverage(createValidContent(), 'fixture')).not.toThrow();
  });

  it('rejects an empty geographic index', () => {
    expect(() =>
      assertGeographicSearchCoverage({ geographicNames: [] }, 'empty snapshot'),
    ).toThrow(/expected at least 15 published geographic names/i);
  });

  it('rejects a baseline with a required geographic identity missing', () => {
    const content = createValidContent();
    content.geographicNames = content.geographicNames.filter(({ slug }) => slug !== 'neverwinter');
    content.geographicNames.push({
      slug: 'extra-place',
      name: 'Extra place',
      language: 'en',
      aliases: [],
      coordinates: { x: 1000, y: 1000 },
      recommendedZoom: 0.5,
    });

    expect(() => assertGeographicSearchCoverage(content, 'missing identity')).toThrow(
      /required geographic name neverwinter is missing/i,
    );
  });

  it('rejects Waterdeep coordinate or zoom drift', () => {
    const content = createValidContent();
    const waterdeep = content.geographicNames.find(({ slug }) => slug === 'waterdeep');
    if (!waterdeep) throw new Error('Waterdeep fixture missing');
    waterdeep.coordinates = { x: 1690, y: 1020 };

    expect(() => assertGeographicSearchCoverage(content, 'drifted snapshot')).toThrow(
      /Waterdeep must keep the MAP-032 measured coordinate/i,
    );
  });

  it('rejects a required geographic alias missing from the publication', () => {
    const content = createValidContent();
    const waterdeep = content.geographicNames.find(({ slug }) => slug === 'waterdeep');
    if (!waterdeep) throw new Error('Waterdeep fixture missing');
    waterdeep.aliases = [];

    expect(() => assertGeographicSearchCoverage(content, 'alias drift')).toThrow(
      /waterdeep is missing required alias City of Splendors/i,
    );
  });
});
