import { assertGeographicSearchCoverage } from './geographicCoverageContract.js';
import { assertGeographicSpanishSearchCoverage } from './geographicSpanishReviewContract.js';
import {
  GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST,
  MAP041_GEOGRAPHIC_REVIEW_COUNT,
  MAP041_GEOGRAPHIC_REVIEW_COUNTS,
  MAP041_PUBLISHED_SEARCH_EXTENTS,
} from './geographicSearchExtentManifest.js';
import { OFFICIAL_MAP_PIXEL_BOUNDS } from './geographicCoverageManifest.js';

function fail(label, message) {
  throw new Error(`MAP-041 geographic search extent coverage (${label}): ${message}`);
}

export function assertSearchExtent(extent, label = 'searchExtent', coordinates = null) {
  if (!extent || typeof extent !== 'object' || Array.isArray(extent)) {
    fail(label, 'extent must be an object.');
  }

  const { minX, maxX, minY, maxY } = extent;
  const values = [minX, maxX, minY, maxY];
  if (!values.every(Number.isFinite)) fail(label, 'all bounds must be finite numbers.');
  if (minX < 0 || maxX > OFFICIAL_MAP_PIXEL_BOUNDS.width) {
    fail(label, `X bounds must stay within 0..${OFFICIAL_MAP_PIXEL_BOUNDS.width}.`);
  }
  if (minY < 0 || maxY > OFFICIAL_MAP_PIXEL_BOUNDS.height) {
    fail(label, `Y bounds must stay within 0..${OFFICIAL_MAP_PIXEL_BOUNDS.height}.`);
  }
  if (minX >= maxX) fail(label, 'minX must be lower than maxX.');
  if (minY >= maxY) fail(label, 'minY must be lower than maxY.');

  if (coordinates) {
    if (
      coordinates.x < minX ||
      coordinates.x > maxX ||
      coordinates.y < minY ||
      coordinates.y > maxY
    ) {
      fail(label, 'canonical coordinate must be contained by its extent.');
    }
  }
}

export function assertGeographicSearchExtentReviewManifest() {
  if (GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.length !== MAP041_GEOGRAPHIC_REVIEW_COUNT) {
    fail(
      'review manifest',
      `expected ${MAP041_GEOGRAPHIC_REVIEW_COUNT} reviewed identities, got ${GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.length}.`,
    );
  }

  const ids = new Set();
  for (const entry of GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST) {
    if (ids.has(entry.id)) fail('review manifest', `duplicate identity ${entry.id}.`);
    ids.add(entry.id);

    if (!['point', 'extent', 'unverified'].includes(entry.status)) {
      fail('review manifest', `${entry.id} has unsupported status ${entry.status}.`);
    }
    if (entry.status === 'extent') {
      assertSearchExtent(entry.searchExtent, `${entry.id}.searchExtent`);
      if (!entry.source) fail('review manifest', `${entry.id} extent is missing provenance.`);
    } else if (entry.searchExtent !== null || entry.source !== null) {
      fail('review manifest', `${entry.id} defines extent metadata without extent status.`);
    }
  }

  const total =
    MAP041_GEOGRAPHIC_REVIEW_COUNTS.point +
    MAP041_GEOGRAPHIC_REVIEW_COUNTS.extent +
    MAP041_GEOGRAPHIC_REVIEW_COUNTS.unverified;
  if (total !== MAP041_GEOGRAPHIC_REVIEW_COUNT) {
    fail(
      'review manifest',
      `status counts add up to ${total}, not ${MAP041_GEOGRAPHIC_REVIEW_COUNT}.`,
    );
  }
  if (MAP041_PUBLISHED_SEARCH_EXTENTS.length !== MAP041_GEOGRAPHIC_REVIEW_COUNTS.extent) {
    fail('review manifest', 'published extent list does not match extent classification count.');
  }
}

function sameExtent(actual, expected) {
  return (
    actual?.minX === expected?.minX &&
    actual?.maxX === expected?.maxX &&
    actual?.minY === expected?.minY &&
    actual?.maxY === expected?.maxY
  );
}

export function assertGeographicSearchExtentCoverage(content, label = 'catalog') {
  assertGeographicSearchExtentReviewManifest();
  assertGeographicSearchCoverage(content, label);
  assertGeographicSpanishSearchCoverage(content, label);

  if (!content || typeof content !== 'object' || !Array.isArray(content.geographicNames)) {
    fail(label, 'geographicNames must be an array.');
  }

  const namesById = new Map(content.geographicNames.map((entry) => [entry.id, entry]));
  for (const review of GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST) {
    const name = namesById.get(review.id);
    if (!name) fail(label, `${review.id} disappeared from the MAP-039 identity universe.`);

    if (review.status === 'extent') {
      assertSearchExtent(name.searchExtent, `${review.id}.searchExtent`, name.coordinates);
      if (!sameExtent(name.searchExtent, review.searchExtent)) {
        fail(label, `${review.id} does not expose the reviewed representative bounds.`);
      }
    } else if ((name.searchExtent ?? null) !== null) {
      fail(label, `${review.id} must remain without a published extent (${review.status}).`);
    }
  }

  const waterdeep = namesById.get('geo-waterdeep');
  if (!waterdeep || waterdeep.searchExtent !== null) {
    fail(label, 'Waterdeep must remain a point target without searchExtent.');
  }
}

assertGeographicSearchExtentReviewManifest();
