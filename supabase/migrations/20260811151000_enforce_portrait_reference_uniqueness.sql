-- MAP-045 hardening: one Storage portrait object may have at most one current entity owner.
--
-- The client always uploads to a fresh opaque UUID path before swapping the entity
-- reference. Enforcing that ownership in PostgreSQL prevents a privileged/manual RPC
-- caller from sharing one binary between entities, which would otherwise make public
-- authorization and replacement cleanup depend on another entity's lifecycle.

create unique index map_entities_portrait_path_unique
on public.map_entities (portrait_path)
where portrait_path is not null;

comment on index public.map_entities_portrait_path_unique is
  'MAP-045 enforces one current character entity owner per private portrait object path.';
