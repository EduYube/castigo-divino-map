# Estado del proyecto

## Resumen

- Proyecto: **El Atlas de los Nuevos Dioses**.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: **Beta 0.2**.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Fecha de publicación técnica validada: **2026-08-09**.
- SHA funcional de Beta 0.2 desplegado y smokeado: `3de99ee6d080d552606383601340378d5d6c0e91`.
- Pages validado para ese SHA: run `31300919855`.
- `github-pages/deployment`: `success`.
- Issue de release: #49 — MAP-030.
- Estado de MAP-030: publicación automática completada; queda únicamente el checkpoint humano de sesión administrativa real con credenciales personales antes del cierre de la Issue.
- Última actualización: **2026-08-09**.

Los commits posteriores que solo actualicen evidencia/documentación pueden provocar un nuevo despliegue de Pages con un SHA de fuente distinto pero un runtime equivalente. El SHA anterior identifica el código funcional de Beta 0.2 que superó build, deploy y smoke publicados; el SHA final de `master` se registra en #49 al cerrar el release.

## Capacidades publicadas en Beta 0.2

Beta 0.2 conserva los contratos públicos de Beta 0.1 y publica:

- mapa oficial remoto de Faerûn, sin copiar ni transformar la imagen en el artefacto;
- búsqueda geográfica, búsqueda por entidades/aliases/notas, filtros y navegación por URL/historial;
- pines accesibles para `character` y `location`, incluidos grupos en coordenadas coincidentes;
- fichas compactas y fichas públicas completas con relaciones e historial visibles cuando existen;
- controles responsive/colapsables y experiencia usable a 320 px;
- solicitudes públicas de nuevos pines sin sesión administrativa;
- moderación y catálogo persistente de Beta 0.2 en Supabase;
- autenticación y superficies administrativas separadas del acceso público;
- snapshot público versionado y modo degradado cuando Supabase falla;
- recuperación explícita mediante retry sin polling automático.

## Evidencia del release MAP-030

### Pull requests

- PR #85 — `MAP-030 — Publicar y validar la Beta 0.2`.
  - head validado: `fcb8ca2b84d07d50157509c67b746feb0041a0a1`;
  - CI de PR final: run `31299977748`, completamente verde tras reintentar un job de Supabase afectado por una colisión transitoria del puerto Docker `54322`;
  - merge funcional: `7b239aeae87b807db96687b6026542150b54dad8`.
- PR #86 — `MAP-030 — Corregir smoke local previo a Pages`.
  - corrección exclusivamente de test tras un falso negativo de Pages;
  - head validado: `e0b51133f87f5597892245b8ec42115dae15eb0c`;
  - CI de PR final: run `31300597886`, completamente verde;
  - merge funcional final: `3de99ee6d080d552606383601340378d5d6c0e91`.

### GitHub Pages

Primer intento post-merge sobre `7b239aea…`:

- Pages run `31300332425`;
- snapshot remoto, build y auditoría pasaron;
- el smoke local bloqueó correctamente el deploy por una aserción de test demasiado estricta;
- no se ejecutó `actions/deploy-pages` y producción permaneció en el estado seguro anterior.

Intento final sobre `3de99ee6d080d552606383601340378d5d6c0e91`:

- Pages run `31300919855`;
- `Verify public snapshot against Supabase`: `success`;
- `Build application for GitHub Pages`: `success`;
- `Audit production artifact`: `success`;
- smoke local de Pages: **4/4**;
- `Deploy GitHub Pages`: `success`;
- smoke contra `https://eduyube.github.io/castigo-divino-map/`: **4/4**;
- `github-pages/deployment`: **success**.

El wrapper disponible para Actions enumera runs asociados a `pull_request`, no el run `push` de `master`. No se inventa su ID. La ejecución automática de Pages solo entra en la ruta de despliegue cuando el evento `workflow_run` de CI sobre `master` concluye `success`, y el run `31300919855` resolvió y reconstruyó exactamente el SHA `3de99ee6…`.

## Pruebas y calidad

En el candidato funcional validado:

- formato: verde;
- auditoría de credenciales versionadas: verde;
- invariantes de accesibilidad: verde;
- lint: verde;
- unitarios: **262/262** en 43 archivos;
- E2E completos: **122/122**;
- smoke local del build Pages: verde;
- pgTAP/RLS: **292/292** en 15 archivos;
- concurrencia Supabase: **17/17** comprobaciones, 13 generales y 4 de moderación;
- npm audit del build final: **0 vulnerabilidades** sobre 175 paquetes.

La cobertura de accesibilidad conserva teclado, foco, 320 px, `prefers-reduced-motion`, `forced-colors` y los checks automatizados de contraste heredados de MAP-029. La suite de resiliencia cubre HTTP 503, 429, timeout/lentitud, conexión rechazada/red no disponible, JSON inválido, respuesta incompleta y recuperación explícita mediante retry.

## Artefacto de producción

El build final de Pages contiene únicamente cuatro ficheros publicables:

- `index.html`: 711 bytes;
- CSS: 75,939 bytes;
- JavaScript: 419,530 bytes;
- `data/public-catalog.snapshot.json`: 3,595 bytes.

Totales del artefacto extraído:

- tamaño sin comprimir: **499,775 bytes**;
- gzip calculado localmente sobre los cuatro ficheros: **131,500 bytes**;
- source maps: **0**;
- imágenes raster empaquetadas: **0**.

El artefacto `github-pages` del run `31300919855`:

- artifact id: `9034455436`;
- tamaño del archivo subido: 132,718 bytes;
- digest del artefacto: `sha256:4313fbd327857699fff552e19995b7a2bc6dc673cb0e0efbac06cbd8f32ca8ca`.

El build mantiene únicamente la URL pública y la clave publicable de Supabase. La auditoría de `dist` confirma ausencia de `service_role`, `sb_secret_*`, tokens de gestión, contraseñas, connection strings privilegiadas y copias raster del mapa oficial.

## Snapshot público

Archivo: `public/data/public-catalog.snapshot.json`.

Checksum canónico del contenido público:

`sha256:27c51790408f662898d6aea09fb1845f6aa9029ed9c0e08802d3effeaaff6683`

El run final de Pages verificó ese checksum tanto localmente como contra la Data API pública de Supabase antes de desplegar. El snapshot contiene solo la proyección pública publicada y excluye solicitudes, remitentes, motivos, notas de moderación y datos administrativos.

## Supabase de producción

Proyecto: `atlas-nuevos-dioses-prod` (`ehpouvbzmvwbkkoypgfa`).

Estado antes y después del despliegue: `ACTIVE_HEALTHY`.

Historial alojado: **16 migraciones**. Las últimas son:

1. `20260808172454_add_public_request_moderation`;
2. `20260809003008_migrate_beta01_public_catalog`.

MAP-030 no introduce DDL ni una migración propia. No había ninguna migración de release pendiente y no se reaplicó ninguna migración ni se ejecutó `seed.sql`.

Estado post-deploy:

- tablas públicas con RLS activa: **14**;
- categorías publicadas: 2;
- tags publicados: 4;
- entidades publicadas: 2;
- aliases publicados: 2;
- relaciones entidad–tag publicadas: 6;
- notas públicas: 2;
- relaciones nota–tag publicadas: 5;
- solicitudes públicas persistentes después de los smoke transaccionales: **0**.

## Autorización administrativa

MAP-030 no cambia Auth, RLS, grants, owners, policies ni la allowlist.

Validaciones automáticas realizadas directamente contra producción, siempre dentro de transacciones revertidas:

- la identidad allowlisted devuelve `current_user_is_admin() = true`;
- una identidad autenticada no allowlisted devuelve `false`;
- el admin allowlisted puede leer `admin_get_map_entity_editor` y una escritura no destructiva/no-op afecta una fila dentro de la transacción;
- el usuario autenticado no allowlisted no puede modificar esa fila: 0 filas afectadas;
- `anon` puede invocar `submit_public_request`; tras `ROLLBACK` quedan 0 filas persistidas.

La contraseña personal del administrador no se ha solicitado, copiado ni expuesto. El único control pendiente antes de cerrar #49 es comprobar en la URL alojada que las credenciales reales permiten iniciar sesión, que aparece la superficie administrativa y que el cierre de sesión devuelve correctamente a la experiencia pública.

## Rollback

Baseline seguro anterior a MAP-030:

`3f4052027a511da63b84886498b25edc12ca3b43`

SHA funcional Beta 0.2 desplegado y validado:

`3de99ee6d080d552606383601340378d5d6c0e91`

MAP-030 no añade migraciones, por lo que una regresión del frontend puede retirarse mediante una PR de `git revert` sobre `master`, seguida de CI y Pages normales. No se usa force-push ni se reescribe historial.

Las migraciones de Supabase son forward-only. Si frontend y base de datos quedasen desalineados, se prioriza un frontend compatible o una migración correctiva hacia delante. El catálogo migrado por MAP-028 conserva rollback lógico por archivado y no requiere borrado físico.

Procedimiento completo: [`deployment-and-rollback.md`](deployment-and-rollback.md).

## Riesgos residuales

MAP-030 no ha descubierto un riesgo material nuevo que requiera aceptación adicional. Se conservan las decisiones ya adoptadas en MAP-029:

- **R-01** — sin rate limiting autoritativo por IP/dispositivo para solicitudes públicas: aceptado para Beta 0.2 con seguimiento;
- **R-02** — leaked-password protection de Supabase Auth desactivada: aceptado para Beta 0.2 con seguimiento;
- **R-03** — propietario elevado de `submit_public_request`: deuda posterior de defensa en profundidad;
- **R-04** — sin sesión humana con lector de pantalla real: deuda posterior de assurance;
- **R-05** — advisors de rendimiento con catálogo mínimo: deuda posterior.

## Estado de cierre

La publicación técnica de Beta 0.2 está completada: frontend, snapshot, Supabase, build, deploy, smoke publicado, separación de autorización y rollback están validados.

**#49 no debe cerrarse todavía.** Falta únicamente el checkpoint humano de login/logout administrativo real que requiere las credenciales personales del propietario. Tras registrar ese resultado en la Issue, y siempre que sea satisfactorio, MAP-030 puede cerrarse como `completed`.

La evidencia ampliada está en [`map-030-release.md`](map-030-release.md). El historial detallado de MAP-001 a MAP-029 permanece conservado en Git y en la documentación específica de cada Issue/PR.
