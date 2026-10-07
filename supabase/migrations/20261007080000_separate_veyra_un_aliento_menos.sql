begin;

alter table public.players add column character_entity_id text;
alter table public.players
  add constraint players_character_entity_campaign_fk
  foreign key (character_entity_id, campaign_id)
  references public.map_entities(id, campaign_id) on update restrict on delete restrict;
create unique index players_character_entity_identity_unique
  on public.players(character_entity_id) where character_entity_id is not null;


create or replace function private.validate_player_character_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.character_entity_id is null then return new; end if;
  perform 1
  from public.map_entities as entity
  where entity.id = new.character_entity_id
    and entity.campaign_id = new.campaign_id
    and entity.entity_type = 'character'::public.entity_type
  for share;
  if not found then
    raise exception using errcode='23514',
      message='player character identity must reference a character in the same campaign';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_player_character_identity() from public, anon, authenticated;
create trigger "20_player_character_identity"
before insert or update of character_entity_id, campaign_id on public.players
for each row execute function private.validate_player_character_identity();

create or replace function private.remove_self_player_disposition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.character_entity_id is not null then
    delete from public.entity_player_dispositions
    where campaign_id=new.campaign_id and entity_id=new.character_entity_id and player_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.remove_self_player_disposition() from public, anon, authenticated;
create trigger "96_player_remove_self_disposition"
after insert or update of character_entity_id, campaign_id on public.players
for each row execute function private.remove_self_player_disposition();

create or replace function private.reject_self_player_disposition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.players as player
    where player.id=new.player_id
      and player.campaign_id=new.campaign_id
      and player.character_entity_id=new.entity_id
  ) then
    raise exception using errcode='23514',
      message='a player cannot have a disposition toward their own character entity';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_self_player_disposition() from public, anon, authenticated;
create trigger "20_reject_self_player_disposition"
before insert or update on public.entity_player_dispositions
for each row execute function private.reject_self_player_disposition();

create or replace function private.ensure_entity_player_dispositions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('entity-player-disposition-matrix'));
  if tg_table_name='map_entities' then
    insert into public.entity_player_dispositions(entity_id,player_id,campaign_id)
    select new.id, player.id, new.campaign_id
    from public.players as player
    where player.campaign_id=new.campaign_id
      and player.character_entity_id is distinct from new.id
    on conflict (entity_id,player_id) do nothing;
  elsif tg_table_name='players' then
    insert into public.entity_player_dispositions(entity_id,player_id,campaign_id)
    select entity.id,new.id,new.campaign_id
    from public.map_entities as entity
    where entity.campaign_id=new.campaign_id
      and entity.id is distinct from new.character_entity_id
    on conflict (entity_id,player_id) do nothing;
  else
    raise exception using errcode='0A000',message='unsupported disposition matrix trigger source';
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_entity_player_dispositions() from public;

comment on column public.players.character_entity_id is
  'MAP-068 explicit optional player-character identity; campaign-bound and excluded from self-dispositions.';

do $$
declare
  initial_campaign constant uuid := '00000000-0000-4000-8000-000000000053'::uuid;
  new_campaign constant uuid := '00000000-0000-4000-8000-000000000068'::uuid;
  veyra_entity constant text := 'entity-request-07d26371bbff42d9b91e076d099891b0';
  veyra_player constant text := 'player-veyra';
  request_id constant uuid := '07d26371-bbff-42d9-b91e-076d099891b0'::uuid;
  entity_count integer;
  player_count integer;
  request_count integer;
  tag_count integer;
begin
  if exists (
    select 1
    from public.campaigns
    where (id = new_campaign or slug = 'un-aliento-menos' or name = 'Un aliento menos')
      and not (
        id = new_campaign
        and slug = 'un-aliento-menos'
        and name = 'Un aliento menos'
      )
  ) then
    raise exception 'MAP-068 found a conflicting Un aliento menos campaign identity';
  end if;

  insert into public.campaigns (id, slug, name, status, display_order)
  values (new_campaign, 'un-aliento-menos', 'Un aliento menos', 'active', 1)
  on conflict (id) do nothing;

  select count(*) into entity_count
  from public.map_entities
  where id = veyra_entity;

  select count(*) into player_count
  from public.players
  where id = veyra_player;

  select count(*) into request_count
  from public.public_requests
  where id = request_id;

  select count(*) into tag_count
  from public.tags
  where id = 'category-veyra';

  -- Fresh installs apply migrations before seed and therefore have no Veyra
  -- source rows. Keep the new campaign usable without fabricating Veyra.
  if entity_count = 0 and player_count = 0 and request_count = 0 and tag_count = 0 then
    insert into public.categories (
      campaign_id,
      id,
      slug,
      name,
      description,
      publication_status,
      published_at
    )
    values (
      new_campaign,
      'category-pj-un-aliento-menos',
      'personaje-un-aliento-menos',
      'Personaje',
      'Personaje',
      'published',
      pg_catalog.now()
    )
    on conflict (id) do nothing;
    return;
  end if;

  if entity_count <> 1 or player_count <> 1 then
    raise exception 'MAP-068 requires the stable Veyra entity and player together';
  end if;

  if not exists (
    select 1
    from public.campaigns
    where id = initial_campaign
      and slug = 'castigo-divino'
      and name = 'Castigo Divino'
  ) then
    raise exception 'MAP-068 initial campaign identity does not match the audited baseline';
  end if;

  if not exists (
    select 1
    from public.map_entities
    where id = veyra_entity
      and campaign_id = initial_campaign
      and slug = 'request-07d26371bbff42d9b91e076d099891b0'
      and name = 'Veyra'
      and entity_type = 'character'::public.entity_type
  ) then
    raise exception 'MAP-068 Veyra entity identity does not match the expected lineage';
  end if;

  if not exists (
    select 1
    from public.players
    where id = veyra_player
      and campaign_id = initial_campaign
      and slug = 'veyra'
      and display_name = 'Veyra'
  ) then
    raise exception 'MAP-068 Veyra player identity does not match the expected lineage';
  end if;

  if not exists (
    select 1
    from public.map_entities as entity
    join public.categories as category
      on category.id = entity.category_id
     and category.campaign_id = entity.campaign_id
    where entity.id = veyra_entity
      and entity.campaign_id = initial_campaign
  ) then
    raise exception 'MAP-068 Veyra category is not valid in the source campaign';
  end if;

  if request_count = 1 and not exists (
    select 1
    from public.public_requests
    where id = request_id
      and campaign_id = initial_campaign
      and request_status = 'converted'::public.request_status
      and converted_entity_id = veyra_entity
  ) then
    raise exception 'MAP-068 Veyra request no longer matches its converted entity';
  end if;

  if (
    select count(*)
    from public.public_requests
    where converted_entity_id = veyra_entity
  ) <> request_count then
    raise exception 'MAP-068 found an unexpected request converted to Veyra';
  end if;

  if tag_count = 1 then
    if (
      select count(*)
      from public.entity_tags
      where tag_id = 'category-veyra'
    ) <> 1
       or not exists (
         select 1
         from public.entity_tags
         where id = 'entity-tag-432d9dc2a2b6dbd6a450f556'
           and entity_id = veyra_entity
           and tag_id = 'category-veyra'
           and campaign_id = initial_campaign
       )
       or exists (
         select 1
         from public.public_note_tags
         where tag_id = 'category-veyra'
       ) then
      raise exception 'MAP-068 Veyra tag is no longer exclusive to Veyra';
    end if;
  elsif tag_count <> 0 then
    raise exception 'MAP-068 found an ambiguous Veyra tag identity';
  end if;

  if exists (
    select 1
    from public.entity_tags
    where entity_id = veyra_entity
      and tag_id <> 'category-veyra'
  ) then
    raise exception 'MAP-068 found an unaudited additional tag on Veyra';
  end if;

  -- Production currently has none of these dependencies. Failing here is
  -- deliberate: if production gains one before the checkpoint, it must be
  -- classified explicitly instead of being silently deleted or re-scoped.
  if exists (select 1 from public.entity_aliases where entity_id = veyra_entity)
     or exists (select 1 from public.public_notes where entity_id = veyra_entity)
     or exists (
       select 1
       from public.public_notes
       where author_player_id = veyra_player
          or last_modifier_player_id = veyra_player
     )
     or exists (
       select 1
       from public.entity_player_associations
       where entity_id = veyra_entity
          or player_id = veyra_player
     )
     or exists (
       select 1
       from public.character_location_relations
       where character_id = veyra_entity
          or location_id = veyra_entity
     )
     or exists (
       select 1
       from public.character_location_events
       where character_id = veyra_entity
          or location_entity_id = veyra_entity
     )
     or exists (
       select 1
       from public.campaign_geographic_entity_links
       where entity_id = veyra_entity
     )
     or exists (
       select 1
       from public.geographic_names
       where entity_id = veyra_entity
     ) then
    raise exception 'MAP-068 found an unaudited Veyra dependency; review before migrating';
  end if;

  if exists (
    select 1
    from public.categories
    where id = 'category-pj-un-aliento-menos'
      and campaign_id <> new_campaign
  ) then
    raise exception 'MAP-068 destination character category id is already in use';
  end if;

  insert into public.categories (
    campaign_id,
    id,
    slug,
    name,
    description,
    publication_status,
    published_at
  )
  select
    new_campaign,
    'category-pj-un-aliento-menos',
    'personaje-un-aliento-menos',
    category.name,
    category.description,
    category.publication_status,
    category.published_at
  from public.map_entities as entity
  join public.categories as category
    on category.id = entity.category_id
   and category.campaign_id = entity.campaign_id
  where entity.id = veyra_entity
    and entity.campaign_id = initial_campaign
  on conflict (id) do nothing;

  -- Every disposition involving Veyra becomes either cross-campaign or self
  -- after the split. Production audit counts 19 unique rows; historic upgrade
  -- fixtures may contain a different matrix cardinality, so the semantic rule
  -- is expressed by endpoints rather than by a brittle global count.
  delete from public.entity_player_dispositions
  where player_id = veyra_player
     or entity_id = veyra_entity;
end;
$$;

alter table public.entity_tags
  drop constraint entity_tags_entity_campaign_fk,
  drop constraint entity_tags_tag_campaign_fk;
alter table public.public_requests drop constraint public_requests_converted_entity_campaign_fk;

alter table public.players disable trigger "05_campaign_scope_immutable";
alter table public.players disable trigger "90_player_updated_at";
alter table public.map_entities disable trigger "05_campaign_scope_immutable";
alter table public.map_entities disable trigger "90_map_entity_updated_at";
alter table public.tags disable trigger "05_campaign_scope_immutable";
alter table public.tags disable trigger "90_tag_updated_at";
alter table public.entity_tags disable trigger "05_campaign_scope_immutable";
alter table public.entity_tags disable trigger "90_entity_tag_updated_at";
alter table public.public_requests disable trigger "05_campaign_scope_immutable";
alter table public.public_requests disable trigger "90_public_request_updated_at";

do $$
declare
  initial_campaign constant uuid := '00000000-0000-4000-8000-000000000053'::uuid;
  new_campaign constant uuid := '00000000-0000-4000-8000-000000000068'::uuid;
  veyra_entity constant text := 'entity-request-07d26371bbff42d9b91e076d099891b0';
begin
  if exists(select 1 from public.map_entities where id=veyra_entity and campaign_id=initial_campaign) then
    update public.tags set campaign_id=new_campaign where id='category-veyra' and campaign_id=initial_campaign;
    update public.map_entities set campaign_id=new_campaign,category_id='category-pj-un-aliento-menos'
      where id=veyra_entity and campaign_id=initial_campaign;
    update public.entity_tags set campaign_id=new_campaign
      where id='entity-tag-432d9dc2a2b6dbd6a450f556' and entity_id=veyra_entity and campaign_id=initial_campaign;
    update public.public_requests set campaign_id=new_campaign
      where id='07d26371-bbff-42d9-b91e-076d099891b0'::uuid and campaign_id=initial_campaign;
    update public.players set campaign_id=new_campaign,display_order=0,character_entity_id=veyra_entity
      where id='player-veyra' and campaign_id=initial_campaign;
  end if;
end;
$$;

alter table public.players enable trigger "05_campaign_scope_immutable";
alter table public.players enable trigger "90_player_updated_at";
alter table public.map_entities enable trigger "05_campaign_scope_immutable";
alter table public.map_entities enable trigger "90_map_entity_updated_at";
alter table public.tags enable trigger "05_campaign_scope_immutable";
alter table public.tags enable trigger "90_tag_updated_at";
alter table public.entity_tags enable trigger "05_campaign_scope_immutable";
alter table public.entity_tags enable trigger "90_entity_tag_updated_at";
alter table public.public_requests enable trigger "05_campaign_scope_immutable";
alter table public.public_requests enable trigger "90_public_request_updated_at";

alter table public.entity_tags
  add constraint entity_tags_entity_campaign_fk foreign key(entity_id,campaign_id)
    references public.map_entities(id,campaign_id) on update restrict on delete restrict,
  add constraint entity_tags_tag_campaign_fk foreign key(tag_id,campaign_id)
    references public.tags(id,campaign_id) on update restrict on delete restrict;
alter table public.public_requests
  add constraint public_requests_converted_entity_campaign_fk foreign key(converted_entity_id,campaign_id)
    references public.map_entities(id,campaign_id) on update restrict on delete restrict;

do $$
declare
  initial_campaign constant uuid := '00000000-0000-4000-8000-000000000053'::uuid;
  new_campaign constant uuid := '00000000-0000-4000-8000-000000000068'::uuid;
  veyra_entity constant text := 'entity-request-07d26371bbff42d9b91e076d099891b0';
begin
  if not exists(select 1 from public.campaigns where id=new_campaign and slug='un-aliento-menos'
    and name='Un aliento menos' and status='active') then raise exception 'MAP-068 failed to create Un aliento menos'; end if;
  if exists(select 1 from public.players where id='player-veyra' and campaign_id=initial_campaign)
    or exists(select 1 from public.map_entities where id=veyra_entity and campaign_id=initial_campaign)
    then raise exception 'MAP-068 left Veyra in Castigo Divino'; end if;
  if exists(select 1 from public.players where id='player-veyra') then
    if not exists(select 1 from public.players where id='player-veyra' and campaign_id=new_campaign
      and display_order=0 and character_entity_id=veyra_entity)
      or not exists(select 1 from public.map_entities where id=veyra_entity and campaign_id=new_campaign
        and category_id='category-pj-un-aliento-menos')
      then raise exception 'MAP-068 failed to preserve and move Veyra'; end if;
    if exists(select 1 from public.entity_player_dispositions where player_id='player-veyra' or entity_id=veyra_entity)
      then raise exception 'MAP-068 left a Veyra disposition after campaign separation'; end if;
  end if;
  if exists(
    select 1 from public.entity_player_dispositions d
    join public.map_entities e on e.id=d.entity_id join public.players p on p.id=d.player_id
    where d.campaign_id<>e.campaign_id or d.campaign_id<>p.campaign_id
  ) or exists(
    select 1 from public.entity_player_associations a
    join public.map_entities e on e.id=a.entity_id join public.players p on p.id=a.player_id
    where a.campaign_id<>e.campaign_id or a.campaign_id<>p.campaign_id
  ) or exists(
    select 1 from public.public_requests r join public.map_entities e on e.id=r.converted_entity_id
    where r.converted_entity_id is not null and r.campaign_id<>e.campaign_id
  ) then raise exception 'MAP-068 detected cross-campaign integrity leakage'; end if;
end;
$$;

commit;
