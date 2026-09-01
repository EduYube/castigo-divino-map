begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

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

create function pg_temp.error_message(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlerrm;
end;
$$;

select plan(35);

select has_column('public', 'public_notes', 'author_kind', 'notes persist original author kind');
select has_column('public', 'public_notes', 'author_player_id', 'notes persist stable player author id');
select has_column('public', 'public_notes', 'last_modifier_kind', 'notes persist last modifier kind');
select has_column('public', 'public_notes', 'last_modifier_player_id', 'notes persist last modifier player id');

select is(
  (select author_kind::text from public.public_notes where id = 'note-demo-harbor-overview'),
  'master'::text,
  'pre-MAP-063 demo note is represented as historical Master authorship'
);
select is(
  (select title from public.public_notes where id = 'note-demo-harbor-overview'),
  'Información pública de demostración'::text,
  'migration preserves historic note id and title'
);
select ok(
  (select created_at = updated_at from public.public_notes where id = 'note-demo-harbor-overview'),
  'migration preserves historic note timestamps instead of recreating the row'
);

-- Build a second campaign plus a Master-only target while running as the owner.
insert into public.campaigns (id, slug, name, status, display_order)
values ('00000000-0000-4000-8000-000000000063', 'map063-campaign-b', 'MAP063 Campaign B', 'active', 63);

insert into public.categories (campaign_id, id, slug, name, description, publication_status)
values
  ('00000000-0000-4000-8000-000000000063', 'category-map063-b', 'map063-b', 'MAP063 B', '', 'published'),
  ('00000000-0000-4000-8000-000000000053', 'category-map063-master', 'map063-master', 'MAP063 Master', '', 'published');

insert into public.players (
  campaign_id, id, slug, display_name, publication_status, display_order, accent_color
) values (
  '00000000-0000-4000-8000-000000000063',
  'player-map063-b', 'map063-b', 'MAP063 Player B', 'published', 0, '#1e3a8a'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
  (
    '00000000-0000-4000-8000-000000000063',
    'entity-map063-b', 'map063-b', 'location', 'pin', 'public', 'MAP063 B entity', '', '',
    630, 630, 'category-map063-b', 'published'
  ),
  (
    '00000000-0000-4000-8000-000000000053',
    'entity-map063-master', 'map063-master', 'location', 'pin', 'master', 'MAP063 Master entity', '', '',
    631, 631, 'category-map063-master', 'published'
  );

set local role anon;

select ok(
  pg_temp.statement_fails($sql$
    insert into public.public_notes (id, slug, entity_id, title, body, publication_status)
    values ('note-map063-direct', 'map063-direct', 'entity-aster-guide', 'Direct', 'Blocked', 'published')
  $sql$),
  'anon cannot insert directly into public_notes'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.public_notes set title = 'spoofed' where id = 'note-aster-arrival'
  $sql$),
  'anon cannot update a persisted note'
);
select ok(
  pg_temp.statement_fails($sql$
    delete from public.public_notes where id = 'note-aster-arrival'
  $sql$),
  'anon cannot delete a persisted note'
);

select lives_ok(
  $$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', 'Visitor note', '<script>alert(1)</script>'
  )$$,
  'anon can create a note on a public entity with a published player in the same campaign'
);
select is(
  (select author_kind::text from public.public_notes where title = 'Visitor note'),
  'player'::text,
  'public RPC derives player authorship'
);
select is(
  (select author_player_id from public.public_notes where title = 'Visitor note'),
  'player-demo-one'::text,
  'public RPC persists the stable player id'
);
select is(
  (select last_modifier_kind::text from public.public_notes where title = 'Visitor note'),
  'player'::text,
  'new player note records the player as last modifier'
);
select is(
  (select body from public.public_notes where title = 'Visitor note'),
  '<script>alert(1)</script>'::text,
  'HTML-looking content is stored as inert text without backend interpretation'
);

select ok(
  pg_temp.statement_fails($$select * from public.create_master_public_note(
    'entity-aster-guide', 'Spoofed Master', 'Blocked'
  )$$),
  'anon cannot self-attribute Master authorship through the administrative RPC'
);
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-map063-b', 'Cross campaign', 'Blocked'
  )$$),
  'campaign B player cannot author a campaign A note'
);
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-map063-b', 'player-demo-one', 'Cross campaign reverse', 'Blocked'
  )$$),
  'campaign A player cannot author a campaign B note'
);
select lives_ok(
  $$select * from public.create_public_player_note(
    'entity-map063-b', 'player-map063-b', 'Campaign B note', 'Allowed'
  )$$,
  'campaign B player can author inside campaign B'
);
select is(
  (select campaign_id::text from public.public_notes where title = 'Campaign B note'),
  '00000000-0000-4000-8000-000000000063'::text,
  'created note inherits campaign from its entity rather than client input'
);

select is(
  pg_temp.error_message($$select * from public.create_public_player_note(
    'entity-echo-wanderer', 'player-demo-one', 'Draft target', 'Blocked'
  )$$),
  'public note target unavailable'::text,
  'draft entity is rejected with the generic unavailable-target error'
);
select is(
  pg_temp.error_message($$select * from public.create_public_player_note(
    'entity-dawn-envoy', 'player-demo-one', 'Archived target', 'Blocked'
  )$$),
  'public note target unavailable'::text,
  'archived entity uses the same non-enumerating error'
);
select is(
  pg_temp.error_message($$select * from public.create_public_player_note(
    'entity-map063-master', 'player-demo-one', 'Master target', 'Blocked'
  )$$),
  'public note target unavailable'::text,
  'Master-only entity uses the same non-enumerating error'
);
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-does-not-exist', 'Unknown player', 'Blocked'
  )$$),
  'unknown player id is rejected by the backend'
);

set local role postgres;
update public.players set publication_status = 'archived' where id = 'player-demo-two';
set local role anon;
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-two', 'Inactive player', 'Blocked'
  )$$),
  'inactive player cannot be used as a declared author'
);

-- One player/entity already has one recent note. Four more are allowed, then the
-- sixth attempt inside ten minutes is rejected.
select lives_ok(
  $$select * from public.create_public_player_note('entity-aster-guide', 'player-demo-one', 'Rate 2', 'Allowed')$$,
  'rate limit allows a second recent note'
);
select lives_ok(
  $$select * from public.create_public_player_note('entity-aster-guide', 'player-demo-one', 'Rate 3', 'Allowed')$$,
  'rate limit allows a third recent note'
);
select lives_ok(
  $$select * from public.create_public_player_note('entity-aster-guide', 'player-demo-one', 'Rate 4', 'Allowed')$$,
  'rate limit allows a fourth recent note'
);
select lives_ok(
  $$select * from public.create_public_player_note('entity-aster-guide', 'player-demo-one', 'Rate 5', 'Allowed')$$,
  'rate limit allows a fifth recent note'
);
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', 'Rate 6', 'Blocked'
  )$$),
  'backend rate limiting rejects trivial repeated spam'
);

-- A non-admin authenticated session still cannot use administrative note RPCs.
set local role postgres;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails($$select * from public.create_master_public_note(
    'entity-aster-guide', 'Unauthorized', 'Blocked'
  )$$),
  'authenticated non-admin cannot create Master notes'
);

-- Authorized Master operations are RPC-only and preserve original authorship.
set local role postgres;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$select * from public.create_master_public_note(
    'entity-aster-guide', 'Master note', 'Created by authorized Master'
  )$$,
  'authorized Master can create a public note'
);
select is(
  (select author_kind::text from public.public_notes where title = 'Master note'),
  'master'::text,
  'Master creation derives Master authorship on the backend'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.public_notes set author_kind = 'master', author_player_id = null
    where title = 'Visitor note'
  $sql$),
  'even an authorized Master cannot bypass RPC invariants with direct UPDATE'
);
select lives_ok(
  $$select * from public.update_master_public_note(
    'entity-aster-guide',
    (select id from public.public_notes where title = 'Visitor note'),
    'Visitor note edited', 'Edited safely by Master'
  )$$,
  'authorized Master can edit a player note through the narrow RPC'
);
select ok(
  (select author_kind = 'player'::public.public_note_author_kind
      and author_player_id = 'player-demo-one'
      and last_modifier_kind = 'master'::public.public_note_author_kind
      and last_modifier_player_id is null
    from public.public_notes where title = 'Visitor note edited'),
  'Master edit preserves original player author and records Master as last modifier'
);
select lives_ok(
  $$select public.archive_master_public_note(
    'entity-aster-guide',
    (select id from public.public_notes where title = 'Visitor note edited')
  )$$,
  'authorized Master can retire a persisted note without deleting it'
);
select ok(
  (select publication_status = 'archived'::public.publication_status
      and author_kind = 'player'::public.public_note_author_kind
      and last_modifier_kind = 'master'::public.public_note_author_kind
    from public.public_notes where title = 'Visitor note edited'),
  'retired note remains stored with original authorship and Master last-modifier metadata'
);

select * from finish();
rollback;
