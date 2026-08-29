begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;

create function pg_temp.wait_for_lock(target_pid integer, timeout_ms integer)
returns boolean
language plpgsql
as $$
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => timeout_ms / 1000.0);
begin
  loop
    if exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.pid = target_pid
        and activity.wait_event_type = 'Lock'
    ) then
      return true;
    end if;

    if pg_catalog.clock_timestamp() >= deadline then
      return false;
    end if;

    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

create function pg_temp.consume_json_result(connection_name text)
returns bigint
language plpgsql
as $$
declare
  result_count bigint;
begin
  select pg_catalog.count(*)
  into result_count
  from extensions.dblink_get_result(connection_name, false) as response(payload jsonb);

  return result_count;
end;
$$;

select plan(5);

-- Three physical sessions are used: two real writers and one deterministic barrier.
-- The barrier pauses v5 only after it has reached the association read that follows
-- its entity row lock. With the pre-fix lock order, v4 could then hold the advisory
-- lock while waiting for that row, creating a true deadlock when the barrier was
-- released. With the fixed order, v5 already owns the advisory lock and v4 queues
-- behind it instead.
do $$
begin
  perform extensions.dblink_connect('map058_v5', 'dbname=' || current_database());
  perform extensions.dblink_connect('map058_v4', 'dbname=' || current_database());
  perform extensions.dblink_connect('map058_barrier', 'dbname=' || current_database());

  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.entity_player_associations
    where entity_id = 'entity-map058-v4-v5-concurrency';
  $remote$);
  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.entity_tags
    where entity_id = 'entity-map058-v4-v5-concurrency';
  $remote$);
  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.entity_player_dispositions
    where entity_id = 'entity-map058-v4-v5-concurrency';
  $remote$);
  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.map_entities
    where id = 'entity-map058-v4-v5-concurrency';
  $remote$);

  perform extensions.dblink_exec('map058_barrier', $remote$
    insert into public.map_entities (
      campaign_id,
      id,
      slug,
      entity_type,
      visibility,
      audience,
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
      source.campaign_id,
      'entity-map058-v4-v5-concurrency',
      'map058-v4-v5-concurrency',
      'character',
      'pin',
      'public',
      'en',
      'MAP058 v4/v5 concurrency fixture',
      '',
      '',
      520,
      520,
      source.category_id,
      'draft'
    from public.map_entities as source
    where source.id = 'entity-aster-guide';
  $remote$);
end;
$$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select set_config(
  'map058.lock_updated_at',
  (select updated_at::text from public.map_entities where id = 'entity-map058-v4-v5-concurrency'),
  true
);
select set_config(
  'map058.lock_v4_revision',
  public.admin_get_map_entity_editor_v4(
    (select campaign_id from public.map_entities where id = 'entity-map058-v4-v5-concurrency'),
    'entity-map058-v4-v5-concurrency'
  ) ->> 'relations_revision',
  true
);
select set_config(
  'map058.lock_v5_revision',
  public.admin_get_map_entity_editor_v5(
    (select campaign_id from public.map_entities where id = 'entity-map058-v4-v5-concurrency'),
    'entity-map058-v4-v5-concurrency'
  ) ->> 'relations_revision',
  true
);

reset role;

do $$
declare
  connection_name text;
begin
  foreach connection_name in array array['map058_v5', 'map058_v4'] loop
    perform extensions.dblink_exec(
      connection_name,
      'set "request.jwt.claim.sub" = ''00000000-0000-4000-8000-000000000001'''
    );
    perform extensions.dblink_exec(
      connection_name,
      'set "request.jwt.claims" = ''{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}'''
    );
    perform extensions.dblink_exec(connection_name, 'set role authenticated');
    perform extensions.dblink_exec(connection_name, 'set statement_timeout = ''10s''');
  end loop;
end;
$$;

select set_config(
  'map058.v5_pid',
  remote.pid::text,
  true
)
from extensions.dblink('map058_v5', 'select pg_backend_pid()') as remote(pid integer);
select set_config(
  'map058.v4_pid',
  remote.pid::text,
  true
)
from extensions.dblink('map058_v4', 'select pg_backend_pid()') as remote(pid integer);

do $$
begin
  perform extensions.dblink_exec('map058_barrier', 'begin');
  perform extensions.dblink_exec(
    'map058_barrier',
    'lock table public.entity_player_associations in access exclusive mode'
  );

  perform extensions.dblink_exec('map058_v5', 'begin');
  perform extensions.dblink_send_query(
    'map058_v5',
    pg_catalog.format($remote$
      select public.admin_save_map_entity_v5(
        entity.campaign_id,
        entity.id,
        %L::timestamptz,
        %L,
        entity.slug,
        entity.entity_type,
        entity.visibility,
        entity.audience,
        entity.portrait_path,
        entity.name,
        'MAP058 v5 serialized writer',
        entity.description,
        entity.x,
        entity.y,
        entity.category_id,
        entity.publication_status,
        '{}'::text[],
        '[]'::jsonb,
        '{}'::text[]
      )
      from public.map_entities as entity
      where entity.id = 'entity-map058-v4-v5-concurrency'
    $remote$,
      current_setting('map058.lock_updated_at'),
      current_setting('map058.lock_v5_revision')
    )
  );
end;
$$;

select ok(
  pg_temp.wait_for_lock(current_setting('map058.v5_pid')::integer, 5000),
  'v5 reaches the deterministic association-table barrier after taking its entity locks'
);

do $$
begin
  perform extensions.dblink_exec('map058_v4', 'begin');
  perform extensions.dblink_send_query(
    'map058_v4',
    pg_catalog.format($remote$
      select public.admin_save_map_entity_v4(
        entity.campaign_id,
        entity.id,
        %L::timestamptz,
        %L,
        entity.slug,
        entity.entity_type,
        entity.visibility,
        entity.audience,
        entity.portrait_path,
        entity.name,
        'MAP058 v4 stale writer',
        entity.description,
        entity.x,
        entity.y,
        entity.category_id,
        entity.publication_status,
        '{}'::text[],
        '[]'::jsonb
      )
      from public.map_entities as entity
      where entity.id = 'entity-map058-v4-v5-concurrency'
    $remote$,
      current_setting('map058.lock_updated_at'),
      current_setting('map058.lock_v4_revision')
    )
  );
end;
$$;

select ok(
  pg_temp.wait_for_lock(current_setting('map058.v4_pid')::integer, 5000),
  'concurrent v4 waits behind the lock order established by v5'
);

do $$
begin
  perform extensions.dblink_exec('map058_barrier', 'rollback');
end;
$$;

select is(
  pg_temp.consume_json_result('map058_v5'),
  1::bigint,
  'v5 completes successfully after the barrier is released'
);

do $$
begin
  perform extensions.dblink_exec('map058_v5', 'commit');
end;
$$;

select is(
  pg_temp.consume_json_result('map058_v4'),
  0::bigint,
  'the queued v4 writer is rejected instead of deadlocking after v5 commits'
);
select like(
  extensions.dblink_error_message('map058_v4'),
  '%the entity changed while it was being edited%',
  'v4 fails with the expected stale-write error, not a deadlock'
);

do $$
begin
  perform extensions.dblink_exec('map058_v4', 'rollback');

  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.entity_player_associations
    where entity_id = 'entity-map058-v4-v5-concurrency';
  $remote$);
  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.entity_tags
    where entity_id = 'entity-map058-v4-v5-concurrency';
  $remote$);
  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.entity_player_dispositions
    where entity_id = 'entity-map058-v4-v5-concurrency';
  $remote$);
  perform extensions.dblink_exec('map058_barrier', $remote$
    delete from public.map_entities
    where id = 'entity-map058-v4-v5-concurrency';
  $remote$);

  perform extensions.dblink_disconnect('map058_v5');
  perform extensions.dblink_disconnect('map058_v4');
  perform extensions.dblink_disconnect('map058_barrier');
end;
$$;

select * from finish();
rollback;