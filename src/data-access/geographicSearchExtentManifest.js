import {
  GEOGRAPHIC_COVERAGE_MANIFEST,
  MAP039_AUDITED_INVENTORY_COUNT,
  OFFICIAL_MAP_PIXEL_BOUNDS,
} from './geographicCoverageManifest.js';

export const MAP041_GEOGRAPHIC_REVIEW_COUNT = 213;

// MAP-041 owns a semantic fingerprint rather than a second runtime index. Any MAP-039 identity,
// spelling, classification or audit-cell change must be explicitly reviewed before this module loads.
export const MAP041_REVIEWED_MAP039_FINGERPRINT = 'PENDING';

export const MAP041_EXTENT_SOURCES = Object.freeze({
  'official-sword-coast-raster': Object.freeze({
    label: 'Official Sword Coast map raster (Wizards of the Coast, 2015)',
    url: 'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg',
    methodology:
      'Representative CRS.Simple rectangle measured from the printed label and visible surrounding feature on the accepted 3600 × 2329 official raster. It is a search focus area, not an official boundary.',
  }),
});

const EXTENT_DECISIONS = Object.freeze({
  'geo-anauroch': Object.freeze({ minX: 2450, maxX: 3100, minY: 1050, maxY: 1700 }),
  'geo-cormyr': Object.freeze({ minX: 2700, maxX: 3290, minY: 600, maxY: 950 }),
  'geo-evermoors': Object.freeze({ minX: 1720, maxX: 2030, minY: 1810, maxY: 2020 }),
  'geo-forest-of-tethir': Object.freeze({ minX: 1880, maxX: 2580, minY: 0, maxY: 300 }),
  'geo-high-forest': Object.freeze({ minX: 1700, maxX: 2250, minY: 1500, maxY: 2010 }),
  'geo-high-moor': Object.freeze({ minX: 1750, maxX: 2300, minY: 1100, maxY: 1450 }),
  'geo-icewind-dale': Object.freeze({ minX: 1120, maxX: 1450, minY: 2010, maxY: 2290 }),
  'geo-moonshae-isles': Object.freeze({ minX: 850, maxX: 1390, minY: 570, maxY: 1250 }),
  'geo-sea-of-swords': Object.freeze({ minX: 1370, maxX: 1740, minY: 680, maxY: 1180 }),
  'geo-sword-coast': Object.freeze({ minX: 1380, maxX: 1710, minY: 750, maxY: 1500 }),
  'geo-the-dalelands': Object.freeze({ minX: 3050, maxX: 3430, minY: 850, maxY: 1200 }),
  'geo-the-high-ice': Object.freeze({ minX: 2350, maxX: 3130, minY: 1650, maxY: 2290 }),
  'geo-the-shining-plains': Object.freeze({ minX: 2700, maxX: 3270, minY: 70, maxY: 380 }),
});

function invariant(condition, message) {
  if (!condition) throw new Error(`MAP-041 geographic extent manifest: ${message}`);
}

function isFiniteBound(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash ^= BigInt(code & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt(code >>> 8);
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

export function geographicCoverageSemanticFingerprint(entries = GEOGRAPHIC_COVERAGE_MANIFEST) {
  const canonical = [...entries]
    .map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      kind: entry.kind,
      zoomClass: entry.zoomClass,
      mapCell: entry.mapCell,
      requiredAliases: (entry.requiredAliases ?? []).map(({ id, value }) => ({ id, value })),
      lockedCoordinates: entry.lockedCoordinates ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return fnv1a64(JSON.stringify(canonical));
}

const currentMap039Fingerprint = geographicCoverageSemanticFingerprint();

invariant(
  MAP039_AUDITED_INVENTORY_COUNT === MAP041_GEOGRAPHIC_REVIEW_COUNT &&
    GEOGRAPHIC_COVERAGE_MANIFEST.length === MAP041_GEOGRAPHIC_REVIEW_COUNT,
  `MAP-039 must contain exactly ${MAP041_GEOGRAPHIC_REVIEW_COUNT} reviewed identities.`,
);
invariant(
  currentMap039Fingerprint === MAP041_REVIEWED_MAP039_FINGERPRINT,
  `MAP-039 semantic fingerprint changed: expected ${MAP041_REVIEWED_MAP039_FINGERPRINT}, received ${currentMap039Fingerprint}. Re-audit MAP-041 before updating the fingerprint.`,
);

const map039ById = new Map(GEOGRAPHIC_COVERAGE_MANIFEST.map((entry) => [entry.id, entry]));

for (const [id, extent] of Object.entries(EXTENT_DECISIONS)) {
  const entry = map039ById.get(id);
  invariant(entry, `${id} has an extent decision but is absent from MAP-039.`);
  invariant(entry.zoomClass === 'area', `${id} has an extent but MAP-039 classifies it as point.`);
  invariant(
    isFiniteBound(extent.minX, OFFICIAL_MAP_PIXEL_BOUNDS.width) &&
      isFiniteBound(extent.maxX, OFFICIAL_MAP_PIXEL_BOUNDS.width) &&
      isFiniteBound(extent.minY, OFFICIAL_MAP_PIXEL_BOUNDS.height) &&
      isFiniteBound(extent.maxY, OFFICIAL_MAP_PIXEL_BOUNDS.height),
    `${id} has bounds outside the accepted raster.`,
  );
  invariant(extent.minX < extent.maxX, `${id} has inverted or degenerate X bounds.`);
  invariant(extent.minY < extent.maxY, `${id} has inverted or degenerate Y bounds.`);
}

export const GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST = Object.freeze(
  GEOGRAPHIC_COVERAGE_MANIFEST.map((entry) => {
    const extent = EXTENT_DECISIONS[entry.id] ?? null;
    const status = extent ? 'extent' : entry.zoomClass === 'point' ? 'point' : 'unverified';

    return Object.freeze({
      id: entry.id,
      canonicalName: entry.name,
      status,
      searchExtent: extent,
      source: extent ? 'official-sword-coast-raster' : null,
    });
  }),
);

export const MAP041_GEOGRAPHIC_REVIEW_COUNTS = Object.freeze(
  GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.reduce(
    (counts, entry) => ({ ...counts, [entry.status]: counts[entry.status] + 1 }),
    { point: 0, extent: 0, unverified: 0 },
  ),
);

export const MAP041_PUBLISHED_SEARCH_EXTENTS = Object.freeze(
  GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST.filter(({ status }) => status === 'extent'),
);
