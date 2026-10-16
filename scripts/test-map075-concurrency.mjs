import { spawn, spawnSync } from 'node:child_process';

const CONTAINER = 'supabase_db_castigo-divino-map';
const CAMPAIGN = '00000000-0000-4000-8000-000000000053';
const ADMIN = '00000000-0000-4000-8000-000000000001';
const ENTITY = 'entity-map075-race';
const CATEGORY = 'category-map075-race';
const TIMEOUT = 20_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";

function fail(message) {
  throw new Error('MAP-075 concurrency regression: ' + message);
}
function psqlArgs(interactive) {
  return ['exec', ...(interactive ? ['--interactive'] : []),
    '--user', 'postgres', CONTAINER, 'psql', '--username', 'postgres',
    '--dbname', 'postgres', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    '--quiet', '--tuples-only', '--no-align'];
}
function psql(sql) {
  const result = spawnSync('docker', [...psqlArgs(false), '--command', sql], {
    encoding: 'utf8', windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    fail(result.error?.message || result.stderr || 'psql failed');
  }
  return result.stdout.trim();
}
function openSession() {
  const child = spawn('docker', psqlArgs(true), {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  let closed = false;
  let spawnError;
  let done;
  const exit = new Promise((resolve) => { done = resolve; });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.once('error', (error) => { spawnError = error; });
  child.once('close', (code) => { closed = true; done(code); });
  return { child, exit,
    get output() { return output; },
    get closed() { return closed; },
    get spawnError() { return spawnError; },
  };
}
async function waitForMarker(s, marker) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    if (s.output.includes(marker)) return;
    if (s.closed || s.spawnError) fail('session exited before ' + marker + ': ' + s.output);
    await sleep(25);
  }
  fail('timeout waiting for ' + marker);
}
async function waitForDatabaseLock(marker, s) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    if (s.closed || s.spawnError) fail('contender exited before lock: ' + s.output);
    const count = psql(
      'select count(*) from pg_catalog.pg_stat_activity ' +
      'where pid <> pg_catalog.pg_backend_pid() and state=' + quote('active') +
      ' and wait_event_type=' + quote('Lock') +
      ' and query like ' + quote('%' + marker + '%') + ';',
    );
    if (Number(count) > 0) return;
    await sleep(30);
  }
  fail('timeout waiting for contender lock: ' + marker);
}
async function waitForExit(s, label) {
  let timer;
  try {
    return await Promise.race([s.exit, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout: ' + label)), TIMEOUT);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
function adminSetup() {
  return [
    'set "request.jwt.claim.sub" = ' + quote(ADMIN) + ';',
    'set "request.jwt.claims" = ' +
      quote(JSON.stringify({ sub: ADMIN, role: 'authenticated' })) + ';',
    'set role authenticated;',
    "set statement_timeout='15s';",
  ].join('\n');
}
function stop(s) {
  if (s && !s.closed) s.child.kill();
}
async function runRace(label, firstSql, secondSql, marker, error, verify) {
  let first;
  let second;
  try {
    first = openSession();
    first.child.stdin.write(
      adminSetup() + '\nbegin;\n' + firstSql + ';\n\\echo MAP075_FIRST_DONE\n',
    );
    await waitForMarker(first, 'MAP075_FIRST_DONE');
    second = openSession();
    second.child.stdin.write(
      adminSetup() + '\nbegin;\n\\echo MAP075_SECOND_START\n' +
      '/* ' + marker + ' */ ' + secondSql + ';\n\\echo MAP075_SECOND_DONE\n',
    );
    await waitForMarker(second, 'MAP075_SECOND_START');
    await waitForDatabaseLock(marker, second);
    first.child.stdin.end('commit;\n\\q\n');
    if ((await waitForExit(first, label + ' first commit')) !== 0) {
      fail(label + ' first transaction failed: ' + first.output);
    }
    const code = await waitForExit(second, label + ' rejected contender');
    if (code === 0 || !error.test(second.output)) {
      fail(label + ' second transaction not rejected as expected: ' + second.output);
    }
    if (/deadlock detected/iu.test(first.output + second.output)) {
      fail(label + ' deadlock detected: ' + second.output);
    }
    if (psql(verify) !== 'true') fail(label + ' committed state violates invariant');
    console.log('ok - MAP-075 ' + label + ': serialized, no deadlock');
  } finally {
    stop(first);
    stop(second);
    await Promise.allSettled([first, second].filter(Boolean).map((s) => s.exit));
  }
}
function cleanup() {
  psql(
    'delete from public.entity_map_placements where entity_id=' + quote(ENTITY) + ';' +
    'delete from public.entity_player_dispositions where entity_id=' + quote(ENTITY) + ';' +
    'delete from public.entity_player_associations where entity_id=' + quote(ENTITY) + ';' +
    'delete from public.entity_tags where entity_id=' + quote(ENTITY) + ';' +
    'delete from public.map_entities where id=' + quote(ENTITY) + ';' +
    'delete from public.categories where id=' + quote(CATEGORY) + ';' +
    "update public.map_contexts set parent_id=null where id like 'map-map075-race-%';" +
    "delete from public.map_contexts where id like 'map-map075-race-%';",
  );
}
function fixtures() {
  psql(
    'insert into public.categories(campaign_id,id,slug,name,description,publication_status) ' +
    'values(' + quote(CAMPAIGN) + ',' + quote(CATEGORY) +
    ",'map075-race','MAP075 Race','','draft');" +
    'insert into public.map_entities' +
    ' (campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,x,y,category_id,publication_status)' +
    ' values(' + quote(CAMPAIGN) + ',' + quote(ENTITY) +
    ",'map075-race','character','pin','public','MAP075 Race','','',10,10," +
    quote(CATEGORY) + ",'draft');" +
    'insert into public.map_contexts(id,slug,name,width,height,publication_status) values ' +
    "('map-map075-race-a','map075-race-a','Cycle A',100,100,'draft')," +
    "('map-map075-race-b','map075-race-b','Cycle B',100,100,'draft')," +
    "('map-map075-race-pub','map075-race-pub','Publication',100,100,'published')," +
    "('map-map075-race-dims','map075-race-dims','Dimensions',100,100,'draft')," +
    "('map-map075-race-uniq','map075-race-uniq','Uniqueness',100,100,'draft');",
  );
}
async function main() {
  const running = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8', windowsHide: true,
  });
  if (running.error || running.status !== 0 ||
      !running.stdout.split(/\r?\n/u).includes(CONTAINER)) {
    fail('local Docker Supabase database is required');
  }
  cleanup();
  try {
    fixtures();
    await runRace(
      'crossed parent cycle',
      "update public.map_contexts set parent_id='map-map075-race-b' where id='map-map075-race-a'",
      "update public.map_contexts set parent_id='map-map075-race-a' where id='map-map075-race-b'",
      'map075-race-cycle', /map context hierarchy cycle/iu,
      "select (select parent_id from public.map_contexts where id='map-map075-race-a')='map-map075-race-b' " +
      "and (select parent_id is null from public.map_contexts where id='map-map075-race-b');",
    );
    await runRace(
      'published child versus parent unpublish',
      "update public.map_contexts set publication_status='draft' where id='map-map075-race-pub'",
      'insert into public.map_contexts(id,slug,name,parent_id,width,height,publication_status) ' +
      "values('map-map075-race-child','map075-race-child','Child','map-map075-race-pub',10,10,'published')",
      'map075-race-publish', /published context requires a published parent/iu,
      "select (select publication_status='draft' from public.map_contexts where id='map-map075-race-pub') " +
      "and not exists(select 1 from public.map_contexts where id='map-map075-race-child');",
    );
    const insert = (map) =>
      'insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry) ' +
      'values(' + quote(CAMPAIGN) + ',' + quote(map) + ',' + quote(ENTITY) +
      ", '{\"kind\":\"point\",\"coordinates\":{\"x\":50,\"y\":50}}'::jsonb)";
    await runRace(
      'dimension shrink versus insertion',
      insert('map-map075-race-dims'),
      "update public.map_contexts set width=20 where id='map-map075-race-dims'",
      'map075-race-resize', /map dimensions cannot change while placements exist/iu,
      "select (select width=100 from public.map_contexts where id='map-map075-race-dims') " +
      "and (select count(*)=1 from public.entity_map_placements where map_context_id='map-map075-race-dims');",
    );
    await runRace(
      'concurrent duplicate placement',
      insert('map-map075-race-uniq'), insert('map-map075-race-uniq'),
      'map075-race-duplicate', /duplicate key value violates unique constraint/iu,
      "select count(*)=1 from public.entity_map_placements where map_context_id='map-map075-race-uniq';",
    );
    console.log('MAP-075 PostgreSQL two-session concurrency: 4 scenarios PASS.');
  } finally {
    cleanup();
  }
}
await main();
