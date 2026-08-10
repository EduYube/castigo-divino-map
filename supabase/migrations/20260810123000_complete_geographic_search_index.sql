-- MAP-039 — complete the public geographic search index from the audited official raster.
-- Data-only migration. It does not change schema, RLS, grants, Auth, roles, policies or functions.
--
-- Source contract:
-- - official Sword Coast LowRes raster approved by MAP-002 (3600 x 2329);
-- - SHA-256 9f60e95dfe2e4501f8d86757a5ba2cae75b0aa729fd66a0a408f91b870283d8a;
-- - x = source pixel x, y = 2329 - source pixel y in CRS.Simple;
-- - point destinations use recommended_zoom 0.75;
-- - regional, linear and area destinations use recommended_zoom 0.50.
--
-- The source image and temporary inspection crops are intentionally not stored by this migration
-- or anywhere else in the repository. Re-execution is safe and semantic conflicts fail closed.

do $map039$
declare
  expected_rows constant text := $names$
geo-tuern|tuern|Tuern|385|2134|0.5
geo-uttersea|uttersea|Uttersea|395|2164|0.75
geo-the-purple-rocks|the-purple-rocks|The Purple Rocks|620|1919|0.5
geo-ruins-of-ascarle|ruins-of-ascarle|Ruins of Ascarle|523|1936|0.75
geo-trisk|trisk|Trisk|520|1909|0.75
geo-ulf-of-thuger|ulf-of-thuger|Ulf of Thuger|515|1891|0.75
geo-utherall|utherall|Utherall|550|1869|0.75
geo-vilkstead|vilkstead|Vilkstead|592|1874|0.75
geo-trackless-sea|trackless-sea|Trackless Sea|610|1649|0.5
geo-sea-of-moving-ice|sea-of-moving-ice|Sea of Moving Ice|1140|2194|0.5
geo-icewind-dale|icewind-dale|Icewind Dale|1250|2209|0.5
geo-kelvins-cairn|kelvins-cairn|Kelvin's Cairn|1290|2184|0.5
geo-ironmaster|ironmaster|Ironmaster|1250|2147|0.75
geo-ten-towns|ten-towns|Ten-Towns|1300|2149|0.5
geo-fireshear|fireshear|Fireshear|1250|2059|0.75
geo-gundbarg|gundbarg|Gundbarg|978|1861|0.75
geo-gundarlun|gundarlun|Gundarlun|950|1824|0.5
geo-reghed-glacier|reghed-glacier|Reghed Glacier|1390|2224|0.5
geo-the-spine-of-the-world|the-spine-of-the-world|The Spine of the World|1600|2159|0.5
geo-the-endless-ice-sea|the-endless-ice-sea|The Endless Ice Sea|1740|2239|0.5
geo-kingdom-of-many-arrows|kingdom-of-many-arrows|Kingdom of Many Arrows|1850|2169|0.5
geo-raven-rock|raven-rock|Raven Rock|1455|2124|0.75
geo-mirabar|mirabar|Mirabar|1562|2093|0.75
geo-great-worm-cavern|great-worm-cavern|Great Worm Cavern|1670|2119|0.75
geo-the-lurkwood|the-lurkwood|The Lurkwood|1775|2069|0.5
geo-mithral-hall|mithral-hall|Mithral Hall|1880|2044|0.75
geo-settlestone|settlestone|Settlestone|1900|2024|0.75
geo-luskan|luskan|Luskan|1416|2011|0.75
geo-blackford-crossing|blackford-crossing|Blackford Crossing|1430|2014|0.75
geo-river-mirar|river-mirar|River Mirar|1570|2044|0.5
geo-blackford-road|blackford-road|Blackford Road|1460|2044|0.5
geo-morgurs-mound|morgurs-mound|Morgur's Mound|1510|1974|0.75
geo-gauntlgrym|gauntlgrym|Gauntlgrym|1465|1944|0.75
geo-mount-hotenow|mount-hotenow|Mount Hotenow|1425|1919|0.75
geo-longsaddle|longsaddle|Longsaddle|1630|1922|0.75
geo-neverwinter|neverwinter|Neverwinter|1433|1853|0.75
geo-neverwinter-wood|neverwinter-wood|Neverwinter Wood|1530|1874|0.5
geo-helms-hold|helms-hold|Helm's Hold|1475|1829|0.75
geo-triboar|triboar|Triboar|1675|1814|0.75
geo-yartar|yartar|Yartar|1755|1809|0.75
geo-dessarin-river|dessarin-river|Dessarin River|1820|1809|0.5
geo-river-surbrin|river-surbrin|River Surbrin|1725|1864|0.5
geo-flint-rock|flint-rock|Flint Rock|1770|1864|0.75
geo-the-laughingflow|the-laughingflow|The Laughingflow|1860|1909|0.5
geo-evermoors|the-evermoors|The Evermoors|1890|1921|0.5
geo-sword-mountains|sword-mountains|Sword Mountains|1610|1569|0.5
geo-mere-of-dead-men|mere-of-dead-men|Mere of Dead Men|1470|1677|0.5
geo-high-road|high-road|High Road|1470|1789|0.5
geo-long-road|long-road|Long Road|1650|1679|0.5
geo-cold-wood|cold-wood|Cold Wood|2130|2184|0.5
geo-beorunnas-well|beorunnas-well|Beorunna's Well|2100|2144|0.75
geo-castle-hartwick|castle-hartwick|Castle Hartwick|2335|2164|0.75
geo-hartsvale|hartsvale|Hartsvale|2420|2169|0.5
geo-ice-spires|ice-spires|Ice Spires|2255|2134|0.5
geo-citadel-adbar|citadel-adbar|Citadel Adbar|2310|2094|0.75
geo-one-stone|one-stone|One Stone|1975|2064|0.75
geo-menzoberranzan|menzoberranzan|Menzoberranzan|1935|2019|0.75
geo-citadel-felbarr|citadel-felbarr|Citadel Felbarr|2110|2059|0.75
geo-silverymoon|silverymoon|Silverymoon|1998|1969|0.75
geo-sundabar|sundabar|Sundabar|2145|1984|0.75
geo-nether-mountains|nether-mountains|Nether Mountains|2310|1944|0.5
geo-ascore|ascore|Ascore|2390|2019|0.75
geo-arn-forest|arn-forest|Arn Forest|2380|1984|0.5
geo-river-rauvin|river-rauvin|River Rauvin|2080|1939|0.5
geo-stone-stand|stone-stand|Stone Stand|2120|1909|0.75
geo-high-forest|the-high-forest|The High Forest|2098|1809|0.5
geo-hellgate-dell|hellgate-dell|Hellgate Dell|2240|1874|0.75
geo-delimbiyr-river|delimbiyr-river|Delimbiyr River|1855|1429|0.5
geo-the-far-forest|the-far-forest|The Far Forest|2290|1847|0.5
geo-grandfather-tree|grandfather-tree|Grandfather Tree|1980|1836|0.75
geo-star-mountains|star-mountains|Star Mounts|2000|1746|0.5
geo-karse|karse|Karse|2080|1744|0.75
geo-unicorn-run|unicorn-run|Unicorn Run|2010|1639|0.5
geo-the-high-ice|the-high-ice|The High Ice|2760|2054|0.5
geo-the-frozen-sea|the-frozen-sea|The Frozen Sea|2470|1809|0.5
geo-the-frozen-forest|the-frozen-forest|The Frozen Forest|3260|1924|0.5
geo-turnback-mountains|turnback-mountains|Turnback Mountains|3130|1759|0.5
geo-the-tortured-land|the-tortured-land|The Tortured Land|3250|1639|0.5
geo-ruathym|ruathym|Ruathym|950|1479|0.5
geo-the-whale-bones|the-whale-bones|The Whale Bones|1215|1489|0.5
geo-finback|finback|Finback|1210|1447|0.75
geo-northlander-isles|northlander-isles|Northlander Isles|1100|1394|0.5
geo-korinn-archipelago|korinn-archipelago|Korinn Archipelago|1280|1359|0.5
geo-moonshae-isles|moonshae-isles|Moonshae Isles|1110|1099|0.5
geo-thornhold|thornhold|Thornhold|1515|1596|0.75
geo-amphail|amphail|Amphail|1630|1549|0.75
geo-waterdeep|waterdeep|Waterdeep|1626|1465|0.75
geo-daggerford|daggerford|Daggerford|1742|1386|0.75
geo-secomber|secomber|Secomber|1890|1449|0.75
geo-misty-forest|misty-forest|Misty Forest|1850|1351|0.5
geo-trade-way|trade-way|Trade Way|2010|1229|0.5
geo-trollbark-forest|trollbark-forest|Trollbark Forest|1800|1201|0.5
geo-skadaurak|skadaurak|Skadaurak|1225|1199|0.5
geo-orlumbor|orlumbor|Orlumbor|1690|1199|0.5
geo-warlocks-crypt|warlocks-crypt|Warlock's Crypt|1790|1139|0.75
geo-mintarn|mintarn|Mintarn|1300|1099|0.5
geo-greypeak-mountains|greypeak-mountains|Greypeak Mountains|2220|1539|0.5
geo-southwood|southwood|Southwood|2060|1469|0.5
geo-orogoth|orogoth|Orogoth|2100|1319|0.75
geo-high-moor|the-high-moor|The High Moor|2010|1279|0.5
geo-marsh-of-chelimber|marsh-of-chelimber|Marsh of Chelimber|2280|1319|0.5
geo-greycloak-hills|greycloak-hills|Greycloak Hills|2440|1319|0.5
geo-serpent-hills|serpent-hills|Serpent Hills|2150|1239|0.5
geo-dragonspear-castle|dragonspear-castle|Dragonspear Castle|1925|1169|0.75
geo-najara|najara|Najara|2230|1159|0.5
geo-ssthartissssun|ssthartissssun|Ss'thar'tiss'ssun|2275|1179|0.75
geo-forest-of-wyrms|forest-of-wyrms|Forest of Wyrms|2165|1084|0.5
geo-the-plain-of-standing-stones|the-plain-of-standing-stones|The Plain of Standing Stones|2770|1579|0.5
geo-anauroch|anauroch|Anauroch|2700|1329|0.5
geo-evereska|evereska|Evereska|2482|1249|0.75
geo-desertsmouth-mountains|desertsmouth-mountains|Desertsmouth Mountains|2900|1114|0.5
geo-spiderhaunt-woods|spiderhaunt-woods|Spiderhaunt Woods|3020|1144|0.5
geo-white-peaks|white-peaks|White Peaks|3175|1549|0.5
geo-vercy-wood|vercy-wood|Vercy Wood|3470|1524|0.5
geo-the-ride|the-ride|The Ride|3270|1459|0.5
geo-border-forest|border-forest|Border Forest|3125|1364|0.5
geo-thar|thar|Thar|3470|1379|0.5
geo-zhentil-keep|zhentil-keep|Zhentil Keep|3280|1314|0.75
geo-hillsfar|hillsfar|Hillsfar|3370|1229|0.75
geo-myth-drannor|myth-drannor|Myth Drannor|3298|1149|0.75
geo-cormanthor|cormanthor|Cormanthor|3360|1104|0.5
geo-sea-of-moonshae|sea-of-moonshae|Sea of Moonshae|1100|1039|0.5
geo-norland|norland|Norland|1000|994|0.5
geo-rogarsheim|rogarsheim|Rogarsheim|1135|1044|0.75
geo-fairheight-range|fairheight-range|Fairheight Range|1240|1044|0.5
geo-dernall-forest|dernall-forest|Dernall Forest|1250|979|0.5
geo-alaron|alaron|Alaron|1260|914|0.5
geo-omans-isle|omans-isle|Omans Isle|1090|899|0.5
geo-iron-keep|iron-keep|Iron Keep|1105|951|0.75
geo-gwynneth|gwynneth|Gwynneth|1160|839|0.5
geo-myrloch-vale|myrloch-vale|Myrloch Vale|1130|789|0.5
geo-moray|moray|Moray|995|806|0.5
geo-trollclaw-range|trollclaw-range|Trollclaw Range|950|869|0.5
geo-caer-moray|caer-moray|Caer Moray|1008|884|0.75
geo-dynnegall|dynnegall|Dynnegall|1010|855|0.75
geo-fairview|fairview|Fairview|976|834|0.75
geo-caer-corwell|caer-corwell|Caer Corwell|1150|739|0.75
geo-snowdown|snowdown|Snowdown|1290|759|0.5
geo-caer-westphal|caer-westphal|Caer Westphal|1295|724|0.75
geo-sea-of-swords|sea-of-swords|Sea of Swords|1570|889|0.5
geo-sword-coast|sword-coast|Sword Coast|1450|1049|0.5
geo-winding-water|winding-water|Winding Water|1830|1069|0.5
geo-baldurs-gate|baldurs-gate|Baldur's Gate|1889|824|0.75
geo-the-cloakwood|the-cloakwood|The Cloakwood|1880|764|0.5
geo-candlekeep|candlekeep|Candlekeep|1830|659|0.75
geo-the-trollclaws|the-trollclaws|The Trollclaws|1980|1069|0.5
geo-trollclaw-ford|trollclaw-ford|Trollclaw Ford|1980|1039|0.75
geo-boareskyr-bridge|boareskyr-bridge|Boareskyr Bridge|2090|1059|0.75
geo-fields-of-the-dead|the-fields-of-the-dead|The Fields of the Dead|2016|959|0.5
geo-northdark-wood|northdark-wood|Northdark Wood|2300|1019|0.5
geo-trielta-hills|trielta-hills|Trielta Hills|2260|989|0.5
geo-hardbuckler|hardbuckler|Hardbuckler|2310|979|0.75
geo-triel|triel|Triel|2225|899|0.75
geo-the-reaching-woods|the-reaching-woods|The Reaching Woods|2320|879|0.5
geo-river-chionthar|river-chionthar|River Chionthar|2050|879|0.5
geo-elturel|elturel|Elturel|2145|879|0.75
geo-fort-morninglord|fort-morninglord|Fort Morninglord|2100|859|0.75
geo-scornubel|scornubel|Scornubel|2290|854|0.75
geo-elturgard|elturgard|Elturgard|2180|814|0.5
geo-coast-way|coast-way|Coast Way|1900|749|0.5
geo-wood-of-sharp-teeth|wood-of-sharp-teeth|Wood of Sharp Teeth|2090|739|0.5
geo-berdusk|berdusk|Berdusk|2300|729|0.75
geo-iriaebor|iriaebor|Iriaebor|2450|689|0.75
geo-the-green-fields|the-green-fields|The Green Fields|2280|584|0.5
geo-the-high-moors|the-high-moors|The High Moors|2800|1004|0.5
geo-sunset-mountains|sunset-mountains|Sunset Mountains|2500|829|0.5
geo-darkhold|darkhold|Darkhold|2465|901|0.75
geo-the-far-hills|the-far-hills|The Far Hills|2470|859|0.5
geo-the-storm-horns|the-storm-horns|The Storm Horns|2680|899|0.5
geo-arabel|arabel|Arabel|2870|899|0.75
geo-hullack-forest|hullack-forest|Hullack Forest|2960|879|0.5
geo-cormyr|cormyr|Cormyr|2870|769|0.5
geo-marsember|marsember|Marsember|2760|699|0.75
geo-lake-of-dragons|lake-of-dragons|Lake of Dragons|2830|659|0.5
geo-proskur|proskur|Proskur|2670|664|0.75
geo-easting|easting|Easting|2500|644|0.75
geo-priapurl|priapurl|Priapurl|2600|604|0.75
geo-elversult|elversult|Elversult|2720|624|0.75
geo-westgate|westgate|Westgate|3030|679|0.75
geo-the-dalelands|the-dalelands|The Dalelands|3180|1009|0.5
geo-thunder-peaks|thunder-peaks|Thunder Peaks|3100|859|0.5
geo-archwood|archwood|Archwood|3230|879|0.5
geo-ordulin|ordulin|Ordulin|3370|879|0.75
geo-yhaunn|yhaunn|Yhaunn|3470|869|0.75
geo-sembia|sembia|Sembia|3310|759|0.5
geo-mulhessen|mulhessen|Mulhessen|3150|779|0.75
geo-selgaunt|selgaunt|Selgaunt|3300|749|0.75
geo-saerloon|saerloon|Saerloon|3230|709|0.75
geo-sea-of-fallen-stars|sea-of-fallen-stars|Sea of Fallen Stars|3450|679|0.5
geo-the-nelanther|the-nelanther|The Nelanther|1530|419|0.5
geo-the-cloud-peaks|the-cloud-peaks|The Cloud Peaks|1950|479|0.5
geo-the-snakewood|the-snakewood|The Snakewood|2320|469|0.5
geo-amn|amn|Amn|2160|369|0.5
geo-the-small-teeth|the-small-teeth|The Small Teeth|1930|309|0.5
geo-murann|murann|Murann|1930|249|0.75
geo-tejarn-hills|tejarn-hills|Tejarn Hills|2290|249|0.5
geo-forest-of-tethir|forest-of-tethir|Forest of Tethir|2180|139|0.5
geo-troll-mountains|troll-mountains|Troll Mountains|2460|514|0.5
geo-the-giants-plain|the-giants-plain|The Giant's Plain|2630|479|0.5
geo-giants-run-mountains|giants-run-mountains|Giant's Run Mountains|2820|499|0.5
geo-shilmista-forest|shilmista-forest|Shilmista Forest|2580|309|0.5
geo-snowflake-mountains|snowflake-mountains|Snowflake Mountains|2690|259|0.5
geo-riatavin|riatavin|Riatavin|2480|189|0.75
geo-the-shining-plains|the-shining-plains|The Shining Plains|2860|219|0.5
geo-ormath|ormath|Ormath|2980|184|0.75
geo-gulthmere|gulthmere|Gulthmere|3130|489|0.5
geo-orsraun-mountains|orsraun-mountains|Orsraun Mountains|3230|319|0.5
geo-turmish|turmish|Turmish|3460|334|0.5
geo-the-flooded-forest|the-flooded-forest|The Flooded Forest|3050|289|0.5
geo-hlondeth|hlondeth|Hlondeth|3300|139|0.75
geo-deepwing-mountains|deepwing-mountains|Deepwing Mountains|3100|94|0.5
geo-the-vilhon-reach|the-vilhon-reach|The Vilhon Reach|3400|89|0.5
geo-the-aphrunn-mountains|the-aphrunn-mountains|The Aphrunn Mountains|3455|199|0.5
$names$;
  expected_names jsonb;
  expected_aliases constant jsonb := $aliases$[
    {"id":"geo-alias-evermoors","geographic_name_id":"geo-evermoors","value":"Evermoors"},
    {"id":"geo-alias-fields-of-the-dead","geographic_name_id":"geo-fields-of-the-dead","value":"Fields of the Dead"},
    {"id":"geo-alias-high-forest","geographic_name_id":"geo-high-forest","value":"High Forest"},
    {"id":"geo-alias-high-moor","geographic_name_id":"geo-high-moor","value":"High Moor"},
    {"id":"geo-alias-star-mountains-legacy","geographic_name_id":"geo-star-mountains","value":"Star Mountains"},
    {"id":"geo-alias-waterdeep-city-of-splendors","geographic_name_id":"geo-waterdeep","value":"City of Splendors"}
  ]$aliases$::jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'id', parts[1],
      'slug', parts[2],
      'name', parts[3],
      'x', parts[4]::double precision,
      'y', parts[5]::double precision,
      'recommended_zoom', parts[6]::double precision
    )
  )
  into expected_names
  from (
    select regexp_split_to_array(row_value, '\\|') as parts
    from regexp_split_to_table(trim(expected_rows), E'\\n') as rows(row_value)
  ) parsed;

  if jsonb_array_length(expected_names) <> 213 then
    raise exception using
      errcode = '23514',
      message = 'MAP-039 migration source must contain exactly 213 audited identities';
  end if;

  -- MAP-032 used the non-raster display "Star Mountains". MAP-039 keeps the stable id/slug and
  -- coordinate contract while correcting the canonical raster label to "Star Mounts".
  if exists (
    select 1
    from public.geographic_names
    where id = 'geo-star-mountains'
      and (
        slug is distinct from 'star-mountains'
        or name not in ('Star Mountains', 'Star Mounts')
        or language is distinct from 'en'
        or x is distinct from 2000::double precision
        or y is distinct from 1746::double precision
        or recommended_zoom is distinct from 0.50::double precision
        or entity_id is not null
        or publication_status is distinct from 'published'::public.publication_status
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'MAP-039 Star Mounts compatibility update conflicts with existing data';
  end if;

  update public.geographic_names
  set name = 'Star Mounts'
  where id = 'geo-star-mountains'
    and name = 'Star Mountains'
    and slug = 'star-mountains'
    and language = 'en'
    and x = 2000::double precision
    and y = 1746::double precision
    and recommended_zoom = 0.50::double precision
    and entity_id is null
    and publication_status = 'published'::public.publication_status;

  insert into public.geographic_names (
    id,
    slug,
    name,
    language,
    x,
    y,
    recommended_zoom,
    entity_id,
    publication_status
  )
  select
    expected.id,
    expected.slug,
    expected.name,
    'en',
    expected.x,
    expected.y,
    expected.recommended_zoom,
    null,
    'published'::public.publication_status
  from jsonb_to_recordset(expected_names) as expected(
    id text,
    slug text,
    name text,
    x double precision,
    y double precision,
    recommended_zoom double precision
  )
  where not exists (
    select 1
    from public.geographic_names actual
    where actual.id = expected.id
  );

  if exists (
    select 1
    from jsonb_to_recordset(expected_names) as expected(
      id text,
      slug text,
      name text,
      x double precision,
      y double precision,
      recommended_zoom double precision
    )
    left join public.geographic_names actual on actual.id = expected.id
    where actual.id is null
      or actual.slug is distinct from expected.slug
      or actual.name is distinct from expected.name
      or actual.language is distinct from 'en'
      or actual.x is distinct from expected.x
      or actual.y is distinct from expected.y
      or actual.recommended_zoom is distinct from expected.recommended_zoom
      or actual.entity_id is not null
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using
      errcode = '23514',
      message = 'MAP-039 geographic inventory conflicts with existing data';
  end if;

  insert into public.geographic_name_aliases (
    id,
    geographic_name_id,
    language,
    value,
    publication_status
  )
  select
    expected.id,
    expected.geographic_name_id,
    'en',
    expected.value,
    'published'::public.publication_status
  from jsonb_to_recordset(expected_aliases) as expected(
    id text,
    geographic_name_id text,
    value text
  )
  where not exists (
    select 1
    from public.geographic_name_aliases actual
    where actual.id = expected.id
  );

  if exists (
    select 1
    from jsonb_to_recordset(expected_aliases) as expected(
      id text,
      geographic_name_id text,
      value text
    )
    left join public.geographic_name_aliases actual on actual.id = expected.id
    where actual.id is null
      or actual.geographic_name_id is distinct from expected.geographic_name_id
      or actual.language is distinct from 'en'
      or actual.value is distinct from expected.value
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using
      errcode = '23514',
      message = 'MAP-039 geographic aliases conflict with existing data';
  end if;

  if (
    select count(*)
    from public.geographic_names actual
    join jsonb_to_recordset(expected_names) as expected(id text) on expected.id = actual.id
    where actual.publication_status = 'published'::public.publication_status
  ) <> jsonb_array_length(expected_names) then
    raise exception using
      errcode = '23514',
      message = 'MAP-039 requires every audited geographic identity to be published';
  end if;
end
$map039$;
