import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, from, to) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`MAP-064 contract patch anchor missing in ${path}`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`MAP-064 contract patch made no change in ${path}`);
  writeFileSync(path, next);
}

replaceOnce(
  'supabase/migrations/20260902111000_add_mission_hazard_lifecycle.sql',
  "source_entity.value || pg_catalog.jsonb_build_object('lifecycleStatus', entity.lifecycle_status)",
  "source_entity.value || pg_catalog.jsonb_build_object('lifecycle_status', entity.lifecycle_status)",
);

const testPath = 'supabase/tests/database/038_mission_hazard_lifecycle.test.sql';
replaceOnce(testPath, 'select plan(30);', 'select plan(31);');
replaceOnce(
  testPath,
  "  'authorized Master catalog returns mission and hazard with private audience'\n);\n\nselect * from finish();",
  "  'authorized Master catalog returns mission and hazard with private audience'\n);\nselect is(\n  (\n    select entity ->> 'lifecycle_status'\n    from pg_catalog.jsonb_array_elements(\n      public.admin_get_master_catalog_v6('00000000-0000-4000-8000-000000000053'::uuid) -> 'entities'\n    ) as entity\n    where entity ->> 'id' = 'entity-map064-master-mission'\n  ),\n  'active',\n  'authorized Master catalog exposes snake_case lifecycle_status expected by the client decoder'\n);\n\nselect * from finish();",
);

console.log('MAP-064 Master lifecycle wire contract fixed and regression added.');
