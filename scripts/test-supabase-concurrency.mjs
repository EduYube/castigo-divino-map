import { spawn, spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const SESSION_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;

function fail(message) {
  throw new Error(`Supabase concurrency verification failed: ${message}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function findDatabaseContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    fail(`Docker could not be executed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(result.stderr.trim() || `docker ps exited with status ${result.status ?? 'unknown'}`);
  }

  const runningContainers = result.stdout.split(/\r?\n/u).filter(Boolean);

  if (!runningContainers.includes(DATABASE_CONTAINER)) {
    fail(
      `Expected running local database container ${DATABASE_CONTAINER}; found ${runningContainers.join(', ') || 'none'}.`,
    );
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

async function waitForMarker(session, marker) {
  const deadline = Date.now() + SESSION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (session.output.includes(marker)) {
      return;
    }

    if (session.spawnError) {
      fail(`Unable to start psql: ${session.spawnError.message}`);
    }

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

function runPsql(containerName, sql) {
  const result = spawnSync(
    'docker',
    [
      ...psqlArguments(containerName).filter((argument) => argument !== '--interactive'),
      '--command',
      sql,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  if (result.error) {
    fail(`Unable to run psql: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(result.stderr.trim() || `psql exited with status ${result.status ?? 'unknown'}`);
  }

  return result.stdout.trim();
}

async function waitForDatabaseLock(containerName, queryMarker, blockedSession) {
  const escapedMarker = queryMarker.replaceAll("'", "''");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (blockedSession.exited) {
      fail(
        `Blocked session exited before waiting on a lock: ${blockedSession.output || 'no output'}`,
      );
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

    if (waitingSessions === '1') {
      return;
    }

    await delay(25);
  }

  fail(`Timed out waiting for query ${queryMarker} to block.`);
}

function stopSession(session) {
  if (session && !session.exited) {
    session.child.kill();
  }
}

async function verifyWithdrawalScenario(containerName, scenario) {
  let publisher;
  let withdrawer;

  try {
    publisher = startPsqlSession(containerName);
    publisher.child.stdin.write(
      `begin;\n${scenario.publisherSql}\n\\echo ${scenario.lockMarker}\n`,
    );
    await waitForMarker(publisher, scenario.lockMarker);

    withdrawer = startPsqlSession(containerName);
    withdrawer.child.stdin.write(
      `\\echo ${scenario.withdrawalMarker}\n${scenario.withdrawalSql}\n\\q\n`,
    );
    withdrawer.child.stdin.end();
    await waitForMarker(withdrawer, scenario.withdrawalMarker);
    await waitForDatabaseLock(containerName, scenario.queryMarker, withdrawer);
    console.log(`ok - ${scenario.subject} withdrawal waits for the publication lock`);

    publisher.child.stdin.end('rollback;\n\\q\n');
    const publisherExit = await waitForExit(publisher, `${scenario.subject} publisher rollback`);

    if (publisherExit.code !== 0) {
      fail(
        `${scenario.subject} publisher exited with ${String(publisherExit.code)}: ${publisher.output}`,
      );
    }

    const withdrawerExit = await waitForExit(withdrawer, `${scenario.subject} withdrawal failure`);

    if (withdrawerExit.code === 0) {
      fail(`${scenario.subject} withdrawal unexpectedly succeeded.`);
    }

    if (!withdrawer.output.includes(scenario.expectedError)) {
      fail(
        `${scenario.subject} withdrawal failed for an unexpected reason: ${withdrawer.output || 'no output'}`,
      );
    }
    console.log(`ok - ${scenario.subject} withdrawal rechecks the invariant after waiting`);

    const status = runPsql(containerName, scenario.verificationSql);
    if (status !== 'published') {
      fail(`${scenario.subject} status is ${status || 'empty'} after the concurrent test.`);
    }
    console.log(`ok - ${scenario.subject} remains published after the rejected withdrawal`);
  } finally {
    stopSession(withdrawer);
    if (publisher && !publisher.exited) {
      publisher.child.stdin.end('rollback;\n\\q\n');
      await Promise.race([publisher.exit, delay(1_000)]);
      stopSession(publisher);
    }
  }
}

async function verifyEntityPlayerMatrixScenario(containerName) {
  const entityId = 'entity-concurrency-matrix-location';
  const playerId = 'player-concurrency-matrix';
  let entitySession;
  let playerSession;

  runPsql(
    containerName,
    `delete from public.players where id = '${playerId}';
     delete from public.map_entities where id = '${entityId}';`,
  );

  try {
    entitySession = startPsqlSession(containerName);
    entitySession.child.stdin.write(
      `begin;
       insert into public.map_entities (
         id, slug, entity_type, name, x, y, category_id
       ) values (
         '${entityId}',
         'concurrency-matrix-location',
         'location',
         'Concurrency Matrix Location',
         2100,
         1300,
         'category-places'
       );
       \\echo MAP015_MATRIX_ENTITY_LOCKED
`,
    );
    await waitForMarker(entitySession, 'MAP015_MATRIX_ENTITY_LOCKED');

    playerSession = startPsqlSession(containerName);
    playerSession.child.stdin.write(
      `begin;
       \\echo MAP015_MATRIX_PLAYER_STARTED
       insert into public.players /* map015-matrix-player */ (
         id, slug, display_name
       ) values (
         '${playerId}',
         'concurrency-matrix',
         'Concurrency Matrix Player'
       );
       commit;
       \\q
`,
    );
    playerSession.child.stdin.end();

    await waitForMarker(playerSession, 'MAP015_MATRIX_PLAYER_STARTED');
    await waitForDatabaseLock(containerName, '/* map015-matrix-player */', playerSession);
    console.log('ok - concurrent player insertion waits for the shared matrix lock');

    entitySession.child.stdin.end('commit;\n\\q\n');
    const entityExit = await waitForExit(entitySession, 'matrix entity commit');
    if (entityExit.code !== 0) {
      fail(`Matrix entity insertion failed: ${entitySession.output || 'no output'}`);
    }

    const playerExit = await waitForExit(playerSession, 'matrix player commit');
    if (playerExit.code !== 0) {
      fail(`Matrix player insertion failed: ${playerSession.output || 'no output'}`);
    }
    console.log('ok - both concurrent matrix endpoints commit successfully');

    const pairCount = runPsql(
      containerName,
      `select count(*)
       from public.entity_player_dispositions
       where entity_id = '${entityId}'
         and player_id = '${playerId}';`,
    );

    if (pairCount !== '1') {
      fail(`Concurrent matrix intersection count is ${pairCount || 'empty'}, expected 1.`);
    }
    console.log('ok - concurrent entity and player inserts create their matrix intersection');
  } finally {
    stopSession(playerSession);
    if (entitySession && !entitySession.exited) {
      entitySession.child.stdin.end('rollback;\n\\q\n');
      await Promise.race([entitySession.exit, delay(1_000)]);
      stopSession(entitySession);
    }

    runPsql(
      containerName,
      `delete from public.players where id = '${playerId}';
       delete from public.map_entities where id = '${entityId}';`,
    );
  }
}

async function verifyRelatedSightingScenario(containerName) {
  const sightingId = 'location-event-concurrency-sighting';
  const departureId = 'location-event-concurrency-departure';
  let departureSession;
  let sightingUpdateSession;

  runPsql(
    containerName,
    `delete from public.character_location_events
     where id in ('${departureId}', '${sightingId}');

     insert into public.character_location_events (
       id,
       character_id,
       event_type,
       x,
       y,
       location_label,
       observed_at
     ) values (
       '${sightingId}',
       'entity-aster-guide',
       'sighting',
       1800,
       1100,
       'Concurrency sighting',
       '2026-02-10T10:00:00Z'
     );`,
  );

  try {
    departureSession = startPsqlSession(containerName);
    departureSession.child.stdin.write(
      `begin;
       insert into public.character_location_events (
         id,
         character_id,
         event_type,
         x,
         y,
         location_label,
         observed_at,
         related_sighting_id
       ) values (
         '${departureId}',
         'entity-aster-guide',
         'departure',
         1800,
         1100,
         'Concurrency departure',
         '2026-02-11T10:00:00Z',
         '${sightingId}'
       );
       \\echo MAP015_SIGHTING_LOCKED
`,
    );
    await waitForMarker(departureSession, 'MAP015_SIGHTING_LOCKED');

    sightingUpdateSession = startPsqlSession(containerName);
    sightingUpdateSession.child.stdin.write(
      `\\echo MAP015_SIGHTING_UPDATE_STARTED
       update public.character_location_events /* map015-sighting-update */
       set observed_at = '2026-02-12T10:00:00Z'
       where id = '${sightingId}';
       \\q
`,
    );
    sightingUpdateSession.child.stdin.end();

    await waitForMarker(sightingUpdateSession, 'MAP015_SIGHTING_UPDATE_STARTED');
    await waitForDatabaseLock(
      containerName,
      '/* map015-sighting-update */',
      sightingUpdateSession,
    );
    console.log('ok - sighting mutation waits while a related departure is being created');

    departureSession.child.stdin.end('commit;\n\\q\n');
    const departureExit = await waitForExit(departureSession, 'related departure commit');
    if (departureExit.code !== 0) {
      fail(`Related departure insertion failed: ${departureSession.output || 'no output'}`);
    }

    const updateExit = await waitForExit(sightingUpdateSession, 'rejected sighting mutation');
    if (updateExit.code === 0) {
      fail('Concurrent sighting mutation unexpectedly succeeded.');
    }

    if (!sightingUpdateSession.output.includes('a departure cannot precede its related sighting')) {
      fail(
        `Concurrent sighting mutation failed for an unexpected reason: ${sightingUpdateSession.output || 'no output'}`,
      );
    }
    console.log('ok - sighting mutation rechecks dependent departures after waiting');

    const observedAt = runPsql(
      containerName,
      `select to_char(
         observed_at at time zone 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS"Z"'
       )
       from public.character_location_events
       where id = '${sightingId}';`,
    );

    if (observedAt !== '2026-02-10T10:00:00Z') {
      fail(`Referenced sighting moved to ${observedAt || 'empty'} after the rejected update.`);
    }
    console.log('ok - referenced sighting chronology remains unchanged');

    const departureCount = runPsql(
      containerName,
      `select count(*)
       from public.character_location_events
       where id = '${departureId}'
         and related_sighting_id = '${sightingId}';`,
    );

    if (departureCount !== '1') {
      fail(`Committed related departure count is ${departureCount || 'empty'}, expected 1.`);
    }
    console.log('ok - the committed departure retains its valid sighting relation');
  } finally {
    stopSession(sightingUpdateSession);
    if (departureSession && !departureSession.exited) {
      departureSession.child.stdin.end('rollback;\n\\q\n');
      await Promise.race([departureSession.exit, delay(1_000)]);
      stopSession(departureSession);
    }

    runPsql(
      containerName,
      `delete from public.character_location_events
       where id in ('${departureId}', '${sightingId}');`,
    );
  }
}

const containerName = findDatabaseContainer();

await verifyWithdrawalScenario(containerName, {
  subject: 'category',
  lockMarker: 'MAP014_CATEGORY_LOCKED',
  withdrawalMarker: 'MAP014_CATEGORY_WITHDRAWAL_STARTED',
  queryMarker: '/* map014-category-withdrawer */',
  publisherSql: `update public.map_entities
    set summary = summary
    where id = 'entity-aster-guide';`,
  withdrawalSql: `update public.categories /* map014-category-withdrawer */
    set publication_status = 'draft'
    where id = 'category-people';`,
  expectedError: 'a category used by published entities cannot be withdrawn',
  verificationSql: `select publication_status::text
    from public.categories
    where id = 'category-people';`,
});

await verifyWithdrawalScenario(containerName, {
  subject: 'tag',
  lockMarker: 'MAP014_TAG_LOCKED',
  withdrawalMarker: 'MAP014_TAG_WITHDRAWAL_STARTED',
  queryMarker: '/* map014-tag-withdrawer */',
  publisherSql: `update public.entity_tags
    set tag_id = tag_id
    where id = 'entity-tag-aster-notable';`,
  withdrawalSql: `update public.tags /* map014-tag-withdrawer */
    set publication_status = 'draft'
    where id = 'notable';`,
  expectedError: 'a tag used by published relations cannot be withdrawn',
  verificationSql: `select publication_status::text
    from public.tags
    where id = 'notable';`,
});

await verifyEntityPlayerMatrixScenario(containerName);
await verifyRelatedSightingScenario(containerName);

console.log('Supabase concurrency verification passed: 13 checks across 4 scenarios.');
