import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const ENTITY_A = 'entity-map069-lock-a';
const ENTITY_B = 'entity-map069-lock-b';
const CATEGORY_ID = 'category-map069-lock';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const ADMIN_SUB = '00000000-0000-4000-8000-000000000001';
const TIMEOUT_MS = 20_000;

function fail(message) {
  throw new Error(`MAP-069 shared-relation concurrency failed: ${message}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psqlArguments(interactive = false) {
  return [
    'exec',
    ...(interactive ? ['--interactive'] : []),
    '--user',
    'postgres',
    DATABASE_CONTAINER,
    'psql',
    '--username',
    'postgres',
    '--dbname',
    'postgres',
    '--no-psqlrc',
    '--set=ON_ERROR_STOP=1',
    '--quiet',
    '--tuples-only',
    '--no-align',
  ];
}

function assertDatabaseContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) fail(`docker could not be executed: ${result.error.message}`);
  if (result.status !== 0) fail(result.stderr.trim() || `docker ps exited ${result.status}`);
  if (!result.stdout.split(/\r?\n/u).includes(DATABASE_CONTAINER)) {
    fail(`expected running database container ${DATABASE_CONTAINER}`);
  }
}

function runPsql(sql) {
  const result = spawnSync('docker', [...psqlArguments(false), '--command', sql], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) fail(`psql could not be executed: ${result.error.message}`);
  if (result.status !== 0) fail(result.stderr.trim() || `psql exited ${result.status}`);
  return result.stdout.trim();
}

function startSession() {
  const child = spawn('docker', psqlArguments(true), {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let exited = false;
  let spawnError;
  let finishExit;
  const exit = new Promise((resolve) => {
    finishExit = resolve;
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.once('error', (error) => {
    spawnError = error;
  });
  child.once('close', (code, signal) => {
    exited = true;
    finishExit({ code, signal });
  });
  return {
    child,
    exit,
    get output() {
      return `${stdout}\n${stderr}`.trim();
    },
    get exited() {
      return exited;
    },
    get spawnError() {
      return spawnError;
    },
  };
}

async function waitForMarker(session, marker) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (session.output.includes(marker)) return;
    if (session.spawnError) fail(`session spawn failed: ${session.spawnError.message}`);
    if (session.exited) fail(`session exited before ${marker}: ${session.output || 'no output'}`);
    await delay(20);
  }
  fail(`timed out waiting for ${marker}`);
}

async function waitForExit(session, label) {
  return Promise.race([
    session.exit,
    delay(TIMEOUT_MS).then(() => fail(`timed out waiting for ${label}`)),
  ]);
}

async function waitForLock(marker, locktype, granted) {
  const escaped = marker.replaceAll("'", "''");
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = runPsql(`
      select count(*)
      from pg_catalog.pg_locks as lock
      join pg_catalog.pg_stat_activity as activity on activity.pid = lock.pid
      where activity.query like '%${escaped}%'
        and lock.locktype = ${sqlLiteral(locktype)}
        and lock.granted is ${granted ? 'true' : 'false'};
    `);
    if (Number(count) > 0) return;
    await delay(25);
  }
  fail(`timed out waiting for ${granted ? 'granted' : 'waiting'} ${locktype} lock for ${marker}`);
}

function adminPreamble() {
  const claims = JSON.stringify({ sub: ADMIN_SUB, role: 'authenticated' });
  return `set "request.jwt.claim.sub" = ${sqlLiteral(ADMIN_SUB)};
set "request.jwt.claims" = ${sqlLiteral(claims)};
set role authenticated;
set statement_timeout = '15s';`;
}

function stopSession(session) {
  if (session && !session.exited) session.child.kill();
}

function cleanFixtures() {
  runPsql(`delete from public.entity_relations
    where left_entity_id in (${sqlLiteral(ENTITY_A)}, ${sqlLiteral(ENTITY_B)})
    or right_entity_id in (${sqlLiteral(ENTITY_A)}, ${sqlLiteral(ENTITY_B)});
  delete from public.map_entities where id in (${sqlLiteral(ENTITY_A)}, ${sqlLiteral(ENTITY_B)});
  delete from public.categories where id = ${sqlLiteral(CATEGORY_ID)};`);
}

function readEditor(id) {
  return JSON.parse(
    runPsql(`${adminPreamble()}
    select pg_catalog.jsonb_build_object(
      'updated', entity.updated_at::text,
      'relations', editor.payload ->> 'relations_revision',
      'generic', editor.payload ->> 'entity_relations_revision'
    )::text
    from public.map_entities entity
    cross join lateral (
      select public.admin_get_map_entity_editor_v8(
        ${sqlLiteral(CAMPAIGN_ID)}::uuid, ${sqlLiteral(id)}
      ) as payload
    ) editor
    where entity.id = ${sqlLiteral(id)};`),
  );
}

function writeEditor(id, original, ownLabel, otherLabel, summary) {
  const targetEntityId = id === ENTITY_A ? ENTITY_B : ENTITY_A;
  const name = id === ENTITY_A ? 'MAP069 Lock A' : 'MAP069 Lock B';
  const relations = JSON.stringify([{ targetEntityId, ownLabel, targetLabel: otherLabel }]);
  return `select public.admin_save_map_entity_v8(
    ${sqlLiteral(CAMPAIGN_ID)}::uuid,
    ${sqlLiteral(id)},
    ${sqlLiteral(original.updated)}::timestamptz,
    ${sqlLiteral(original.relations)},
    ${sqlLiteral(original.generic)},
    ${sqlLiteral(id)},
    'organization'::public.entity_type,
    'search_only'::public.map_visibility,
    'public'::public.entity_audience,
    null::text,
    ${sqlLiteral(name)},
    ${sqlLiteral(summary)},
    '',
    null::jsonb,
    ${sqlLiteral(CATEGORY_ID)},
    'draft'::public.publication_status,
    '{}'::text[],
    '[]'::jsonb,
    '{}'::text[],
    null::public.entity_lifecycle_status,
    ${sqlLiteral(relations)}::jsonb
  );`;
}

async function main() {
  assertDatabaseContainer();
  cleanFixtures();
  let first;
  let second;
  try {
    runPsql(`insert into public.categories
      (campaign_id, id, slug, name, description, publication_status)
      values (${sqlLiteral(CAMPAIGN_ID)}, ${sqlLiteral(CATEGORY_ID)},
              'map069-lock', 'MAP069 Lock', '', 'draft');
    insert into public.map_entities
      (campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
       summary, description, x, y, category_id, publication_status)
    values
      (${sqlLiteral(CAMPAIGN_ID)}, ${sqlLiteral(ENTITY_A)}, ${sqlLiteral(ENTITY_A)},
       'organization', 'search_only', 'public', 'MAP069 Lock A', 'en',
       'initial a', '', null, null, ${sqlLiteral(CATEGORY_ID)}, 'draft'),
      (${sqlLiteral(CAMPAIGN_ID)}, ${sqlLiteral(ENTITY_B)}, ${sqlLiteral(ENTITY_B)},
       'organization', 'search_only', 'public', 'MAP069 Lock B', 'en',
       'initial b', '', null, null, ${sqlLiteral(CATEGORY_ID)}, 'draft');
    insert into public.entity_relations
      (campaign_id, left_entity_id, right_entity_id, left_label, right_label)
    values (${sqlLiteral(CAMPAIGN_ID)}, ${sqlLiteral(ENTITY_A)}, ${sqlLiteral(ENTITY_B)},
            'Original A', 'Original B');`);

    const aEditor = readEditor(ENTITY_A);
    const bEditor = readEditor(ENTITY_B);
    if (!aEditor.generic || !bEditor.generic) fail('initial relation revisions are missing');

    first = startSession();
    first.child.stdin.write(`begin;
${adminPreamble()}
${writeEditor(ENTITY_A, aEditor, 'Updated A', 'Updated B', 'committed from A')}
\\echo MAP069_A_SAVED
`);
    await waitForMarker(first, 'MAP069_A_SAVED');
    console.log('ok - editor A has saved A↔B while its transaction remains open');

    second = startSession();
    second.child.stdin.write(`${adminPreamble()}
/* map069-concurrent-b */
${writeEditor(ENTITY_B, bEditor, 'Stale B', 'Stale A', 'stale from B')}
`);
    await waitForLock('/* map069-concurrent-b */', 'advisory', false);
    console.log('ok - editor B waits on the shared campaign advisory lock');

    first.child.stdin.end('commit;\n\\q\n');
    const aExit = await waitForExit(first, 'editor A commit');
    if (aExit.code !== 0) fail(`editor A failed to commit: ${first.output}`);

    const bExit = await waitForExit(second, 'editor B stale revision');
    if (
      bExit.code === 0 ||
      !/entity relations changed while the editor was open/iu.test(second.output)
    ) {
      fail(`editor B was not rejected for stale relations: ${second.output}`);
    }
    if (/deadlock detected/iu.test(first.output) || /deadlock detected/iu.test(second.output)) {
      fail(`unexpected deadlock: ${first.output}\\n${second.output}`);
    }
    console.log('ok - editor B rejects the stale revision after A commits, without deadlock');

    const state = JSON.parse(
      runPsql(`select pg_catalog.jsonb_build_object(
      'count', count(*), 'left', max(left_label), 'right', max(right_label)
    )::text from public.entity_relations
    where left_entity_id = ${sqlLiteral(ENTITY_A)}
      and right_entity_id = ${sqlLiteral(ENTITY_B)};`),
    );
    const summaries = runPsql(`select summary from public.map_entities
      where id in (${sqlLiteral(ENTITY_A)}, ${sqlLiteral(ENTITY_B)}) order by id;`).split('\n');
    if (
      state.count !== 1 ||
      state.left !== 'Updated A' ||
      state.right !== 'Updated B' ||
      summaries[0] !== 'committed from A' ||
      summaries[1] !== 'initial b'
    ) {
      fail(`serialized final state did not match: ${JSON.stringify({ state, summaries })}`);
    }
    console.log(
      'MAP-069 relation concurrency passed: stale writes rejected, no deadlock or lost update.',
    );
  } finally {
    stopSession(first);
    stopSession(second);
    await Promise.allSettled([first, second].filter(Boolean).map((session) => session.exit));
    cleanFixtures();
  }
}

await main();
