# INFRA #210 — Contrato explícito de Supabase Data API

Auditoría: 2026-10-21, proyecto `atlas-nuevos-dioses-prod` (`ehpouvbzmvwbkkoypgfa`).
Baseline: `a9e410e214f244c33d4330341ea703889aee5af4`.
Changelog: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
Guía: https://supabase.com/docs/guides/api/securing-your-api

## Regla innegociable para futuras migraciones

**RLS no sustituye GRANT.** `GRANT` permite alcanzar el objeto; RLS limita
las filas que se pueden leer o modificar una vez alcanzado. Una nueva tabla
`public` debe incluir **en la misma migración**:

1. `REVOKE` explícitos, cuando correspondan, para cerrar los permisos iniciales.
2. `GRANT` mínimos **por tabla y por columna**; nunca un `GRANT ... ON ALL TABLES`.
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
4. `CREATE POLICY` con autorización de fila y controles de escritura.

Para una función `public`, **revocar EXECUTE a PUBLIC** y concederlo
explícitamente solo a los roles consumidores; restringir `SECURITY DEFINER`
y fijar `search_path`. Para una secuencia nueva, conceder solo los
`USAGE`/`SELECT` necesarios, o no conceder nada. Revisar también
propiedad del objeto y los `DEFAULT PRIVILEGES` del rol que lo crea.

No añadir `service_role` por comodidad: puede saltarse RLS y no se usa
desde el frontend ni como consumidor Data API del producto. Cualquier caso
nuevo requiere prueba de consumidor real, mínimo privilegio y revisión de
seguridad antes de un `GRANT`. Nunca introducir secretos en `VITE_*`.

## Inventario y matriz efectiva de producción (lectura exclusivamente)

Snapshot de ACL obtenido de `pg_class`, `information_schema.role_table_grants`,
`information_schema.column_privileges`, `pg_proc`, `pg_default_acl` y
`pg_policies` el 2026-10-21. **Todos** los 20 objetos tabulares listados
tienen RLS activo. `SELECT` en esta tabla describe `GRANT`, no visibilidad
de filas; la matriz no sustituye la evaluación de RLS.

| Tabla `public` | anon SELECT | authenticated SELECT | authenticated DELETE |
|---|:---:|:---:|:---:|
| campaign_geographic_entity_links | sí | sí | sí |
| campaigns | sí | sí | no |
| categories | sí | sí | sí |
| character_location_events | sí | sí | sí |
| character_location_relations | no | sí | sí |
| entity_aliases | sí | sí | sí |
| entity_map_placements | sí | sí | sí |
| entity_player_associations | no | no | sí |
| entity_player_dispositions | sí | sí | no |
| entity_relations | no | no | sí |
| entity_tags | sí | sí | sí |
| geographic_name_aliases | sí | sí | sí |
| geographic_names | sí | sí | sí |
| map_contexts | sí | sí | sí |
| map_entities | sí | sí | sí |
| players | no | no | sí |
| public_note_tags | sí | sí | sí |
| public_notes | sí | sí | no |
| public_requests | no | sí | sí |
| tags | sí | sí | sí |

**Tablas:** `anon` no tiene INSERT, UPDATE ni DELETE.
`authenticated` no tiene INSERT ni UPDATE a nivel tabla: sus escrituras
permitidas son **por columna** y se limitan a usuarios autorizados mediante
RLS o RPC. `service_role` no tiene SELECT/INSERT/UPDATE/DELETE a nivel
tabla ni column-level writes en ninguna tabla. Actualmente **sí** conserva
`TRUNCATE`, `REFERENCES` y `TRIGGER` heredados sobre las tablas existentes;
esta migración no los modifica retroactivamente. Los defaults de nuevas
tablas los revocan.

**SELECT por columna sin SELECT de tabla:** `character_location_relations`
expone a `anon` solo `campaign_id,character_id,location_id,relation_status`;
`entity_player_associations` solo `campaign_id,entity_id,player_id`;
`entity_relations` solo `campaign_id,left_entity_id,left_label,right_entity_id,right_label`.
`authenticated` agrega `created_at` en asociaciones y relaciones.
`players` expone la proyección editorial pública, pero no SELECT de
tabla; la lista completa de 12 columnas figura en el test 042.
Estos son permisos SELECT por columna auténticos, no ausencia total de
lectura: una API puede leer las columnas permitidas. La matriz anterior
indica estrictamente **table-level** SELECT.

**Columnas INSERT/UPDATE para authenticated:** el contrato preciso, con
todas las columnas en orden canónico, vive en
`supabase/tests/database/042_infra210_explicit_data_api_grants.test.sql`.
Se comprueba mediante `information_schema.column_privileges`, y abarca
`map_entities`, `map_contexts`, `entity_map_placements`,
`campaigns`, `players`, `entity_relations`, `public_requests`
y las demás tablas. Las columnas de identidad, tiempos y campos derivados
mantienen las restricciones documentadas por MAP-014 a MAP-075.

**Funciones:** producción contiene 32 routines en `public`: 31 RPC del
producto más `rls_auto_enable()`, un event trigger de Supabase que no se
crea desde las migraciones versionadas y no aparece en el fresh reset local.
Las 31 RPC son ejecutables por `authenticated`, y solo
`begin_public_request_submission(uuid)`,
`submit_public_request_v3(...)` y
`create_public_player_note(...)` por `anon`.
Ninguna permite EXECUTE a `service_role` ni a `PUBLIC`. Existen 8
`SECURITY DEFINER` intencionales (moderación, solicitudes, notas,
autoactivación RLS) que se mantienen sin cambios. Sus controles de usuario
siguen en las suites de autorización y RLS existentes.

**Secuencias:** 0 en `public`. **Policies:** cada tabla tiene policies de
lectura/escritura específicas; los borradores y privados permanecen sujetos
a RLS. `private` no se expone en la configuración de Data API.

**Default ACL del owner `postgres` previo a #210:**

| Schema/objeto | Default ACL |
|---|---|
| public/tables | `postgres=arwdDxtm`, `service_role=Dxtm` |
| public/sequences | `postgres=rwU` |
| public/functions | `postgres=X` |

En `public`, `anon` y `authenticated` ya carecían de los CRUD
automáticos. Los defaults de `storage` son independientes: esta tarea
**no modifica** `storage`, `auth` ni los schemas internos.

## Decisiones de implementación

- La migración nueva contiene exclusivamente `ALTER DEFAULT PRIVILEGES`
  **para `postgres` en `public`** (salvo el revoke global de EXECUTE sobre funciones). Revoca todo acceso automático a
  tablas/secuencias para `anon`, `authenticated`, `service_role`; revoca
  EXECUTE automático a estos roles y `PUBLIC` para funciones.
- PostgreSQL 17 no permite retirar un EXECUTE heredado de `PUBLIC` mediante
  un REVOKE exclusivamente por schema: el REVOKE para funciones debe ser
  **global para el owner `postgres`**. Es una restricción real del motor
  ([referencia PostgreSQL](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)).
  Solo afecta a funciones **futuras** de ese owner en cualquier schema;
  las funciones existentes permanecen intactas. Las migraciones futuras
  de otros schemas deben declarar EXECUTE explícito si lo necesitan.
- **No** reescribe migraciones históricas, policies, RPC, datos canónicos,
  grants de objetos existentes ni el snapshot de producción.
- La revisión de las migraciones versionadas que crean objetos `public`
  encuentra concesiones específicas posteriores para la superficie
  que sigue expuesta; la suite de estado final falla si alguna faltase
  tras un fresh reset bajo el nuevo contrato.
- No existe evidencia de un cliente Data API que deba operar con
  `service_role`. Los scripts y workflows desplegados utilizan conexión
  PostgreSQL de operación, claves publicables o tokens autenticados, no
  un cliente Data API de servicio. No se otorga CRUD.
- La deuda E2E MAP-074/#208 está fuera de alcance.

## Verificación reproducible / ensayo del 30 de octubre

Usar un stack local con Docker, Node 22 y la CLI fijada en `package.json`:

```sh
npm ci
npx supabase --version
npx supabase --help
npx supabase db --help
npx supabase start
npm run supabase:db:validate
npm run supabase:db:test:infra210:http
npm run supabase:db:reset
npm run supabase:db:test
npx supabase migration list --local
npx supabase db lint --local --fail-on warning
```

El job `database` de `.github/workflows/ci.yml` ejecuta
`npm run supabase:db:validate`, que reconstruye la base
(`supabase db reset`) y lanza pgTAP.
Los ensayos históricos de actualización previos a ese reset ocultan
temporalmente **solo** la nueva migración INFRA-210 (con restauración
`finally`) porque validan checkpoints anteriores: esto evita que el
orden de aplicación del CLI altere su escenario. El reset completo
posterior sí aplica **todas** las migraciones, incluido INFRA-210, y
valida los nuevos defaults con las probes y el smoke HTTP. La prueba 042 reforzada tras la revisión independiente (27 aserciones):

- crea tabla, secuencia y función en `public` como `postgres`, sin
  `GRANT`, comprueba los **ocho derechos de tabla de PostgreSQL 17**,
  los tres de secuencia (**USAGE/SELECT/UPDATE**) y EXECUTE; hace `ROLLBACK`;
- compara los ocho permisos efectivos de las 20 tablas (conservando la
  excepción histórica Dxtm de `service_role`), los INSERT/UPDATE por columna
  y los SELECT efectivos de todas las columnas restringidas, incluyendo
  grants heredados de `PUBLIC`; además, comprueba **todos los privilegios
  INSERT/UPDATE efectivos por columna** de `anon` y `service_role`, incluso
  concesiones directas que no aparecen en los permisos de tabla.
  Fija también las **31 firmas completas de RPC**
  (con verificación independiente del hook opcional `rls_auto_enable()`);
- falla ante tablas/routines nuevas no catalogadas, permisos de tabla como
  `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` ampliados, exposiciones de
  columnas heredadas de `PUBLIC` y pérdida de permisos administrativos;
  mantiene RLS como segunda barrera.
- incluye pruebas de sensibilidad que conceden temporalmente
  `SELECT(created_at)` a `PUBLIC`, `TRUNCATE` a `anon` y `UPDATE` sobre una
  secuencia de prueba; se comprueba que los detectan los predicados de
  seguridad y se revocan antes del `ROLLBACK` final.
- incorpora dos casos de sensibilidad adicionales sobre el **mismo detector
  de escritura por columna**: `service_role INSERT(name)` y
  `anon UPDATE(description)` sobre `map_entities`, cada uno seguido de su
  revocación y comprobación de recuperación a cero.
- Los helpers `pg_temp` de las pruebas históricas reciben `EXECUTE`
  explícito y transaccional para `anon`/`authenticated`. No se alteran
  los defaults endurecidos ni los privilegios de las funciones del producto.

El HTTP smoke local comprueba lecturas públicas, endpoint sin GRANT
(`public_requests` para anon → `42501`), editor admin y bloqueo
no-admin mediante RLS. No escribe datos, ni en local ni en remoto.

## Prohibiciones y checkpoint

Durante PR #210: **PRODUCTION WRITES: 0**. No ejecutar migrations
alojadas, SQL Editor de producción, releases, merge ni deploy.
No modificar `public/data/public-catalog.snapshot.json`.
El merge y la migración remota esperan revisión independiente,
CI en verde sobre HEAD exacto y autorización humana.
