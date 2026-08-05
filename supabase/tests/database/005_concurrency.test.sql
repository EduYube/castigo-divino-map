begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;

select plan(6);

do $setup$
begin
  perform extensions.dblink_connect(
    'category_publisher',
    'dbname=' || current_database()
  );
  perform extensions.dblink_connect(
    'category_withdrawer',
    'dbname=' || current_database()
  );

  perform extensions.dblink_exec('category_publisher', 'begin');
  perform extensions.dblink_exec(
    'category_publisher',
    $sql$
      update public.map_entities
      set summary = summary
      where id = 'entity-aster-guide'
    $sql$
  );

  perform extensions.dblink_send_query(
    'category_withdrawer',
    $sql$
      update public.categories
      set publication_status = 'draft'
      where id = 'category-people'
    $sql$
  );
end;
$setup$;

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('category_withdrawer'),
  1,
  'category withdrawal waits for the publishing transaction shared lock'
);

do $release$
begin
  perform extensions.dblink_exec('category_publisher', 'rollback');
  perform *
  from extensions.dblink_get_result('category_withdrawer', false)
    as result(status text);
end;
$release$;

select like(
  extensions.dblink_error_message('category_withdrawer'),
  '%a category used by published entities cannot be withdrawn%',
  'category withdrawal rechecks the invariant after the lock is released'
);

select is(
  (
    select publication_status
    from public.categories
    where id = 'category-people'
  ),
  'published'::public.publication_status,
  'concurrent category withdrawal leaves the published parent unchanged'
);

do $tag_setup$
begin
  perform extensions.dblink_connect(
    'tag_publisher',
    'dbname=' || current_database()
  );
  perform extensions.dblink_connect(
    'tag_withdrawer',
    'dbname=' || current_database()
  );

  perform extensions.dblink_exec('tag_publisher', 'begin');
  perform extensions.dblink_exec(
    'tag_publisher',
    $sql$
      update public.entity_tags
      set tag_id = tag_id
      where id = 'entity-tag-aster-notable'
    $sql$
  );

  perform extensions.dblink_send_query(
    'tag_withdrawer',
    $sql$
      update public.tags
      set publication_status = 'draft'
      where id = 'notable'
    $sql$
  );
end;
$tag_setup$;

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('tag_withdrawer'),
  1,
  'tag withdrawal waits for the published relation shared lock'
);

do $tag_release$
begin
  perform extensions.dblink_exec('tag_publisher', 'rollback');
  perform *
  from extensions.dblink_get_result('tag_withdrawer', false)
    as result(status text);
end;
$tag_release$;

select like(
  extensions.dblink_error_message('tag_withdrawer'),
  '%a tag used by published relations cannot be withdrawn%',
  'tag withdrawal rechecks the invariant after the lock is released'
);

select is(
  (
    select publication_status
    from public.tags
    where id = 'notable'
  ),
  'published'::public.publication_status,
  'concurrent tag withdrawal leaves the published parent unchanged'
);

do $cleanup$
begin
  perform extensions.dblink_disconnect('category_publisher');
  perform extensions.dblink_disconnect('category_withdrawer');
  perform extensions.dblink_disconnect('tag_publisher');
  perform extensions.dblink_disconnect('tag_withdrawer');
end;
$cleanup$;

select * from finish();
rollback;
