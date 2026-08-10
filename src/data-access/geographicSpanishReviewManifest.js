import {
  GEOGRAPHIC_COVERAGE_MANIFEST,
  MAP039_AUDITED_INVENTORY_COUNT,
} from './geographicCoverageManifest.js';

export const MAP040_SPANISH_REVIEW_COUNT = 213;

export const MAP040_SPANISH_REVIEW_SOURCES = Object.freeze({
  'secret-lair-forgotten-realms-2026':
    'https://secretlair.wizards.com/eu/es/product/1249734/secret-lair-x-dungeons-dragonsr-lands-of-the-forgotten-realms',
  'magic-afr-spanish-gallery':
    'https://magic.wizards.com/es/news/card-image-gallery/d-and-d-adventures-in-the-forgotten-realms-card-image-gallery',
  'magic-afr-spanish-commander':
    'https://magic.wizards.com/es/news/card-image-gallery/adventures-in-the-forgotten-realms-commander',
  'magic-clb-spanish-gallery':
    'https://magic.wizards.com/es/news/card-image-gallery/commander-legends-battle-for-baldurs-gate',
  'magic-clb-spanish-product':
    'https://magic.wizards.com/es/products/commander-legends-battle-baldurs-gate',
});

// This is an audit contract, never a runtime search index. Keeping the exact MAP-039 identity set
// here makes an inventory change fail closed until the Spanish review is explicitly repeated.
const AUDITED_MAP039_IDS = `
geo-alaron
geo-amn
geo-amphail
geo-anauroch
geo-arabel
geo-archwood
geo-arn-forest
geo-ascore
geo-baldurs-gate
geo-beorunnas-well
geo-berdusk
geo-blackford-crossing
geo-blackford-road
geo-boareskyr-bridge
geo-border-forest
geo-caer-corwell
geo-caer-moray
geo-caer-westphal
geo-candlekeep
geo-castle-hartwick
geo-citadel-adbar
geo-citadel-felbarr
geo-coast-way
geo-cold-wood
geo-cormanthor
geo-cormyr
geo-daggerford
geo-darkhold
geo-deepwing-mountains
geo-delimbiyr-river
geo-dernall-forest
geo-desertsmouth-mountains
geo-dessarin-river
geo-dragonspear-castle
geo-dynnegall
geo-easting
geo-elturel
geo-elturgard
geo-elversult
geo-evereska
geo-evermoors
geo-fairheight-range
geo-fairview
geo-fields-of-the-dead
geo-finback
geo-fireshear
geo-flint-rock
geo-forest-of-tethir
geo-forest-of-wyrms
geo-fort-morninglord
geo-gauntlgrym
geo-giants-run-mountains
geo-grandfather-tree
geo-great-worm-cavern
geo-greycloak-hills
geo-greypeak-mountains
geo-gulthmere
geo-gundarlun
geo-gundbarg
geo-gwynneth
geo-hardbuckler
geo-hartsvale
geo-hellgate-dell
geo-helms-hold
geo-high-forest
geo-high-moor
geo-high-road
geo-hillsfar
geo-hlondeth
geo-hullack-forest
geo-ice-spires
geo-icewind-dale
geo-iriaebor
geo-iron-keep
geo-ironmaster
geo-karse
geo-kelvins-cairn
geo-kingdom-of-many-arrows
geo-korinn-archipelago
geo-lake-of-dragons
geo-long-road
geo-longsaddle
geo-luskan
geo-marsember
geo-marsh-of-chelimber
geo-menzoberranzan
geo-mere-of-dead-men
geo-mintarn
geo-mirabar
geo-misty-forest
geo-mithral-hall
geo-moonshae-isles
geo-moray
geo-morgurs-mound
geo-mount-hotenow
geo-mulhessen
geo-murann
geo-myrloch-vale
geo-myth-drannor
geo-najara
geo-nether-mountains
geo-neverwinter
geo-neverwinter-wood
geo-norland
geo-northdark-wood
geo-northlander-isles
geo-omans-isle
geo-one-stone
geo-ordulin
geo-orlumbor
geo-ormath
geo-orogoth
geo-orsraun-mountains
geo-priapurl
geo-proskur
geo-raven-rock
geo-reghed-glacier
geo-riatavin
geo-river-chionthar
geo-river-mirar
geo-river-rauvin
geo-river-surbrin
geo-rogarsheim
geo-ruathym
geo-ruins-of-ascarle
geo-saerloon
geo-scornubel
geo-sea-of-fallen-stars
geo-sea-of-moonshae
geo-sea-of-moving-ice
geo-sea-of-swords
geo-secomber
geo-selgaunt
geo-sembia
geo-serpent-hills
geo-settlestone
geo-shilmista-forest
geo-silverymoon
geo-skadaurak
geo-snowdown
geo-snowflake-mountains
geo-southwood
geo-spiderhaunt-woods
geo-ssthartissssun
geo-star-mountains
geo-stone-stand
geo-sundabar
geo-sunset-mountains
geo-sword-coast
geo-sword-mountains
geo-tejarn-hills
geo-ten-towns
geo-thar
geo-the-aphrunn-mountains
geo-the-cloakwood
geo-the-cloud-peaks
geo-the-dalelands
geo-the-endless-ice-sea
geo-the-far-forest
geo-the-far-hills
geo-the-flooded-forest
geo-the-frozen-forest
geo-the-frozen-sea
geo-the-giants-plain
geo-the-green-fields
geo-the-high-ice
geo-the-high-moors
geo-the-laughingflow
geo-the-lurkwood
geo-the-nelanther
geo-the-plain-of-standing-stones
geo-the-purple-rocks
geo-the-reaching-woods
geo-the-ride
geo-the-shining-plains
geo-the-small-teeth
geo-the-snakewood
geo-the-spine-of-the-world
geo-the-storm-horns
geo-the-tortured-land
geo-the-trollclaws
geo-the-vilhon-reach
geo-the-whale-bones
geo-thornhold
geo-thunder-peaks
geo-trackless-sea
geo-trade-way
geo-triboar
geo-triel
geo-trielta-hills
geo-trisk
geo-troll-mountains
geo-trollbark-forest
geo-trollclaw-ford
geo-trollclaw-range
geo-tuern
geo-turmish
geo-turnback-mountains
geo-ulf-of-thuger
geo-unicorn-run
geo-utherall
geo-uttersea
geo-vercy-wood
geo-vilkstead
geo-warlocks-crypt
geo-waterdeep
geo-westgate
geo-white-peaks
geo-winding-water
geo-wood-of-sharp-teeth
geo-yartar
geo-yhaunn
geo-zhentil-keep
`
  .trim()
  .split('\n');

const VERIFIED_DECISIONS = Object.freeze({
  'geo-baldurs-gate': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Puerta de Baldur']),
    sources: Object.freeze(['magic-clb-spanish-product', 'magic-afr-spanish-gallery']),
  }),
  'geo-candlekeep': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Candelero']),
    sources: Object.freeze(['magic-clb-spanish-gallery']),
  }),
  'geo-elturel': Object.freeze({
    status: 'unchanged',
    aliases: Object.freeze([]),
    sources: Object.freeze(['magic-clb-spanish-gallery']),
  }),
  'geo-elturgard': Object.freeze({
    status: 'unchanged',
    aliases: Object.freeze([]),
    sources: Object.freeze(['magic-afr-spanish-gallery']),
  }),
  'geo-icewind-dale': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Valle del Viento Helado']),
    sources: Object.freeze(['magic-afr-spanish-commander']),
  }),
  'geo-moonshae-isles': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Islas Lunshaes']),
    sources: Object.freeze(['secret-lair-forgotten-realms-2026']),
  }),
  'geo-neverwinter': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Nuncainvierno']),
    sources: Object.freeze(['magic-afr-spanish-gallery']),
  }),
  'geo-silverymoon': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Luna Plateada']),
    sources: Object.freeze(['magic-afr-spanish-gallery']),
  }),
  'geo-sword-coast': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Costa de la Espada']),
    sources: Object.freeze(['magic-clb-spanish-gallery']),
  }),
  'geo-waterdeep': Object.freeze({
    status: 'translated',
    aliases: Object.freeze(['Aguas Profundas']),
    sources: Object.freeze(['secret-lair-forgotten-realms-2026', 'magic-afr-spanish-gallery']),
  }),
});

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`MAP-040 Spanish review manifest: ${message}`);
  }
}

invariant(
  MAP039_AUDITED_INVENTORY_COUNT === MAP040_SPANISH_REVIEW_COUNT,
  `MAP-039 inventory count changed from ${MAP040_SPANISH_REVIEW_COUNT}.`,
);
invariant(
  AUDITED_MAP039_IDS.length === MAP040_SPANISH_REVIEW_COUNT,
  `expected ${MAP040_SPANISH_REVIEW_COUNT} audited IDs, got ${AUDITED_MAP039_IDS.length}.`,
);
invariant(
  new Set(AUDITED_MAP039_IDS).size === AUDITED_MAP039_IDS.length,
  'audited ID list contains duplicates.',
);

const map039ById = new Map(GEOGRAPHIC_COVERAGE_MANIFEST.map((entry) => [entry.id, entry]));
const auditedIdSet = new Set(AUDITED_MAP039_IDS);

invariant(
  map039ById.size === MAP040_SPANISH_REVIEW_COUNT,
  `MAP-039 manifest contains ${map039ById.size} identities instead of ${MAP040_SPANISH_REVIEW_COUNT}.`,
);

for (const id of AUDITED_MAP039_IDS) {
  invariant(map039ById.has(id), `${id} is audited by MAP-040 but is absent from MAP-039.`);
}
for (const id of map039ById.keys()) {
  invariant(auditedIdSet.has(id), `${id} exists in MAP-039 but has not been audited by MAP-040.`);
}
for (const [id, decision] of Object.entries(VERIFIED_DECISIONS)) {
  invariant(auditedIdSet.has(id), `${id} has a Spanish decision outside the MAP-039 inventory.`);
  invariant(
    decision.status === 'translated' || decision.status === 'unchanged',
    `${id} has an unsupported verified status.`,
  );
  invariant(
    decision.status !== 'translated' || decision.aliases.length > 0,
    `${id} is translated without an official Spanish alias.`,
  );
  invariant(
    decision.status !== 'unchanged' || decision.aliases.length === 0,
    `${id} is unchanged but defines a Spanish alias.`,
  );
  invariant(decision.sources.length > 0, `${id} is verified without an official source.`);
}

export const GEOGRAPHIC_SPANISH_REVIEW_MANIFEST = Object.freeze(
  AUDITED_MAP039_IDS.map((id) => {
    const map039Entry = map039ById.get(id);
    const decision = VERIFIED_DECISIONS[id] ?? {
      status: 'unverified',
      aliases: Object.freeze([]),
      sources: Object.freeze([]),
    };

    return Object.freeze({
      id,
      canonicalName: map039Entry.name,
      status: decision.status,
      aliases: decision.aliases,
      sources: decision.sources,
    });
  }),
);

export const MAP040_SPANISH_REVIEW_COUNTS = Object.freeze(
  GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.reduce(
    (counts, entry) => ({ ...counts, [entry.status]: counts[entry.status] + 1 }),
    { translated: 0, unchanged: 0, unverified: 0 },
  ),
);

export const MAP040_VERIFIED_SPANISH_ALIASES = Object.freeze(
  GEOGRAPHIC_SPANISH_REVIEW_MANIFEST.flatMap((entry) =>
    entry.aliases.map((value) => Object.freeze({ geographicNameId: entry.id, value })),
  ),
);
