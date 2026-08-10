export const OFFICIAL_MAP_PIXEL_BOUNDS = Object.freeze({ width: 3600, height: 2329 });

export const GEOGRAPHIC_ZOOM_POLICY = Object.freeze({
  point: 0.75,
  area: 0.5,
});

export const MAP039_AUDITED_INVENTORY_COUNT = 213;

const REQUIRED_ALIASES_BY_ID = Object.freeze({
  'geo-evermoors': Object.freeze([
    Object.freeze({ id: 'geo-alias-evermoors', value: 'Evermoors' }),
  ]),
  'geo-high-forest': Object.freeze([
    Object.freeze({ id: 'geo-alias-high-forest', value: 'High Forest' }),
  ]),
  'geo-star-mountains': Object.freeze([
    Object.freeze({ id: 'geo-alias-star-mountains-legacy', value: 'Star Mountains' }),
  ]),
  'geo-waterdeep': Object.freeze([
    Object.freeze({ id: 'geo-alias-waterdeep-city-of-splendors', value: 'City of Splendors' }),
  ]),
  'geo-high-moor': Object.freeze([
    Object.freeze({ id: 'geo-alias-high-moor', value: 'High Moor' }),
  ]),
  'geo-fields-of-the-dead': Object.freeze([
    Object.freeze({ id: 'geo-alias-fields-of-the-dead', value: 'Fields of the Dead' }),
  ]),
});

const LOCKED_MAP032_COORDINATES_BY_ID = Object.freeze({
  'geo-baldurs-gate': Object.freeze({ x: 1889, y: 824 }),
  'geo-daggerford': Object.freeze({ x: 1742, y: 1386 }),
  'geo-evermoors': Object.freeze({ x: 1890, y: 1921 }),
  'geo-fields-of-the-dead': Object.freeze({ x: 2016, y: 959 }),
  'geo-forest-of-wyrms': Object.freeze({ x: 2165, y: 1084 }),
  'geo-high-forest': Object.freeze({ x: 2098, y: 1809 }),
  'geo-high-moor': Object.freeze({ x: 2010, y: 1279 }),
  'geo-luskan': Object.freeze({ x: 1416, y: 2011 }),
  'geo-mirabar': Object.freeze({ x: 1562, y: 2093 }),
  'geo-neverwinter': Object.freeze({ x: 1433, y: 1853 }),
  'geo-silverymoon': Object.freeze({ x: 1998, y: 1969 }),
  'geo-star-mountains': Object.freeze({ x: 2000, y: 1746 }),
  'geo-sword-mountains': Object.freeze({ x: 1610, y: 1569 }),
  'geo-trollbark-forest': Object.freeze({ x: 1800, y: 1201 }),
  'geo-waterdeep': Object.freeze({ x: 1626, y: 1465 }),
});

const AUDITED_ROWS = `
geo-tuern|tuern|Tuern|island|area|R1C1
geo-uttersea|uttersea|Uttersea|settlement|point|R1C1
geo-the-purple-rocks|the-purple-rocks|The Purple Rocks|island|area|R1C1
geo-ruins-of-ascarle|ruins-of-ascarle|Ruins of Ascarle|landmark|point|R1C1
geo-trisk|trisk|Trisk|settlement|point|R1C1
geo-ulf-of-thuger|ulf-of-thuger|Ulf of Thuger|settlement|point|R1C1
geo-utherall|utherall|Utherall|settlement|point|R1C1
geo-vilkstead|vilkstead|Vilkstead|settlement|point|R1C1
geo-trackless-sea|trackless-sea|Trackless Sea|water|area|R1C1
geo-sea-of-moving-ice|sea-of-moving-ice|Sea of Moving Ice|water|area|R1C2
geo-icewind-dale|icewind-dale|Icewind Dale|region|area|R1C2
geo-kelvins-cairn|kelvins-cairn|Kelvin's Cairn|mountain|area|R1C2
geo-ironmaster|ironmaster|Ironmaster|settlement|point|R1C2
geo-ten-towns|ten-towns|Ten-Towns|region|area|R1C2
geo-fireshear|fireshear|Fireshear|settlement|point|R1C2
geo-gundbarg|gundbarg|Gundbarg|settlement|point|R1C1
geo-gundarlun|gundarlun|Gundarlun|island|area|R1C1
geo-reghed-glacier|reghed-glacier|Reghed Glacier|region|area|R1C2
geo-the-spine-of-the-world|the-spine-of-the-world|The Spine of the World|mountain|area|R1C2
geo-the-endless-ice-sea|the-endless-ice-sea|The Endless Ice Sea|water|area|R1C3
geo-kingdom-of-many-arrows|kingdom-of-many-arrows|Kingdom of Many Arrows|region|area|R1C2
geo-raven-rock|raven-rock|Raven Rock|landmark|point|R1C2
geo-mirabar|mirabar|Mirabar|settlement|point|R1C2
geo-great-worm-cavern|great-worm-cavern|Great Worm Cavern|landmark|point|R1C2
geo-the-lurkwood|the-lurkwood|The Lurkwood|forest|area|R1C2
geo-mithral-hall|mithral-hall|Mithral Hall|landmark|point|R1C2
geo-settlestone|settlestone|Settlestone|settlement|point|R1C2
geo-luskan|luskan|Luskan|settlement|point|R1C2
geo-blackford-crossing|blackford-crossing|Blackford Crossing|landmark|point|R1C2
geo-river-mirar|river-mirar|River Mirar|water|area|R1C2
geo-blackford-road|blackford-road|Blackford Road|route|area|R1C2
geo-morgurs-mound|morgurs-mound|Morgur's Mound|landmark|point|R1C2
geo-gauntlgrym|gauntlgrym|Gauntlgrym|settlement|point|R1C2
geo-mount-hotenow|mount-hotenow|Mount Hotenow|mountain|point|R1C2
geo-longsaddle|longsaddle|Longsaddle|settlement|point|R1C2
geo-neverwinter|neverwinter|Neverwinter|settlement|point|R1C2
geo-neverwinter-wood|neverwinter-wood|Neverwinter Wood|forest|area|R1C2
geo-helms-hold|helms-hold|Helm's Hold|settlement|point|R1C2
geo-triboar|triboar|Triboar|settlement|point|R1C2
geo-yartar|yartar|Yartar|settlement|point|R1C2
geo-dessarin-river|dessarin-river|Dessarin River|water|area|R1C2
geo-river-surbrin|river-surbrin|River Surbrin|water|area|R1C2
geo-flint-rock|flint-rock|Flint Rock|settlement|point|R1C2
geo-the-laughingflow|the-laughingflow|The Laughingflow|water|area|R1C2
geo-evermoors|the-evermoors|The Evermoors|region|area|R1C2
geo-sword-mountains|sword-mountains|Sword Mountains|mountain|area|R1C2
geo-mere-of-dead-men|mere-of-dead-men|Mere of Dead Men|region|area|R1C2
geo-high-road|high-road|High Road|route|area|R1C2
geo-long-road|long-road|Long Road|route|area|R1C2
geo-cold-wood|cold-wood|Cold Wood|forest|area|R1C3
geo-beorunnas-well|beorunnas-well|Beorunna's Well|landmark|point|R1C3
geo-castle-hartwick|castle-hartwick|Castle Hartwick|landmark|point|R1C3
geo-hartsvale|hartsvale|Hartsvale|region|area|R1C3
geo-ice-spires|ice-spires|Ice Spires|mountain|area|R1C3
geo-citadel-adbar|citadel-adbar|Citadel Adbar|landmark|point|R1C3
geo-one-stone|one-stone|One Stone|settlement|point|R1C3
geo-menzoberranzan|menzoberranzan|Menzoberranzan|settlement|point|R1C2
geo-citadel-felbarr|citadel-felbarr|Citadel Felbarr|landmark|point|R1C3
geo-silverymoon|silverymoon|Silverymoon|settlement|point|R1C3
geo-sundabar|sundabar|Sundabar|settlement|point|R1C3
geo-nether-mountains|nether-mountains|Nether Mountains|mountain|area|R1C3
geo-ascore|ascore|Ascore|settlement|point|R1C3
geo-arn-forest|arn-forest|Arn Forest|forest|area|R1C3
geo-river-rauvin|river-rauvin|River Rauvin|water|area|R1C3
geo-stone-stand|stone-stand|Stone Stand|settlement|point|R1C3
geo-high-forest|the-high-forest|The High Forest|forest|area|R1C3
geo-hellgate-dell|hellgate-dell|Hellgate Dell|landmark|point|R1C3
geo-delimbiyr-river|delimbiyr-river|Delimbiyr River|water|area|R1C2
geo-the-far-forest|the-far-forest|The Far Forest|forest|area|R1C3
geo-grandfather-tree|grandfather-tree|Grandfather Tree|landmark|point|R1C3
geo-star-mountains|star-mountains|Star Mounts|mountain|area|R1C3
geo-karse|karse|Karse|settlement|point|R1C3
geo-unicorn-run|unicorn-run|Unicorn Run|water|area|R1C3
geo-the-high-ice|the-high-ice|The High Ice|region|area|R1C4
geo-the-frozen-sea|the-frozen-sea|The Frozen Sea|water|area|R1C3
geo-the-frozen-forest|the-frozen-forest|The Frozen Forest|forest|area|R1C4
geo-turnback-mountains|turnback-mountains|Turnback Mountains|mountain|area|R1C4
geo-the-tortured-land|the-tortured-land|The Tortured Land|region|area|R1C4
geo-ruathym|ruathym|Ruathym|island|area|R1C1
geo-the-whale-bones|the-whale-bones|The Whale Bones|island|area|R1C2
geo-finback|finback|Finback|settlement|point|R1C2
geo-northlander-isles|northlander-isles|Northlander Isles|island|area|R1C2
geo-korinn-archipelago|korinn-archipelago|Korinn Archipelago|island|area|R1C2
geo-moonshae-isles|moonshae-isles|Moonshae Isles|island|area|R2C2
geo-thornhold|thornhold|Thornhold|landmark|point|R1C2
geo-amphail|amphail|Amphail|settlement|point|R1C2
geo-waterdeep|waterdeep|Waterdeep|settlement|point|R1C2
geo-daggerford|daggerford|Daggerford|settlement|point|R1C2
geo-secomber|secomber|Secomber|settlement|point|R1C2
geo-misty-forest|misty-forest|Misty Forest|forest|area|R1C2
geo-trade-way|trade-way|Trade Way|route|area|R2C3
geo-trollbark-forest|trollbark-forest|Trollbark Forest|forest|area|R2C2
geo-skadaurak|skadaurak|Skadaurak|island|area|R2C2
geo-orlumbor|orlumbor|Orlumbor|island|area|R2C2
geo-warlocks-crypt|warlocks-crypt|Warlock's Crypt|landmark|point|R2C3
geo-mintarn|mintarn|Mintarn|island|area|R2C2
geo-greypeak-mountains|greypeak-mountains|Greypeak Mountains|mountain|area|R1C3
geo-southwood|southwood|Southwood|forest|area|R1C3
geo-orogoth|orogoth|Orogoth|landmark|point|R2C3
geo-high-moor|the-high-moor|The High Moor|region|area|R2C3
geo-marsh-of-chelimber|marsh-of-chelimber|Marsh of Chelimber|region|area|R2C3
geo-greycloak-hills|greycloak-hills|Greycloak Hills|region|area|R2C3
geo-serpent-hills|serpent-hills|Serpent Hills|region|area|R2C3
geo-dragonspear-castle|dragonspear-castle|Dragonspear Castle|landmark|point|R2C3
geo-najara|najara|Najara|region|area|R2C3
geo-ssthartissssun|ssthartissssun|Ss'thar'tiss'ssun|settlement|point|R2C3
geo-forest-of-wyrms|forest-of-wyrms|Forest of Wyrms|forest|area|R2C3
geo-the-plain-of-standing-stones|the-plain-of-standing-stones|The Plain of Standing Stones|region|area|R1C4
geo-anauroch|anauroch|Anauroch|region|area|R2C4
geo-evereska|evereska|Evereska|settlement|point|R2C3
geo-desertsmouth-mountains|desertsmouth-mountains|Desertsmouth Mountains|mountain|area|R2C4
geo-spiderhaunt-woods|spiderhaunt-woods|Spiderhaunt Woods|forest|area|R2C4
geo-white-peaks|white-peaks|White Peaks|mountain|area|R1C4
geo-vercy-wood|vercy-wood|Vercy Wood|forest|area|R1C4
geo-the-ride|the-ride|The Ride|region|area|R1C4
geo-border-forest|border-forest|Border Forest|forest|area|R1C4
geo-thar|thar|Thar|region|area|R1C4
geo-zhentil-keep|zhentil-keep|Zhentil Keep|settlement|point|R2C4
geo-hillsfar|hillsfar|Hillsfar|settlement|point|R2C4
geo-myth-drannor|myth-drannor|Myth Drannor|settlement|point|R2C4
geo-cormanthor|cormanthor|Cormanthor|forest|area|R2C4
geo-sea-of-moonshae|sea-of-moonshae|Sea of Moonshae|water|area|R2C2
geo-norland|norland|Norland|island|area|R2C2
geo-rogarsheim|rogarsheim|Rogarsheim|settlement|point|R2C2
geo-fairheight-range|fairheight-range|Fairheight Range|mountain|area|R2C2
geo-dernall-forest|dernall-forest|Dernall Forest|forest|area|R2C2
geo-alaron|alaron|Alaron|island|area|R2C2
geo-omans-isle|omans-isle|Omans Isle|island|area|R2C2
geo-iron-keep|iron-keep|Iron Keep|landmark|point|R2C2
geo-gwynneth|gwynneth|Gwynneth|island|area|R2C2
geo-myrloch-vale|myrloch-vale|Myrloch Vale|region|area|R2C2
geo-moray|moray|Moray|island|area|R2C2
geo-trollclaw-range|trollclaw-range|Trollclaw Range|mountain|area|R2C2
geo-caer-moray|caer-moray|Caer Moray|settlement|point|R2C2
geo-dynnegall|dynnegall|Dynnegall|settlement|point|R2C2
geo-fairview|fairview|Fairview|settlement|point|R2C2
geo-caer-corwell|caer-corwell|Caer Corwell|settlement|point|R2C2
geo-snowdown|snowdown|Snowdown|island|area|R2C2
geo-caer-westphal|caer-westphal|Caer Westphal|settlement|point|R2C2
geo-sea-of-swords|sea-of-swords|Sea of Swords|water|area|R2C2
geo-sword-coast|sword-coast|Sword Coast|region|area|R2C2
geo-winding-water|winding-water|Winding Water|water|area|R2C3
geo-baldurs-gate|baldurs-gate|Baldur's Gate|settlement|point|R2C3
geo-the-cloakwood|the-cloakwood|The Cloakwood|forest|area|R2C3
geo-candlekeep|candlekeep|Candlekeep|landmark|point|R3C3
geo-the-trollclaws|the-trollclaws|The Trollclaws|region|area|R2C3
geo-trollclaw-ford|trollclaw-ford|Trollclaw Ford|landmark|point|R2C3
geo-boareskyr-bridge|boareskyr-bridge|Boareskyr Bridge|landmark|point|R2C3
geo-fields-of-the-dead|the-fields-of-the-dead|The Fields of the Dead|region|area|R2C3
geo-northdark-wood|northdark-wood|Northdark Wood|forest|area|R2C3
geo-trielta-hills|trielta-hills|Trielta Hills|region|area|R2C3
geo-hardbuckler|hardbuckler|Hardbuckler|settlement|point|R2C3
geo-triel|triel|Triel|settlement|point|R2C3
geo-the-reaching-woods|the-reaching-woods|The Reaching Woods|forest|area|R2C3
geo-river-chionthar|river-chionthar|River Chionthar|water|area|R2C3
geo-elturel|elturel|Elturel|settlement|point|R2C3
geo-fort-morninglord|fort-morninglord|Fort Morninglord|landmark|point|R2C3
geo-scornubel|scornubel|Scornubel|settlement|point|R2C3
geo-elturgard|elturgard|Elturgard|region|area|R2C3
geo-coast-way|coast-way|Coast Way|route|area|R2C3
geo-wood-of-sharp-teeth|wood-of-sharp-teeth|Wood of Sharp Teeth|forest|area|R2C3
geo-berdusk|berdusk|Berdusk|settlement|point|R2C3
geo-iriaebor|iriaebor|Iriaebor|settlement|point|R3C3
geo-the-green-fields|the-green-fields|The Green Fields|region|area|R3C3
geo-the-high-moors|the-high-moors|The High Moors|region|area|R2C4
geo-sunset-mountains|sunset-mountains|Sunset Mountains|mountain|area|R2C3
geo-darkhold|darkhold|Darkhold|landmark|point|R2C3
geo-the-far-hills|the-far-hills|The Far Hills|region|area|R2C3
geo-the-storm-horns|the-storm-horns|The Storm Horns|mountain|area|R2C3
geo-arabel|arabel|Arabel|settlement|point|R2C4
geo-hullack-forest|hullack-forest|Hullack Forest|forest|area|R2C4
geo-cormyr|cormyr|Cormyr|region|area|R2C4
geo-marsember|marsember|Marsember|settlement|point|R3C4
geo-lake-of-dragons|lake-of-dragons|Lake of Dragons|water|area|R2C4
geo-proskur|proskur|Proskur|settlement|point|R2C4
geo-easting|easting|Easting|settlement|point|R3C3
geo-priapurl|priapurl|Priapurl|settlement|point|R3C3
geo-elversult|elversult|Elversult|settlement|point|R3C3
geo-westgate|westgate|Westgate|settlement|point|R3C4
geo-the-dalelands|the-dalelands|The Dalelands|region|area|R2C4
geo-thunder-peaks|thunder-peaks|Thunder Peaks|mountain|area|R2C4
geo-archwood|archwood|Archwood|forest|area|R2C4
geo-ordulin|ordulin|Ordulin|settlement|point|R2C4
geo-yhaunn|yhaunn|Yhaunn|settlement|point|R2C4
geo-sembia|sembia|Sembia|region|area|R2C4
geo-mulhessen|mulhessen|Mulhessen|settlement|point|R3C4
geo-selgaunt|selgaunt|Selgaunt|settlement|point|R3C4
geo-saerloon|saerloon|Saerloon|settlement|point|R3C4
geo-sea-of-fallen-stars|sea-of-fallen-stars|Sea of Fallen Stars|water|area|R3C4
geo-the-nelanther|the-nelanther|The Nelanther|island|area|R3C2
geo-the-cloud-peaks|the-cloud-peaks|The Cloud Peaks|mountain|area|R3C3
geo-the-snakewood|the-snakewood|The Snakewood|forest|area|R3C3
geo-amn|amn|Amn|region|area|R3C3
geo-the-small-teeth|the-small-teeth|The Small Teeth|mountain|area|R3C3
geo-murann|murann|Murann|settlement|point|R3C3
geo-tejarn-hills|tejarn-hills|Tejarn Hills|region|area|R3C3
geo-forest-of-tethir|forest-of-tethir|Forest of Tethir|forest|area|R3C3
geo-troll-mountains|troll-mountains|Troll Mountains|mountain|area|R3C3
geo-the-giants-plain|the-giants-plain|The Giant's Plain|region|area|R3C3
geo-giants-run-mountains|giants-run-mountains|Giant's Run Mountains|mountain|area|R3C4
geo-shilmista-forest|shilmista-forest|Shilmista Forest|forest|area|R3C3
geo-snowflake-mountains|snowflake-mountains|Snowflake Mountains|mountain|area|R3C3
geo-riatavin|riatavin|Riatavin|settlement|point|R3C3
geo-the-shining-plains|the-shining-plains|The Shining Plains|region|area|R3C4
geo-ormath|ormath|Ormath|settlement|point|R3C4
geo-gulthmere|gulthmere|Gulthmere|forest|area|R3C4
geo-orsraun-mountains|orsraun-mountains|Orsraun Mountains|mountain|area|R3C4
geo-turmish|turmish|Turmish|region|area|R3C4
geo-the-flooded-forest|the-flooded-forest|The Flooded Forest|forest|area|R3C4
geo-hlondeth|hlondeth|Hlondeth|settlement|point|R3C4
geo-deepwing-mountains|deepwing-mountains|Deepwing Mountains|mountain|area|R3C4
geo-the-vilhon-reach|the-vilhon-reach|The Vilhon Reach|water|area|R3C4
geo-the-aphrunn-mountains|the-aphrunn-mountains|The Aphrunn Mountains|mountain|area|R3C4
`;

function parseRow(row) {
  const [id, slug, name, kind, zoomClass, mapCell] = row.split('|');
  return Object.freeze({
    id,
    slug,
    name,
    kind,
    zoomClass,
    mapCell,
    requiredAliases: Object.freeze(REQUIRED_ALIASES_BY_ID[id] ?? []),
    lockedCoordinates: LOCKED_MAP032_COORDINATES_BY_ID[id] ?? null,
  });
}

export const GEOGRAPHIC_COVERAGE_MANIFEST = Object.freeze(
  AUDITED_ROWS.trim().split('\n').map(parseRow),
);

export const GEOGRAPHIC_COVERAGE_MANIFEST_COUNT = GEOGRAPHIC_COVERAGE_MANIFEST.length;

export const MAP032_STABLE_IDS = Object.freeze(
  Object.keys(LOCKED_MAP032_COORDINATES_BY_ID),
);
