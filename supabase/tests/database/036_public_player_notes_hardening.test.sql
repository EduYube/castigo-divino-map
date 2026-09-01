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

select plan(11);

set local role anon;

select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', repeat('x', 161), 'Body'
  )$$),
  'backend rejects an overlong public note title'
);
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', 'Title', repeat('x', 5001)
  )$$),
  'backend rejects an overlong public note body'
);
select ok(
  pg_temp.statement_fails($$select public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', 'Title', 'Body', 'master'
  )$$),
  'public RPC exposes no extra mass-assignment parameter for Master authorship'
);
select ok(
  pg_temp.statement_fails($$select * from public.update_master_public_note(
    'entity-aster-guide', 'note-aster-arrival', 'Changed', 'Blocked'
  )$$),
  'anon cannot execute the Master update RPC'
);
select ok(
  pg_temp.statement_fails($$select public.archive_master_public_note(
    'entity-aster-guide', 'note-aster-arrival'
  )$$),
  'anon cannot execute the Master archive RPC'
);

select lives_ok(
  $$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', 'Published immediately', 'No moderation queue'
  )$$,
  'valid visitor note persists without approval'
);
select ok(
  (select publication_status = 'published'::public.publication_status
      and published_at is not null
      and archived_at is null
    from public.public_notes where title = 'Published immediately'),
  'visitor note is immediately published rather than queued for moderation'
);
select ok(
  (select publication_status = 'published'::public.publication_status
      and audience = 'public'::public.entity_audience
    from public.map_entities where id = 'entity-aster-guide'),
  'public note RPC cannot mutate the entity publication or audience fields'
);

set local role postgres;

select ok(
  pg_temp.statement_fails($sql$
    insert into public.public_notes (
      id, slug, entity_id, title, body, publication_status,
      author_kind, author_player_id, last_modifier_kind, last_modifier_player_id
    ) values (
      'note-map063-bad-master', 'map063-bad-master', 'entity-aster-guide',
      'Invalid', 'Invalid', 'published', 'master', 'player-demo-one', 'master', null
    )
  $sql$),
  'database constraint rejects Master authorship carrying a player id'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.public_notes (
      id, slug, entity_id, title, body, publication_status,
      author_kind, author_player_id, last_modifier_kind, last_modifier_player_id
    ) values (
      'note-map063-bad-player', 'map063-bad-player', 'entity-aster-guide',
      'Invalid', 'Invalid', 'published', 'player', null, 'player', null
    )
  $sql$),
  'database constraint rejects player authorship without a stable player id'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails($$select * from public.create_public_player_note(
    'entity-aster-guide', 'player-demo-one', 'Admin spoof', 'Blocked'
  )$$),
  'authorized Master session cannot use the visitor RPC to forge player authorship'
);

select * from finish();
rollback;
