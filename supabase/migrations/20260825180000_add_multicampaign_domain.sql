begin;

-- MAP-053 establishes campaign as a first-class domain boundary while keeping
-- v1.0 identifiers and public slugs stable. The initial campaign identifier is
-- intentionally constant so every v1.0 installation migrates to the same scope.
create table public.campaigns (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  display_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint campaigns_name_not_blank check (btrim(name) <> ''),
  constraint campaigns_status check (status in ('active', 'archived')),
  constraint campaigns_display_order_nonnegative check (display_order >= 0),
  constraint campaigns_archive_lifecycle check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

comment on table public.campaigns is
  'Publicly selectable campaign identities. MAP-053 keeps authorization global-admin while making campaign scope structural.';

insert into public.campaigns (id, slug, name, status, display_order)
values ('00000000-0000-4000-8000-000000000053', 'castigo-divino', 'Castigo Divino', 'active', 0);

create or replace function private.enforce_campaign_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception using errcode = '23514', message = 'campaign id is immutable';
  end if;

  if new.slug is distinct from old.slug then
    raise exception using errcode = '23514', message = 'campaign slug is immutable';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_campaign_identity() from public;

create trigger 10_campaign_identity
before update on public.campaigns
for each row execute function private.enforce_campaign_identity();

create trigger 90_campaign_updated_at
before update on public.campaigns
for each row execute function private.set_updated_at();

create or replace function private.enforce_campaign_scope_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campaign_id is distinct from old.campaign_id then
    raise exception using errcode = '23514', message = format('%s campaign_id is immutable', tg_table_name);
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_campaign_scope_immutability() from public;

-- The DEFAULT is deliberately retained after migration. It is the rolling
-- compatibility bridge for the already published v1.0 clients/RPCs, which do
-- not yet send campaign_id. New v1.1 callers can always specify another scope.
alter table public.categories
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.tags
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.players
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.map_entities
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.entity_aliases
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.entity_tags
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.entity_player_dispositions
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.public_notes
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.public_note_tags
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.character_location_relations
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.character_location_events
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';
alter table public.public_requests
  add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000053';

alter table public.categories
  add constraint categories_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint categories_id_campaign_unique unique (id, campaign_id);
alter table public.tags
  add constraint tags_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint tags_id_campaign_unique unique (id, campaign_id);
alter table public.players
  add constraint players_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint players_id_campaign_unique unique (id, campaign_id);
alter table public.map_entities
  add constraint map_entities_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint map_entities_id_campaign_unique unique (id, campaign_id);
alter table public.entity_aliases
  add constraint entity_aliases_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict;
alter table public.entity_tags
  add constraint entity_tags_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict;
alter table public.entity_player_dispositions
  add constraint entity_player_dispositions_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict;
alter table public.public_notes
  add constraint public_notes_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint public_notes_id_campaign_unique unique (id, campaign_id);
alter table public.public_note_tags
  add constraint public_note_tags_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict;
alter table public.character_location_relations
  add constraint character_location_relations_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict;
alter table public.character_location_events
  add constraint character_location_events_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint character_location_events_id_campaign_unique unique (id, campaign_id);
alter table public.public_requests
  add constraint public_requests_campaign_fk foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  add constraint public_requests_id_campaign_unique unique (id, campaign_id);

-- Composite foreign keys make cross-campaign joins invalid at the storage layer.
alter table public.map_entities
  add constraint map_entities_category_campaign_fk
    foreign key (category_id, campaign_id) references public.categories(id, campaign_id) on update restrict on delete restrict;
alter table public.entity_aliases
  add constraint entity_aliases_entity_campaign_fk
    foreign key (entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict;
alter table public.entity_tags
  add constraint entity_tags_entity_campaign_fk
    foreign key (entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict,
  add constraint entity_tags_tag_campaign_fk
    foreign key (tag_id, campaign_id) references public.tags(id, campaign_id) on update restrict on delete restrict;
alter table public.entity_player_dispositions
  add constraint entity_player_dispositions_entity_campaign_fk
    foreign key (entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict,
  add constraint entity_player_dispositions_player_campaign_fk
    foreign key (player_id, campaign_id) references public.players(id, campaign_id) on update restrict on delete restrict;
alter table public.public_notes
  add constraint public_notes_entity_campaign_fk
    foreign key (entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict;
alter table public.public_note_tags
  add constraint public_note_tags_note_campaign_fk
    foreign key (note_id, campaign_id) references public.public_notes(id, campaign_id) on update restrict on delete restrict,
  add constraint public_note_tags_tag_campaign_fk
    foreign key (tag_id, campaign_id) references public.tags(id, campaign_id) on update restrict on delete restrict;
alter table public.character_location_relations
  add constraint character_location_relations_character_campaign_fk
    foreign key (character_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict,
  add constraint character_location_relations_location_campaign_fk
    foreign key (location_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict;
alter table public.character_location_events
  add constraint character_location_events_character_campaign_fk
    foreign key (character_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict,
  add constraint character_location_events_location_campaign_fk
    foreign key (location_entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict,
  add constraint character_location_events_related_campaign_fk
    foreign key (related_sighting_id, campaign_id) references public.character_location_events(id, campaign_id) on update restrict on delete restrict;
alter table public.public_requests
  add constraint public_requests_converted_entity_campaign_fk
    foreign key (converted_entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict;

-- The base geographic index remains global. The old entity_id column is kept as
-- a null-only compatibility column, while its semantic relationship moves to a
-- campaign-scoped association table.
create table public.campaign_geographic_entity_links (
  campaign_id uuid not null,
  geographic_name_id text not null,
  entity_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, geographic_name_id),
  constraint campaign_geographic_entity_links_campaign_fk
    foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  constraint campaign_geographic_entity_links_geographic_name_fk
    foreign key (geographic_name_id) references public.geographic_names(id) on update restrict on delete restrict,
  constraint campaign_geographic_entity_links_entity_campaign_fk
    foreign key (entity_id, campaign_id) references public.map_entities(id, campaign_id) on update restrict on delete restrict
);

comment on table public.campaign_geographic_entity_links is
  'Campaign-specific canonical map entity associated with a global geographic name.';

create or replace function private.validate_campaign_geographic_entity_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.map_entities entity
    where entity.id = new.entity_id
      and entity.campaign_id = new.campaign_id
      and entity.entity_type = 'location'::public.entity_type
  ) then
    raise exception using errcode = '23514', message = 'geographic links require a location entity in the same campaign';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_campaign_geographic_entity_link() from public;

create trigger 20_campaign_geographic_entity_link_validate
before insert or update on public.campaign_geographic_entity_links
for each row execute function private.validate_campaign_geographic_entity_link();

create trigger 90_campaign_geographic_entity_link_updated_at
before update on public.campaign_geographic_entity_links
for each row execute function private.set_updated_at();

insert into public.campaign_geographic_entity_links (
  campaign_id,
  geographic_name_id,
  entity_id,
  created_at,
  updated_at
)
select
  '00000000-0000-4000-8000-000000000053'::uuid,
  geographic_name.id,
  geographic_name.entity_id,
  geographic_name.created_at,
  geographic_name.updated_at
from public.geographic_names geographic_name
where geographic_name.entity_id is not null;

drop trigger if exists 25_geographic_name_identity on public.geographic_names;
alter table public.geographic_names disable trigger 90_geographic_name_updated_at;
update public.geographic_names set entity_id = null where entity_id is not null;
alter table public.geographic_names enable trigger 90_geographic_name_updated_at;
alter table public.geographic_names
  add constraint geographic_names_legacy_entity_id_is_null check (entity_id is null);

-- Future disposition rows are generated only inside one campaign, rather than
-- from the global cartesian product used by v1.0.
create or replace function private.ensure_entity_player_dispositions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('entity-player-disposition-matrix'));

  if tg_table_name = 'map_entities' then
    insert into public.entity_player_dispositions (entity_id, player_id, campaign_id)
    select new.id, player.id, new.campaign_id
    from public.players player
    where player.campaign_id = new.campaign_id
    on conflict (entity_id, player_id) do nothing;
  elsif tg_table_name = 'players' then
    insert into public.entity_player_dispositions (entity_id, player_id, campaign_id)
    select entity.id, new.id, new.campaign_id
    from public.map_entities entity
    where entity.campaign_id = new.campaign_id
    on conflict (entity_id, player_id) do nothing;
  else
    raise exception using errcode = '0A000', message = 'unsupported disposition matrix trigger source';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_entity_player_dispositions() from public;

-- A campaign scope is identity, not editable metadata.
do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'categories',
    'tags',
    'players',
    'map_entities',
    'entity_aliases',
    'entity_tags',
    'entity_player_dispositions',
    'public_notes',
    'public_note_tags',
    'character_location_relations',
    'character_location_events',
    'public_requests'
  ] loop
    execute format(
      'create trigger 05_campaign_scope_immutable before update on public.%I for each row execute function private.enforce_campaign_scope_immutability()',
      scoped_table
    );
  end loop;
end;
$$;

alter table public.campaign_geographic_entity_links enable row level security;
alter table public.campaigns enable row level security;

-- Deny by default until the following security migration installs reviewed ACLs.
revoke all on table public.campaigns from public, anon, authenticated;
revoke all on table public.campaign_geographic_entity_links from public, anon, authenticated;

commit;
