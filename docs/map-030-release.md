# MAP-030 — Evidencia de publicación de Beta 0.2

## Objetivo

Publicar y validar Beta 0.2 de **El Atlas de los Nuevos Dioses** sobre GitHub Pages y Supabase de producción, conservando los contratos de Beta 0.1 y demostrando la separación público/admin, el fallback por snapshot y un rollback coordinado.

Issue: #49.

## Baseline de partida

- `master`: `3f4052027a511da63b84886498b25edc12ca3b43`.
- último Pages validado: run `31290640876`.
- `github-pages/deployment`: `success`.
- URL: `https://eduyube.github.io/castigo-divino-map/`.
- Supabase: `atlas-nuevos-dioses-prod` (`ehpouvbzmvwbkkoypgfa`), `ACTIVE_HEALTHY` al iniciar el release.
- snapshot público: `sha256:27c51790408f662898d6aea09fb1845f6aa9029ed9c0e08802d3effeaaff6683`.

## Preflight de producción

### Migraciones

El historial alojado contiene 16 migraciones y termina en:

- `20260808172454_add_public_request_moderation`;
- `20260809003008_migrate_beta01_public_catalog`.

No existe una migración propia de MAP-030. No se reaplican migraciones ya alojadas ni se ejecuta `seed.sql`.

### Datos públicos

La inspección read-only previa al release mantiene exactamente el contenido migrado por MAP-028:

- 2 categorías publicadas;
- 4 tags publicados;
- 2 entidades publicadas;
- 2 aliases publicados;
- 6 relaciones entidad–tag publicadas;
- 2 notas públicas;
- 5 relaciones nota–tag publicadas.

No hay borradores/archivados en ese conjunto publicado. El snapshot comprometido contiene esas mismas identidades públicas y excluye solicitudes, remitentes, motivos y datos administrativos.

### RLS, roles y RPC

La inspección alojada previa confirma RLS activa en las 14 tablas del esquema `public` expuestas por la aplicación.

La superficie de funciones mantiene el diseño aprobado:

- `current_user_is_admin`: `SECURITY INVOKER`, solo `authenticated`;
- `admin_get_map_entity_editor`: `SECURITY INVOKER`, solo `authenticated`;
- `admin_save_map_entity`: `SECURITY INVOKER`, solo `authenticated`;
- `admin_moderate_public_request`: `SECURITY DEFINER`, propietario dedicado `atlas_public_request_moderator`, solo `authenticated`;
- `submit_public_request`: `SECURITY DEFINER`, única entrada pública prevista para solicitudes, ejecutable por `anon` y `authenticated`.

La allowlist contiene una identidad administrativa. Una simulación transaccional de JWT para esa identidad devuelve `current_user_is_admin() = true`; una identidad autenticada no allowlisted devuelve `false`. No se utilizó ni se expuso la contraseña del administrador.

### Advisors

Los findings de seguridad permanecen en el baseline aceptado de MAP-029:

- `submit_public_request` expuesta intencionalmente como `SECURITY DEFINER` pública;
- `admin_moderate_public_request` expuesta intencionalmente a usuarios autenticados y protegida de nuevo por allowlist/RLS;
- leaked-password protection de Auth desactivada;
- tablas privadas con RLS y sin policies públicas.

MAP-030 no cambia RLS, Auth, owners, grants, policies ni fronteras de seguridad para silenciar advisors preexistentes.

## Cambios del candidato de release

- `package.json`: versión `0.2.0`.
- `src/app/renderApp.ts`: badge y textos públicos de Beta 0.2.
- `tests/deployment/pages-smoke.spec.ts`: versión visible, backend conectado, ficha completa y fallback publicado ante Supabase HTTP 503.
- `README.md`: documentación activa de Beta 0.2.
- `docs/deployment-and-rollback.md`: despliegue actual y rollback coordinado.
- este documento: evidencia reproducible de MAP-030.

No se modifica SQL, Supabase, Auth, RLS, workflows, permisos de Actions/Pages ni secretos.

## Snapshot público

El contenido público de producción no cambió durante el preflight, por lo que no se genera churn de `generatedAt`. El release conserva el snapshot V2 existente y exige dos gates:

1. `npm run snapshot:verify` durante el build;
2. `npm run snapshot:verify:remote` en Pages contra la Data API pública antes de desplegar.

Checksum esperado:

`sha256:27c51790408f662898d6aea09fb1845f6aa9029ed9c0e08802d3effeaaff6683`

## Validación heredada de MAP-029

El baseline inmediatamente anterior ya validó:

- auditoría de credenciales en tracked files y build;
- RLS positiva/negativa y separación visitante/no-admin/admin;
- XSS almacenado como texto inerte;
- teclado, foco, 320 px, `prefers-reduced-motion` y `forced-colors`;
- contraste automatizado;
- 503, 429, timeout, conexión rechazada, JSON inválido y respuesta parcial;
- retry explícito y ausencia de polling;
- sourcemaps = 0 e imágenes raster empaquetadas = 0.

MAP-030 vuelve a ejecutar toda esa CI sobre el nuevo head y no reutiliza el run de MAP-029 como prueba del release.

## Evidencia del candidato

Se completará después de que la PR de release tenga un head estable y CI verde:

- PR: pendiente.
- head validado: pendiente.
- CI PR: pendiente.
- unitarios: pendiente.
- E2E: pendiente.
- smoke Pages local: pendiente.
- pgTAP/RLS: pendiente.
- concurrencia: pendiente.
- métricas de build: pendiente.
- auditoría de credenciales/build: pendiente.

## Evidencia post-merge y producción

Se completará únicamente con evidencia observada sobre el SHA realmente integrado:

- SHA de release en `master`: pendiente.
- CI `master`: pendiente.
- Pages run: pendiente.
- `snapshot:verify:remote`: pendiente.
- deploy: pendiente.
- smoke publicado: pendiente.
- `github-pages/deployment`: pendiente.
- estado Supabase post-deploy: pendiente.
- validación administrativa real con credenciales personales: pendiente solo si no existe alternativa automatizable segura.

## Rollback

Baseline seguro anterior: `3f4052027a511da63b84886498b25edc12ca3b43`.

MAP-030 no añade migraciones. Una regresión de frontend puede retirarse mediante una PR de `git revert`, manteniendo el esquema actual. La migración de catálogo de MAP-028 conserva un rollback lógico forward-only por archivado si el problema fuese de contenido persistente; no se realiza borrado físico ni reescritura de `master`.

El procedimiento completo vive en [`deployment-and-rollback.md`](deployment-and-rollback.md).

## Riesgos residuales

Se heredan sin cambio las decisiones ya aceptadas en MAP-029:

- **R-01** — sin rate limiting autoritativo por IP/dispositivo para solicitudes públicas: aceptado para Beta 0.2 con seguimiento.
- **R-02** — leaked-password protection de Supabase Auth desactivada: aceptado para Beta 0.2 con seguimiento.
- **R-03** — `submit_public_request` conserva propietario elevado: deuda posterior de defensa en profundidad.
- **R-04** — sin sesión humana con lector de pantalla real: deuda posterior de assurance.
- **R-05** — advisors de rendimiento con catálogo mínimo: deuda posterior.

Cualquier riesgo material nuevo descubierto durante MAP-030 debe presentarse antes del cierre de #49; no se acepta implícitamente.
