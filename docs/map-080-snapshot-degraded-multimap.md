# MAP-080 — Snapshot/degraded multi-map y hardening de seguridad

Baseline: `173d76d72fc55122e3b89a28f17a88148c943a43` (MAP-079).
Issue: https://github.com/EduYube/castigo-divino-map/issues/201

## Contract
Snapshot schema V4: world-only campaign catalogs, published global map contexts and
campaign-scoped local projections in one checksum/revision. No local-only identity is
injected into world catalogs. All local context bindings and local placements require
public, active and published endpoints. Missing/invalid references reject the revision.

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
