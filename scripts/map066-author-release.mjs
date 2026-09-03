import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RELEASE_VERSION = '1.1.0';
const RELEASE_LABEL = 'v1.1';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function replace(path, from, to) {
  const source = read(path);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`Expected replacement not found in ${path}`);
  write(path, next);
}

function appendOnce(path, marker, content) {
  const source = read(path);
  if (source.includes(marker)) return;
  appendFileSync(path, `\n${content.trim()}\n`, 'utf8');
}

const packageJson = JSON.parse(read('package.json'));
packageJson.version = RELEASE_VERSION;
packageJson.scripts['verify:release-version'] = 'node scripts/verify-release-version.mjs';
packageJson.scripts['supabase:db:test:map066:upgrade'] = 'node scripts/test-map066-v1-v1-rehearsal.mjs';
packageJson.scripts['supabase:db:validate'] = packageJson.scripts['supabase:db:validate'].replace(
  'npm run supabase:db:test:map053:upgrade && ',
  'npm run supabase:db:test:map066:upgrade && ',
);
write('package.json', JSON.stringify(packageJson, null, 2));

replace('src/app/renderApp.ts', /v1\.0/g, RELEASE_LABEL);
replace('tests/deployment/pages-smoke.spec.ts', /v1\.0/g, RELEASE_LABEL);

write(
  'scripts/verify-release-version.mjs',
  `import { readFileSync } from 'node:fs';\n\nconst expectedVersion = '${RELEASE_VERSION}';\nconst expectedLabel = '${RELEASE_LABEL}';\nconst packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));\nconst packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));\nconst renderApp = readFileSync(new URL('../src/app/renderApp.ts', import.meta.url), 'utf8');\nconst pagesSmoke = readFileSync(new URL('../tests/deployment/pages-smoke.spec.ts', import.meta.url), 'utf8');\nconst projectStatus = readFileSync(new URL('../docs/project-status.md', import.meta.url), 'utf8');\n\nfunction assert(condition, message) {\n  if (!condition) throw new Error(\`MAP-066 release version verification failed: \${message}\`);\n}\n\nassert(packageJson.version === expectedVersion, \`package.json must be \${expectedVersion}\`);\nassert(packageLock.version === expectedVersion, \`package-lock.json root must be \${expectedVersion}\`);\nassert(packageLock.packages?.['']?.version === expectedVersion, \`package-lock.json package root must be \${expectedVersion}\`);\nassert(renderApp.includes(\`release-badge\\\">\${expectedLabel}<\`), \`UI badge must declare \${expectedLabel}\`);\nassert(renderApp.includes(\`Faerûn · \${expectedLabel}\`), \`UI eyebrow must declare \${expectedLabel}\`);\nassert(!renderApp.includes('release-badge\\\">v1.0<'), 'UI badge must not retain v1.0 as current release');\nassert(pagesSmoke.includes(expectedLabel), 'Pages smoke must assert the current release label');\nassert(projectStatus.includes(expectedVersion) && projectStatus.includes(expectedLabel), 'project status must declare both semantic and UI versions');\n\nconsole.log(\`MAP-066 release version verification passed: \${expectedVersion} / \${expectedLabel}.\`);\n`,
);

write(
  'scripts/test-map066-v1-v1-rehearsal.mjs',
  `import { spawnSync } from 'node:child_process';\n\nconst DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';\nconst NODE_COMMAND = process.execPath;\n\nfunction fail(message) {\n  throw new Error(\`MAP-066 v1.0 → v1.1 rehearsal failed: \${message}\`);\n}\n\nfunction run(command, args, description) {\n  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });\n  if (result.stdout) process.stdout.write(result.stdout);\n  if (result.stderr) process.stderr.write(result.stderr);\n  if (result.error) fail(\`\${description}: \${result.error.message}\`);\n  if (result.status !== 0) fail(\`\${description} exited with status \${result.status ?? 'unknown'}\`);\n  return result.stdout.trim();\n}\n\nrun(NODE_COMMAND, ['scripts/test-map053-v1-upgrade.mjs'], 'running the exact v1.0 baseline upgrade fixture');\n\nconst sql = String.raw\`\nwith checks as (\n  select\n    (select count(*) from public.campaigns) = 1 as one_campaign,\n    exists (select 1 from public.campaigns where id = '00000000-0000-4000-8000-000000000053' and slug = 'castigo-divino' and status = 'active') as initial_campaign_preserved,\n    exists (select 1 from public.map_entities where id = 'entity-map053-upgrade-character' and slug = 'map053-upgrade-character' and x = 1200 and y = 800 and portrait_path = 'portraits/11111111-1111-4111-8111-111111111111.png' and audience = 'public' and publication_status = 'published' and created_at = '2026-06-01T00:03:00Z'::timestamptz and updated_at = '2026-07-02T00:03:00Z'::timestamptz) as public_entity_identity_preserved,\n    exists (select 1 from public.map_entities where id = 'entity-map053-upgrade-location' and slug = 'map053-upgrade-location' and x = 1300 and y = 900 and audience = 'master' and publication_status = 'published' and created_at = '2026-06-01T00:04:00Z'::timestamptz and updated_at = '2026-07-02T00:04:00Z'::timestamptz) as master_entity_identity_preserved,\n    not exists (select 1 from public.map_entities where campaign_id is null or geometry is null) as scoped_entities_complete,\n    not exists (select 1 from public.map_entities where geometry->>'kind' = 'point' and (((geometry->'coordinates'->>'x')::double precision <> x) or ((geometry->'coordinates'->>'y')::double precision <> y)) as point_geometry_matches_legacy_coordinates,\n    exists (select 1 from public.entity_aliases where entity_id = 'entity-map053-upgrade-character') as aliases_preserved,\n    exists (select 1 from public.entity_tags where entity_id = 'entity-map053-upgrade-character' and tag_id = 'map053-upgrade-tag') as tags_preserved,\n    exists (select 1 from public.entity_player_dispositions where entity_id = 'entity-map053-upgrade-character' and player_id = 'player-map053-upgrade' and disposition = 'ally') as dispositions_preserved,\n    exists (select 1 from public.character_location_relations where character_id = 'entity-map053-upgrade-character' and location_id = 'entity-map053-upgrade-location') as relations_preserved,\n    exists (select 1 from public.character_location_events where character_id = 'entity-map053-upgrade-character' and location_id = 'entity-map053-upgrade-location') as history_preserved,\n    exists (select 1 from public.public_notes where entity_id = 'entity-map053-upgrade-character') as notes_preserved,\n    exists (select 1 from public.public_note_tags pnt join public.public_notes pn on pn.id = pnt.note_id where pn.entity_id = 'entity-map053-upgrade-character') as note_tags_preserved,\n    exists (select 1 from public.public_requests where id = '20000000-0000-4000-8000-000000000053' and converted_entity_id = 'entity-request-20000000000040008000000000000053') as converted_request_preserved,\n    (select count(*) from public.map_entities where id in ('entity-map053-upgrade-character','entity-map053-upgrade-location','entity-skade','entity-ura','entity-request-07d26371bbff42d9b91e076d099891b0')) = 5 as no_entity_duplication,\n    (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='entity_type' and e.enumlabel in ('character','location','mission','hazard')) = 4 as v11_entity_types_available\n)\nselect to_jsonb(checks)::text from checks;\n\`;

const raw = run('docker', ['exec', '--user', 'postgres', DATABASE_CONTAINER, 'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--quiet', '--tuples-only', '--no-align', '--command', sql], 'checking current v1.1 invariants');\nconst result = JSON.parse(raw.split(/\\r?\\n/u).filter(Boolean).at(-1));\nconst failures = Object.entries(result).filter(([, ok]) => ok !== true).map(([name]) => name);\nif (failures.length) fail(\`failed invariants: \${failures.join(', ')}\`);\nconsole.log(\`MAP-066 v1.0 → v1.1 rehearsal passed: \${Object.keys(result).length} cross-release invariants, zero manual recreation.\`);\n`,
);

const releaseDoc = `# MAP-066 — Release v1.1\n\n## Propósito\n\nMAP-066 es el gate transversal de v1.1. Parte del baseline estable v1.0, valida la cadena MAP-052→MAP-065, ensaya la migración completa sin recreación manual, revalida aislamiento multicampaña/Modo Máster/notas públicas, y deja el frontend preparado para publicar 1.1.0.\n\n## Baseline y dependencias\n\nBaseline fijado al comenzar: \`9d71d845307481c646fd2c457e8249e94f963ba7\` (master posterior a MAP-065). MAP-052→MAP-065 se consideran satisfechas únicamente cuando su issue está cerrada y su PR/follow-up está integrada en la historia de master. El gate de MAP-066 conserva como evidencia las suites acumuladas, no sustituye sus tests por una lista manual.\n\n## Rehearsal v1.0 → v1.1\n\n\`npm run supabase:db:test:map066:upgrade\` parte del último baseline SQL de v1.0 (\`20260811213000\`) mediante el fixture determinista de MAP-053, aplica en orden todas las migraciones posteriores del repositorio y comprueba el estado final de v1.1. El dataset incluye campaña inicial, entidades públicas/Máster, IDs/slugs, coordenadas, retrato/Storage path, categoría/tag/alias, roster/disposiciones, relaciones e historial, notas/tags de nota, solicitud moderada y \`converted_entity_id\`, además de timestamps históricos. MAP-066 añade comprobación explícita de geometría point derivada sin alterar X/Y, ausencia de duplicados y disponibilidad de los tipos v1.1. El resultado aceptable es cero pérdida, duplicación, regeneración de IDs/slugs o recreación manual.\n\n## Matriz multicampaña\n\nLa fixture de E2E mantiene campañas A/B con contenido distinto. La suite completa cubre selector, pines, búsqueda, filtros, notas, relaciones, disposiciones, geografía global compartida, solicitudes A→A/B→B, negativas cross-campaign, URL/deep links, Back/Forward, reload y snapshot degradado. Las regresiones de Modo Máster cubren purga síncrona A→B y respuestas privadas obsoletas.\n\n## Seguridad\n\nLa release no introduce nuevas RLS, grants, RPC, functions, policies, Storage ni autenticación por sí misma. El checkpoint humano revisa el diff sensible acumulado de MAP-053, MAP-056, MAP-063 y MAP-064 y cualquier corrección nueva que pudiera aparecer. La CI ejecuta pgTAP/RLS, negativas anon/authenticated-no-admin/admin, Storage HTTP, concurrencia y auditoría de artifact/snapshot para evitar canarios Máster.\n\nLa autoría de notas públicas de jugador expresa una identidad declarada del roster de campaña; no equivale a un login criptográficamente verificado del jugador. La RPC cerrada y RLS siguen siendo la frontera de escritura pública.\n\n## Snapshot y degradación\n\nEl snapshot público versionado sigue siendo fallback de solo lectura. La suite cubre backend disponible, lento/caído, recuperación, selector de campaña, capas/filtros/notas y ausencia de escrituras simuladas. Recuperar Supabase no debe cambiar la campaña seleccionada ni duplicar entidades. No existe snapshot privado persistente.\n\n## Rendimiento\n\nSe comparan las métricas reproducibles de \`npm run report:build\` con el baseline de master y se inspeccionan las suites de clustering, regiones, retratos, campaña y capas. Cualquier regresión material debe justificarse o corregirse antes del checkpoint.\n\n## Versionado\n\n- paquete/aplicación: **1.1.0**;\n- badge visible: **v1.1**;\n- \`npm run verify:release-version\` impide divergencia entre package, lockfile, UI, smoke y estado documental.\n\n## Deploy y rollback\n\nEl frontend se integra mediante PR normal y Pages despliega únicamente el SHA de master cuya CI termina verde. Un rollback de frontend usa \`git revert\` en una nueva PR; no se reescribe master. Las migraciones de base de datos ya aplicadas nunca se revierten ni se renombran: cualquier corrección de DB se realiza con una nueva migración forward-only. MAP-066 no debe volver a empujar migraciones históricas cuyo timestamp remoto difiera del nombre local; se compara por cambio ya desplegado y se añade una nueva migración solo si existe un delta real.\n\n## Gate humano\n\nAntes de Ready/merge/deploy final se presenta una única revisión humana con: cambios sensibles acumulados, pgTAP/RLS, rehearsal, aislamiento multicampaña, purga Máster A→B, riesgos, deploy, rollback frontend y estrategia DB forward-only. Hasta esa aprobación la PR permanece Draft.\n`;
write('docs/map-066-release.md', releaseDoc);

appendOnce(
  'README.md',
  '## Release v1.1',
  `## Release v1.1\n\nLa versión estable preparada por MAP-066 es **v1.1 (1.1.0)**. Consolida el dominio multicampaña, selector y aislamiento por campaña, roster/asociaciones/disposiciones, clustering y spiderfy, geometría persistente y regiones, ficha desktop, notas públicas con autoría declarada, misiones/peligros y control de capas. El contrato de validación y migración sin pérdida está en [docs/map-066-release.md](docs/map-066-release.md). La documentación histórica de v1.0 y Beta permanece intacta.`,
);

appendOnce(
  'docs/project-status.md',
  '## Estado v1.1 — MAP-066',
  `## Estado v1.1 — MAP-066\n\nMAP-066 promueve el baseline posterior a MAP-065 a **v1.1 (1.1.0)** una vez superados rehearsal, seguridad, CI, checkpoint humano, merge y Pages. La fuente canónica de versión sigue siendo \`package.json\`; el badge público usa \`v1.1\` y \`npm run verify:release-version\` comprueba coherencia con lockfile, UI, smoke y este documento. Las secciones anteriores de v1.0 se conservan como evidencia histórica del baseline de partida.`,
);

appendOnce(
  'docs/architecture.md',
  '## Extensión v1.1',
  `## Extensión v1.1\n\nSobre la arquitectura heredada de v1.0, v1.1 añade campaña como dimensión persistente, catálogo público particionado por campaña con geografía global compartida, catálogo Máster efímero scopeado en backend, geometría canónica \`point | polygon\`, tipos misión/peligro con lifecycle propio y capas de presentación no persistentes. El cambio de campaña purga primero estado privado y solo después carga el catálogo autorizado del nuevo scope.`,
);

appendOnce(
  'docs/data-model.md',
  '## Modelo consolidado v1.1',
  `## Modelo consolidado v1.1\n\nEl modelo v1.1 conserva IDs/slugs históricos y añade \`campaign_id\` a los dominios dependientes de campaña, roster de jugadores, asociaciones narrativas, geometría JSON canónica y lifecycle de misión/peligro. La geografía física permanece global. Las relaciones cross-campaign se impiden en PostgreSQL mediante constraints/FKs compuestas y RLS. El rehearsal de MAP-066 valida que el upgrade desde el último baseline v1.0 no recrea contenido.`,
);

appendOnce(
  'docs/security.md',
  '## Gate transversal de seguridad v1.1',
  `## Gate transversal de seguridad v1.1\n\nMAP-066 revalida anon, authenticated no-admin y admin; catálogo público/Máster; campañas A/B; snapshot/artifact; Storage de retratos; logout/expiración/401/403; y escritura pública de notas. Modo Máster nunca debe mezclar secretos entre campañas: A se purga de memoria/DOM/búsqueda/fichas antes de solicitar B. La autoría pública de jugador es declarada, no una autenticación del jugador; la RPC cerrada valida pertenencia a campaña y mantiene la identidad Máster fuera del alcance anónimo.`,
);

appendOnce(
  'docs/deployment-and-rollback.md',
  '## Release v1.1 / MAP-066',
  `## Release v1.1 / MAP-066\n\nEl release final exige CI verde del candidato, checkpoint humano, merge protegido por head SHA, CI verde de master, verificación remota del snapshot, Pages y smoke publicado sobre el mismo SHA. El rollback de frontend se realiza con una nueva PR de \`git revert\`. La base de datos usa exclusivamente correcciones forward-only: no se reescriben ni renombran migraciones ya aplicadas y no se ejecuta un rollback destructivo de esquema/datos.`,
);

appendOnce(
  'docs/public-data-resilience.md',
  '## Matriz degradada v1.1',
  `## Matriz degradada v1.1\n\nEl snapshot v1.1 debe conservar selector multicampaña, geografía global, entidades/regiones/misiones/peligros públicos, notas, filtros y capas. El fallback es de solo lectura: una escritura nunca se presenta como exitosa si Supabase está offline. La recuperación mantiene la campaña elegida, evita duplicados y nunca reutiliza secretos Máster de una campaña anterior si falla temporalmente la carga privada de la nueva.`,
);

appendOnce(
  'docs/supabase-operations.md',
  '## Política de migración para v1.1',
  `## Política de migración para v1.1\n\nMAP-066 trata el historial remoto como evidencia de despliegue, no como una invitación a renombrar SQL histórico. Algunas migraciones v1.1 se aplicaron previamente mediante la API de Supabase con versiones remotas distintas del timestamp del filename conservado en Git; sus nombres funcionales/esquema ya están desplegados. No se reescribe \`supabase_migrations\` ni se hace un \`db push\` ciego para “alinear” timestamps. Cualquier corrección futura se implementa como una migración nueva, forward-only, después de comparar el delta real.`,
);

const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--package-lock-only', '--ignore-scripts'], { encoding: 'utf8', windowsHide: true });
if (install.stdout) process.stdout.write(install.stdout);
if (install.stderr) process.stderr.write(install.stderr);
if (install.error || install.status !== 0) throw new Error(`Unable to refresh package-lock.json: ${install.error?.message ?? install.status}`);

for (const path of ['scripts/map066-author-release.mjs', '.github/workflows/map066-author-release.yml']) {
  if (existsSync(path)) unlinkSync(path);
}
