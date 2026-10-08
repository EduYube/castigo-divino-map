import { spawnSync } from 'node:child_process';
import { renameSync } from 'node:fs';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MAP053_BASELINE_VERSION = '20260825182000';
const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const MAP068_MIGRATION = new URL(
  '../supabase/migrations/20261007080000_separate_veyra_un_aliento_menos.sql',
  import.meta.url,
);
const MAP068_HIDDEN = new URL(
  '../supabase/migrations/20261007080000_separate_veyra_un_aliento_menos.sql.rehearsal-hidden',
  import.meta.url,
);

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

renameSync(MAP068_MIGRATION, MAP068_HIDDEN);
try {
  runCommand(
    NPX_COMMAND,
    ['--no-install', 'supabase', 'migration', 'up', '--local'],
    'applying MAP-054 migrations through the pre-MAP-068 checkpoint',
  );
} finally {
  renameSync(MAP068_HIDDEN, MAP068_MIGRATION);
}

runPsql(
  containerName,
  `
   -- MAP-054's complete historic fixture predates the real production request
   -- and full disposition inventory. Normalize only this local rehearsal to the
   -- audited pre-MAP-068 checkpoint before testing the campaign split.

   insert into auth.users (id)
   values ('00000000-0000-4000-8000-000000000068')
   on conflict (id) do nothing;

   alter table public.map_entities disable trigger "60_map_entity_identifier";
   alter table public.map_entities disable trigger "70_map_entity_reserve";

   insert into public.map_entities (
     campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
     summary, description, x, y, category_id, publication_status
   )
   select
     '${INITIAL_CAMPAIGN_ID}'::uuid,
     source.id,
     'map054-' || source.ordinal,
     'character'::public.entity_type,
     'pin'::public.map_visibility,
     'public'::public.entity_audience,
     'MAP054 Veyra peer ' || source.ordinal,
     'en',
     '',
     'Synthetic audited pre-MAP-068 compatibility fixture',
     1500 + source.ordinal,
     1000 + source.ordinal,
     (select category_id
      from public.map_entities
      where id = 'entity-request-07d26371bbff42d9b91e076d099891b0'),
     'published'::public.publication_status
   from (
     values
       ('entity-agamen', 1),
       ('entity-asentamiento-thar', 2),
       ('entity-bring', 3),
       ('entity-captitan', 4),
       ('entity-jhonny', 5),
       ('entity-masred', 6),
       ('entity-memnon', 7),
       ('entity-myrath', 8),
       ('entity-ojos-tempestad', 9),
       ('entity-thalasis', 10),
       ('entity-thar', 11),
       ('entity-tulu', 12),
       ('place-demo-harbor', 13),
       ('place-demo-pass', 14)
   ) as source(id, ordinal)
   on conflict (id) do nothing;

   alter table public.map_entities enable trigger "60_map_entity_identifier";
   alter table public.map_entities enable trigger "70_map_entity_reserve";

   alter table public.public_requests disable trigger "20_validate_public_request";
   insert into public.public_requests (
     id, campaign_id, sender_name, proposed_name, entity_type, x, y, description, reason,
     request_status, moderator_user_id, converted_entity_id, moderated_at
   ) values (
     '07d26371-bbff-42d9-b91e-076d099891b0',
     '${INITIAL_CAMPAIGN_ID}',
     'Veyra la Grandiosa',
     'Veyra',
     'character',
     1438.727724022,
     1837.31274570082,
     'Posición inicial Veyra (dudo entre neverwinter y lidian)',
     'Inicio partida picara',
     'converted',
     '00000000-0000-4000-8000-000000000068',
     'entity-request-07d26371bbff42d9b91e076d099891b0',
     pg_catalog.now()
   )
   on conflict (id) do update set
     campaign_id = excluded.campaign_id,
     request_status = excluded.request_status,
     moderator_user_id = excluded.moderator_user_id,
     converted_entity_id = excluded.converted_entity_id,
     moderated_at = excluded.moderated_at;
   alter table public.public_requests enable trigger "20_validate_public_request";

   delete from public.entity_player_dispositions
   where player_id = 'player-veyra'
      or entity_id = 'entity-request-07d26371bbff42d9b91e076d099891b0';

   insert into public.entity_player_dispositions (
     entity_id, player_id, campaign_id, disposition
   ) values
     ('entity-agamen', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-asentamiento-thar', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-bring', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-captitan', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-jhonny', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-masred', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-memnon', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-myrath', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-ojos-tempestad', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-request-07d26371bbff42d9b91e076d099891b0', 'player-skade', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-request-07d26371bbff42d9b91e076d099891b0', 'player-ura', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-request-07d26371bbff42d9b91e076d099891b0', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-skade', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-thalasis', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-thar', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-tulu', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('entity-ura', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('place-demo-harbor', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral'),
     ('place-demo-pass', 'player-veyra', '${INITIAL_CAMPAIGN_ID}', 'neutral');
  `,
);

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-068 after the complete historic roster checkpoint',
);

runPsql(
  containerName,
  `do $$
   declare
     initial_campaign uuid := '${INITIAL_CAMPAIGN_ID}'::uuid;
     veyra_campaign uuid := '00000000-0000-4000-8000-000000000068'::uuid;
     veyra_entity text := 'entity-request-07d26371bbff42d9b91e076d099891b0';
   begin
     if (select count(*) from public.players
         where lower(display_name) in ('skade', 'ura', 'veyra')) <> 3 then
       raise exception 'historic roster identities were not materialised exactly once';
     end if;

     if (select count(*) from public.players
         where campaign_id = initial_campaign
           and lower(display_name) in ('skade', 'ura')) <> 2
        or exists (
          select 1 from public.players
          where campaign_id = initial_campaign and lower(display_name) = 'veyra'
        ) then
       raise exception 'MAP-068 did not leave the historic Castigo Divino roster as Skade/Ura';
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
         and campaign_id = veyra_campaign
         and slug = 'veyra'
         and display_name = 'Veyra'
         and display_order = 0
         and accent_color = '#9d174d'
         and publication_status = 'published'
         and character_entity_id = veyra_entity
     ) then
       raise exception 'Veyra roster identity was not preserved in Un aliento menos';
     end if;

     if not exists (
       select 1 from public.map_entities
       where id = veyra_entity
         and campaign_id = veyra_campaign
         and name = 'Veyra'
     ) then
       raise exception 'Veyra entity identity was not preserved in Un aliento menos';
     end if;

     if not exists (
       select 1 from public.entity_player_dispositions
       where campaign_id = initial_campaign
         and player_id = 'player-skade-existing'
         and entity_id = 'entity-ura'
         and disposition = 'ally'
         and updated_at = '2026-07-02T00:00:00Z'::timestamptz
     ) then
       raise exception 'existing same-campaign Skade disposition/history changed during migration';
     end if;

     if exists (
       select 1 from public.entity_player_dispositions
       where player_id = 'player-veyra'
          or entity_id = veyra_entity
     ) then
       raise exception 'Veyra dispositions that became cross-campaign/self survived MAP-068';
     end if;
   end;
   $$;`,
);

console.log(
  'MAP-054 roster upgrade rehearsal passed, including damaged-upgrade fail-closed scenarios.',
);
