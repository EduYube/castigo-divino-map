import { describe, expect, it } from 'vitest';

import {
  assertGeographicCoverageManifest,
  assertGeographicSearchCoverage,
  MAP032_STABLE_IDS,
} from './geographicCoverageContract.js';
import {
  GEOGRAPHIC_COVERAGE_MANIFEST,
  GEOGRAPHIC_COVERAGE_MANIFEST_COUNT,
  GEOGRAPHIC_ZOOM_POLICY,
} from './geographicCoverageManifest.js';

function createValidContent() {
  return {
    geographicNames: GEOGRAPHIC_COVERAGE_MANIFEST.map((expected, index) => ({
      id: expected.id,
      slug: expected.slug,
      name: expected.name,
      language: 'en',
      aliases: expected.requiredAliases.map((alias) => ({
        ...alias,
        geographicNameId: expected.id,
        language: 'en',
      })),
      coordinates: expected.lockedCoordinates ?? {
        x: 100 + (index % 30) * 100,
        y: 100 + (index % 20) * 100,
      },
      recommendedZoom: GEOGRAPHIC_ZOOM_POLICY[expected.zoomClass],
      entityId: null,
    })),
  };
}

function createValidMulticampaignContent() {
  const legacy = createValidContent();
  return {
    schemaVersion: 3,
    geographicNames: legacy.geographicNames.map((name) => {
      const globalName = { ...name };
      Reflect.deleteProperty(globalName, 'entityId');
      return globalName as Omit<typeof name, 'entityId'>;
    }),
  };
}

describe('MAP-039 geographic search coverage contract', () => {
  it('accepts the audited complete raster inventory', () => {
    expect(GEOGRAPHIC_COVERAGE_MANIFEST_COUNT).toBe(213);
    expect(() => assertGeographicCoverageManifest()).not.toThrow();
    expect(() => assertGeographicSearchCoverage(createValidContent(), 'fixture')).not.toThrow();

    for (const name of [
      'The Dalelands',
      'Thunder Peaks',
      'The Shining Plains',
      'The High Ice',
      'Omans Isle',
    ]) {
      expect(GEOGRAPHIC_COVERAGE_MANIFEST.some((entry) => entry.name === name)).toBe(true);
    }
  });

  it('accepts schema v3 global geography only when campaign entity pointers are absent', () => {
    const content = createValidMulticampaignContent();

    expect(() => assertGeographicSearchCoverage(content, 'multicampaign fixture')).not.toThrow();

    const tuern = content.geographicNames.find(({ id }) => id === 'geo-tuern');
    if (!tuern) throw new Error('Tuern fixture missing');
    Object.assign(tuern, { entityId: null });

    expect(() => assertGeographicSearchCoverage(content, 'invalid multicampaign pointer')).toThrow(
      /geo-tuern must remain global without a campaign-specific entityId/i,
    );
  });

  it('keeps the legacy projection strict about explicit search-only entityId null values', () => {
    const content = createValidContent();
    const tuern = content.geographicNames.find(({ id }) => id === 'geo-tuern');
    if (!tuern) throw new Error('Tuern fixture missing');
    const legacyRowWithoutEntityId = { ...tuern } as Partial<typeof tuern>;
    delete legacyRowWithoutEntityId.entityId;
    content.geographicNames = content.geographicNames.map((entry) =>
      entry.id === tuern.id ? (legacyRowWithoutEntityId as typeof entry) : entry,
    );

    expect(() => assertGeographicSearchCoverage(content, 'invalid legacy pointer')).toThrow(
      /geo-tuern must remain a search-only geographic identity/i,
    );
  });

  it('rejects a required geographic identity even when the row count stays high', () => {
    const content = createValidContent();
    content.geographicNames = content.geographicNames.filter(
      ({ id }) => id !== 'geo-the-dalelands',
    );

    for (let index = 0; index < 50; index += 1) {
      content.geographicNames.push({
        id: `geo-extra-${index}`,
        slug: `extra-${index}`,
        name: `Extra ${index}`,
        language: 'en',
        aliases: [],
        coordinates: { x: 1000, y: 1000 },
        recommendedZoom: 0.5,
        entityId: null,
      });
    }

    expect(content.geographicNames.length).toBeGreaterThan(GEOGRAPHIC_COVERAGE_MANIFEST_COUNT);
    expect(() => assertGeographicSearchCoverage(content, 'missing identity')).toThrow(
      /required geographic identity geo-the-dalelands is missing/i,
    );
  });

  it('rejects invalid coordinates for a covered identity', () => {
    const content = createValidContent();
    const thunderPeaks = content.geographicNames.find(({ id }) => id === 'geo-thunder-peaks');
    if (!thunderPeaks) throw new Error('Thunder Peaks fixture missing');
    thunderPeaks.coordinates = { x: 3601, y: 859 };

    expect(() => assertGeographicSearchCoverage(content, 'invalid coordinates')).toThrow(
      /geo-thunder-peaks must use finite coordinates inside the official map bounds/i,
    );
  });

  it('rejects zoom drift from the scale policy', () => {
    const content = createValidContent();
    const shiningPlains = content.geographicNames.find(({ id }) => id === 'geo-the-shining-plains');
    if (!shiningPlains) throw new Error('The Shining Plains fixture missing');
    shiningPlains.recommendedZoom = 0.75;

    expect(() => assertGeographicSearchCoverage(content, 'invalid zoom')).toThrow(
      /geo-the-shining-plains must use the area zoom policy \(0\.5\)/i,
    );
  });

  it('rejects a required alias missing from the publication', () => {
    const content = createValidContent();
    const starMounts = content.geographicNames.find(({ id }) => id === 'geo-star-mountains');
    if (!starMounts) throw new Error('Star Mounts fixture missing');
    starMounts.aliases = [];

    expect(() => assertGeographicSearchCoverage(content, 'alias drift')).toThrow(
      /geo-star-mountains is missing required alias Star Mountains/i,
    );
  });

  it('keeps every MAP-032 stable identity, coordinate lock and legacy search compatibility', () => {
    const content = createValidContent();
    const ids = new Set(GEOGRAPHIC_COVERAGE_MANIFEST.map(({ id }) => id));

    expect(MAP032_STABLE_IDS).toHaveLength(15);
    expect(MAP032_STABLE_IDS.every((id) => ids.has(id))).toBe(true);

    const waterdeep = content.geographicNames.find(({ id }) => id === 'geo-waterdeep');
    expect(waterdeep?.coordinates).toEqual({ x: 1626, y: 1465 });
    expect(waterdeep?.recommendedZoom).toBe(0.75);

    const starMounts = content.geographicNames.find(({ id }) => id === 'geo-star-mountains');
    expect(starMounts?.slug).toBe('star-mountains');
    expect(starMounts?.name).toBe('Star Mounts');
    expect(starMounts?.aliases.map(({ value }) => value)).toContain('Star Mountains');
  });
});
