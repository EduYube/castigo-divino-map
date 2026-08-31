import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const ENTITY_ID = 'entity-map060-lock-order-regression';
const ADMIN_SUB = '00000000-0000-4000-8000-000000000001';
const TIMEOUT_MS = 12_000;

function fail(message) {
  throw new Error(`MAP-060 v5/v6 lock-order regression failed: ${message}`);
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
set statement_timeout = '10s';`;
}

function stopSession(session) {
  if (session && !session.exited) session.child.kill();
}

async function main() {
  assertDatabaseContainer();
  let barrier;
  let v5;
  let v6;

  runPsql(`
    delete from public.entity_player_associations where entity_id = ${sqlLiteral(ENTITY_ID)};
    delete from public.entity_tags where entity_id = ${sqlLiteral(ENTITY_ID)};
    delete from public.entity_player_dispositions where entity_id = ${sqlLiteral(ENTITY_ID)};
    delete from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};

    insert into public.map_entities (
      campaign_id, id, slug, entity_type, visibility, audience, name_language,
      name, summary, description, x, y, category_id, publication_status
    )
    select campaign_id, ${sqlLiteral(ENTITY_ID)}, 'map060-lock-order-regression',
      'location', 'pin', 'public', 'en', 'MAP060 lock order regression', '', '',
      640, 640, category_id, 'draft'
    from public.map_entities
    where id = 'entity-aster-guide';
  `);

  const campaignId = runPsql(
    `select campaign_id::text from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const categoryId = runPsql(
    `select category_id from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const updatedAt = runPsql(
    `select updated_at::text from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const v5Revision = runPsql(`${adminPreamble()}
    select public.admin_get_map_entity_editor_v5(${sqlLiteral(campaignId)}::uuid, ${sqlLiteral(ENTITY_ID)}) ->> 'relations_revision';`);
  const v6Revision = runPsql(`${adminPreamble()}
    select public.admin_get_map_entity_editor_v6(${sqlLiteral(campaignId)}::uuid, ${sqlLiteral(ENTITY_ID)}) ->> 'relations_revision';`);

  if (!campaignId || !categoryId || !updatedAt || !v5Revision || !v6Revision) {
    fail('unable to resolve fixture state');
  }

  const common = `${sqlLiteral(campaignId)}::uuid, ${sqlLiteral(ENTITY_ID)}, ${sqlLiteral(updatedAt)}::timestamptz`;
  const v5Call = `select public.admin_save_map_entity_v5(
    /* map060-v5-first-lock-order */
    ${common}, ${sqlLiteral(v5Revision)}, 'map060-lock-order-regression', 'location',
    'pin', 'public', null, 'MAP060 lock order regression', 'legacy v5 writer', '',
    640, 640, ${sqlLiteral(categoryId)}, 'draft', '{}'::text[], '[]'::jsonb, '{}'::text[]
  );`;
  const v6Call = `select public.admin_save_map_entity_v6(
    /* map060-v6-second-lock-order */
    ${common}, ${sqlLiteral(v6Revision)}, 'map060-lock-order-regression', 'location',
    'pin', 'public', null, 'MAP060 lock order regression', 'geometry v6 writer', '',
    '{"kind":"polygon","vertices":[{"x":620,"y":620},{"x":660,"y":620},{"x":660,"y":660},{"x":620,"y":660}]}'::jsonb,
    ${sqlLiteral(categoryId)}, 'draft', '{}'::text[], '[]'::jsonb, '{}'::text[]
  );`;

  try {
    barrier = startSession();
    barrier.child.stdin.write(`begin;
lock table public.entity_player_associations in access exclusive mode;
\\echo MAP060_RELATION_BARRIER_READY
`);
    await waitForMarker(barrier, 'MAP060_RELATION_BARRIER_READY');

    v5 = startSession();
    v5.child.stdin.write(`${adminPreamble()}
begin;
\\echo MAP060_V5_STARTED
${v5Call}
\\echo MAP060_V5_COMPLETED
`);
    await waitForMarker(v5, 'MAP060_V5_STARTED');

    -- v5 must already own the per-entity advisory lock before it reaches the
    -- relation read blocked by the barrier. This is the exact ordering that was
    -- missing in the vulnerable implementation.
    await waitForLock('/* map060-v5-first-lock-order */', 'advisory', true);
    console.log('ok - v5 owns the advisory entity lock before its blocked relation read');

    v6 = startSession();
    v6.child.stdin.write(`${adminPreamble()}
begin;
\\echo MAP060_V6_STARTED
${v6Call}
\\echo MAP060_V6_COMPLETED
`);
    await waitForMarker(v6, 'MAP060_V6_STARTED');
    await waitForLock('/* map060-v6-second-lock-order */', 'advisory', false);
    console.log('ok - v6 waits on the same advisory lock instead of taking the entity row first');

    barrier.child.stdin.end('rollback;\n\\q\n');
    const barrierExit = await waitForExit(barrier, 'relation barrier rollback');
    if (barrierExit.code !== 0) fail(`barrier failed: ${barrier.output}`);

    await waitForMarker(v5, 'MAP060_V5_COMPLETED');
    v5.child.stdin.end('commit;\n\\q\n');
    const v5Exit = await waitForExit(v5, 'v5 commit');
    if (v5Exit.code !== 0) fail(`v5 writer failed: ${v5.output}`);
    console.log('ok - v5 commits after the relation barrier is released');

    v6.child.stdin.end('\\q\n');
    const v6Exit = await waitForExit(v6, 'v6 stale rejection');
    if (v6Exit.code === 0) fail('v6 unexpectedly committed with the stale pre-v5 updated_at');
    if (/deadlock detected/iu.test(v6.output) || /deadlock detected/iu.test(v5.output)) {
      fail(`deadlock detected despite advisory ordering: ${v5.output}\n${v6.output}`);
    }
    if (!/changed while it was being edited|changed while geometry was being saved/iu.test(v6.output)) {
      fail(`v6 failed for an unexpected reason: ${v6.output || 'no output'}`);
    }
    console.log('ok - queued v6 resumes without deadlock and rejects its stale write');
  } finally {
    stopSession(barrier);
    stopSession(v5);
    stopSession(v6);
    runPsql(`
      reset role;
      delete from public.entity_player_associations where entity_id = ${sqlLiteral(ENTITY_ID)};
      delete from public.entity_tags where entity_id = ${sqlLiteral(ENTITY_ID)};
      delete from public.entity_player_dispositions where entity_id = ${sqlLiteral(ENTITY_ID)};
      delete from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};
    `);
  }
}

await main();