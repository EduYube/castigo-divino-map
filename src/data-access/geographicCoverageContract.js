export const MINIMUM_GEOGRAPHIC_NAME_COUNT = 15;

export const REQUIRED_GEOGRAPHIC_NAMES = Object.freeze([
  ['baldurs-gate', "Baldur's Gate"],
  ['daggerford', 'Daggerford'],
  ['the-evermoors', 'The Evermoors'],
  ['the-fields-of-the-dead', 'The Fields of the Dead'],
  ['forest-of-wyrms', 'Forest of Wyrms'],
  ['the-high-forest', 'The High Forest'],
  ['the-high-moor', 'The High Moor'],
  ['luskan', 'Luskan'],
  ['mirabar', 'Mirabar'],
  ['neverwinter', 'Neverwinter'],
  ['silverymoon', 'Silverymoon'],
  ['star-mountains', 'Star Mountains'],
  ['sword-mountains', 'Sword Mountains'],
  ['trollbark-forest', 'Trollbark Forest'],
  ['waterdeep', 'Waterdeep'],
]);

const REQUIRED_ALIASES = Object.freeze({
  'the-evermoors': ['Evermoors'],
  'the-fields-of-the-dead': ['Fields of the Dead'],
  'the-high-forest': ['High Forest'],
  'the-high-moor': ['High Moor'],
  waterdeep: ['City of Splendors'],
});

function fail(sourceLabel, message) {
  throw new Error(`Geographic search coverage invalid in ${sourceLabel}: ${message}`);
}

function isValidCoordinate(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

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

  const namesBySlug = new Map(geographicNames.map((entry) => [entry.slug, entry]));

  for (const [slug, expectedName] of REQUIRED_GEOGRAPHIC_NAMES) {
    const entry = namesBySlug.get(slug);
    if (!entry) {
      fail(sourceLabel, `required geographic name ${slug} is missing.`);
    }
    if (entry.name !== expectedName || entry.language !== 'en') {
      fail(sourceLabel, `${slug} must keep its expected English public identity.`);
    }
    if (
      !entry.coordinates ||
      !isValidCoordinate(entry.coordinates.x, 3600) ||
      !isValidCoordinate(entry.coordinates.y, 2329)
    ) {
      fail(sourceLabel, `${slug} must use finite coordinates inside the official map bounds.`);
    }
    if (
      !Number.isFinite(entry.recommendedZoom) ||
      entry.recommendedZoom < -5 ||
      entry.recommendedZoom > 1
    ) {
      fail(sourceLabel, `${slug} must define a recommended zoom supported by the current map.`);
    }

    const requiredAliases = REQUIRED_ALIASES[slug] ?? [];
    const aliases = new Set((entry.aliases ?? []).map(({ value }) => value));
    for (const alias of requiredAliases) {
      if (!aliases.has(alias)) {
        fail(sourceLabel, `${slug} is missing required alias ${alias}.`);
      }
    }
  }

  const waterdeep = namesBySlug.get('waterdeep');
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
