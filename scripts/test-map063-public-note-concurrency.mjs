import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const ENTITY_ID = 'place-demo-harbor';
const PLAYER_ID = 'player-skade';
const ADMIN_SUB = '00000000-0000-4000-8000-000000000001';
const TITLE_PREFIX = 'MAP063 concurrency';
const TIMEOUT_MS = 12_000;

function fail(message) {
  throw new Error(`MAP-063 public-note concurrency regression failed: ${message}`);
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

async function waitForBlockedQuery(marker, session, label) {
  const escaped = marker.replaceAll("'", "''");
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (session.spawnError) fail(`${label} spawn failed: ${session.spawnError.message}`);
    if (session.exited) fail(`${label} exited before blocking: ${session.output || 'no output'}`);
    const count = runPsql(`
      select count(*)
      from pg_catalog.pg_stat_activity as activity
      where activity.query like '%${escaped}%'
        and activity.wait_event_type = 'Lock';
    `);
    if (Number(count) > 0) return;
    await delay(25);
  }
  fail(`timed out waiting for ${label} to block on a lock`);
}

function assertNoLockFailure(output, label) {
  if (
    /deadlock detected|statement timeout|canceling statement due to statement timeout/iu.test(
      output,
    )
  ) {
    fail(`${label} hit a lock timeout/deadlock: ${output}`);
  }
}

function adminPreamble() {
  const claims = JSON.stringify({ sub: ADMIN_SUB, role: 'authenticated' });
  return `set "request.jwt.claim.sub" = ${sqlLiteral(ADMIN_SUB)};
set "request.jwt.claims" = ${sqlLiteral(claims)};
set role authenticated;
set statement_timeout = '8s';`;
}

function anonPreamble() {
  return `set role anon;
set statement_timeout = '8s';`;
}

function stopSession(session) {
  if (session && !session.exited) session.child.kill();
}

function restoreFixtureState() {
  runPsql(`
    update public.campaigns
    set status = 'active'
    where id = ${sqlLiteral(CAMPAIGN_ID)}::uuid
      and status <> 'active';

    update public.players
    set publication_status = 'draft'::public.publication_status
    where id = ${sqlLiteral(PLAYER_ID)}
      and publication_status = 'archived'::public.publication_status;

    update public.players
    set publication_status = 'published'::public.publication_status
    where id = ${sqlLiteral(PLAYER_ID)}
      and publication_status <> 'published'::public.publication_status;

    update public.public_notes
    set publication_status = 'archived'::public.publication_status
    where title like ${sqlLiteral(`${TITLE_PREFIX} %`)}
      and publication_status = 'published'::public.publication_status;

    update public.public_notes
    set created_at = pg_catalog.now() - interval '1 day'
    where title like ${sqlLiteral(`${TITLE_PREFIX} %`)};
  `);
}

function assertFixtureReady() {
  const state = runPsql(`
    select concat_ws(
      ':',
      (select status::text from public.campaigns where id = ${sqlLiteral(CAMPAIGN_ID)}::uuid),
      (select publication_status::text from public.players where id = ${sqlLiteral(PLAYER_ID)}),
      (select publication_status::text || ':' || audience::text from public.map_entities where id = ${sqlLiteral(ENTITY_ID)})
    );
  `);
  if (state !== 'active:published:published:public') {
    fail(`fixture is not public/active: ${state || 'missing state'}`);
  }
}

async function assertRevocationWins(kind) {
  restoreFixtureState();
  assertFixtureReady();

  const upper = kind.toUpperCase();
  const title = `${TITLE_PREFIX} ${kind} revocation wins`;
  const adminMarker = `map063-${kind}-revocation-admin`;
  const rpcMarker = `map063-${kind}-revocation-rpc`;
  const expectedError =
    kind === 'player' ? 'invalid public note author' : 'public note target unavailable';

  let admin;
  let rpc;
  try {
    admin = startSession();
    const update =
      kind === 'player'
        ? `update public.players /* ${adminMarker} */
set publication_status = 'archived'::public.publication_status
where id = ${sqlLiteral(PLAYER_ID)};`
        : `update public.campaigns /* ${adminMarker} */
set status = 'archived'
where id = ${sqlLiteral(CAMPAIGN_ID)}::uuid;`;

    admin.child.stdin.write(`${adminPreamble()}
begin;
${update}
\\echo MAP063_${upper}_REVOCATION_READY
`);
    await waitForMarker(admin, `MAP063_${upper}_REVOCATION_READY`);

    rpc = startSession();
    rpc.child.stdin.write(`${anonPreamble()}
\\echo MAP063_${upper}_RPC_STARTED
select id
from public.create_public_player_note(
  /* ${rpcMarker} */
  ${sqlLiteral(ENTITY_ID)},
  ${sqlLiteral(PLAYER_ID)},
  ${sqlLiteral(title)},
  'Concurrent revocation must win before persistence.'
);
\\echo MAP063_${upper}_RPC_UNEXPECTED_SUCCESS
`);
    await waitForMarker(rpc, `MAP063_${upper}_RPC_STARTED`);
    await waitForBlockedQuery(rpcMarker, rpc, `${kind} revocation RPC`);

    admin.child.stdin.write(`commit;
\\echo MAP063_${upper}_REVOCATION_COMMITTED
\\q
`);
    const adminExit = await waitForExit(admin, `${kind} revocation admin`);
    if (adminExit.code !== 0) fail(`${kind} revocation admin failed: ${admin.output}`);
    assertNoLockFailure(admin.output, `${kind} revocation admin`);

    const rpcExit = await waitForExit(rpc, `${kind} revocation RPC rejection`);
    if (rpcExit.code === 0 || rpc.output.includes(`MAP063_${upper}_RPC_UNEXPECTED_SUCCESS`)) {
      fail(`${kind} revocation did not reject the stale RPC: ${rpc.output}`);
    }
    assertNoLockFailure(rpc.output, `${kind} revocation RPC`);
    if (!rpc.output.includes(expectedError)) {
      fail(`${kind} revocation returned the wrong error: ${rpc.output}`);
    }

    const count = Number(
      runPsql(`select count(*) from public.public_notes where title = ${sqlLiteral(title)};`),
    );
    if (count !== 0) fail(`${kind} revocation persisted ${count} stale public note(s)`);
  } finally {
    stopSession(rpc);
    stopSession(admin);
    await delay(100);
    restoreFixtureState();
  }
}

async function assertCreationWins(kind) {
  restoreFixtureState();
  assertFixtureReady();

  const upper = kind.toUpperCase();
  const title = `${TITLE_PREFIX} ${kind} creation wins`;
  const rpcMarker = `map063-${kind}-creation-rpc`;
  const adminMarker = `map063-${kind}-creation-admin`;

  let barrier;
  let rpc;
  let admin;
  try {
    barrier = startSession();
    barrier.child.stdin.write(`set statement_timeout = '8s';
begin;
lock table public.public_notes in access exclusive mode;
\\echo MAP063_${upper}_NOTE_BARRIER_READY
`);
    await waitForMarker(barrier, `MAP063_${upper}_NOTE_BARRIER_READY`);

    rpc = startSession();
    rpc.child.stdin.write(`${anonPreamble()}
begin;
\\echo MAP063_${upper}_CREATION_STARTED
select id
from public.create_public_player_note(
  /* ${rpcMarker} */
  ${sqlLiteral(ENTITY_ID)},
  ${sqlLiteral(PLAYER_ID)},
  ${sqlLiteral(title)},
  'Creation owns eligibility locks before concurrent revocation.'
);
\\echo MAP063_${upper}_CREATION_RPC_COMPLETED
`);
    await waitForMarker(rpc, `MAP063_${upper}_CREATION_STARTED`);
    await waitForBlockedQuery(rpcMarker, rpc, `${kind} creation RPC barrier`);

    admin = startSession();
    const update =
      kind === 'player'
        ? `update public.players /* ${adminMarker} */
set publication_status = 'archived'::public.publication_status
where id = ${sqlLiteral(PLAYER_ID)};`
        : `update public.campaigns /* ${adminMarker} */
set status = 'archived'
where id = ${sqlLiteral(CAMPAIGN_ID)}::uuid;`;

    admin.child.stdin.write(`${adminPreamble()}
begin;
\\echo MAP063_${upper}_CONCURRENT_REVOCATION_STARTED
${update}
\\echo MAP063_${upper}_CONCURRENT_REVOCATION_COMPLETED
commit;
\\q
`);
    await waitForMarker(admin, `MAP063_${upper}_CONCURRENT_REVOCATION_STARTED`);
    await waitForBlockedQuery(adminMarker, admin, `${kind} concurrent revocation`);

    barrier.child.stdin.write(`commit;
\\q
`);
    const barrierExit = await waitForExit(barrier, `${kind} public_notes barrier`);
    if (barrierExit.code !== 0) fail(`${kind} barrier failed: ${barrier.output}`);

    await waitForMarker(rpc, `MAP063_${upper}_CREATION_RPC_COMPLETED`);
    assertNoLockFailure(rpc.output, `${kind} creation RPC`);

    await delay(100);
    if (admin.output.includes(`MAP063_${upper}_CONCURRENT_REVOCATION_COMPLETED`)) {
      fail(`${kind} revocation bypassed eligibility locks before creation committed`);
    }

    rpc.child.stdin.write(`commit;
\\q
`);
    const rpcExit = await waitForExit(rpc, `${kind} creation commit`);
    if (rpcExit.code !== 0) fail(`${kind} creation failed: ${rpc.output}`);

    const adminExit = await waitForExit(admin, `${kind} serialized revocation`);
    if (adminExit.code !== 0) fail(`${kind} serialized revocation failed: ${admin.output}`);
    assertNoLockFailure(admin.output, `${kind} serialized revocation`);
    if (!admin.output.includes(`MAP063_${upper}_CONCURRENT_REVOCATION_COMPLETED`)) {
      fail(`${kind} revocation never completed after creation commit`);
    }

    const count = Number(
      runPsql(`select count(*) from public.public_notes where title = ${sqlLiteral(title)};`),
    );
    if (count !== 1) {
      fail(`${kind} creation-first serialization expected one persisted note, found ${count}`);
    }
  } finally {
    stopSession(admin);
    stopSession(rpc);
    stopSession(barrier);
    await delay(100);
    restoreFixtureState();
  }
}

async function main() {
  assertDatabaseContainer();
  restoreFixtureState();
  assertFixtureReady();

  await assertRevocationWins('player');
  await assertRevocationWins('campaign');
  await assertCreationWins('player');
  await assertCreationWins('campaign');

  restoreFixtureState();
  console.log(
    'MAP-063 public-note concurrency regression passed (player/campaign revocation and lock ordering).',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
