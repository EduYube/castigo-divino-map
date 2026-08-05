# Operación de Supabase para Beta 0.2

## Propósito

Este documento define el flujo reproducible y seguro para desarrollar, validar, desplegar y recuperar la base de datos de Beta 0.2. Complementa `docs/architecture.md`, `docs/data-model.md`, `docs/security.md` y los ADR 0002 a 0005.

MAP-014 prepara la base local, la validación automática y el aprovisionamiento inicial controlado del único proyecto alojado. Las cuatro migraciones iniciales ya están aplicadas sin semillas; cualquier cambio posterior debe realizarse mediante nuevas migraciones y siguiendo los controles descritos aquí.

## Fuente de verdad

- Las migraciones versionadas bajo `supabase/migrations/` son la fuente de verdad del esquema ejecutable.
- `supabase/config.toml` define el stack local y puede versionarse porque no contiene secretos literales.
- `supabase/seed.sql` contiene únicamente datos ficticios para desarrollo y pruebas.
- `supabase/tests/database/` contiene las pruebas pgTAP de estructura, permisos e invariantes.
- `.temp/`, `.branches/`, archivos `.env.local`, dumps y credenciales locales no se versionan.
- Una migración aplicada no se edita ni se reordena. Toda corrección posterior se añade como una migración nueva.

## Requisitos locales

- Node.js 22 y npm 10 o posteriores, según `package.json`.
- Docker Desktop o un motor compatible con la API de Docker.
- Dependencias instaladas mediante `npm ci`.
- Supabase CLI fijada exactamente en `2.111.0` como dependencia de desarrollo del proyecto.

No se requiere login de Supabase ni credenciales alojadas para ejecutar el flujo local o CI.

## Arranque local seguro

El comando recomendado crea o reutiliza la red Docker `castigo-divino-map-local`, vinculada a `127.0.0.1`, y arranca el stack local:

```bash
npm run supabase:start
```

Comandos de consulta y parada:

```bash
npm run supabase:status
npm run supabase:stop
```

La salida de `supabase status` contiene contraseña local de PostgreSQL, claves locales de Auth y claves locales de Storage. Aunque no sean credenciales de producción, no deben copiarse a Issues, pull requests, chats, documentación, logs permanentes ni capturas sin sustituirlas por `<REDACTED>`.

La parada normal conserva los datos en volúmenes Docker. `supabase stop --no-backup` elimina los volúmenes locales y solo debe usarse para limpieza deliberada o en runners efímeros de CI.

## Reconstrucción y validación

La comprobación principal destruye exclusivamente la base local, aplica todas las migraciones en orden y ejecuta la semilla ficticia:

```bash
npm run supabase:db:reset
```

Validaciones individuales:

```bash
npm run supabase:migration:list
npm run supabase:db:lint
npm run supabase:db:test
npm run verify:security
```

Validación completa de base de datos:

```bash
npm run supabase:db:validate
```

Resultado esperado de MAP-014:

- reset completo sin errores;
- lint sin advertencias;
- 69 pruebas pgTAP correctas;
- ninguna credencial privilegiada detectada en archivos versionados.

## Cobertura de las pruebas

Las pruebas comprueban, entre otros contratos:

- existencia de tablas, tipos, funciones, índices y RLS;
- lectura anónima limitada a contenido publicado;
- ocultación de borradores y archivados;
- ausencia de escritura pública directa;
- inserción de solicitudes únicamente mediante la RPC cerrada;
- rechazo de coordenadas, estados y referencias inválidas;
- autenticación insuficiente por sí sola para administrar;
- autorización administrativa mediante `private.admin_users` y `private.is_admin()`;
- operaciones administrativas válidas;
- ciclo editorial, slugs e identificadores estables;
- eliminación física restringida.

Las semillas incluyen usuarios y contenido completamente ficticios con dominios reservados para pruebas. No deben sustituirse por copias de producción.

## Integración continua

El workflow `.github/workflows/ci.yml` ejecuta dos trabajos independientes:

1. calidad, pruebas y build del frontend, incluida la auditoría de archivos versionados y del artefacto de Pages;
2. base local efímera con Supabase CLI `2.111.0`, reconstrucción desde cero, lint y pruebas pgTAP.

El trabajo de base de datos no usa `SUPABASE_ACCESS_TOKEN`, contraseña remota, `service_role` ni ningún proyecto enlazado. El runner crea únicamente recursos Docker locales y los elimina al finalizar.

## Valores permitidos y prohibidos

Pueden aparecer en el frontend y en el bundle:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` con una clave `sb_publishable_...`;
- constantes públicas no sensibles.

No pueden aparecer en frontend, Git, Pages, logs ni artefactos:

- claves `sb_secret_...`;
- claves heredadas `service_role`;
- JWT privilegiados;
- `SUPABASE_ACCESS_TOKEN` con valor real;
- `SUPABASE_DB_PASSWORD` con valor real;
- URLs PostgreSQL con contraseña incorporada;
- secretos SMTP, OAuth, CAPTCHA o Storage.

`npm run verify:security` audita archivos versionados. `npm run verify:build` audita el contenido textual de `dist/` y bloquea patrones privilegiados de Supabase.

## Creación y configuración del proyecto alojado

La creación del proyecto de producción es una acción manual y separada. Antes de enlazarlo:

1. elegir organización y región;
2. comprobar la versión principal de PostgreSQL del proyecto alojado;
3. confirmar que coincide con `db.major_version = 17` o actualizar deliberadamente la configuración local antes de desplegar;
4. deshabilitar registro público, usuarios anónimos, enlace manual y proveedores no usados;
5. configurar los requisitos de contraseña y las URLs permitidas de Auth para desarrollo local y GitHub Pages;
6. obtener la URL y una clave publicable para el frontend sin exponer sus valores;
7. crear el GitHub Environment protegido `supabase-production` antes de automatizar despliegues.

Después de disponer del esquema de autorización se crea manualmente el único usuario administrativo, se confirma su correo y se añade su UUID a `private.admin_users`. No se utilizan metadatos editables del usuario para conceder permisos.

No debe introducirse ningún dato real de campaña durante la validación inicial de infraestructura.

## Despliegue de migraciones

El aprovisionamiento inicial de MAP-014 se realizó desde su rama de trabajo con CI verde, dry run revisado y confirmación humana explícita en cada operación dependiente. Se aplicaron exactamente las cuatro migraciones versionadas y no se incluyó `seed.sql`.

Después de integrar MAP-014, las promociones posteriores a producción se harán desde `master`, con CI verde, aprobación humana y ejecución serializada.

Variables previstas para un workflow protegido:

- variable no secreta con el project ref;
- secreto `SUPABASE_ACCESS_TOKEN`;
- secreto `SUPABASE_DB_PASSWORD`.

Secuencia operativa:

```bash
supabase link --project-ref <PROJECT_REF>
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
supabase db lint --linked --fail-on warning
```

Reglas:

- revisar el historial remoto y el dry run antes de aplicar;
- detenerse si aparecen migraciones inesperadas o divergencias no documentadas;
- no usar `--include-seed` en producción;
- no ejecutar `db reset --linked` contra producción;
- no editar el esquema de producción desde Dashboard o SQL Editor fuera de una recuperación documentada;
- no ejecutar dos despliegues simultáneos;
- verificar después el historial remoto, el lint y las políticas RLS.

MAP-014 no crea todavía un workflow de despliegue remoto. El enlace, el dry run y el primer `db push` se ejecutaron manualmente bajo puntos de control; la automatización futura deberá usar un GitHub Environment protegido.

## Validación posterior al aprovisionamiento inicial

Tras aplicar las migraciones se verificó:

- coincidencia exacta entre las cuatro versiones locales y remotas;
- lint remoto sin errores ni advertencias;
- ausencia de ejecución de `seed.sql`;
- existencia de un único usuario administrativo real con correo confirmado;
- autorización positiva del UUID incluido en `private.admin_users`;
- rechazo de un UUID autenticado no incluido en la lista blanca;
- lectura anónima limitada a contenido publicado;
- bloqueo de escritura para visitantes y usuarios autenticados no autorizados;
- escritura editorial permitida al administrador;
- rollback limpio de los datos usados por la prueba remota.

Las consultas de verificación que simulan roles deben ejecutarse dentro de una transacción y terminar con `rollback`. No deben incluirse UUID, correos, contraseñas, tokens o claves en Issues, PRs, documentación o capturas.

## Copia lógica previa a cambios destructivos

Antes de una migración destructiva aprobada se realizará un dump lógico fuera del repositorio y de los artefactos públicos:

```bash
supabase db dump --linked --file <RUTA_SEGURA>/schema-before-<CAMBIO>.sql
supabase db dump --linked --data-only --use-copy --file <RUTA_SEGURA>/data-before-<CAMBIO>.sql
```

La ruta debe estar cifrada o protegida, fuera del checkout y con acceso limitado. Los dumps pueden contener datos personales o de campaña y nunca deben adjuntarse a Issues, PRs o artefactos de CI.

## Recuperación

Orden preferido:

1. detener despliegues y bloquear nuevas mutaciones administrativas;
2. identificar la última migración aplicada y el alcance del incidente;
3. revertir el frontend mediante un nuevo commit o `git revert` si procede;
4. aplicar una migración correctiva hacia delante compatible con los datos existentes;
5. restaurar desde el dump lógico solo si la corrección hacia delante no es suficiente;
6. validar RLS, catálogo público, solicitudes y snapshot antes de reabrir escrituras;
7. documentar el incidente y cualquier reparación del historial.

`supabase migration repair` solo corrige el registro del historial; no aplica ni revierte SQL. Debe utilizarse únicamente cuando el esquema real se haya verificado y la discrepancia esté documentada.

## Limpieza local de Docker

No se eliminan imágenes o volúmenes manualmente mientras el stack está activo. Para una limpieza deliberada del proyecto local:

```bash
npm run supabase:stop
npx supabase stop --no-backup --project-id castigo-divino-map
```

Antes de borrar imágenes compartidas se debe comprobar que ningún otro proyecto o contenedor las utiliza. Las imágenes descargadas pero inactivas no indican un error y pueden reutilizarse en futuros arranques.

## Referencias oficiales

- <https://supabase.com/docs/guides/local-development/cli-workflows>
- <https://supabase.com/docs/guides/local-development/cli/testing-and-linting>
- <https://supabase.com/docs/guides/deployment/ci/testing>
- <https://supabase.com/docs/guides/deployment/database-migrations>
- <https://supabase.com/docs/reference/cli/getting-started>
