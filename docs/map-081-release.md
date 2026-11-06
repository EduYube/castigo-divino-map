# MAP-081 — Gate QA y preparación de release v1.3.0

**Issue:** #202 · **Repo:** `EduYube/castigo-divino-map` · **BASE:** `f673c73a19dc61a972acd4b7ee07cb95a67e3240` · **Fecha de preparación:** 2026-11-06.

**Estado de esta rama:** candidata `1.3.0 / v1.3` para **revisión independiente**, sujeta a CI verde del HEAD exacto. No es una release publicada. No crear tag, GitHub Release, Ready, merge ni hacer deploy manual durante MAP-081. Ninguna escritura a Supabase de producción, ninguna migración MAP-081.

## 1. Alcance y delta frente a v1.2

El bump es **minor** y compatible: nuevas capacidades visibles de mapas locales sin alterar la identidad mundial, no un cambio breaking.

| Entrega | Evidencia técnica y producto |
| --- | --- |
| MAP-075 | `docs/map-075-local-map-contexts.md`, `map_contexts` y `entity_map_placements` opcionales, geometrías CRS.Simple y aislamiento por campaña; migración y pgTAP preexistentes. |
| MAP-076 | `docs/map-076-local-map-sources.md`, selección cartográfica y bloqueo de redistribución hasta acreditar procedencia/derechos; ninguna imagen incorporada. |
| MAP-077 | `docs/map-077-neverwinter-local-navigation.md`, `campaign_geographic_map_context_links`, deep links, entrar/volver, History, refresh, campana activa y neutral Neverwinter. |
| MAP-078 | `docs/map-078-local-map-admin.md`, CRUD controlado de contextos, bindings y placements; provenance, lifecycle, geometría y purga administrativa. |
| MAP-079 | `docs/map-079-public-multimap-local-only.md`, lector público autónomo local-only/world+local; entidad canónica única, point/polygon, búsqueda/fichas; RLS y helper privados. |
| MAP-080 | `docs/map-080-snapshot-degraded-multimap.md`, snapshot V4 atómico a nivel de proyección validada, session cache, degraded/offline, recuperación y hardening de estado Máster. |

**Incluido:** Neverwinter físico lógico `2048×1582` publicado, `map-neverwinter`, link exclusivo `un-aliento-menos` + `geo-neverwinter`, panel de entrada/retorno, contextos locales opcionales, editores, reader multi-map, búsqueda y ficha sin ID duplicada, RLS y grants explícitos, accesibilidad y responsive.

**Excluido deliberadamente:** placement canónico local de Veyra, entidades reales local-only, raster de Neverwinter, Skade/Ura dentro de mapas locales y City of Shadows / Shade. No son defectos de la release. Su capacidad se verifica únicamente con fixtures sintéticos, no con datos falsos persistentes.

**Derechos:** asset seleccionado `RIGHTS_METADATA_PENDING`. `image_uri=NULL` y `loading_strategy=NULL` en Neverwinter; usar únicamente cuadrícula neutral. No copiar, recortar, transformar, hotlinkear, alojar, servir ni incorporar el raster a snapshot/repositorio/Pages, ni añadir tiles. La licencia del mapa mundial es distinta.

## 2. Estado real comprobado antes de la rama

- GitHub `master` = BASE exacta. Pages baseline `42104954892` `SUCCESS` para la BASE (todavía v1.2).
- Snapshot público comprometido: `schemaVersion=4`, `checksum=sourceRevision=sha256:4ace919dac2936ba7042ea85569d8a6eaf6801b86836e7332fc85afd95d5719b`, generado 2026-11-05. El blob del snapshot no se modifica para esta release.
- Supabase producción (consultas solo lectura, 2026-11-06): un contexto `map-neverwinter` `published`, `2048×1582`, sin imagen/estrategia; un binding `un-aliento-menos + geo-neverwinter` y **0 placements**. Castigo Divino sin binding.
- Migraciones remotas incluyen MAP-075, MAP-077, MAP-079 e INFRA #210. Precaución histórica: fichero Git `20261021095215_harden_explicit_data_api_grants.sql` versus registro remoto `20261022213637`. **No `supabase db push` a ciegas** por ese alias.
- Auditoría de catálogo SQL: RLS activo en `map_contexts`, `campaign_geographic_map_context_links`, `entity_map_placements` y `map_entities`; `anon` conserva SELECT de superficie pública bajo RLS, y `authenticated` genérico no tiene INSERT de tabla en ellas. La cobertura completa por columna/función se valida por `supabase:db:validate`; esta inspección parcial no la sustituye.

## 3. Matriz QA de aceptación

**Interpretación:** `AUTOMATED (CI)` designa escenarios cubiertos por pruebas existentes que deben ejecutarse para el HEAD candidato; no significa PASS hasta contrastar sus jobs. `HUMAN REQUIRED` indica inspección visual o sesión real no ejecutada por este agente. Los mocks/fixtures nunca son producción.

| Gate | Cobertura reproducible y procedencia | Carril |
| --- | --- | --- |
| Neverwinter real y campaña A/B | `tests/e2e/map077-local-navigation.spec.ts`: CTA de Un aliento, rechazo Castigo, deep links, refresh, Back/Forward, volver, superficie neutral; `tests/deployment/pages-smoke.spec.ts`: fallback V4 de Pages y rechazo cross-campaign | AUTOMATED (CI) |
| Dimensiones y raster | `src/app/localMapNavigation.ts` construye bounds con width/height; snapshot/SELECT acreditan 2048×1582 y ausencia de `imageUri`; E2E verifica texto neutral y el nuevo Pages smoke prohíbe image overlay | AUTOMATED (CI) + SOURCE/DB READ |
| Local-only, world+local, point/polygon, identidad, búsqueda/ficha | Fixtures `map077-local-navigation` `MAP-079`, `map080-degraded`, unit/integration `publicLocalMapRepository`, `publicCatalogSnapshot` | AUTOMATED (CI) |
| Navegación, history, refresh y filtros/capas | `map077-local-navigation`, `map065-layers`, `map065-url-responsive` y negativos MAP-079 | AUTOMATED (CI) |
| Administración contexts, lifecycle, source, bindings, CRUD y geometría | `tests/e2e/map078-local-admin.spec.ts`, `adminLocalMapRepository.test.ts`, `domain/adminLocalMaps.test.ts` y `supabase/tests/database` con fixtures/transacciones y rollback | AUTOMATED (CI) |
| SQL/RLS/grants: anon, non-admin, admin, draft/archived, unbound, organization, bounds, campaign | `npm run supabase:db:validate`, pgTAP/RLS, HTTP Data API INFRA #210, migration upgrade y concurrencia | AUTOMATED (CI) + PRODUCTION READ |
| Master purge, logout, stale/callbacks y revocación | `map080-master-local-revocation`, `campaign-master-mode-stale-response`, `map061-master-status-purge`, `masterModeController.race.test.ts`, `map078-local-admin` | AUTOMATED (CI) |
| Connected, degraded, offline, session cache V4, recovery, sin mezcla remota | `map080-degraded`, `map077-local-navigation`, `publicCatalogSnapshot.test.ts` y `snapshot:verify(:remote)`; optimista de doble pasada documentada en MAP-080 | AUTOMATED (CI) |
| Accesibilidad teclado, foco, region/pin/selector, anuncios | `map077-local-navigation`, `map078-local-admin`, `map080-degraded`, `responsive-accessibility` y `verify:accessibility`; deuda P3 #219 se registra separada | AUTOMATED (CI) |
| Forced colors / reduced motion | `map077-local-navigation` usa `page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })`; CSS de foco/estado visual | AUTOMATED (CI); examen visual HUMAN REQUIRED |
| Responsive 320/390/430/desktop | bucles E2E `map077-local-navigation`, `map080-degraded`, `map078-local-admin`; 320 Pages smoke, width sin scroll horizontal | AUTOMATED (CI); examen visual HUMAN REQUIRED |
| Chromium, WebKit y Firefox | Matriz existente de `.github/workflows/ci.yml` (Chromium + WebKit + mobile, Firefox y Firefox-MAP061), sin reducción de proyectos | AUTOMATED (CI) |
| Consistencia de 1.3 + Pages local | `verify:release-version`, `build`, `build:pages`, `test:e2e:pages` y artifact audit | AUTOMATED (CI) |

**Estado de aceptación:** pendiente de resultados CI del HEAD creado. Ninguna QA humana se presume realizada. Una ejecución local de Playwright/Supabase requiere checkout y contenedor/red local; un job previo exitoso sobre BASE no acredita el HEAD.

### Checklist humana específica (sin fingir ejecución)

En navegador real y entorno controlado, revisar con 320, 390, 430 y desktop: selector Campaña, world map, CTA Neverwinter, entrada, breadcrumb/volver, foco visible, search/results, fichas y bottom sheet, desplazamiento y clipping. Repetir teclado Tab/Shift+Tab/Enter/Espacio/Escape, zoom/foco de polígonos y spiderfy; verificar forced colors y reduced motion cuando el navegador lo permita. Con credenciales de QA **no productivas**, inspeccionar admin (context/atribución/binding/placement/archivado, validaciones y revocación) sin escribir datos canónicos en producción. Confirmar visualmente anuncios públicos y ausencia de contenido Master viejo tras cambio A↔B o logout. Registrar hallazgos y capturas sin secretos; no convertir en PASS un carril no ejecutado.

## 4. Seguridad y resiliencia

- La identidad canónica sigue en `map_entities`; los placements no crean identidades `entity-world`/`entity-local` ficticias. Las relaciones se autorizan por campaña, publicación y contexto.
- `anon`: solo superficie pública según grants explícitos + RLS. `authenticated` sin admin: autenticación no concede CRUD. Admin: operaciones conforme a ACL de columna, RLS y validaciones SQL. Contextos draft/archived o sin binding no autorizan navegación pública.
- Switching de campaña/contexto, logout, pérdida de autorización, cambios de estado y respuestas tardías: los mecanismos de generación/abort y las pruebas de carreras invalidan DOM, búsqueda, fichas, callbacks y anuncios obsoletos. Los datos Master jamás forman parte del snapshot o cache pública.
- Connected: revisión completa V4 de mundo + todos los mapas. Degraded/offline: solo V4 validada de cache de sesión o bundle, nunca mezcla de revisiones remotas/world-only de V1–V3 reinterpretadas como mapas locales. Recuperación connected valida una nueva revisión íntegra. El doble muestreo detecta drift común, **no** garantiza MVCC/ABA.
- `npm run snapshot:verify` verifica schema/checksum y exclusiones de contenido; `npm run snapshot:verify:remote` es **gate obligatorio del HEAD final**. Ante checksum remoto diferente: bloquear, identificar diff semántico y privacidad; nunca regenerar ni escribir a ciegas.

## 5. Validación y criterios de corte

Antes de aceptar la PR: `npm ci`, `format:check`, `verify:security`, `verify:accessibility`, `lint`, `test`, `build`, `build:pages`, `verify:release-version`, `snapshot:verify`, `validate:data`, `supabase:db:validate`, `supabase:migration:list`, `test:e2e` y `test:e2e:pages`. Documentar qué se ejecutó localmente, en CI o quedó sin ejecutar; no atribuir PASS a comandos no ejecutados. CI tiene los jobs de calidad/E2E+Pages, Firefox y Supabase migrations/RLS. Conteos, skips/retries y run/attempt del HEAD exacto se anotan en PR tras su ejecución.

No ampliar retries/timeouts ni debilitar assertions para obtener verde. Flakes conocidos: #208 (post-save), #213 (Escape/spiderfy), #214 (autorización admin), #215 (Enter/Space/foco) y #219 (P3 anuncio Máster por texto/audiencia). Retry recuperado sin defecto funcional es deuda; reproducción real de aislamiento, fuga o caída de un criterio v1.3 **bloquea** el gate.

## 6. Procedimiento de publicación — NO EJECUTAR en Draft

1. CI íntegramente verde sobre HEAD exacto de la Draft PR y `snapshot:verify:remote` idéntico.
2. Revisión técnica de otro agente aislado; resolver findings y revalidar nuevo HEAD con el mismo reviewer.
3. `APPROVE` y checkpoint humano explícito; marcar Ready y hacer merge solo tras autorización.
4. Validar CI de `master`, Pages automáticas y `published smoke` sobre el SHA publicado; verificar checksum remoto, seguridad y etiquetas UI.
5. Crear **después** tag **anotado** `v1.3.0` al commit aprobado, y entonces GitHub Release con las notas de la sección 7. Verificar enlace, checksum, Pages y trazabilidad final; cerrar #202 únicamente al concluir.
6. No mover un tag publicado, no force push, no forzar deploy manual de Pages desde esta Draft PR.

**Rollback frontend:** nueva PR con `git revert` del cambio aprobado, CI y Pages normales, más verificación del publicado. **DB:** cambios siempre forward-only; sin migración nueva MAP-081, no revert destructivo ni `supabase db push` para reconciliar el alias INFRA #210.

## 7. Release notes propuestas (NO PUBLICADAS)

### v1.3.0 — Mapas locales opcionales

- Entrar y salir de mapas locales desde la geografía pública, con URLs compartibles, Back/Forward y refresh.
- Neverwinter disponible en `Un aliento menos` como superficie neutral de 2048×1582. `Castigo Divino` no hereda ese binding. Raster seleccionado **pendiente de derechos**: no se distribuye.
- Administración de contextos físicos, bindings campaña/geografía y placements de puntos y regiones con provenance, bounds y ciclo editorial.
- Lector público multi-map, soporte world+local y local-only, búsqueda y fichas con una única identidad canónica.
- Snapshot público V4 y recuperación en degraded/offline a través de revisiones completas verificadas y cache de sesión V4.
- Endurecimiento de aislamiento entre campañas, permisos RLS/grants y purga de estado privado Master; foco, teclado y responsive.
- Incluye MAP-075, MAP-076, MAP-077, MAP-078, MAP-079 y MAP-080.
- Excluido: City of Shadows / Shade (deferred), placements canónicos no autorizados y raster Neverwinter (rights pending).
- QA no bloqueante conocida: #208, #213, #214, #215 y #219. Su estado no es una garantía de que hayan quedado corregidas.

**Residual explícito:** consistencia remota V4 por comprobación consecutiva sin garantía MVCC ante ABA; deuda E2E conocida sujeta a observación; inspección visual/manual adicional solo donde el test automatizado no la sustituye. Todo hallazgo real de privacidad, aislamiento o contenido privado bloquea release.

**Publicación pendiente**: no existe tag v1.3.0 ni GitHub Release ni Pages v1.3 en la fase Draft.
