import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const SESSION_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';

function fail(message) {
  throw new Error(`MAP-056 concurrency verification failed: ${message}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function psqlArguments() {
  return [
    'exec',
    '--interactive',
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

function runPsql(sql) {
  const result = spawnSync(
    'docker',
    [...psqlArguments().filter((argument) => argument !== '--interactive'), '--command', sql],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `psql exited with status ${String(result.status)}`);
  }
  return result.stdout.trim();
}

function startSession() {
  const child = spawn('docker', psqlArguments(), {
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
    get exited() {
      return exited;
    },
    get output() {
      return `${stdout}\n${stderr}`.trim();
    },
    get spawnError() {
      return spawnError;
    },
  };
}

async function waitForMarker(session, marker) {
  const deadline = Date.now() + SESSION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (session.output.includes(marker)) return;
    if (session.spawnError) fail(`Unable to start psql: ${session.spawnError.message}`);
    if (session.exited) fail(`psql exited before ${marker}: ${session.output || 'no output'}`);
    await delay(20);
  }
  fail(`Timed out waiting for ${marker}.`);
}

async function waitForExit(session, description) {
  return Promise.race([
    session.exit,
    delay(SESSION_TIMEOUT_MS).then(() => fail(`Timed out waiting for ${description}.`)),
  ]);
}

async function waitForBlockedQuery(marker, session) {
  const escaped = marker.replaceAll("'", "''");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (session.exited) fail(`Second moderation exited before blocking: ${session.output}`);
    const waiting = runPsql(`select count(*)
      from pg_catalog.pg_stat_activity
      where pid <> pg_catalog.pg_backend_pid()
        and state = 'active'
        and wait_event_type = 'Lock'
        and query like '%${escaped}%';`);
    if (waiting === '1') return;
    await delay(25);
  }
  fail('Timed out waiting for the concurrent moderation row lock.');
}

function adminPrelude() {
  return `set local "request.jwt.claim.sub" = '${ADMIN_USER_ID}';
    set local "request.jwt.claims" = '{"sub":"${ADMIN_USER_ID}","role":"authenticated"}';
    set local role authenticated;`;
}

const requestId = randomUUID();
const entityId = `entity-request-${requestId.replaceAll('-', '')}`;

runPsql(`insert into public.public_requests (
    id, sender_name, proposed_name, entity_type, x, y, description, reason
  ) values (
    '${requestId}',
    'Concurrency Visitor',
    'Concurrency Draft',
    'location',
    1900,
    1200,
    'Concurrent moderation request.',
    'Exactly one draft must be created.'
  );`);

const [campaignId, expectedUpdatedAt] = runPsql(
  `select campaign_id::text || '|' || updated_at::text from public.public_requests where id = '${requestId}';`,
)
  .split('|')
  .map((value) => value.replaceAll("'", "''"));

if (!campaignId || !expectedUpdatedAt) fail('Unable to resolve the request campaign and revision.');

let first;
let second;
try {
  first = startSession();
  first.child.stdin.write(`begin;
    ${adminPrelude()}
    select public.admin_moderate_public_request_v2(
      '${campaignId}'::uuid,
      '${requestId}',
      '${expectedUpdatedAt}'::timestamptz,
      'convert',
      null
    ) /* map056-first-moderation */;
    \\echo MAP056_FIRST_CONVERTED_UNCOMMITTED
`);
  await waitForMarker(first, 'MAP056_FIRST_CONVERTED_UNCOMMITTED');

  second = startSession();
  second.child.stdin.write(`begin;
    ${adminPrelude()}
    \\echo MAP056_SECOND_STARTED
    select public.admin_moderate_public_request_v2(
      '${campaignId}'::uuid,
      '${requestId}',
      '${expectedUpdatedAt}'::timestamptz,
      'convert',
      null
    ) /* map056-second-moderation */;
    commit;
    \\q
`);
  second.child.stdin.end();
  await waitForMarker(second, 'MAP056_SECOND_STARTED');
  await waitForBlockedQuery('/* map056-second-moderation */', second);
  console.log('ok - concurrent scoped moderation waits for the authoritative request row lock');

  first.child.stdin.end(`commit;
    \\q
`);

  const firstExit = await waitForExit(first, 'first moderation commit');
  if (firstExit.code !== 0) fail(`First moderation failed: ${first.output}`);
  console.log('ok - the first moderator converts the request successfully');

  const secondExit = await waitForExit(second, 'second moderation rejection');
  if (secondExit.code === 0) fail('Second concurrent moderation unexpectedly succeeded.');
  if (!second.output.includes('public request changed or was already processed')) {
    fail(`Second moderation failed for an unexpected reason: ${second.output || 'no output'}`);
  }
  console.log('ok - the second moderator is rejected after rechecking the locked request');

  const verification = runPsql(`select
      request.request_status::text || '|' ||
      request.converted_entity_id || '|' ||
      request.campaign_id::text || '|' ||
      entity.campaign_id::text || '|' ||
      entity.audience::text || '|' ||
      entity.publication_status::text || '|' ||
      case when entity.category_id is null then 'null-category' else 'categorized' end || '|' ||
      (select count(*)::text from public.entity_tags where entity_id = entity.id)
    from public.public_requests as request
    join public.map_entities as entity
      on entity.id = request.converted_entity_id
     and entity.campaign_id = request.campaign_id
    where request.id = '${requestId}';`);

  if (
    verification !==
    `converted|${entityId}|${campaignId}|${campaignId}|public|draft|null-category|0`
  ) {
    fail(`Unexpected committed state: ${verification || 'empty'}`);
  }
  console.log('ok - exactly one same-campaign public-audience draft remains linked to the request');
} finally {
  if (second && !second.exited) second.child.kill();
  if (first && !first.exited) first.child.kill();
}

console.log('MAP-056 concurrency verification passed: 4 checks across 2 concurrent moderators.');
