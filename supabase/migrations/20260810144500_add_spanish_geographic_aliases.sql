-- MAP-040 — allow official Spanish geographic aliases without duplicating geographic identities.
-- This migration changes only the language contract of geographic_name_aliases and public data.
-- It does not change Auth, RLS, policies, grants, roles, ownership or privileged functions.
-- Re-execution is safe; any semantic conflict fails closed instead of being overwritten.

alter table public.geographic_name_aliases
  drop constraint if exists geographic_name_aliases_language_check;

alter table public.geographic_name_aliases
  add constraint geographic_name_aliases_language_check
  check (language in ('en', 'es'));

do $map040$
declare
  candidate record;
  parent record;
  existing record;
  normalized text;
  expected_count constant integer := 8;
begin
  for candidate in
    select *
    from (
      values
        ('geo-alias-baldurs-gate-es', 'geo-baldurs-gate', 'Baldur''s Gate', 'Puerta de Baldur'),
        ('geo-alias-candlekeep-es', 'geo-candlekeep', 'Candlekeep', 'Candelero'),
        ('geo-alias-icewind-dale-es', 'geo-icewind-dale', 'Icewind Dale', 'Valle del Viento Helado'),
        ('geo-alias-moonshae-isles-es', 'geo-moonshae-isles', 'Moonshae Isles', 'Islas Lunshaes'),
        ('geo-alias-neverwinter-es', 'geo-neverwinter', 'Neverwinter', 'Nuncainvierno'),
        ('geo-alias-silverymoon-es', 'geo-silverymoon', 'Silverymoon', 'Luna Plateada'),
        ('geo-alias-sword-coast-es', 'geo-sword-coast', 'Sword Coast', 'Costa de la Espada'),
        ('geo-alias-waterdeep-es', 'geo-waterdeep', 'Waterdeep', 'Aguas Profundas')
    ) as expected(id, geographic_name_id, canonical_name, value)
  loop
    select id, name, language, publication_status, entity_id, x, y, recommended_zoom
    into parent
    from public.geographic_names
    where id = candidate.geographic_name_id;

    if not found then
      raise exception 'MAP-040 expected geographic identity % is missing', candidate.geographic_name_id;
    end if;

    if parent.name <> candidate.canonical_name
      or parent.language <> 'en'
      or parent.publication_status <> 'published'::public.publication_status then
      raise exception
        'MAP-040 geographic identity % has incompatible canonical semantics',
        candidate.geographic_name_id;
    end if;

    normalized := private.normalize_search_text(candidate.value);

    if normalized = '' then
      raise exception 'MAP-040 alias % normalizes to an empty value', candidate.id;
    end if;

    select id, geographic_name_id, language, value, normalized_value, publication_status
    into existing
    from public.geographic_name_aliases
    where id = candidate.id;

    if found then
      if existing.geographic_name_id <> candidate.geographic_name_id
        or existing.language <> 'es'
        or existing.value <> candidate.value
        or existing.normalized_value <> normalized
        or existing.publication_status <> 'published'::public.publication_status then
        raise exception 'MAP-040 alias id % already exists with incompatible semantics', candidate.id;
      end if;
    else
      select id, geographic_name_id, language, value, normalized_value, publication_status
      into existing
      from public.geographic_name_aliases
      where normalized_value = normalized
        and publication_status = 'published'::public.publication_status
      limit 1;

      if found then
        raise exception
          'MAP-040 Spanish alias % conflicts with published alias % for geographic identity %',
          candidate.value,
          existing.id,
          existing.geographic_name_id;
      end if;

      insert into public.geographic_name_aliases (
        id,
        geographic_name_id,
        language,
        value,
        normalized_value,
        publication_status,
        published_at,
        created_at,
        updated_at
      ) values (
        candidate.id,
        candidate.geographic_name_id,
        'es',
        candidate.value,
        normalized,
        'published'::public.publication_status,
        '2026-08-10T14:45:00Z'::timestamptz,
        '2026-08-10T14:45:00Z'::timestamptz,
        '2026-08-10T14:45:00Z'::timestamptz
      );
    end if;
  end loop;

  if (
    select count(*)
    from public.geographic_name_aliases
    where id in (
      'geo-alias-baldurs-gate-es',
      'geo-alias-candlekeep-es',
      'geo-alias-icewind-dale-es',
      'geo-alias-moonshae-isles-es',
      'geo-alias-neverwinter-es',
      'geo-alias-silverymoon-es',
      'geo-alias-sword-coast-es',
      'geo-alias-waterdeep-es'
    )
      and language = 'es'
      and publication_status = 'published'::public.publication_status
  ) <> expected_count then
    raise exception 'MAP-040 expected % verified Spanish aliases after migration', expected_count;
  end if;
end
$map040$;
