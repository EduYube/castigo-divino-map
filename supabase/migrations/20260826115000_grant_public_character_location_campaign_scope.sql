-- MAP-053 production gate follow-up: MAP-020 intentionally exposes only the
-- public relation projection to anon through column-level SELECT grants. When
-- MAP-053 added campaign_id, that new scope column was therefore not inherited
-- by the existing grant, causing PostgREST to reject the multicampaign snapshot
-- reader before RLS could evaluate the row.
--
-- Expose only campaign_id in addition to the existing public columns. RLS
-- remains authoritative for row visibility and still requires published,
-- public endpoints in the same active campaign.
grant select (campaign_id)
  on public.character_location_relations
  to anon;
