begin;

-- MAP-054 adds the mutable presentation metadata required by the per-campaign
-- administrative roster. Campaign membership remains immutable under the
-- MAP-053 trigger and published player identifiers keep their existing
-- reservation/lifecycle rules.
alter table public.players
  add column display_order integer not null default 0,
  add column accent_color text not null default '#475569',
  add constraint players_display_order_nonnegative check (display_order >= 0),
  add constraint players_accent_color_hex check (accent_color ~ '^#[0-9a-f]{6}$');

create or replace function private.player_accent_contrast_on_white(p_color text)
returns double precision
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  red double precision;
  green double precision;
  blue double precision;
  luminance double precision;
  component double precision;
begin
  if p_color !~ '^#[0-9a-f]{6}$' then
    return 0;
  end if;

  red := pg_catalog.get_byte(pg_catalog.decode(pg_catalog.substr(p_color, 2, 2), 'hex'), 0) / 255.0;
  green := pg_catalog.get_byte(pg_catalog.decode(pg_catalog.substr(p_color, 4, 2), 'hex'), 0) / 255.0;
  blue := pg_catalog.get_byte(pg_catalog.decode(pg_catalog.substr(p_color, 6, 2), 'hex'), 0) / 255.0;

  component := red;
  if component <= 0.04045 then
    red := component / 12.92;
  else
    red := pg_catalog.power((component + 0.055) / 1.055, 2.4);
  end if;

  component := green;
  if component <= 0.04045 then
    green := component / 12.92;
  else
    green := pg_catalog.power((component + 0.055) / 1.055, 2.4);
  end if;

  component := blue;
  if component <= 0.04045 then
    blue := component / 12.92;
  else
    blue := pg_catalog.power((component + 0.055) / 1.055, 2.4);
  end if;

  luminance := 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05);
end;
$$;

revoke all on function private.player_accent_contrast_on_white(text) from public;

create or replace function private.normalize_player_roster_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.accent_color := pg_catalog.lower(pg_catalog.btrim(new.accent_color));

  if new.accent_color !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '23514', message = 'player accent_color must be a normalized six-digit hex value';
  end if;

  if private.player_accent_contrast_on_white(new.accent_color) < 3.0 then
    raise exception using errcode = '23514', message = 'player accent_color must have at least 3:1 contrast on white';
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_player_roster_metadata() from public;

create trigger "15_player_roster_metadata"
before insert or update of accent_color, display_order on public.players
for each row execute function private.normalize_player_roster_metadata();

create index players_campaign_roster_idx
  on public.players (campaign_id, publication_status, display_order, display_name, id);

-- Existing player mutation grants remain admin-gated by the established RLS
-- policies. Extend only their column allow-list; campaign_id is deliberately
-- absent from UPDATE so roster members cannot move between campaigns.
grant insert (display_order, accent_color) on table public.players to authenticated;
grant update (display_order, accent_color) on table public.players to authenticated;

-- The live v1.0 data never had rows in public.players: the legitimate historic
-- identities are the published character entities. Assert that source before
-- materialising the roster. If an installation already created a matching
-- roster row, preserve its ID/slug/status and only configure MAP-054 metadata.
do $$
declare
  initial_campaign constant uuid := '00000000-0000-4000-8000-000000000053'::uuid;
  source_count integer;
  roster_count integer;
  player_spec record;
begin
  for player_spec in
    select * from (values
      ('skade'::text, 'Skade'::text, 'player-skade'::text, '#c2410c'::text, 0),
      ('ura'::text, 'Ura'::text, 'player-ura'::text, '#1e3a8a'::text, 1),
      ('veyra'::text, 'Veyra'::text, 'player-veyra'::text, '#9d174d'::text, 2)
    ) as configured(slug, display_name, fallback_id, accent_color, display_order)
  loop
    select pg_catalog.count(*)::integer
    into source_count
    from public.map_entities entity
    where entity.campaign_id = initial_campaign
      and entity.entity_type = 'character'::public.entity_type
      and pg_catalog.lower(entity.name) = pg_catalog.lower(player_spec.display_name);

    if source_count <> 1 then
      raise exception using
        errcode = '23514',
        message = pg_catalog.format(
          'MAP-054 expected exactly one historic character entity for %s in the initial campaign, found %s',
          player_spec.display_name,
          source_count
        );
    end if;

    select pg_catalog.count(*)::integer
    into roster_count
    from public.players player
    where player.campaign_id = initial_campaign
      and (
        pg_catalog.lower(player.display_name) = pg_catalog.lower(player_spec.display_name)
        or player.slug = player_spec.slug
      );

    if roster_count > 1 then
      raise exception using
        errcode = '23514',
        message = pg_catalog.format(
          'MAP-054 found ambiguous existing roster rows for %s in the initial campaign',
          player_spec.display_name
        );
    end if;

    if roster_count = 1 then
      update public.players player
      set accent_color = player_spec.accent_color,
          display_order = player_spec.display_order
      where player.campaign_id = initial_campaign
        and (
          pg_catalog.lower(player.display_name) = pg_catalog.lower(player_spec.display_name)
          or player.slug = player_spec.slug
        );
    else
      insert into public.players (
        campaign_id,
        id,
        slug,
        display_name,
        name_language,
        publication_status,
        display_order,
        accent_color
      ) values (
        initial_campaign,
        player_spec.fallback_id,
        player_spec.slug,
        player_spec.display_name,
        'en',
        'published'::public.publication_status,
        player_spec.display_order,
        player_spec.accent_color
      );
    end if;
  end loop;
end;
$$;

commit;
