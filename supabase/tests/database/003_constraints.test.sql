begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table _map_014_constraint_helpers (id integer);

create function pg_temp.statement_fails(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return true;
end;
$$;

create function pg_temp.statement_succeeds(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return true;
exception
  when others then
    return false;
end;
$$;

insert into private.reserved_public_identifiers (namespace, value)
values ('map_entity_id', 'entity-reserved-test');

select plan(14);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select ok(
  pg_temp.statement_fails(
    $$insert into public.map_entities (
      id, slug, entity_type, disposition, name, summary, description, x, y, category_id
    ) values (
      'entity-invalid-coordinate', 'invalid-coordinate', 'character', 'ally',
      'Invalid Coordinate', '', '', -1, 10, 'category-people'
    )$$
  ),
  'entity coordinates reject values below the map bounds'
);

select ok(
  pg_temp.statement_fails(
    $$insert into public.map_entities (
      id, slug, entity_type, disposition, name, summary, description, x, y, category_id,
      publication_status
    ) values (
      'entity-draft-category-public', 'draft-category-public', 'character', 'ally',
      'Draft Category Public', '', '', 10, 10, 'category-draft', 'published'
    )$$
  ),
  'published entities require a published category'
);

select ok(
  pg_temp.statement_fails(
    $$insert into public.map_entities (
      id, slug, entity_type, disposition, name, summary, description, x, y, category_id
    ) values (
      'entity-invalid-location-disposition', 'invalid-location-disposition', 'location', 'enemy',
      'Invalid Location Disposition', '', '', 10, 10, 'category-places'
    )$$
  ),
  'locations cannot acquire a character disposition'
);

select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set slug = 'changed-after-publication'
      where id = 'entity-aster-guide'$$
  ),
  'published slugs are immutable'
);

select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set id = 'entity-changed-id'
      where id = 'entity-echo-wanderer'$$
  ),
  'public IDs are immutable even before publication'
);

select ok(
  pg_temp.statement_fails(
    $$insert into public.entity_aliases (
      id, entity_id, language, value, publication_status
    ) values (
      'alias-ambiguous-name', 'entity-aster-guide', 'en', 'Aster Guide', 'published'
    )$$
  ),
  'published aliases cannot collide with published entity names'
);

select ok(
  pg_temp.statement_fails(
    $$insert into public.character_locations (
      id, character_id, location_id
    ) values (
      'relation-invalid-types', 'entity-bramble-fort', 'entity-aster-guide'
    )$$
  ),
  'character-location relations enforce endpoint types'
);

select ok(
  pg_temp.statement_fails(
    $$update public.categories
      set publication_status = 'draft'
      where id = 'category-people'$$
  ),
  'published categories cannot be withdrawn while published entities use them'
);

select ok(
  pg_temp.statement_fails(
    $$update public.tags
      set publication_status = 'draft'
      where id = 'notable'$$
  ),
  'published tags cannot be withdrawn while published relations use them'
);

select ok(
  pg_temp.statement_fails(
    $$insert into public.map_entities (
      id, slug, entity_type, disposition, name, summary, description, x, y, category_id
    ) values (
      'entity-reserved-test', 'reserved-test', 'character', 'unknown',
      'Reserved Test', '', '', 10, 10, 'category-people'
    )$$
  ),
  'reserved public identifiers cannot be reused'
);

select ok(
  pg_temp.statement_succeeds(
    $$insert into public.map_entities (
      id, slug, entity_type, disposition, name, summary, description, x, y, category_id
    ) values (
      'entity-boundary-test', 'boundary-test', 'character', 'unknown',
      'Boundary Test', '', '', 3600, 2329, 'category-people'
    )$$
  ),
  'map boundary coordinates are accepted'
);

select ok(
  pg_temp.statement_succeeds(
    $$update public.public_requests
      set request_status = 'archived'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  'pending requests can be archived by an administrator'
);

select ok(
  pg_temp.statement_fails(
    $$update public.public_requests
      set request_status = 'accepted'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  'archived requests are terminal'
);

select ok(
  pg_temp.statement_fails(
    $$select public.submit_public_request(
      '', 'Blank sender', 'location', 10, 10, 'Description', 'Reason'
    )$$
  ),
  'the public request operation rejects blank required text'
);

select * from finish();
rollback;
