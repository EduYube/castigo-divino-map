import {
  GEOGRAPHIC_COVERAGE_MANIFEST,
  GEOGRAPHIC_COVERAGE_MANIFEST_COUNT,
  MAP039_AUDITED_INVENTORY_COUNT,
  GEOGRAPHIC_ZOOM_POLICY,
  MAP032_STABLE_IDS,
  OFFICIAL_MAP_PIXEL_BOUNDS,
} from './geographicCoverageManifest.js';

export const MINIMUM_GEOGRAPHIC_NAME_COUNT = GEOGRAPHIC_COVERAGE_MANIFEST_COUNT;

export const REQUIRED_GEOGRAPHIC_NAMES = Object.freeze(
  GEOGRAPHIC_COVERAGE_MANIFEST.map(({ slug, name }) => Object.freeze([slug, name])),
);

export { MAP032_STABLE_IDS };

function fail(sourceLabel, message) {
  throw new Error(`Geographic search coverage invalid in ${sourceLabel}: ${message}`);
}

function manifestFail(message) {
  throw new Error(`MAP-039 geographic coverage manifest invalid: ${message}`);
}

function isValidCoordinate(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

export function assertGeographicCoverageManifest(
  manifest = GEOGRAPHIC_COVERAGE_MANIFEST,
) {
  if (!Array.isArray(manifest)) {
    manifestFail('the manifest must be an array.');
  }

  if (
    GEOGRAPHIC_COVERAGE_MANIFEST_COUNT !== MAP039_AUDITED_INVENTORY_COUNT ||
    manifest.length !== MAP039_AUDITED_INVENTORY_COUNT
  ) {
    manifestFail(
      `expected ${MAP039_AUDITED_INVENTORY_COUNT} audited identities, received ${manifest.length}.`,
    );
  }

  const ids = new Set();
  const slugs = new Set();
  const aliasIds = new Set();

  for (const entry of manifest) {
    if (!entry?.id || !entry.slug || !entry.name) {
      manifestFail('every entry must define id, slug and name.');
    }
    if (ids.has(entry.id)) manifestFail(`duplicate id ${entry.id}.`);
    if (slugs.has(entry.slug)) manifestFail(`duplicate slug ${entry.slug}.`);
    ids.add(entry.id);
    slugs.add(entry.slug);

    if (!Object.hasOwn(GEOGRAPHIC_ZOOM_POLICY, entry.zoomClass)) {
      manifestFail(`${entry.id} uses unsupported zoom class ${entry.zoomClass}.`);
    }
    if (!/^R[1-3]C[1-4]$/.test(entry.mapCell)) {
      manifestFail(`${entry.id} has invalid audit cell ${entry.mapCell}.`);
    }

    for (const alias of entry.requiredAliases ?? []) {
      if (!alias?.id || !alias.value) {
        manifestFail(`${entry.id} contains an incomplete required alias.`);
      }
      if (aliasIds.has(alias.id)) {
        manifestFail(`duplicate alias id ${alias.id}.`);
      }
      aliasIds.add(alias.id);
    }

    if (
      entry.lockedCoordinates &&
      (!isValidCoordinate(entry.lockedCoordinates.x, OFFICIAL_MAP_PIXEL_BOUNDS.width) ||
        !isValidCoordinate(entry.lockedCoordinates.y, OFFICIAL_MAP_PIXEL_BOUNDS.height))
    ) {
      manifestFail(`${entry.id} has invalid locked coordinates.`);
    }
  }

  for (const id of MAP032_STABLE_IDS) {
    if (!ids.has(id)) {
      manifestFail(`MAP-032 stable identity ${id} disappeared.`);
    }
  }
}

assertGeographicCoverageManifest();

export function assertGeographicSearchCoverage(content, sourceLabel = 'public catalog') {
  const geographicNames = content?.geographicNames;

  if (!Array.isArray(geographicNames)) {
    fail(sourceLabel, 'geographicNames must be an array.');
  }

  if (geographicNames.length < MINIMUM_GEOGRAPHIC_NAME_COUNT) {
    fail(
      sourceLabel,
      `expected at least ${MINIMUM_GEOGRAPHIC_NAME_COUNT} published geographic names, received ${geographicNames.length}.`,
    );
  }

  const namesById = new Map(geographicNames.map((entry) => [entry.id, entry]));
  const actualSlugs = new Set();

  for (const actual of geographicNames) {
    if (actualSlugs.has(actual.slug)) {
      fail(sourceLabel, `duplicate geographic slug ${actual.slug}.`);
    }
    actualSlugs.add(actual.slug);
  }

  for (const expected of GEOGRAPHIC_COVERAGE_MANIFEST) {
    const entry = namesById.get(expected.id);
    if (!entry) {
      fail(sourceLabel, `required geographic identity ${expected.id} is missing.`);
    }
    if (entry.slug !== expected.slug || entry.name !== expected.name || entry.language !== 'en') {
      fail(sourceLabel, `${expected.id} must keep its expected English public identity.`);
    }
    if (entry.entityId !== null) {
      fail(sourceLabel, `${expected.id} must remain a search-only geographic identity.`);
    }
    if (
      !entry.coordinates ||
      !isValidCoordinate(entry.coordinates.x, OFFICIAL_MAP_PIXEL_BOUNDS.width) ||
      !isValidCoordinate(entry.coordinates.y, OFFICIAL_MAP_PIXEL_BOUNDS.height)
    ) {
      fail(sourceLabel, `${expected.id} must use finite coordinates inside the official map bounds.`);
    }

    const expectedZoom = GEOGRAPHIC_ZOOM_POLICY[expected.zoomClass];
    if (entry.recommendedZoom !== expectedZoom) {
      fail(
        sourceLabel,
        `${expected.id} must use the ${expected.zoomClass} zoom policy (${expectedZoom}).`,
      );
    }

    const aliasesById = new Map((entry.aliases ?? []).map((alias) => [alias.id, alias]));
    for (const expectedAlias of expected.requiredAliases ?? []) {
      const alias = aliasesById.get(expectedAlias.id);
      if (
        !alias ||
        alias.value !== expectedAlias.value ||
        alias.language !== 'en' ||
        alias.geographicNameId !== expected.id
      ) {
        fail(
          sourceLabel,
          `${expected.id} is missing required alias ${expectedAlias.value} (${expectedAlias.id}).`,
        );
      }
    }

    if (
      expected.lockedCoordinates &&
      (entry.coordinates.x !== expected.lockedCoordinates.x ||
        entry.coordinates.y !== expected.lockedCoordinates.y)
    ) {
      fail(sourceLabel, `${expected.id} must keep its MAP-032 measured coordinates.`);
    }
  }

  const waterdeep = namesById.get('geo-waterdeep');
  if (
    waterdeep.coordinates.x !== 1626 ||
    waterdeep.coordinates.y !== 1465 ||
    waterdeep.recommendedZoom !== 0.75
  ) {
    fail(
      sourceLabel,
      'Waterdeep must keep the MAP-032 measured coordinate and MAP-021 zoom contract.',
    );
  }
}
