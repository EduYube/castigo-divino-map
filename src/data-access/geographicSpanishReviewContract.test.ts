import { describe, expect, it } from 'vitest';

import {
  assertGeographicSpanishReviewIdentitySet,
  assertGeographicSpanishReviewManifest,
  assertGeographicSpanishSearchCoverage,
  spanishGeographicAliasId,
} from './geographicSpanishReviewContract.js';
import {
  GEOGRAPHIC_COVERAGE_MANIFEST,
  GEOGRAPHIC_ZOOM_POLICY,
} from './geographicCoverageManifest.js';
import {
  GEOGRAPHIC_SPANISH_REVIEW_MANIFEST,
  MAP040_SPANISH_REVIEW_COUNTS,
  MAP040_VERIFIED_SPANISH_ALIASES,
} from './geographicSpanishReviewManifest.js';

function createValidContent() {
  const spanishAliasesById = new Map<string, string[]>();
  for (const alias of MAP040_VERIFIED_SPANISH_ALIASES) {
    const values = spanishAliasesById.get(alias.geographicNameId) ?? [];
    values.push(alias.value);
    spanishAliasesById.set(alias.geographicNameId, values);
  }

  return {
    geographicNames: GEOGRAPHIC_COVERAGE_MANIFEST.map((expected, index) => ({
      id: expected.id,
      slug: expected.slug,
      name: expected.name,
      language: 'en',
      aliases: [
        ...expected.requiredAliases.map((alias) => ({
          ...alias,
          geographicNameId: expected.id,
          language: 'en',
        })),
        ...(spanishAliasesById.get(expected.id) ?? []).map((value) => ({
          id: spanishGeographicAliasId(expected.id),
          geographicNameId: expected.id,
          language: 'es',
          value,
        })),
      ],
      coordinates: expected.lockedCoordinates ?? {
        x: 100 + (index % 30) * 100,
        y: 100 + (index % 20) * 100,
      },
      recommendedZoom: GEOGRAPHIC_ZOOM_POLICY[expected.zoomClass],
      entityId: null,
    })),
  };
}

describe('MAP-040 Spanish geographic review contract', () => {
  it('classifies all 213 MAP-039 identities without speculative aliases', () => {
    expect(() => assertGeographicSpanishReviewManifest()).not.toThrow();
    expect(GEOGRAPHIC_SPANISH_REVIEW_MANIFEST).toHaveLength(213);
    expect(MAP040_SPANISH_REVIEW_COUNTS).toEqual({
      translated: 8,
      unchanged: 2,
      unverified: 203,
    });
    expect(MAP040_VERIFIED_SPANISH_ALIASES).toHaveLength(8);
  });

  it('fails when MAP-039 contains an identity that was not audited', () => {
    const expandedMap039 = [
      ...GEOGRAPHIC_COVERAGE_MANIFEST,
      { ...GEOGRAPHIC_COVERAGE_MANIFEST[0], id: 'geo-future-identity' },
    ];

    expect(() => assertGeographicSpanishReviewIdentitySet(expandedMap039)).toThrow(
      /geo-future-identity exists in MAP-039 but has not been audited/i,
    );
  });

  it('accepts the verified Spanish aliases and preserves the canonical English identities', () => {
    const content = createValidContent();
    expect(() => assertGeographicSpanishSearchCoverage(content, 'fixture')).not.toThrow();

    const waterdeep = content.geographicNames.find(({ id }) => id === 'geo-waterdeep');
    expect(waterdeep?.name).toBe('Waterdeep');
    expect(waterdeep?.language).toBe('en');
    expect(waterdeep?.aliases).toContainEqual({
      id: 'geo-alias-waterdeep-es',
      geographicNameId: 'geo-waterdeep',
      language: 'es',
      value: 'Aguas Profundas',
    });
    expect(content.geographicNames.filter(({ id }) => id === 'geo-waterdeep')).toHaveLength(1);
  });

  it('rejects a missing verified Spanish alias', () => {
    const content = createValidContent();
    const waterdeep = content.geographicNames.find(({ id }) => id === 'geo-waterdeep');
    if (!waterdeep) throw new Error('Waterdeep fixture missing');
    waterdeep.aliases = waterdeep.aliases.filter(({ language }) => language !== 'es');

    expect(() => assertGeographicSpanishSearchCoverage(content, 'missing alias')).toThrow(
      /expected 8 verified Spanish aliases, got 7|missing verified Spanish alias Aguas Profundas/i,
    );
  });

  it('rejects an invented alias for an unverified identity', () => {
    const content = createValidContent();
    const cormyr = content.geographicNames.find(({ id }) => id === 'geo-cormyr');
    if (!cormyr) throw new Error('Cormyr fixture missing');
    cormyr.aliases.push({
      id: 'geo-alias-cormyr-es',
      geographicNameId: 'geo-cormyr',
      language: 'es',
      value: 'Cormiria',
    });

    expect(() => assertGeographicSpanishSearchCoverage(content, 'invented alias')).toThrow(
      /geo-cormyr exposes unverified Spanish alias Cormiria/i,
    );
  });

  it('distinguishes unchanged and unverified decisions', () => {
    const elturel = GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.find(({ id }) => id === 'geo-elturel');
    const cormyr = GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.find(({ id }) => id === 'geo-cormyr');

    expect(elturel).toMatchObject({ status: 'unchanged', aliases: [] });
    expect(elturel?.sources.length).toBeGreaterThan(0);
    expect(cormyr).toMatchObject({ status: 'unverified', aliases: [], sources: [] });
  });
});
