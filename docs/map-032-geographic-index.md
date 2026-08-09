# MAP-032 — Geographic search baseline and release gate

## Purpose

MAP-032 restores the geographic-name capability implemented by MAP-021 after the Beta 0.2 publication exposed an empty `geographicNames` collection.

The defect was not in ranking, URL state, camera movement, zoom or highlighting. The public query and snapshot paths already transported geographic rows correctly. The production source tables were empty, and the MAP-030 release verification checked equality between Supabase and the committed snapshot without asserting that the declared geographic-search capability had a usable baseline.

## Data provenance

The baseline is limited to English names that are visibly printed on the official low-resolution Sword Coast map already approved by MAP-002:

`https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg`

The source image remains remote and is not copied, redistributed, transformed or stored in this repository. It was opened only as a temporary private inspection source, which is the workflow already documented by MAP-002.

Coordinates were measured against the 3600 × 2329 source image. The application uses Leaflet `CRS.Simple`; repository coordinates therefore use:

- `x = source image pixel x`
- `y = 2329 - source image pixel y`

Settlement coordinates use the centre of the visible settlement marker. Broad regions use the centre of the printed region label.

Recommended zoom is not tuned independently per name. MAP-032 reuses the MAP-021 semantics already represented in its tests:

- settlements: `0.75`, matching the Waterdeep fixture;
- broad regions: `0.50`, matching the Sword Mountains fixture.

## Published baseline

### Settlements

- Baldur's Gate — `(1889, 824)`, zoom `0.75`
- Daggerford — `(1742, 1386)`, zoom `0.75`
- Luskan — `(1416, 2011)`, zoom `0.75`
- Mirabar — `(1562, 2093)`, zoom `0.75`
- Neverwinter — `(1433, 1853)`, zoom `0.75`
- Silverymoon — `(1998, 1969)`, zoom `0.75`
- Waterdeep — `(1626, 1465)`, zoom `0.75`

### Regions and named places

- The Evermoors — `(1890, 1921)`, zoom `0.50`
- The Fields of the Dead — `(2016, 959)`, zoom `0.50`
- Forest of Wyrms — `(2165, 1084)`, zoom `0.50`
- The High Forest — `(2098, 1809)`, zoom `0.50`
- The High Moor — `(2010, 1279)`, zoom `0.50`
- Star Mountains — `(2000, 1746)`, zoom `0.50`
- Sword Mountains — `(1610, 1569)`, zoom `0.50`
- Trollbark Forest — `(1800, 1201)`, zoom `0.50`

### Aliases

Aliases are restricted to English alternatives already justified by the map naming or previous MAP-021 fixtures:

- `Evermoors` → The Evermoors
- `Fields of the Dead` → The Fields of the Dead
- `High Forest` → The High Forest
- `High Moor` → The High Moor
- `City of Splendors` → Waterdeep

All MAP-032 names have `entity_id = null`. They are searchable geographic targets only and do not create campaign pins or entity detail sheets.

## Database migration

`supabase/migrations/20260809160000_populate_geographic_search_index.sql` is a data-only migration.

It does not change schema, Auth, RLS, grants, roles, privileged functions or security boundaries. It inserts the baseline only when stable IDs are absent and then verifies the complete public meaning. A conflicting pre-existing row fails the migration instead of being silently overwritten.

Existing public-read RLS policies remain authoritative. pgTAP coverage verifies that anonymous readers can retrieve the published MAP-032 names and aliases through those unchanged policies.

## Snapshot and degraded mode

`public/data/public-catalog.snapshot.json` contains the same geographic baseline as the remote source. When Supabase is unavailable, the existing degraded-mode loader therefore retains the basic geographic search capability instead of falling back to an empty index.

E2E coverage explicitly forces the remote REST path to return `503` and verifies that Waterdeep still resolves from the bundled snapshot with the same coordinate, zoom and highlight behaviour.

## MAP-030 release hardening

`src/data-access/geographicCoverageContract.js` defines the minimum functional publication contract. The snapshot verifier now requires:

- at least 15 published geographic names;
- all 15 baseline identities in English;
- coordinates inside the official 3600 × 2329 map bounds;
- supported recommended zoom values;
- the required aliases;
- Waterdeep at `(1626, 1465)` with zoom `0.75`.

`scripts/verify-public-snapshot.mjs` applies this contract both to the committed snapshot and, in remote verification mode, to the Supabase projection. Exact snapshot-versus-remote equality remains required.

The historical MAP-028 migration fixture is intentionally compared through its legacy projection with `geographicNames: []`: MAP-028 remains reproducible without pretending it originally supplied data introduced later by MAP-032.

The Pages smoke suite also searches Waterdeep and verifies camera centre, zoom and geographic highlight. A release can therefore no longer pass merely because an empty Supabase index and an empty snapshot agree with each other.

## Regression coverage

MAP-032 adds or extends coverage for:

- exact Waterdeep search;
- representative settlements and broad regions;
- alias search;
- separation from visible campaign pins and entity sheets;
- camera centring;
- recommended zoom;
- geographic highlighting;
- remote public data;
- degraded snapshot fallback;
- minimum geographic publication coverage;
- existing RLS visibility.

The pre-existing MAP-021 tests continue to cover keyboard interaction, URL/history handling, reduced motion and the accessible zero-results state for unknown names.
