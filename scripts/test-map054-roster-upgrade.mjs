import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MAP053_BASELINE_VERSION = '20260825182000';
const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';

function fail(message) {
  throw new Error(`MAP-054 roster upgrade rehearsal failed: ${message}`);
}

function spawnCommand(command, argumentsList) {
  return spawnSync(command, argumentsList, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function printCommandOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function runCommand(command, argumentsList, description) {
  const result = spawnCommand(command, argumentsList);
  printCommandOutput(result);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${description} exited with status ${result.status ?? 'unknown'}`);
  }
}

function runCommandExpectFailure(command, argumentsList, description, expectedText) {
  const result = spawnCommand(command, argumentsList);
  printCommandOutput(result);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status === 0) fail(`${description} unexpectedly succeeded`);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (!output.includes(expectedText)) {
    fail(
      `${description} failed for an unexpected reason; expected output containing ${expectedText}`,
    );
  }
}

function findDatabaseContainer() {
  const result = spawnCommand('docker', ['ps', '--format', '{{.Names}}']);
  if (result.error) fail(`Docker could not be executed: ${result.error.message}`);
  if (result.status !== 0) fail(result.stderr.trim() || 'docker ps failed');
  const running = result.stdout.split(/\r?\n/u).filter(Boolean);
  if (!running.includes(DATABASE_CONTAINER)) {
    fail(`Expected running local database container ${DATABASE_CONTAINER}.`);
  }
  return DATABASE_CONTAINER;
}

function runPsql(containerName, sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
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
      '--command',
      sql,
    ],
    { encoding: 'utf8', windowsHide: true },
  );

  printCommandOutput(result);
  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) fail(result.stderr.trim() || 'psql failed');
  return result.stdout.trim();
}

function resetToMap053() {
  runCommand(
    NPX_COMMAND,
    [
      '--no-install',
      'supabase',
      'db',
      'reset',
      '--local',
      '--version',
      MAP053_BASELINE_VERSION,
      '--no-seed',
    ],
    'resetting to the MAP-053 baseline',
  );
  return findDatabaseContainer();
}

function historicCategorySql() {
  return `insert into public.categories (
    campaign_id, id, slug, name, description, publication_status
  ) values (
    '${INITIAL_CAMPAIGN_ID}', 'category-map054-upgrade', 'map054-upgrade',
    'MAP054 Upgrade', 'Historic roster upgrade fixture', 'published'
  );`;
}

function historicCharacterValues(names) {
  return names
    .map((name, index) => {
      const slug = `${name.toLowerCase()}-${index + 1}`;
      return `(
        '${INITIAL_CAMPAIGN_ID}', 'entity-${slug}', '${slug}', 'character', 'pin', 'public',
        '${name}', 'en', 'Historic ${name}', 'Historic ${name}', ${800 + index * 100}, 700,
        'category-map054-upgrade', 'published'
      )`;
    })
    .join(',\n');
}

function runDamagedUpgradeScenario(description, setupSql, expectedText) {
  const containerName = resetToMap053();
  runPsql(containerName, setupSql);
  runCommandExpectFailure(
    NPX_COMMAND,
    ['--no-install', 'supabase', 'migration', 'up', '--local'],
    description,
    expectedText,
  );
}

const incompleteMessage =
  'MAP-054 historic campaign content requires the complete three-character Skade/Ura/Veyra source';

runDamagedUpgradeScenario(
  'rejecting a non-empty historic campaign with zero expected roster names',
  `${historicCategorySql()}
   insert into public.map_entities (
     campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
     summary, description, x, y, category_id, publication_status
   ) values (
     '${INITIAL_CAMPAIGN_ID}', 'entity-other-hero', 'other-hero', 'character', 'pin', 'public',
     'Other Hero', 'en', 'Historic other hero', 'Historic other hero', 750, 700,
     'category-map054-upgrade', 'published'
   );`,
  incompleteMessage,
);

for (const names of [['Skade'], ['Skade', 'Ura']]) {
  runDamagedUpgradeScenario(
    `rejecting an incomplete ${names.length}/3 historic roster`,
    `${historicCategorySql()}
     insert into public.map_entities (
       campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
       summary, description, x, y, category_id, publication_status
     ) values
       ${historicCharacterValues(names)};`,
    incompleteMessage,
  );
}

runDamagedUpgradeScenario(
  'rejecting duplicate historic roster sources',
  `${historicCategorySql()}
   insert into public.map_entities (
     campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
     summary, description, x, y, category_id, publication_status
   ) values
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-skade-published', 'skade-published', 'character', 'pin',
       'public', 'Skade', 'en', 'Historic Skade', 'Historic Skade', 800, 700,
       'category-map054-upgrade', 'published'
     ),
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-skade-draft', 'skade-draft', 'character', 'pin',
       'public', 'Skade', 'en', 'Historic duplicate Skade', 'Historic duplicate Skade', 850, 700,
       'category-map054-upgrade', 'draft'
     ),
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-ura-duplicate-case', 'ura-duplicate-case', 'character', 'pin',
       'public', 'Ura', 'en', 'Historic Ura', 'Historic Ura', 900, 700,
       'category-map054-upgrade', 'published'
     ),
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-veyra-duplicate-case', 'veyra-duplicate-case', 'character',
       'pin', 'public', 'Veyra', 'en', 'Historic Veyra', 'Historic Veyra', 1000, 700,
       'category-map054-upgrade', 'published'
     );`,
  incompleteMessage,
);

runDamagedUpgradeScenario(
  'rejecting ambiguous existing roster associations',
  `${historicCategorySql()}
   insert into public.map_entities (
     campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
     summary, description, x, y, category_id, publication_status
   ) values
     ${historicCharacterValues(['Skade', 'Ura', 'Veyra'])};
   insert into public.players (
     campaign_id, id, slug, display_name, name_language, publication_status
   ) values
     ('${INITIAL_CAMPAIGN_ID}', 'player-skade-by-name', 'other-skade', 'Skade', 'en', 'published'),
     ('${INITIAL_CAMPAIGN_ID}', 'player-skade-by-slug', 'skade', 'Another Hero', 'en', 'published');`,
  'MAP-054 found ambiguous existing roster rows for Skade',
);

const containerName = resetToMap053();

runPsql(
  containerName,
  `${historicCategorySql()}

   insert into public.map_entities (
     campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
     summary, description, x, y, category_id, publication_status
   ) values
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-skade', 'skade', 'character', 'pin', 'public',
       'Skade', 'en', 'Historic Skade', 'Historic Skade', 800, 700,
       'category-map054-upgrade', 'published'
     ),
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-ura', 'ura', 'character', 'pin', 'public',
       'Ura', 'en', 'Historic Ura', 'Historic Ura', 900, 700,
       'category-map054-upgrade', 'published'
     ),
     (
       '${INITIAL_CAMPAIGN_ID}', 'entity-request-07d26371bbff42d9b91e076d099891b0',
       'request-07d26371bbff42d9b91e076d099891b0', 'character', 'pin', 'public',
       'Veyra', 'en', 'Historic Veyra', 'Historic Veyra', 1000, 700,
       'category-map054-upgrade', 'published'
     );

   insert into public.players (
     campaign_id, id, slug, display_name, name_language, publication_status,
     created_at, updated_at
   ) values (
     '${INITIAL_CAMPAIGN_ID}', 'player-skade-existing', 'skade', 'Skade', 'en', 'published',
     '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'
   );

   alter table public.entity_player_dispositions disable trigger "90_entity_player_disposition_updated_at";
   update public.entity_player_dispositions
   set disposition = case entity_id
       when 'entity-ura' then 'ally'::public.player_disposition
       when 'entity-request-07d26371bbff42d9b91e076d099891b0' then 'enemy'::public.player_disposition
       else 'neutral'::public.player_disposition
     end,
     updated_at = '2026-07-02T00:00:00Z'
   where player_id = 'player-skade-existing';
   alter table public.entity_player_dispositions enable trigger "90_entity_player_disposition_updated_at";`,
);

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-054 migrations to the complete historic fixture',
);

runPsql(
  containerName,
  `do $$
   declare
     initial_campaign uuid := '${INITIAL_CAMPAIGN_ID}'::uuid;
   begin
     if (select count(*) from public.players
         where campaign_id = initial_campaign
           and lower(display_name) in ('skade', 'ura', 'veyra')) <> 3 then
       raise exception 'historic roster was not materialised exactly once';
     end if;

     if not exists (
       select 1 from public.players
       where id = 'player-skade-existing'
         and campaign_id = initial_campaign
         and slug = 'skade'
         and display_name = 'Skade'
         and publication_status = 'published'
         and display_order = 0
         and accent_color = '#c2410c'
         and created_at = '2026-06-01T00:00:00Z'::timestamptz
     ) then
       raise exception 'existing Skade roster identity/history was not reused';
     end if;

     if not exists (
       select 1 from public.players
       where id = 'player-ura'
         and campaign_id = initial_campaign
         and slug = 'ura'
         and display_name = 'Ura'
         and display_order = 1
         and accent_color = '#1e3a8a'
         and publication_status = 'published'
     ) then
       raise exception 'Ura roster row was not migrated correctly';
     end if;

     if not exists (
       select 1 from public.players
       where id = 'player-veyra'
         and campaign_id = initial_campaign
         and slug = 'veyra'
         and display_name = 'Veyra'
         and display_order = 2
         and accent_color = '#9d174d'
         and publication_status = 'published'
     ) then
       raise exception 'Veyra roster row was not migrated correctly';
     end if;

     if (select count(*) from public.entity_player_dispositions
         where campaign_id = initial_campaign
           and player_id in ('player-skade-existing', 'player-ura', 'player-veyra')
           and entity_id in (
             'entity-skade',
             'entity-ura',
             'entity-request-07d26371bbff42d9b91e076d099891b0'
           )) <> 9 then
       raise exception 'roster disposition matrix is incomplete after migration';
     end if;

     if not exists (
       select 1 from public.entity_player_dispositions
       where player_id = 'player-skade-existing'
         and entity_id = 'entity-ura'
         and disposition = 'ally'
         and updated_at = '2026-07-02T00:00:00Z'::timestamptz
     ) or not exists (
       select 1 from public.entity_player_dispositions
       where player_id = 'player-skade-existing'
         and entity_id = 'entity-request-07d26371bbff42d9b91e076d099891b0'
         and disposition = 'enemy'
         and updated_at = '2026-07-02T00:00:00Z'::timestamptz
     ) then
       raise exception 'existing Skade dispositions/history changed during migration';
     end if;

     if exists (
       select 1 from public.entity_player_dispositions
       where player_id in ('player-ura', 'player-veyra')
         and disposition <> 'neutral'
     ) then
       raise exception 'new roster members were not initialised neutrally';
     end if;
   end;
   $$;`,
);

console.log(
  'MAP-054 roster upgrade rehearsal passed, including damaged-upgrade fail-closed scenarios.',
);
