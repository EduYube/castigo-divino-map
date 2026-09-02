import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const SESSION_TIMEOUT_MS = 12_000;
const LOCK_TIMEOUT_MS = 5_000;
const ENTITY_ID = 'entity-map064-v6-v7-concurrency';
const ADMIN_SUB = '00000000-0000-4000-8000-000000000001';

function fail(message) {
  throw new Error(`MAP-064 v6/v7 concurrency verification failed: ${message}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function findDatabaseContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) fail(`Docker could not be executed: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `docker ps exited with status ${result.status ?? 'unknown'}`);
  }
  const runningContainers = result.stdout.split(/\r?\n/u).filter(Boolean);
  if (!runningContainers.includes(DATABASE_CONTAINER)) {
    fail(`Expected running local database container ${DATABASE_CONTAINER}.`);
  }
  return DATABASE_CONTAINER;
}

function psqlArguments(containerName) {
  return [
    'exec',
    '--interactive',
    '--user',
    'postgres',
    containerName,
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

function startPsqlSession(containerName) {
  const child = spawn('docker', psqlArguments(containerName), {
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

function runPsql(containerName, sql) {
  const result = spawnSync(
    'docker',
    [...psqlArguments(containerName).filter((argument) => argument !== '--interactive'), '--command', sql],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `psql exited with status ${result.status ?? 'unknown'}`);
  }
  return result.stdout.trim();
}

async function waitForMarker(session, marker) {
  const deadline = Date.now() + SESSION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (session.output.includes(marker)) return;
    if (session.spawnError) fail(`Unable to start psql: ${session.spawnError.message}`);
    if (session.exited) {
      fail(`psql exited before emitting ${marker}: ${session.output || 'no output'}`);
    }
    await delay(20);
  }
  fail(`Timed out waiting for psql marker ${marker}.`);
}

async function waitForExit(session, description) {
  const timeout = delay(SESSION_TIMEOUT_MS).then(() => {
    fail(`Timed out waiting for ${description}.`);
  });
  return Promise.race([session.exit, timeout]);
}

async function waitForDatabaseLock(containerName, queryMarker, blockedSession) {
  const escapedMarker = queryMarker.replaceAll("'", "''");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (blockedSession.exited) {
      fail(`Session exited before waiting on a lock: ${blockedSession.output || 'no output'}`);
    }
    const waitingSessions = runPsql(
      containerName,
      `select count(*)
       from pg_catalog.pg_stat_activity
       where pid <> pg_catalog.pg_backend_pid()
         and state = 'active'
         and wait_event_type = 'Lock'
         and query like '%${escapedMarker}%';`,
    );
    if (waitingSessions === '1') return;
    await delay(25);
  }
  fail(`Timed out waiting for query ${queryMarker} to block.`);
}

function stopSession(session) {
  if (session && !session.exited) session.child.kill();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function adminPreamble() {
  const claims = JSON.stringify({ sub: ADMIN_SUB, role: 'authenticated' });
  return `set "request.jwt.claim.sub" = ${sqlLiteral(ADMIN_SUB)};
set "request.jwt.claims" = ${sqlLiteral(claims)};
set role authenticated;
set statement_timeout = '10s';`;
}

function editorRevision(containerName, campaignId, version) {
  return runPsql(
    containerName,
    `${adminPreamble()}
     select public.admin_get_map_entity_editor_v${version}(
       ${sqlLiteral(campaignId)}::uuid,
       ${sqlLiteral(ENTITY_ID)}
     ) ->> 'relations_revision';`,
  );
}

async function verifyV6V7LockOrdering(containerName) {
  let barrierSession;
  let v7Session;
  let v6Session;

  runPsql(
    containerName,
    `delete from public.entity_player_associations where entity_id = ${sqlLiteral(ENTITY_ID)};
     delete from public.entity_tags where entity_id = ${sqlLiteral(ENTITY_ID)};
     delete from public.entity_player_dispositions where entity_id = ${sqlLiteral(ENTITY_ID)};
     delete from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};

     insert into public.map_entities (
       campaign_id, id, slug, entity_type, visibility, audience, name_language,
       name, summary, description, x, y, category_id, publication_status
     )
     select
       source.campaign_id,
       ${sqlLiteral(ENTITY_ID)},
       'map064-v6-v7-concurrency',
       'mission',
       'pin',
       'public',
       'en',
       'MAP064 v6/v7 concurrency fixture',
       '',
       '',
       620,
       620,
       source.category_id,
       'draft'
     from public.map_entities as source
     where source.id = 'entity-aster-guide';`,
  );

  const campaignId = runPsql(
    containerName,
    `select campaign_id::text from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const categoryId = runPsql(
    containerName,
    `select category_id from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const updatedAt = runPsql(
    containerName,
    `select updated_at::text from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const dispositions = runPsql(
    containerName,
    `select coalesce(
       pg_catalog.jsonb_agg(
         pg_catalog.jsonb_build_object(
           'playerId', relation.player_id,
           'disposition', relation.disposition::text
         ) order by relation.player_id
       ),
       '[]'::jsonb
     )::text
     from public.entity_player_dispositions as relation
     where relation.entity_id = ${sqlLiteral(ENTITY_ID)};`,
  );
  const v6Revision = editorRevision(containerName, campaignId, 6);
  const v7Revision = editorRevision(containerName, campaignId, 7);

  if (!campaignId || !categoryId || !updatedAt || !v6Revision || !v7Revision) {
    fail('Unable to capture the committed concurrency fixture revisions.');
  }

  const commonArguments = `
    ${sqlLiteral(campaignId)}::uuid,
    ${sqlLiteral(ENTITY_ID)},
    ${sqlLiteral(updatedAt)}::timestamptz`;

  const v7Call = `select public.admin_save_map_entity_v7(
    /* map064-v7-lock-order */
    ${commonArguments},
    ${sqlLiteral(v7Revision)},
    'map064-v6-v7-concurrency',
    'mission',
    'pin',
    'public',
    null,
    'MAP064 v6/v7 concurrency fixture',
    'MAP064 v7 serialized writer',
    '',
    '{"kind":"point","coordinates":{"x":620,"y":620}}'::jsonb,
    ${sqlLiteral(categoryId)},
    'draft',
    '{}'::text[],
    ${sqlLiteral(dispositions)}::jsonb,
    '{}'::text[],
    'completed'
  );`;

  const v6Call = `select public.admin_save_map_entity_v6(
    /* map064-v6-lock-order */
    ${commonArguments},
    ${sqlLiteral(v6Revision)},
    'map064-v6-v7-concurrency',
    'mission',
    'pin',
    'public',
    null,
    'MAP064 v6/v7 concurrency fixture',
    'MAP064 v6 stale writer',
    '',
    '{"kind":"point","coordinates":{"x":620,"y":620}}'::jsonb,
    ${sqlLiteral(categoryId)},
    'draft',
    '{}'::text[],
    ${sqlLiteral(dispositions)}::jsonb,
    '{}'::text[]
  );`;

  try {
    barrierSession = startPsqlSession(containerName);
    barrierSession.child.stdin.write(
      `begin;
       lock table public.entity_player_associations in access exclusive mode;
       \\echo MAP064_ASSOCIATION_BARRIER_LOCKED
`,
    );
    await waitForMarker(barrierSession, 'MAP064_ASSOCIATION_BARRIER_LOCKED');

    v7Session = startPsqlSession(containerName);
    v7Session.child.stdin.write(
      `${adminPreamble()}
       begin;
       \\echo MAP064_V7_STARTED
       ${v7Call}
       \\echo MAP064_V7_COMPLETED
`,
    );
    await waitForMarker(v7Session, 'MAP064_V7_STARTED');
    await waitForDatabaseLock(containerName, '/* map064-v7-lock-order */', v7Session);
    console.log('ok - v7 holds the shared entity advisory lock while waiting at the relation barrier');

    v6Session = startPsqlSession(containerName);
    v6Session.child.stdin.write(
      `${adminPreamble()}
       begin;
       \\echo MAP064_V6_STARTED
       ${v6Call}
       \\echo MAP064_V6_COMPLETED
`,
    );
    await waitForMarker(v6Session, 'MAP064_V6_STARTED');
    await waitForDatabaseLock(containerName, '/* map064-v6-lock-order */', v6Session);
    console.log('ok - legacy v6 queues behind the same entity advisory lock held by v7');

    barrierSession.child.stdin.end('rollback;\n\\q\n');
    const barrierExit = await waitForExit(barrierSession, 'association barrier rollback');
    if (barrierExit.code !== 0) {
      fail(`Association barrier failed: ${barrierSession.output || 'no output'}`);
    }

    await waitForMarker(v7Session, 'MAP064_V7_COMPLETED');
    v7Session.child.stdin.end('commit;\n\\q\n');
    const v7Exit = await waitForExit(v7Session, 'v7 writer commit');
    if (v7Exit.code !== 0) fail(`v7 writer failed: ${v7Session.output || 'no output'}`);
    console.log('ok - v7 commits the lifecycle-aware mutation after the barrier is released');

    v6Session.child.stdin.end('\\q\n');
    const v6Exit = await waitForExit(v6Session, 'queued v6 stale rejection');
    if (v6Exit.code === 0) fail('Queued legacy v6 writer unexpectedly succeeded after v7 committed.');
    if (!v6Session.output.includes('the entity changed while it was being edited')) {
      fail(`Queued v6 writer failed for an unexpected reason: ${v6Session.output || 'no output'}`);
    }
    if (v6Session.output.includes('deadlock detected')) {
      fail(`v6/v7 writers deadlocked: ${v6Session.output}`);
    }
    console.log('ok - queued v6 is rejected as stale after v7 commits, without deadlock');

    const finalState = runPsql(
      containerName,
      `select summary || ':' || lifecycle_status::text
       from public.map_entities
       where id = ${sqlLiteral(ENTITY_ID)};`,
    );
    if (finalState !== 'MAP064 v7 serialized writer:completed') {
      fail(`Final state is ${finalState || 'empty'} instead of the committed v7 lifecycle value.`);
    }
    console.log('ok - the v7 mutation is the only committed entity write and keeps lifecycle state');
  } finally {
    stopSession(v6Session);
    stopSession(v7Session);
    stopSession(barrierSession);
    runPsql(
      containerName,
      `delete from public.entity_player_associations where entity_id = ${sqlLiteral(ENTITY_ID)};
       delete from public.entity_tags where entity_id = ${sqlLiteral(ENTITY_ID)};
       delete from public.entity_player_dispositions where entity_id = ${sqlLiteral(ENTITY_ID)};
       delete from public.map_entities where id = ${sqlLiteral(ENTITY_ID)};`,
    );
  }
}

const containerName = findDatabaseContainer();
await verifyV6V7LockOrdering(containerName);
console.log('MAP-064 v6/v7 concurrency verification passed: 5 checks across real sessions.');
