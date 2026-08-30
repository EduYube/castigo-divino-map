import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const SESSION_TIMEOUT_MS = 12_000;
const LOCK_TIMEOUT_MS = 5_000;
const ENTITY_ID = 'entity-map060-v5-v6-concurrency';
const ADMIN_SUB = '00000000-0000-4000-8000-000000000001';

function fail(message) {
  throw new Error(`MAP-060 v5/v6 concurrency verification failed: ${message}`);
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
    [
      ...psqlArguments(containerName).filter((argument) => argument !== '--interactive'),
      '--command',
      sql,
    ],
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

async function verifyV5V6LockOrdering(containerName) {
  let barrierSession;
  let v6Session;
  let v5Session;

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
       'map060-v5-v6-concurrency',
       'location',
       'pin',
       'public',
       'en',
       'MAP060 v5/v6 concurrency fixture',
       '',
       '',
       520,
       520,
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
  const v5Revision = editorRevision(containerName, campaignId, 5);
  const v6Revision = editorRevision(containerName, campaignId, 6);

  if (!campaignId || !categoryId || !updatedAt || !v5Revision || !v6Revision) {
    fail('Unable to capture the committed concurrency fixture revisions.');
  }

  const commonArguments = `
    ${sqlLiteral(campaignId)}::uuid,
    ${sqlLiteral(ENTITY_ID)},
    ${sqlLiteral(updatedAt)}::timestamptz`;

  const v6Call = `select public.admin_save_map_entity_v6(
    /* map060-v6-lock-order */
    ${commonArguments},
    ${sqlLiteral(v6Revision)},
    'map060-v5-v6-concurrency',
    'location',
    'pin',
    'public',
    null,
    'MAP060 v5/v6 concurrency fixture',
    'MAP060 v6 serialized writer',
    '',
    '{"kind":"polygon","vertices":[{"x":500,"y":500},{"x":540,"y":500},{"x":540,"y":540},{"x":500,"y":540}]}'::jsonb,
    ${sqlLiteral(categoryId)},
    'draft',
    '{}'::text[],
    ${sqlLiteral(dispositions)}::jsonb,
    '{}'::text[]
  );`;

  const v5Call = `select public.admin_save_map_entity_v5(
    /* map060-v5-lock-order */
    ${commonArguments},
    ${sqlLiteral(v5Revision)},
    'map060-v5-v6-concurrency',
    'location',
    'pin',
    'public',
    null,
    'MAP060 v5/v6 concurrency fixture',
    'MAP060 v5 stale writer',
    '',
    520,
    520,
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
       \\echo MAP060_ASSOCIATION_BARRIER_LOCKED
`,
    );
    await waitForMarker(barrierSession, 'MAP060_ASSOCIATION_BARRIER_LOCKED');

    v6Session = startPsqlSession(containerName);
    v6Session.child.stdin.write(
      `${adminPreamble()}
       begin;
       \\echo MAP060_V6_STARTED
       ${v6Call}
       \\echo MAP060_V6_COMPLETED
`,
    );
    await waitForMarker(v6Session, 'MAP060_V6_STARTED');
    await waitForDatabaseLock(containerName, '/* map060-v6-lock-order */', v6Session);
    console.log('ok - v6 holds the shared entity lock while waiting at the relation barrier');

    v5Session = startPsqlSession(containerName);
    v5Session.child.stdin.write(
      `${adminPreamble()}
       begin;
       \\echo MAP060_V5_STARTED
       ${v5Call}
       \\echo MAP060_V5_COMPLETED
`,
    );
    await waitForMarker(v5Session, 'MAP060_V5_STARTED');
    await waitForDatabaseLock(containerName, '/* map060-v5-lock-order */', v5Session);
    console.log('ok - legacy v5 queues behind the same advisory lock held by v6');

    barrierSession.child.stdin.end('rollback;\n\\q\n');
    const barrierExit = await waitForExit(barrierSession, 'association barrier rollback');
    if (barrierExit.code !== 0) {
      fail(`Association barrier failed: ${barrierSession.output || 'no output'}`);
    }

    await waitForMarker(v6Session, 'MAP060_V6_COMPLETED');
    v6Session.child.stdin.end('commit;\n\\q\n');
    const v6Exit = await waitForExit(v6Session, 'v6 writer commit');
    if (v6Exit.code !== 0) fail(`v6 writer failed: ${v6Session.output || 'no output'}`);
    console.log('ok - v6 commits its geometry-aware write after the barrier is released');

    v5Session.child.stdin.end('\\q\n');
    const v5Exit = await waitForExit(v5Session, 'queued v5 stale rejection');
    if (v5Exit.code === 0) fail('Queued legacy v5 writer unexpectedly succeeded after v6 committed.');
    if (!v5Session.output.includes('the entity changed while it was being edited')) {
      fail(`Queued v5 writer failed for an unexpected reason: ${v5Session.output || 'no output'}`);
    }
    if (v5Session.output.includes('deadlock detected')) {
      fail(`v5/v6 writers deadlocked: ${v5Session.output}`);
    }
    console.log('ok - queued v5 is rejected as stale after v6 commits, without deadlock');

    const finalState = runPsql(
      containerName,
      `select summary || ':' || (geometry ->> 'kind')
       from public.map_entities
       where id = ${sqlLiteral(ENTITY_ID)};`,
    );
    if (finalState !== 'MAP060 v6 serialized writer:polygon') {
      fail(`Final state is ${finalState || 'empty'} instead of the committed v6 polygon value.`);
    }
    console.log('ok - the geometry-aware v6 mutation is the only committed entity write');
  } finally {
    stopSession(v5Session);
    stopSession(v6Session);
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
await verifyV5V6LockOrdering(containerName);
console.log('MAP-060 v5/v6 concurrency verification passed: 5 checks across real sessions.');
