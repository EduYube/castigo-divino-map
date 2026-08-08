-- MAP-028 — migrate the Beta 0.1 public demo catalog into the persistent Beta 0.2 model.
-- Data-only migration. It deliberately does not change RLS, grants, Auth, roles or schema.
-- Re-execution is safe: inserts are conditional by stable identity and the final assertions
-- reject any pre-existing row whose public meaning differs from the Beta 0.1 inventory.

with expected(id, slug, name, description) as (
  values
    ('category-settlement', 'asentamientos', 'Asentamiento', 'Ciudades, villas y otros núcleos habitados conocidos públicamente.'),
    ('category-landmark', 'lugares-destacados', 'Lugar destacado', 'Accidentes geográficos y puntos de referencia públicos del mapa.')
)
insert into public.categories (id, slug, name, description, publication_status)
select id, slug, name, description, 'published'::public.publication_status
from expected
where not exists (select 1 from public.categories existing where existing.id = expected.id);

with expected(id, name, description) as (
  values
    ('coastal', 'Costero', 'Lugar situado junto a la costa o relacionado con navegación marítima.'),
    ('demo-data', 'Dato de demostración', 'Contenido neutro creado únicamente para demostrar el modelo de datos.'),
    ('mountain-pass', 'Paso de montaña', 'Ruta pública que atraviesa una zona montañosa.'),
    ('trade-route', 'Ruta comercial', 'Lugar relacionado públicamente con una ruta de intercambio o viaje.')
)
insert into public.tags (id, name, description, publication_status)
select id, name, description, 'published'::public.publication_status
from expected
where not exists (select 1 from public.tags existing where existing.id = expected.id);

with expected(
  id, slug, name, x, y, category_id
) as (
  values
    ('place-demo-harbor', 'puerto-de-demostracion', 'Puerto de demostración', 1080.5::double precision, 820::double precision, 'category-settlement'),
    ('place-demo-pass', 'paso-de-demostracion', 'Paso de demostración', 2240::double precision, 1240.25::double precision, 'category-landmark')
)
insert into public.map_entities (
  id,
  slug,
  entity_type,
  visibility,
  name_language,
  name,
  summary,
  description,
  x,
  y,
  category_id,
  publication_status
)
select
  id,
  slug,
  'location'::public.entity_type,
  'pin'::public.map_visibility,
  'en',
  name,
  '',
  '',
  x,
  y,
  category_id,
  'published'::public.publication_status
from expected
where not exists (select 1 from public.map_entities existing where existing.id = expected.id);

with expected(id, entity_id, value) as (
  values
    ('alias-demo-harbor-puerto-ejemplo', 'place-demo-harbor', 'Puerto de ejemplo'),
    ('alias-demo-pass-desfiladero-ejemplo', 'place-demo-pass', 'Desfiladero de ejemplo')
)
insert into public.entity_aliases (id, entity_id, language, value, publication_status)
select id, entity_id, 'en', value, 'published'::public.publication_status
from expected
where not exists (select 1 from public.entity_aliases existing where existing.id = expected.id);

with expected(id, entity_id, tag_id) as (
  values
    ('entity-tag-demo-harbor-coastal', 'place-demo-harbor', 'coastal'),
    ('entity-tag-demo-harbor-demo-data', 'place-demo-harbor', 'demo-data'),
    ('entity-tag-demo-harbor-trade-route', 'place-demo-harbor', 'trade-route'),
    ('entity-tag-demo-pass-demo-data', 'place-demo-pass', 'demo-data'),
    ('entity-tag-demo-pass-mountain-pass', 'place-demo-pass', 'mountain-pass'),
    ('entity-tag-demo-pass-trade-route', 'place-demo-pass', 'trade-route')
)
insert into public.entity_tags (id, entity_id, tag_id, publication_status)
select id, entity_id, tag_id, 'published'::public.publication_status
from expected
where not exists (select 1 from public.entity_tags existing where existing.id = expected.id);

with expected(id, slug, entity_id, title, body, sort_order) as (
  values
    (
      'note-demo-harbor-overview',
      'puerto-de-demostracion-resumen',
      'place-demo-harbor',
      'Información pública de demostración',
      'Este puerto ficticio sirve para comprobar fichas, búsquedas y filtros sin representar hechos secretos ni confirmados de la campaña.',
      0
    ),
    (
      'note-demo-pass-travel',
      'paso-de-demostracion-viaje',
      'place-demo-pass',
      'Referencia pública de viaje',
      'Este paso ficticio demuestra cómo una nota pública puede relacionar un lugar con etiquetas de viaje y terreno.',
      0
    )
)
insert into public.public_notes (
  id,
  slug,
  entity_id,
  title,
  body,
  sort_order,
  publication_status
)
select id, slug, entity_id, title, body, sort_order, 'published'::public.publication_status
from expected
where not exists (select 1 from public.public_notes existing where existing.id = expected.id);

with expected(id, note_id, tag_id) as (
  values
    ('note-tag-demo-harbor-overview-coastal', 'note-demo-harbor-overview', 'coastal'),
    ('note-tag-demo-harbor-overview-demo-data', 'note-demo-harbor-overview', 'demo-data'),
    ('note-tag-demo-pass-travel-demo-data', 'note-demo-pass-travel', 'demo-data'),
    ('note-tag-demo-pass-travel-mountain-pass', 'note-demo-pass-travel', 'mountain-pass'),
    ('note-tag-demo-pass-travel-trade-route', 'note-demo-pass-travel', 'trade-route')
)
insert into public.public_note_tags (id, note_id, tag_id, publication_status)
select id, note_id, tag_id, 'published'::public.publication_status
from expected
where not exists (select 1 from public.public_note_tags existing where existing.id = expected.id);

do $map028$
begin
  if exists (
    select 1
    from public.categories
    where id = 'category-settlement'
      and (
        slug is distinct from 'asentamientos'
        or name is distinct from 'Asentamiento'
        or description is distinct from 'Ciudades, villas y otros núcleos habitados conocidos públicamente.'
        or publication_status is distinct from 'published'::public.publication_status
      )
  ) or exists (
    select 1
    from public.categories
    where id = 'category-landmark'
      and (
        slug is distinct from 'lugares-destacados'
        or name is distinct from 'Lugar destacado'
        or description is distinct from 'Accidentes geográficos y puntos de referencia públicos del mapa.'
        or publication_status is distinct from 'published'::public.publication_status
      )
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 category identity conflicts with existing data';
  end if;

  if exists (
    select 1
    from (
      values
        ('coastal', 'Costero', 'Lugar situado junto a la costa o relacionado con navegación marítima.'),
        ('demo-data', 'Dato de demostración', 'Contenido neutro creado únicamente para demostrar el modelo de datos.'),
        ('mountain-pass', 'Paso de montaña', 'Ruta pública que atraviesa una zona montañosa.'),
        ('trade-route', 'Ruta comercial', 'Lugar relacionado públicamente con una ruta de intercambio o viaje.')
    ) as expected(id, name, description)
    left join public.tags actual on actual.id = expected.id
    where actual.id is null
      or actual.name is distinct from expected.name
      or actual.description is distinct from expected.description
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 tag identity conflicts with existing data';
  end if;

  if exists (
    select 1
    from public.map_entities
    where id = 'place-demo-harbor'
      and (
        slug is distinct from 'puerto-de-demostracion'
        or entity_type is distinct from 'location'::public.entity_type
        or visibility is distinct from 'pin'::public.map_visibility
        or name is distinct from 'Puerto de demostración'
        or x is distinct from 1080.5::double precision
        or y is distinct from 820::double precision
        or category_id is distinct from 'category-settlement'
        or publication_status is distinct from 'published'::public.publication_status
      )
  ) or exists (
    select 1
    from public.map_entities
    where id = 'place-demo-pass'
      and (
        slug is distinct from 'paso-de-demostracion'
        or entity_type is distinct from 'location'::public.entity_type
        or visibility is distinct from 'pin'::public.map_visibility
        or name is distinct from 'Paso de demostración'
        or x is distinct from 2240::double precision
        or y is distinct from 1240.25::double precision
        or category_id is distinct from 'category-landmark'
        or publication_status is distinct from 'published'::public.publication_status
      )
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 place identity conflicts with existing data';
  end if;

  if exists (
    select 1
    from (
      values
        ('alias-demo-harbor-puerto-ejemplo', 'place-demo-harbor', 'Puerto de ejemplo'),
        ('alias-demo-pass-desfiladero-ejemplo', 'place-demo-pass', 'Desfiladero de ejemplo')
    ) as expected(id, entity_id, value)
    left join public.entity_aliases actual on actual.id = expected.id
    where actual.id is null
      or actual.entity_id is distinct from expected.entity_id
      or actual.language is distinct from 'en'
      or actual.value is distinct from expected.value
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 alias identity conflicts with existing data';
  end if;

  if exists (
    select 1
    from (
      values
        ('entity-tag-demo-harbor-coastal', 'place-demo-harbor', 'coastal'),
        ('entity-tag-demo-harbor-demo-data', 'place-demo-harbor', 'demo-data'),
        ('entity-tag-demo-harbor-trade-route', 'place-demo-harbor', 'trade-route'),
        ('entity-tag-demo-pass-demo-data', 'place-demo-pass', 'demo-data'),
        ('entity-tag-demo-pass-mountain-pass', 'place-demo-pass', 'mountain-pass'),
        ('entity-tag-demo-pass-trade-route', 'place-demo-pass', 'trade-route')
    ) as expected(id, entity_id, tag_id)
    left join public.entity_tags actual on actual.id = expected.id
    where actual.id is null
      or actual.entity_id is distinct from expected.entity_id
      or actual.tag_id is distinct from expected.tag_id
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 entity-tag identity conflicts with existing data';
  end if;

  if exists (
    select 1
    from (
      values
        (
          'note-demo-harbor-overview',
          'puerto-de-demostracion-resumen',
          'place-demo-harbor',
          'Información pública de demostración',
          'Este puerto ficticio sirve para comprobar fichas, búsquedas y filtros sin representar hechos secretos ni confirmados de la campaña.',
          0
        ),
        (
          'note-demo-pass-travel',
          'paso-de-demostracion-viaje',
          'place-demo-pass',
          'Referencia pública de viaje',
          'Este paso ficticio demuestra cómo una nota pública puede relacionar un lugar con etiquetas de viaje y terreno.',
          0
        )
    ) as expected(id, slug, entity_id, title, body, sort_order)
    left join public.public_notes actual on actual.id = expected.id
    where actual.id is null
      or actual.slug is distinct from expected.slug
      or actual.entity_id is distinct from expected.entity_id
      or actual.title is distinct from expected.title
      or actual.body is distinct from expected.body
      or actual.sort_order is distinct from expected.sort_order
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 note identity conflicts with existing data';
  end if;

  if exists (
    select 1
    from (
      values
        ('note-tag-demo-harbor-overview-coastal', 'note-demo-harbor-overview', 'coastal'),
        ('note-tag-demo-harbor-overview-demo-data', 'note-demo-harbor-overview', 'demo-data'),
        ('note-tag-demo-pass-travel-demo-data', 'note-demo-pass-travel', 'demo-data'),
        ('note-tag-demo-pass-travel-mountain-pass', 'note-demo-pass-travel', 'mountain-pass'),
        ('note-tag-demo-pass-travel-trade-route', 'note-demo-pass-travel', 'trade-route')
    ) as expected(id, note_id, tag_id)
    left join public.public_note_tags actual on actual.id = expected.id
    where actual.id is null
      or actual.note_id is distinct from expected.note_id
      or actual.tag_id is distinct from expected.tag_id
      or actual.publication_status is distinct from 'published'::public.publication_status
  ) then
    raise exception using errcode = '23514', message = 'MAP-028 note-tag identity conflicts with existing data';
  end if;
end
$map028$;
