-- MAP-032 — populate the public geographic search index required by MAP-021.
-- Data-only migration. It does not change schema, RLS, grants, Auth, roles or functions.
--
-- Coordinate provenance:
-- - names are English labels visible on the official Sword Coast LowRes map already approved by MAP-002;
-- - coordinates were measured against the 3600 x 2329 source image without storing or redistributing it;
-- - CRS.Simple uses x = image pixel x and y = 2329 - image pixel y;
-- - point settlements use the visible settlement marker centre; broad regions use the printed label centre.
--
-- Zoom provenance:
-- - 0.75 for settlements follows the Waterdeep behaviour established by MAP-021 tests;
-- - 0.50 for broad regions follows the Sword Mountains behaviour established by MAP-021 tests.
--
-- Re-execution is safe: rows are inserted only when their stable id is absent, then the complete
-- expected public meaning is asserted so conflicting pre-existing data fails closed.

with expected(id, slug, name, x, y, recommended_zoom) as (
  values
    ('geo-baldurs-gate', 'baldurs-gate', 'Baldur''s Gate', 1889::double precision, 824::double precision, 0.75::double precision),
    ('geo-daggerford', 'daggerford', 'Daggerford', 1742::double precision, 1386::double precision, 0.75::double precision),
    ('geo-evermoors', 'the-evermoors', 'The Evermoors', 1890::double precision, 1921::double precision, 0.50::double precision),
    ('geo-fields-of-the-dead', 'the-fields-of-the-dead', 'The Fields of the Dead', 2016::double precision, 959::double precision, 0.50::double precision),
    ('geo-forest-of-wyrms', 'forest-of-wyrms', 'Forest of Wyrms', 2165::double precision, 1084::double precision, 0.50::double precision),
    ('geo-high-forest', 'the-high-forest', 'The High Forest', 2098::double precision, 1809::double precision, 0.50::double precision),
    ('geo-high-moor', 'the-high-moor', 'The High Moor', 2010::double precision, 1279::double precision, 0.50::double precision),
    ('geo-luskan', 'luskan', 'Luskan', 1416::double precision, 2011::double precision, 0.75::double precision),
    ('geo-mirabar', 'mirabar', 'Mirabar', 1562::double precision, 2093::double precision, 0.75::double precision),
    ('geo-neverwinter', 'neverwinter', 'Neverwinter', 1433::double precision, 1853::double precision, 0.75::double precision),
    ('geo-silverymoon', 'silverymoon', 'Silverymoon', 1998::double precision, 1969::double precision, 0.75::double precision),
    ('geo-star-mountains', 'star-mountains', 'Star Mountains', 2000::double precision, 1746::double precision, 0.50::double precision),
    ('geo-sword-mountains', 'sword-mountains', 'Sword Mountains', 1610::double precision, 1569::double precision, 0.50::double precision),
    ('geo-trollbark-forest', 'trollbark-forest', 'Trollbark Forest', 1800::double precision, 1201::double precision, 0.50::double precision),
    ('geo-waterdeep', 'waterdeep', 'Waterdeep', 1626::double precision, 1465::double precision, 0.75::double precision)
)
insert into public.geographic_names (
  id,
  slug,
  name,
  language,
  x,
  y,
  recommended_zoom,
  entity_id,
  publication_status
)
select
  id,
  slug,
  name,
  'en',
  x,
  y,
  recommended_zoom,
  null,
  'published'::public.publication_status
from expected
where not exists (
  select 1
  from public.geographic_names existing
  where existing.id = expected.id
);

with expected(id, geographic_name_id, value) as (
  values
    ('geo-alias-evermoors', 'geo-evermoors', 'Evermoors'),
    ('geo-alias-fields-of-the-dead', 'geo-fields-of-the-dead', 'Fields of the Dead'),
    ('geo-alias-high-forest', 'geo-high-forest', 'High Forest'),
    ('geo-alias-high-moor', 'geo-high-moor', 'High Moor'),
    ('geo-alias-waterdeep-city-of-splendors', 'geo-waterdeep', 'City of Splendors')
)
insert into public.geographic_name_aliases (
  id,
  geographic_name_id,
  language,
  value,
  publication_status
)
select
  id,
  geographic_name_id,
  'en',
  value,
  'published'::public.publication_status
from expected
where not exists (
  select 1
  from public.geographic_name_aliases existing
  where existing.id = expected.id
);

do $map032$
begin
  if exists (
    select 1
    from (
      values
        ('geo-baldurs-gate', 'baldurs-gate', 'Baldur''s Gate', 1889::double precision, 824::double precision, 0.75::double precision),
        ('geo-daggerford', 'daggerford', 'Daggerford', 1742::double precision, 1386::double precision, 0.75::double precision),
        ('geo-evermoors', 'the-evermoors', 'The Evermoors', 1890::double precision, 1921::double precision, 0.50::double precision),
        ('geo-fields-of-the-dead', 'the-fields-of-the-dead', 'The Fields of the Dead', 2016::double precision, 959::double precision, 0.50::double precision),
        ('geo-forest-of-wyrms', 'forest-of-wyrms', 'Forest of Wyrms', 2165::double precision, 1084::double precision, 0.50::double precision),
        ('geo-high-forest', 'the-high-forest', 'The High Forest', 2098::double precision, 1809::double precision, 0.50::double precision),
        ('geo-high-moor', 'the-high-moor', 'The High Moor', 2010::double precision, 1279::double precision, 0.50::double precision),
        ('geo-luskan', 'luskan', 'Luskan', 1416::double precision, 2011::double precision, 0.75::double precision),
        ('geo-mirabar', 'mirabar', 'Mirabar', 1562::double precision, 2093::double precision, 0.75::double precision),
        ('geo-neverwinter', 'neverwinter', 'Neverwinter', 1433::double precision, 1853::double precision, 0.75::double precision),
        ('geo-silverymoon', 'silverymoon', 'Silverymoon', 1998::double precision, 1969::double precision, 0.75::double precision),
        ('geo-star-mountains', 'star-mountains', 'Star Mountains', 2000::double precision, 1746::double precision, 0.50::double precision),
        ('geo-sword-mountains', 'sword-mountains', 'Sword Mountains', 1610::double precision, 1569::double precision, 0.50::double precision),
        ('geo-trollbark-forest', 'trollbark-forest', 'Trollbark Forest', 1800::double precision, 1201::double precision, 0.50::double precision),
        ('geo-waterdeep', 'waterdeep', 'Waterdeep', 1626::double precision, 1465::double precision, 0.75::double precision)
    ) as expected(id, slug, name, x, y, recommended_zoom)
    left join public.geographic_names actual on actual.id = expected.id
    where actual.id is null
      or actual.slug is distinct from expected.slug
      or actual.name is distinct from expected.name
      or actual.language is distinct from 'en'
      or actual.x is distinct from expected.x
      or actual.y is distinct from expected.y
      or actual.recommended_zoom is distinct from expected.recommended_zoom
      or actual.entity_id is not null
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using
      errcode = '23514',
      message = 'MAP-032 geographic index conflicts with existing data';
  end if;

  if exists (
    select 1
    from (
      values
        ('geo-alias-evermoors', 'geo-evermoors', 'Evermoors'),
        ('geo-alias-fields-of-the-dead', 'geo-fields-of-the-dead', 'Fields of the Dead'),
        ('geo-alias-high-forest', 'geo-high-forest', 'High Forest'),
        ('geo-alias-high-moor', 'geo-high-moor', 'High Moor'),
        ('geo-alias-waterdeep-city-of-splendors', 'geo-waterdeep', 'City of Splendors')
    ) as expected(id, geographic_name_id, value)
    left join public.geographic_name_aliases actual on actual.id = expected.id
    where actual.id is null
      or actual.geographic_name_id is distinct from expected.geographic_name_id
      or actual.language is distinct from 'en'
      or actual.value is distinct from expected.value
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using
      errcode = '23514',
      message = 'MAP-032 geographic aliases conflict with existing data';
  end if;

  if (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-baldurs-gate',
      'geo-daggerford',
      'geo-evermoors',
      'geo-fields-of-the-dead',
      'geo-forest-of-wyrms',
      'geo-high-forest',
      'geo-high-moor',
      'geo-luskan',
      'geo-mirabar',
      'geo-neverwinter',
      'geo-silverymoon',
      'geo-star-mountains',
      'geo-sword-mountains',
      'geo-trollbark-forest',
      'geo-waterdeep'
    )
      and publication_status = 'published'::public.publication_status
  ) <> 15 then
    raise exception using
      errcode = '23514',
      message = 'MAP-032 requires all 15 baseline geographic names to be published';
  end if;
end
$map032$;
