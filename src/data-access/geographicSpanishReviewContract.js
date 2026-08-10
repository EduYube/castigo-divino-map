import { assertGeographicSearchCoverage } from './geographicCoverageContract.js';
import { GEOGRAPHIC_COVERAGE_MANIFEST } from './geographicCoverageManifest.js';
import {
  GEOGRAPHIC_SPANISH_REVIEW_MANIFEST,
  MAP040_SPANISH_REVIEW_COUNT,
  MAP040_SPANISH_REVIEW_COUNTS,
} from './geographicSpanishReviewManifest.js';

function fail(label, message) {
  throw new Error(`MAP-040 Spanish geographic coverage (${label}): ${message}`);
}

export function spanishGeographicAliasId(geographicNameId) {
  if (typeof geographicNameId !== 'string' || !geographicNameId.startsWith('geo-')) {
    throw new Error('MAP-040 Spanish alias IDs require a geo-* identity.');
  }

  return `geo-alias-${geographicNameId.slice(4)}-es`;
}

export function assertGeographicSpanishReviewIdentitySet(
  map039Entries = GEOGRAPHIC_COVERAGE_MANIFEST,
) {
  const reviewedIds = new Set(GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.map(({ id }) => id));
  const map039Ids = new Set(map039Entries.map(({ id }) => id));

  if (reviewedIds.size !== MAP040_SPANISH_REVIEW_COUNT) {
    fail(
      'review manifest',
      `expected ${MAP040_SPANISH_REVIEW_COUNT} reviewed IDs, got ${reviewedIds.size}.`,
    );
  }

  for (const id of map039Ids) {
    if (!reviewedIds.has(id)) {
      fail('review manifest', `${id} exists in MAP-039 but has not been audited by MAP-040.`);
    }
  }
  for (const id of reviewedIds) {
    if (!map039Ids.has(id)) {
      fail('review manifest', `${id} is audited by MAP-040 but is absent from MAP-039.`);
    }
  }
}

export function assertGeographicSpanishReviewManifest() {
  if (GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.length !== MAP040_SPANISH_REVIEW_COUNT) {
    fail(
      'review manifest',
      `expected ${MAP040_SPANISH_REVIEW_COUNT} identities, got ${GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.length}.`,
    );
  }

  assertGeographicSpanishReviewIdentitySet();

  const total =
    MAP040_SPANISH_REVIEW_COUNTS.translated +
    MAP040_SPANISH_REVIEW_COUNTS.unchanged +
    MAP040_SPANISH_REVIEW_COUNTS.unverified;

  if (total !== MAP040_SPANISH_REVIEW_COUNT) {
    fail(
      'review manifest',
      `status counts add up to ${total}, not ${MAP040_SPANISH_REVIEW_COUNT}.`,
    );
  }

  const waterdeep = GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.find(({ id }) => id === 'geo-waterdeep');
  if (
    waterdeep?.status !== 'translated' ||
    !waterdeep.aliases.includes('Aguas Profundas') ||
    waterdeep.sources.length === 0
  ) {
    fail('review manifest', 'Waterdeep must retain the verified Aguas Profundas decision.');
  }
}

export function assertGeographicSpanishSearchCoverage(content, label = 'catalog') {
  assertGeographicSpanishReviewManifest();
  assertGeographicSearchCoverage(content, label);

  if (!content || typeof content !== 'object' || !Array.isArray(content.geographicNames)) {
    fail(label, 'geographicNames must be an array.');
  }

  const expectedSpanishAliases = new Map();
  for (const review of GEOGRAPHIC_SPANISH_REVIEW_MANIFEST) {
    for (const value of review.aliases) {
      const id = spanishGeographicAliasId(review.id);
      expectedSpanishAliases.set(`${review.id}\u0000${value}`, {
        id,
        geographicNameId: review.id,
        value,
      });
    }
  }

  const observedSpanishAliases = [];
  for (const geographicName of content.geographicNames) {
    if (
      !geographicName ||
      typeof geographicName !== 'object' ||
      !Array.isArray(geographicName.aliases)
    ) {
      fail(label, `${geographicName?.id ?? 'unknown identity'} must expose aliases as an array.`);
    }

    for (const alias of geographicName.aliases) {
      if (alias?.language !== 'es') continue;

      observedSpanishAliases.push({ geographicName, alias });
      const expected = expectedSpanishAliases.get(`${geographicName.id}\u0000${alias.value}`);
      if (!expected) {
        fail(
          label,
          `${geographicName.id} exposes unverified Spanish alias ${String(alias.value)}.`,
        );
      }
      if (alias.id !== expected.id || alias.geographicNameId !== geographicName.id) {
        fail(
          label,
          `${geographicName.id} Spanish alias ${alias.value} does not use deterministic ID ${expected.id}.`,
        );
      }
    }
  }

  if (observedSpanishAliases.length !== expectedSpanishAliases.size) {
    fail(
      label,
      `expected ${expectedSpanishAliases.size} verified Spanish aliases, got ${observedSpanishAliases.length}.`,
    );
  }

  for (const expected of expectedSpanishAliases.values()) {
    const found = observedSpanishAliases.some(
      ({ geographicName, alias }) =>
        geographicName.id === expected.geographicNameId &&
        alias.id === expected.id &&
        alias.value === expected.value &&
        alias.language === 'es',
    );
    if (!found) {
      fail(
        label,
        `${expected.geographicNameId} is missing verified Spanish alias ${expected.value}.`,
      );
    }
  }
}
