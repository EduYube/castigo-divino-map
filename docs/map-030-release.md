# MAP-030 — Evidencia de publicación de Beta 0.2

## Objetivo

Publicar y validar Beta 0.2 de **El Atlas de los Nuevos Dioses** sobre GitHub Pages y Supabase de producción, conservando los contratos de Beta 0.1, demostrando la separación público/admin, el fallback por snapshot y un rollback coordinado.

Issue: #49.

Estado actual: publicación técnica completada; pendiente únicamente el checkpoint humano de login/logout administrativo real con credenciales personales antes de cerrar la Issue.

## Baseline de partida

- `master`: `3f4052027a511da63b84886498b25edc12ca3b43`.
- último Pages validado antes de MAP-030: run `31290640876`.
- `github-pages/deployment`: `success`.
- URL: `https://eduyube.github.io/castigo-divino-map/`.
- Supabase: `atlas-nuevos-dioses-prod` (`ehpouvbzmvwbkkoypgfa`), `ACTIVE_HEALTHY`.
- snapshot público: `sha256:27c51790408f662898d6aea09fb1845f6aa9029ed9c0e08802d3effeaaff6683`.

## Preflight de producción

### Migraciones

El historial alojado contiene 16 migraciones y termina en:

- `20260808172454_add_public_request_moderation`;
- `20260809003008_migrate_beta01_public_catalog`.

No existe una migración propia de MAP-030. No había una migración de release pendiente, no se reaplicó ninguna migración ya alojada y no se ejecutó `seed.sql`.

### Datos públicos

La inspección previa al release encontró exactamente el contenido migrado por MAP-028:

- 2 categorías publicadas;
- 4 tags publicados;
- 2 entidades publicadas;
- 2 aliases publicados;
- 6 relaciones entidad–tag publicadas;
- 2 notas públicas;
- 5 relaciones nota–tag publicadas;
- 0 solicitudes públicas persistentes.

El snapshot comprometido contiene esas identidades públicas y excluye solicitudes, remitentes, motivos, moderación y datos administrativos.

### RLS, roles y RPC

La inspección alojada confirma RLS activa en las 14 tablas del esquema `public` expuestas por la aplicación.

La superficie de funciones mantiene el diseño aprobado:

- `current_user_is_admin`: `SECURITY INVOKER`, solo `authenticated`;
- `admin_get_map_entity_editor`: `SECURITY INVOKER`, solo `authenticated`;
- `admin_save_map_entity`: `SECURITY INVOKER`, solo `authenticated`;
- `admin_moderate_public_request`: `SECURITY DEFINER`, propietario dedicado `atlas_public_request_moderator`, solo `authenticated`;
- `submit_public_request`: `SECURITY DEFINER`, única entrada pública prevista para solicitudes, ejecutable por `anon` y `authenticated`.

La allowlist contiene una identidad administrativa. Una simulación transaccional de JWT para esa identidad devuelve `current_user_is_admin() = true`; una identidad autenticada no allowlisted devuelve `false`. No se utilizó ni se expuso la contraseña del administrador.

### Advisors y riesgos heredados

Los findings de seguridad permanecen en el baseline aceptado de MAP-029:

- `submit_public_request` expuesta intencionalmente como `SECURITY DEFINER` pública;
- `admin_moderate_public_request` expuesta a usuarios autenticados y protegida de nuevo por allowlist/RLS;
- leaked-password protection de Auth desactivada;
- tablas privadas con RLS y sin policies públicas.

MAP-030 no cambia RLS, Auth, owners, grants, policies ni fronteras de seguridad para silenciar advisors preexistentes.

## Cambios de release

### PR #85 — publicación Beta 0.2

Cambios:

- `package.json`: versión `0.2.0`;
- `src/app/renderApp.ts`: badge y textos públicos de Beta 0.2;
- `tests/deployment/pages-smoke.spec.ts`: versión visible, backend, ficha completa y fallback publicado ante Supabase HTTP 503;
- `README.md`: documentación activa de Beta 0.2;
- `docs/deployment-and-rollback.md`: despliegue y rollback coordinado;
- este documento de evidencia.

Head final validado:

`fcb8ca2b84d07d50157509c67b746feb0041a0a1`

CI PR final:

`31299977748`

La PR se fusionó por squash como:

`7b239aeae87b807db96687b6026542150b54dad8`

No se modificaron SQL, Supabase, Auth, RLS, workflows, permisos de Actions/Pages ni secretos.

### PR #86 — corrección del smoke previo a Pages

El primer Pages post-merge reveló un falso negativo del smoke local: la prueba asumía que un preview local siempre carecía de configuración de Supabase, pero el workflow de Pages construye el preview previo al deploy con la configuración pública de producción.

La corrección solo modifica `tests/deployment/pages-smoke.spec.ts`:

- contra `PAGES_URL` sigue siendo obligatorio acabar en `connected`;
- en preview local se admite `connected` cuando existe configuración pública real;
- el único modo degradado estable aceptado en CI ordinario es `configuration-missing`;
- 429, timeout, red no disponible y otras degradaciones no se convierten en falsos éxitos.

Head final validado:

`e0b51133f87f5597892245b8ec42115dae15eb0c`

CI PR final:

`31300597886`

Merge funcional final:

`3de99ee6d080d552606383601340378d5d6c0e91`

## Defectos encontrados durante MAP-030

1. **Formato del nuevo smoke** — el primer CI de #85 (`31299700195`) falló en Prettier antes de tests. Se corrigió el formato y se invalidó ese head.
2. **Smoke local demasiado estricto en CI ordinario** — el run `31299770697` demostró que el preview sin configuración pública entra correctamente en `configuration-missing`; la prueba exigía `connected`. Se corrigió.
3. **Colisión transitoria de Docker/Supabase local** — el primer intento del job de base en `31299977748` no pudo enlazar `54322`. El mismo job se reejecutó sin cambios de código y pasó toda la suite, clasificándolo como infraestructura.
4. **Smoke local demasiado estricto en Pages** — Pages `31300332425` verificó snapshot, build y artefacto, pero bloqueó el deploy porque el preview configurado podía recuperar de red a `connected`. Se corrigió en #86 sin tocar runtime.
5. **Prettier en #86** — dos iteraciones de la expresión de polling no coincidían con el formateador. Se sustituyó por una forma estable y el head final `e0b51133…` quedó completamente verde.

No se descubrió un defecto de runtime, RLS, Auth, datos o snapshot que requiriese cambio sensible de producción.

## Validación del candidato

Sobre el head funcional final de #85 y la corrección test-only de #86:

- formato: verde;
- auditoría de credenciales versionadas: verde;
- accesibilidad estática: verde;
- lint: verde;
- unitarios: **262/262** en 43 archivos;
- build Pages: verde;
- auditoría del artefacto: verde;
- E2E completos: **122/122**;
- smoke local de Pages: verde;
- migraciones desde cero y upgrade: verdes;
- lint SQL: `No schema errors found`;
- pgTAP/RLS: **292/292** en 15 archivos;
- concurrencia: **13** checks generales + **4** de moderación = **17/17**.

La auditoría npm del build final encontró 0 vulnerabilidades sobre 175 paquetes.

## Snapshot público

El contenido público no cambió durante MAP-030, por lo que no se introdujo churn artificial de `generatedAt`.

Checksum canónico:

`sha256:27c51790408f662898d6aea09fb1845f6aa9029ed9c0e08802d3effeaaff6683`

Gates ejecutados:

1. `npm run snapshot:verify` durante build;
2. `npm run snapshot:verify:remote` contra la Data API pública de Supabase antes del deploy.

El Pages final `31300919855` verificó ambos correctamente.

## Primera publicación post-merge bloqueada

SHA:

`7b239aeae87b807db96687b6026542150b54dad8`

Pages run:

`31300332425`

Resultado:

- snapshot remoto: success;
- build Beta 0.2: success;
- auditoría del artefacto: success;
- smoke local: failure por falso negativo de test;
- deploy: no ejecutado;
- smoke público: no ejecutado;
- `github-pages/deployment = failure`.

Como `actions/deploy-pages` no llegó a ejecutarse, la URL pública permaneció en el estado seguro anterior mientras se corregía #86.

## Publicación final validada

SHA funcional de Beta 0.2:

`3de99ee6d080d552606383601340378d5d6c0e91`

Pages run:

`31300919855`

Jobs:

- `Build and upload production artifact`: success;
- `Deploy GitHub Pages`: success;
- `Validate published atlas`: success;
- `Record deployment status`: success.

Evidencia del run:

- resolvió y checkout exactamente `3de99ee6d080d552606383601340378d5d6c0e91`;
- snapshot remoto contra Supabase: success;
- build `castigo-divino-map@0.2.0`: success;
- auditoría de 4 ficheros de producción: success;
- smoke local previo al upload: **4/4**;
- deploy Pages: success;
- smoke contra `https://eduyube.github.io/castigo-divino-map/`: **4/4**;
- `github-pages/deployment`: **success**.

El wrapper disponible de GitHub Actions enumera runs por commit solo para eventos `pull_request`, por lo que no se inventa un ID de CI `push` de `master`. El workflow de Pages automático exige `workflow_run.conclusion == success` para CI en `master` y reconstruyó el SHA exacto anterior, por lo que existe evidencia verificable de que la ruta automática se originó en un CI de `master` satisfactorio.

## Artefacto final

El artefacto de Pages contiene:

- `index.html`: 711 bytes;
- CSS: 75,939 bytes;
- JavaScript: 419,530 bytes;
- snapshot: 3,595 bytes.

Totales observados al extraer el artefacto publicado:

- total sin comprimir: **499,775 bytes**;
- gzip calculado localmente sobre los cuatro ficheros: **131,500 bytes**;
- source maps: **0**;
- imágenes raster empaquetadas: **0**.

Artefacto GitHub Pages:

- artifact id: `9034455436`;
- tamaño subido: 132,718 bytes;
- digest: `sha256:4313fbd327857699fff552e19995b7a2bc6dc673cb0e0efbac06cbd8f32ca8ca`.

El build usa solo la URL pública y una clave publicable de Supabase. La auditoría confirmó que no contiene `service_role`, `sb_secret_*`, tokens de gestión, passwords, connection strings privilegiadas ni imágenes raster del mapa oficial.

## Resiliencia y accesibilidad

La suite acumulada de MAP-029/MAP-030 mantiene cobertura para:

- Supabase normal;
- HTTP 503;
- 429/rate limiting;
- timeout/lentitud;
- conexión rechazada/red no disponible;
- JSON inválido;
- respuesta incompleta;
- recuperación mediante retry explícito;
- ausencia de polling automático;
- degradación a snapshot utilizable;
- fallo de la imagen cartográfica remota sin perder controles/pines/fichas;
- teclado y retorno de foco;
- viewport 320 px;
- `forced-colors`;
- `prefers-reduced-motion`;
- contenido no confiable tratado como texto inerte frente a XSS.

Los contrastes automatizados heredados de MAP-029 son:

- primary: 14.80:1;
- muted: 8.96:1;
- accent: 8.78:1;
- strong accent: 11.58:1;
- focus ring: 12.16:1.

## Validación administrativa de producción

Sin usar credenciales personales se agotó la validación automatizable:

1. allowlist real + JWT simulado dentro de una transacción: `current_user_is_admin() = true`;
2. identidad autenticada no allowlisted: `false`;
3. admin allowlisted: lectura de `admin_get_map_entity_editor` correcta;
4. admin allowlisted: escritura no destructiva/no-op afecta una fila dentro de transacción y se revierte;
5. no-admin autenticado: la misma escritura afecta 0 filas;
6. `anon`: `submit_public_request` acepta una solicitud dentro de una transacción;
7. `ROLLBACK`: quedan 0 solicitudes residuales.

El único paso que no puede automatizarse sin poseer una credencial personal es comprobar la sesión real alojada desde la UI. Antes de cerrar #49 el propietario debe confirmar login, visibilidad de la superficie administrativa y logout correcto. No se solicitará ni almacenará la contraseña.

## Estado de Supabase después del despliegue

- proyecto: `atlas-nuevos-dioses-prod`;
- estado: `ACTIVE_HEALTHY`;
- migraciones: 16, sin cambios de MAP-030;
- tablas públicas con RLS: 14;
- categorías publicadas: 2;
- tags publicados: 4;
- entidades publicadas: 2;
- aliases publicados: 2;
- relaciones entidad–tag: 6;
- notas públicas: 2;
- relaciones nota–tag: 5;
- solicitudes persistentes: 0.

## Rollback

Baseline seguro anterior:

`3f4052027a511da63b84886498b25edc12ca3b43`

SHA funcional publicado:

`3de99ee6d080d552606383601340378d5d6c0e91`

MAP-030 no añade migraciones. Una regresión de frontend puede retirarse con una PR de `git revert`, seguida por el mismo gate CI → Pages → smoke; no se usa force-push ni se reescribe historial.

Las migraciones de Supabase son forward-only. Ante una desalineación futura, se prioriza desplegar frontend compatible o una migración correctiva hacia delante. La migración de catálogo de MAP-028 dispone de rollback lógico por archivado, sin borrado físico.

Procedimiento completo: [`deployment-and-rollback.md`](deployment-and-rollback.md).

## Riesgos residuales

Se heredan sin cambio las decisiones ya aceptadas en MAP-029:

- **R-01** — sin rate limiting autoritativo por IP/dispositivo para solicitudes públicas: aceptado para Beta 0.2 con seguimiento;
- **R-02** — leaked-password protection de Supabase Auth desactivada: aceptado para Beta 0.2 con seguimiento;
- **R-03** — `submit_public_request` conserva propietario elevado: deuda posterior de defensa en profundidad;
- **R-04** — sin sesión humana con lector de pantalla real: deuda posterior de assurance;
- **R-05** — advisors de rendimiento con catálogo mínimo: deuda posterior.

MAP-030 no ha creado un riesgo material nuevo que requiera una aceptación adicional.

## Condición de cierre

La publicación técnica de Beta 0.2 ya cumple build, snapshot, deploy, smoke público, Supabase, autorización automática, resiliencia y rollback.

**Issue #49 permanece abierta** hasta registrar el único checkpoint manual inevitable: login/logout con la cuenta administrativa real. Si ese control es satisfactorio y no revela un bloqueo nuevo, la Issue puede cerrarse como `completed`.
