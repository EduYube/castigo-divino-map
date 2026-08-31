begin;

-- MAP-060 keeps administrative saves SECURITY INVOKER. Authenticated callers
-- therefore need the narrow column privilege required by admin_save_map_entity_v6;
-- RLS and the RPC's explicit admin authorization remain the row-level boundary.
grant update (geometry) on public.map_entities to authenticated;

comment on column public.map_entities.geometry is
  'MAP-060 canonical point/polygon geometry. x/y are a derived backwards-compatible representative point. Authenticated UPDATE is column-scoped and remains subject to map_entities RLS.';

commit;
