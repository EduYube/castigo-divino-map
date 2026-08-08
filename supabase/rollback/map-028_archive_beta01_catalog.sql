-- MAP-028 tested rollback template.
-- Do not execute this file directly in production as an untracked operation.
-- If rollback is required, copy this exact body into a new forward migration,
-- review the current production preconditions, and apply that migration normally.

update public.public_note_tags
set publication_status = 'archived'
where id in (
  'note-tag-demo-harbor-overview-coastal',
  'note-tag-demo-harbor-overview-demo-data',
  'note-tag-demo-pass-travel-demo-data',
  'note-tag-demo-pass-travel-mountain-pass',
  'note-tag-demo-pass-travel-trade-route'
)
  and publication_status <> 'archived';

update public.entity_tags
set publication_status = 'archived'
where id in (
  'entity-tag-demo-harbor-coastal',
  'entity-tag-demo-harbor-demo-data',
  'entity-tag-demo-harbor-trade-route',
  'entity-tag-demo-pass-demo-data',
  'entity-tag-demo-pass-mountain-pass',
  'entity-tag-demo-pass-trade-route'
)
  and publication_status <> 'archived';

update public.public_notes
set publication_status = 'archived'
where id in ('note-demo-harbor-overview', 'note-demo-pass-travel')
  and publication_status <> 'archived';

update public.entity_aliases
set publication_status = 'archived'
where id in (
  'alias-demo-harbor-puerto-ejemplo',
  'alias-demo-pass-desfiladero-ejemplo'
)
  and publication_status <> 'archived';

update public.map_entities
set publication_status = 'archived'
where id in ('place-demo-harbor', 'place-demo-pass')
  and publication_status <> 'archived';

update public.categories
set publication_status = 'archived'
where id in ('category-settlement', 'category-landmark')
  and publication_status <> 'archived';

update public.tags
set publication_status = 'archived'
where id in ('coastal', 'demo-data', 'mountain-pass', 'trade-route')
  and publication_status <> 'archived';

do $map028_rollback$
begin
  if exists (
    select 1
    from public.categories
    where id in ('category-settlement', 'category-landmark')
      and publication_status <> 'archived'
  ) or exists (
    select 1
    from public.tags
    where id in ('coastal', 'demo-data', 'mountain-pass', 'trade-route')
      and publication_status <> 'archived'
  ) or exists (
    select 1
    from public.map_entities
    where id in ('place-demo-harbor', 'place-demo-pass')
      and publication_status <> 'archived'
  ) or exists (
    select 1
    from public.entity_aliases
    where id in (
      'alias-demo-harbor-puerto-ejemplo',
      'alias-demo-pass-desfiladero-ejemplo'
    )
      and publication_status <> 'archived'
  ) or exists (
    select 1 from public.entity_tags
    where id like 'entity-tag-demo-%'
      and publication_status <> 'archived'
  ) or exists (
    select 1
    from public.public_notes
    where id in ('note-demo-harbor-overview', 'note-demo-pass-travel')
      and publication_status <> 'archived'
  ) or exists (
    select 1 from public.public_note_tags
    where id like 'note-tag-demo-%'
      and publication_status <> 'archived'
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 rollback did not archive the complete migrated catalog';
  end if;
end
$map028_rollback$;
