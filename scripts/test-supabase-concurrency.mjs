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

async function waitForDatabaseLock(containerName, queryMarker, withdrawalSession) {
  const escapedMarker = queryMarker.replaceAll("'", "''");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (withdrawalSession.exited) {
      fail(
        `Withdrawal session exited before waiting on a lock: ${withdrawalSession.output || 'no output'}`,
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

  fail(`Timed out waiting for the withdrawal query ${queryMarker} to block.`);
}

function stopSession(session) {
  if (session && !session.exited) {
    session.child.kill();
  }
}

async function verifyScenario(containerName, scenario) {
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

const containerName = findDatabaseContainer();

await verifyScenario(containerName, {
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

await verifyScenario(containerName, {
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

console.log('Supabase concurrency verification passed: 6 checks across 2 scenarios.');
