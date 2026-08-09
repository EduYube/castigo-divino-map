# Despliegue y rollback de Beta 0.2

## Objetivo

Publicar **El Atlas de los Nuevos Dioses — Beta 0.2** en GitHub Pages desde un SHA de `master` completamente validado, con la proyección pública de Supabase sincronizada con el snapshot versionado y con un procedimiento de recuperación que no reescriba `master` ni destruya datos.

URL pública:

`https://eduyube.github.io/castigo-divino-map/`

## Arquitectura de publicación

La publicación separa calidad y despliegue:

1. `.github/workflows/ci.yml` valida PRs hacia `master` y pushes a `master`.
2. El job web ejecuta formato, auditoría de credenciales, accesibilidad, lint, unitarios, build Pages, auditoría de `dist`, métricas, E2E y smoke local.
3. El job Supabase reconstruye una base local, aplica migraciones, ejecuta lint, pgTAP/RLS y concurrencia.
4. `.github/workflows/pages.yml` recibe el `workflow_run` de CI sobre `master` y solo continúa cuando su conclusión es `success`.
5. Pages resuelve y checkout el SHA validado, verifica el snapshot contra Supabase, reconstruye `dist`, vuelve a auditarlo y ejecuta smoke local.
6. `actions/deploy-pages` publica exclusivamente `dist` en el entorno `github-pages`.
7. El job `smoke` ejecuta `tests/deployment/pages-smoke.spec.ts` contra la URL publicada.
8. El job `report` registra el estado `github-pages/deployment` sobre el SHA exacto desplegado.

La concurrencia de Pages usa `cancel-in-progress: false`: un despliegue iniciado no se cancela por una ejecución posterior.

## Configuración pública de Supabase

El frontend necesita únicamente:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` con formato `sb_publishable_*`.

Son valores públicos de navegador, no secretos. El workflow permite Repository Variables como override y conserva como fallback los valores públicos del proyecto de producción. No deben incorporarse al frontend ni al artefacto:

- `service_role`;
- `sb_secret_*`;
- tokens de gestión;
- contraseñas de base de datos;
- connection strings con password;
- credenciales personales de administradores.

`npm run verify:security` audita los ficheros versionados y `npm run verify:build` vuelve a auditar el artefacto de producción.

## Snapshot público

Archivo:

`public/data/public-catalog.snapshot.json`

El snapshot usa `schemaVersion: 2` y un SHA-256 del contenido público canónico. El gate previo al despliegue es:

```bash
npm run snapshot:verify:remote
```

Ese comando compara contenido y checksum contra la Data API pública de Supabase. Un drift bloquea el despliegue antes del build.

El snapshot excluye estados editoriales, solicitudes públicas, remitentes, motivos, notas de moderación y cualquier dato administrativo. No se regenera solo para cambiar `generatedAt`: si el contenido público de Supabase no cambia y la igualdad remota sigue siendo exacta, se conserva el snapshot versionado existente.

## Estado de Supabase para MAP-030

Producción:

- proyecto: `atlas-nuevos-dioses-prod`;
- project id: `ehpouvbzmvwbkkoypgfa`;
- las migraciones alojadas llegan hasta:
  - `20260808172454_add_public_request_moderation`;
  - `20260809003008_migrate_beta01_public_catalog`.

MAP-030 no define una migración nueva. Antes de publicar se compara el historial alojado con las migraciones ya aprobadas del repositorio. Si no existe una migración pendiente, no se reaplica ninguna ni se ejecuta `seed.sql`.

Cualquier DDL nuevo, cambio de RLS/Auth/roles/grants o migración destructiva descubierto durante un release debe tratarse como cambio sensible y no puede introducirse silenciosamente dentro de MAP-030.

## Smoke publicado de Beta 0.2

`tests/deployment/pages-smoke.spec.ts` valida sobre la URL real:

- badge visible `Beta 0.2`;
- backend conectado a Supabase;
- búsqueda, filtros, mapa y pines;
- ficha compacta y apertura de ficha completa;
- URL estable y navegación atrás/adelante;
- panel de solicitudes públicas sin categorías/tags/código de campaña;
- atribución y fuente cartográfica remota;
- assets bajo `/castigo-divino-map/`;
- experiencia a 320 px cuando falla la imagen remota;
- fallback desde el snapshot cuando Supabase devuelve HTTP 503.

La suite E2E completa mantiene además los escenarios de 429, timeout, conexión rechazada, JSON inválido, respuesta parcial, recuperación por retry, XSS, administración, responsive y accesibilidad.

## Baseline anterior a la publicación final

El último estado publicado y validado antes de iniciar MAP-030 es:

- SHA de `master`: `3f4052027a511da63b84886498b25edc12ca3b43`;
- Pages run: `31290640876`;
- `github-pages/deployment = success`;
- smoke publicado: `success`.

Este SHA es la referencia de frontend para comparar y, si fuese necesario, construir un revert explícito.

## Rollback coordinado

### Regresión solo de frontend

1. Identificar el merge que introdujo la regresión y el último SHA seguro.
2. Crear una rama nueva desde el `master` actual.
3. Ejecutar `git revert` sobre el cambio de release o el commit defectuoso; no usar force-push ni reescribir historial.
4. Abrir una PR y exigir los dos jobs de CI verdes.
5. Fusionar con protección por SHA.
6. Esperar el workflow automático de Pages.
7. Verificar build, deploy, smoke publicado y `github-pages/deployment` sobre el nuevo SHA de revert.

### Fallo transitorio de Pages

Si el código correcto ya está en `master` y el fallo es exclusivamente de infraestructura, reejecutar el workflow de Pages sobre `master`. La ruta manual reconstruye y vuelve a validar; no debe publicar un artefacto antiguo descargado manualmente.

### Frontend y base de datos desalineados

MAP-030 no añade DDL. Las migraciones de Beta 0.2 se diseñaron hacia delante y el frontend publicado debe ser compatible con el estado alojado aprobado.

Si una incidencia futura deja frontend y DB desalineados:

1. detener nuevas publicaciones editoriales si pudieran agravar el problema;
2. determinar si el último frontend seguro es compatible con el esquema actual;
3. preferir un revert de frontend mediante PR cuando el esquema siga siendo compatible;
4. si el esquema requiere corrección, aplicar una migración correctiva forward-only revisada;
5. no borrar tablas/filas, resetear producción ni manipular el historial de migraciones para simular un rollback.

### Catálogo migrado y snapshot

La migración de catálogo de MAP-028 dispone de rollback lógico por archivado (`supabase/rollback/map-028_archive_beta01_catalog.sql`). Ese mecanismo retira el contenido de la proyección pública sin borrado físico ni liberación de IDs/slugs reservados.

Tras cualquier corrección de contenido:

1. regenerar el snapshot desde la fuente persistente aprobada cuando el contenido público cambie;
2. verificar checksum local;
3. verificar igualdad remota;
4. versionar el snapshot en una PR;
5. desplegar solo después de CI verde.

## Criterio de release completado

Beta 0.2 solo se considera publicada cuando existe evidencia sobre el SHA final de `master` de que:

- CI está verde;
- Pages reconstruyó ese SHA;
- `snapshot:verify:remote` pasó;
- build y auditoría pasaron;
- deploy terminó correctamente;
- smoke contra la URL publicada pasó;
- `github-pages/deployment = success`;
- Supabase permanece en el estado esperado;
- `docs/project-status.md` registra la publicación, límites, rollback y evidencia final.

La evidencia concreta del release se conserva en [`map-030-release.md`](map-030-release.md).
