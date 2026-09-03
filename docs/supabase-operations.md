# Operación de Supabase para Beta 0.2

## Propósito

Este documento define el flujo reproducible y seguro para desarrollar, validar, desplegar y recuperar la base de datos de Beta 0.2. Complementa `docs/architecture.md`, `docs/data-model.md`, `docs/security.md` y los ADR 0002 a 0005.

MAP-014 prepara el stack local, la validación automática y el aprovisionamiento controlado del único proyecto alojado. Las cuatro migraciones iniciales y la migración de endurecimiento `20260805150000_harden_admin_writes_and_relational_locks.sql` están aplicadas sin semillas, con historial y lint remotos correctos y verificaciones alojadas completadas.

## Fuente de verdad e inmutabilidad

- Las migraciones bajo `supabase/migrations/` son la fuente de verdad del esquema ejecutable.
- `supabase/config.toml` define el stack local y no contiene secretos literales.
- `supabase/seed.sql` contiene únicamente datos ficticios para desarrollo y pruebas.
- `supabase/tests/database/` contiene las pruebas pgTAP de estructura, permisos e invariantes.
- `scripts/test-supabase-concurrency.mjs` valida invariantes que requieren varias sesiones PostgreSQL.
- `.temp/`, `.branches/`, archivos `.env.local`, dumps y credenciales locales no se versionan.
- Una migración aplicada no se edita, renombra ni reordena. Toda corrección posterior se añade mediante una migración nueva.

Las cuatro migraciones iniciales se consideran inmutables:

1. `20260805120000_create_application_schema.sql`;
2. `20260805121000_create_authorization_and_rls.sql`;
3. `20260805122000_create_public_request_rpc.sql`;
4. `20260805123000_fix_public_name_uniqueness.sql`.

La quinta migración es una corrección hacia delante que no reescribe ese historial. Tras su aplicación remota también se considera inmutable.

## Requisitos locales

- Node.js 22 y npm 10 o posteriores, según `package.json`.
- Docker Desktop o Docker Engine compatible con la API de Docker.
- Docker Engine 28.0.0 o posterior recomendado.
- Dependencias instaladas mediante `npm ci`.
- Supabase CLI fijada exactamente en `2.111.0` como dependencia de desarrollo.

Docker documenta que, en versiones anteriores a 28.0.0, equipos del mismo segmento de red de capa 2 podían alcanzar puertos publicados en localhost. El binding a `127.0.0.1` sigue siendo obligatorio, pero no sustituye la actualización del motor.

No se requiere login de Supabase ni ninguna credencial alojada para ejecutar el flujo local o CI.

## Red Docker local segura

El arranque recomendado es:

```bash
npm run supabase:start
```

Antes de arrancar Supabase, `scripts/ensure-supabase-network.mjs` crea o inspecciona la red `castigo-divino-map-local`. Una red existente solo se reutiliza cuando cumple simultáneamente:

- driver exacto `bridge`;
- opción `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`.

El nombre de la red por sí solo no constituye una garantía. Si el driver o el binding no coinciden, el script falla y no elimina recursos automáticamente. La recuperación manual es:

```bash
npm run supabase:stop
docker network rm castigo-divino-map-local
npm run supabase:start
```

La red no debe eliminarse mientras existan contenedores que la utilicen. Sus validadores tienen pruebas unitarias para red correcta, driver incorrecto, binding ausente, binding a todas las interfaces y salida de Docker inválida.

Comandos de consulta y parada:

```bash
npm run supabase:status
npm run supabase:stop
```

La salida de `supabase status` contiene credenciales exclusivamente locales. Aunque no sean valores de producción, no deben copiarse a Issues, PRs, chats, documentación o capturas sin sustituirlas por `<REDACTED>`.

`supabase stop --no-backup` elimina volúmenes locales y se reserva para limpieza deliberada o runners efímeros de CI.

## Reconstrucción y validación

La reconstrucción destruye exclusivamente la base local, aplica las migraciones en orden y ejecuta la semilla ficticia:

```bash
npm run supabase:db:reset
```

Validaciones individuales:

```bash
npm run supabase:migration:list
npm run supabase:db:lint
npm run supabase:db:test
npm run supabase:db:test:concurrency
npm run verify:security
```

Validación completa:

```bash
npm run supabase:db:validate
```

Resultado esperado tras el endurecimiento:

- reset completo sin errores;
- lint sin advertencias;
- 172 aserciones pgTAP correctas en cuatro archivos;
- seis comprobaciones concurrentes correctas en dos escenarios;
- ninguna credencial privilegiada detectada en archivos versionados.

La prueba concurrente abre dos sesiones `psql` independientes dentro del contenedor PostgreSQL local. Comprueba mediante `pg_stat_activity` que la retirada del padre espera realmente un bloqueo y, después, que la operación se rechaza por la invariante correcta. No utiliza credenciales del proyecto alojado.

## Cobertura de las pruebas

Las pruebas comprueban, entre otros contratos:

- existencia de tablas, tipos, funciones, índices y RLS;
- lectura anónima limitada a contenido publicado;
- ocultación de borradores, archivados y relaciones con extremos no públicos;
- ausencia de escritura pública directa;
- inserción de solicitudes únicamente mediante la RPC cerrada;
- rechazo de coordenadas, estados y referencias inválidas;
- autenticación insuficiente por sí sola para administrar;
- autorización mediante `private.admin_users` y `private.is_admin()`;
- operaciones administrativas válidas;
- ciclo editorial, slugs e identificadores estables;
- eliminación física restringida con SQLSTATE y mensaje exactos;
- 91 intentos reales sobre columnas protegidas que deben devolver `42501`;
- reservas y colisiones públicas que deben devolver `23505` y el mensaje previsto;
- retiradas editoriales y transiciones terminales que deben devolver `23514` y el mensaje previsto;
- timestamps de publicación y moderación generados por PostgreSQL;
- identidad del moderador forzada a `auth.uid()`;
- serialización entre publicación y retirada de categorías o etiquetas.

Las pruebas críticas no consideran válida cualquier excepción: comprueban SQLSTATE, mensaje o número de filas según la semántica esperada. Las entidades usadas para probar la protección de borrado no tienen hijos que puedan enmascarar el resultado mediante una foreign key.

## Escrituras administrativas y columnas protegidas

RLS decide qué filas puede modificar el usuario incluido en la lista blanca. Los grants por columna limitan qué valores puede suministrar el navegador.

El rol `authenticated` no recibe permisos de cliente sobre:

- `created_at`, `updated_at`, `published_at` o `archived_at`;
- `normalized_name` y `normalized_value`;
- identificadores o tipos declarados inmutables durante una actualización;
- `moderator_user_id` y `moderated_at`;
- contenido original de una solicitud durante su moderación.

Los triggers fuerzan los valores temporales incluso cuando una operación privilegiada distinta del navegador intenta suministrarlos. La primera publicación genera `published_at` en la base; retirarlo no borra ese timestamp. Las transiciones de solicitudes siempre registran el UID autenticado y la hora de PostgreSQL.

Para `public_requests`, el administrador puede actualizar únicamente:

- `request_status`;
- `moderation_note`;
- `converted_entity_id`.

## Invariantes concurrentes

Una entidad publicada requiere una categoría publicada. Una relación `entity_tags` publicada requiere una etiqueta publicada. Estas reglas deben sobrevivir transacciones concurrentes, no solo operaciones secuenciales.

Durante la publicación o modificación de esas filas, PostgreSQL adquiere `FOR SHARE` sobre la categoría o etiqueta. Una retirada concurrente espera a que termine la transacción y vuelve a evaluar la invariante antes de confirmar.

No se usa únicamente `FOR KEY SHARE`, porque cambiar `publication_status` no modifica la clave referenciada. Los bloqueos se adquieren mediante funciones de base de datos y las pruebas externas verifican tanto la espera como el rechazo final.

Las relaciones cuyo padre editorial puede retirarse deliberadamente —por ejemplo, notas o alias de una entidad retirada— conservan la semántica acordada: pueden seguir marcadas como publicadas, pero RLS las oculta mientras su extremo no sea público.

## Auditoría de credenciales

`npm run verify:security` obtiene todos los archivos versionados mediante `git ls-files` y analiza cada archivo que no contenga bytes nulos. No depende de una lista de extensiones.

Esto cubre, entre otros:

- `Dockerfile` y archivos sin extensión;
- `.npmrc`;
- `.pem`, `.key` y otros textos de claves;
- scripts `.sh`, `.bash` y `.ps1`;
- código `.ts`, `.tsx`, `.js` y `.jsx`;
- configuración y documentación.

La suite incluye fixtures negativos construidos durante la prueba para no almacenar credenciales literales en el propio repositorio. Los binarios detectados se omiten y se contabilizan de forma explícita.

`npm run verify:build` audita además el contenido textual de `dist/` y bloquea patrones privilegiados de Supabase.

## Integración continua y cadena de suministro

`.github/workflows/ci.yml` ejecuta dos trabajos independientes:

1. formato, auditoría de credenciales, lint, pruebas, build, auditoría del artefacto y Playwright;
2. base local efímera con Supabase CLI `2.111.0`, reconstrucción, lint, pgTAP y pruebas concurrentes.

El trabajo de base de datos no usa `SUPABASE_ACCESS_TOKEN`, contraseña remota, `service_role` ni un proyecto enlazado. El runner crea únicamente recursos Docker locales y los elimina al finalizar.

Todas las Actions oficiales utilizadas en los workflows de CI y Pages están fijadas a SHA completos, con la versión legible indicada en comentario. Dependabot revisa semanalmente las referencias de GitHub Actions y los tests exigen referencias inmutables sin codificar un SHA concreto, para que esas actualizaciones puedan avanzar.

## Valores permitidos y prohibidos

Pueden aparecer en el frontend y en el bundle:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` con una clave `sb_publishable_...`;
- constantes públicas no sensibles.

No pueden aparecer en frontend, Git, Pages, logs ni artefactos:

- claves `sb_secret_...`;
- claves heredadas `service_role`;
- JWT privilegiados o tokens de sesión;
- `SUPABASE_ACCESS_TOKEN` con valor real;
- `SUPABASE_DB_PASSWORD` con valor real;
- URLs PostgreSQL con contraseña incorporada;
- secretos SMTP, OAuth, CAPTCHA o Storage.

## Proyecto alojado y administrador

El proyecto alojado usa PostgreSQL 17.6, compatible con `db.major_version = 17`. Se verificaron:

- registro público, usuarios anónimos y enlace manual deshabilitados;
- proveedor de correo y confirmación habilitados;
- cambio seguro de correo habilitado;
- contraseña mínima de 12 caracteres con requisitos fuertes;
- Site URL y Redirect URLs permitidas;
- URL de proyecto y clave publicable disponibles sin exponer sus valores.

Existe un único usuario administrativo real con correo confirmado. Su UUID está incluido en `private.admin_users`; ningún metadata editable concede autorización.

## Despliegue de migraciones

El aprovisionamiento inicial se realizó con historial remoto vacío, dry run revisado y confirmación humana. Se aplicaron exclusivamente las cuatro migraciones iniciales y no se incluyó `seed.sql`.

La quinta migración de endurecimiento siguió el mismo protocolo:

1. CI verde sobre el head definitivo;
2. sincronización limpia del checkout;
3. comparación del historial local y remoto;
4. `db push --linked --dry-run` con una única migración pendiente;
5. aprobación humana explícita;
6. aplicación aislada sin semillas;
7. historial local/remoto, lint y comprobaciones remotas posteriores correctos.

Las cinco migraciones están aplicadas y se consideran inmutables. Cualquier corrección posterior debe añadirse mediante una nueva migración hacia delante.

Secuencia operativa:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
supabase db lint --linked --fail-on warning
```

Reglas:

- detenerse ante migraciones inesperadas o divergencias no documentadas;
- no usar `--include-seed` en producción;
- no ejecutar `db reset --linked` contra producción;
- no usar `migration repair` sin comprobar y documentar el esquema real;
- no ejecutar dos despliegues simultáneos;
- no editar migraciones ya aplicadas;
- no introducir UUID, correos, contraseñas, tokens o claves en logs públicos.

MAP-014 no crea todavía un workflow de despliegue remoto. La automatización futura deberá usar un GitHub Environment protegido y ejecución serializada desde `master`.

## Validación remota

Después del aprovisionamiento inicial se verificó:

- coincidencia exacta de las cuatro versiones locales y remotas;
- lint remoto sin errores;
- ausencia de `seed.sql`;
- autorización positiva del usuario incluido en la lista blanca;
- rechazo de un UUID autenticado no incluido;
- lectura anónima limitada a contenido publicado;
- bloqueo de escritura para visitante y no administrador;
- escritura editorial permitida al administrador;
- rollback limpio de los datos temporales.

Después de aplicar la quinta migración se verificó además:

- coincidencia exacta de las cinco versiones locales y remotas;
- lint remoto sin errores;
- ausencia de privilegios completos de escritura sobre las tablas expuestas;
- columnas gestionadas por el sistema sin privilegios de cliente;
- escritura válida en las columnas editoriales permitidas;
- timestamps de publicación generados por PostgreSQL;
- identidad y fecha de moderación forzadas por la base;
- presencia de los bloqueos relacionales `FOR SHARE`;
- rollback limpio de todos los datos temporales de la prueba alojada.

Las consultas de verificación se ejecutan dentro de una transacción y terminan con `rollback` cuando crean datos temporales.

## Copia lógica previa a cambios destructivos

Antes de una migración destructiva aprobada se realizará un dump lógico fuera del repositorio y de artefactos públicos:

```bash
supabase db dump --linked --file <RUTA_SEGURA>/schema-before-<CAMBIO>.sql
supabase db dump --linked --data-only --use-copy --file <RUTA_SEGURA>/data-before-<CAMBIO>.sql
```

La ruta debe estar cifrada o protegida y fuera del checkout. Los dumps pueden contener datos personales o de campaña y nunca se adjuntan a Issues, PRs o artefactos de CI.

La quinta migración no elimina tablas, columnas ni datos y no requiere un dump destructivo previo.

## Recuperación

Orden preferido:

1. detener despliegues y bloquear nuevas mutaciones administrativas;
2. identificar la última migración aplicada y el alcance del incidente;
3. revertir el frontend mediante un nuevo commit o `git revert` cuando proceda;
4. aplicar una migración correctiva hacia delante compatible con los datos;
5. restaurar desde un dump solo cuando la corrección hacia delante no sea suficiente;
6. validar RLS, catálogo, solicitudes y snapshot antes de reabrir escrituras;
7. documentar el incidente y cualquier reparación del historial.

`supabase migration repair` solo modifica el registro del historial; no aplica ni revierte SQL.

## Limpieza local de Docker

No se eliminan imágenes, redes o volúmenes manualmente mientras el stack está activo. Para una limpieza deliberada:

```bash
npm run supabase:stop
npx supabase stop --no-backup --project-id castigo-divino-map
```

Antes de borrar imágenes compartidas debe comprobarse que ningún otro proyecto las utiliza. Una imagen descargada pero inactiva no indica un error.

## Referencias oficiales

- <https://supabase.com/docs/guides/local-development>
- <https://supabase.com/docs/guides/local-development/cli-workflows>
- <https://supabase.com/docs/guides/local-development/cli/testing-and-linting>
- <https://supabase.com/docs/guides/deployment/ci/testing>
- <https://supabase.com/docs/guides/deployment/database-migrations>
- <https://supabase.com/docs/reference/cli/getting-started>
- <https://www.postgresql.org/docs/17/ddl-priv.html>
- <https://www.postgresql.org/docs/17/explicit-locking.html>
- <https://docs.docker.com/engine/network/port-publishing/>
- <https://docs.github.com/en/actions/reference/security/secure-use>

## Política de migración para v1.1

MAP-066 trata el historial remoto como evidencia de despliegue, no como una invitación a renombrar SQL histórico. Algunas migraciones v1.1 se aplicaron previamente mediante la API de Supabase con versiones remotas distintas del timestamp del filename conservado en Git; sus nombres funcionales/esquema ya están desplegados. No se reescribe `supabase_migrations` ni se hace un `db push` ciego para “alinear” timestamps. Cualquier corrección futura se implementa como una migración nueva, forward-only, después de comparar el delta real.
