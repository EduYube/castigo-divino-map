# MAP-080 — Snapshot/degraded multi-map y hardening de seguridad

Baseline: `173d76d72fc55122e3b89a28f17a88148c943a43` (MAP-079).
Issue: https://github.com/EduYube/castigo-divino-map/issues/201

## Contract
Snapshot schema V4: world-only campaign catalogs, published global map contexts and
campaign-scoped local projections in one checksum/revision. No local-only identity is
injected into world catalogs. All local context bindings and local placements require
public, active and published endpoints. Missing/invalid references reject the revision.

## Source consistency (MAP080-REV-02)
The browser and the remote snapshot command read public PostgREST pages/tables
independently: they **cannot** promise a PostgreSQL point-in-time transaction.
A complete first pass is accepted only after a consecutive complete verification
pass produces the exact same content (SHA-256 for browser envelopes, full public
rows for snapshot tooling). If a concurrent edit changes either pass, the reader
retries up to two additional comparisons (four passes in total) and fails closed,
preserving the previous validated envelope. Both passes include world, all
campaign-local tables, and every pagination page. This is **optimistic drift
detection**, not an MVCC guarantee: simultaneous in-place edits/ABA can escape
sampling. Strong single-transaction consistency requires a future atomic SQL
read endpoint and an explicitly authorized production migration.

## Recovery
Connected: one validated V4 remote envelope (world and local together).
Degraded/offline: last complete V4 from validated session cache or bundled JSON.
Historical V1–V3 are world-only, with no inferred local authorizations.
No remote world/local mixing or independent local network refreshes.

## Real data
Neverwinter: map-neverwinter / neverwinter / 2048×1582, published,
only under Un aliento menos + geo-neverwinter.
imageUri null, no raster, local-only entities 0, placements 0.
No Veyra placement or City of Shadows content.

## Security / Operations
Read-only DB audit; production writes: 0. No new migration,
no MAP-079 timestamp reconciliation, INFRA #210 untouched.
No version bump, release, Ready, merge or deploy in this PR.
Independent review + human checkpoint required before promotion.

## Production public revision reconciliation — 2026-11-05
The remote V4 drift reported by CI on 2026-11-05 was caused by the published
world-only mission `entity-brezo-gris` (`Blackford Crossing`) added to
`un-aliento-menos` on 2026-11-04 at 22:49 UTC. Its public tag and neutral
player disposition are part of the same world projection. The revised snapshot
includes its `lifecycleStatus: active`; it does **not** add a Neverwinter
placement, local-only entity, new map context, private content or raster.
The previous remote checksum (before preserving mission lifecycle) was
`sha256:ffd018f733d30a7b37925ace0ccbc8692366dad3fec5a4b21eb1966ab1fa4e32`.
No production write was performed.
