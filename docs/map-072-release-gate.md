# MAP-072 — Gate QA y release v1.2.0 (ejecución incompleta)

> **Decisión actual: RELEASE GATE BLOCKED.** Este documento registra una sesión de verificación parcial y bloqueos reales, no una aprobación QA. La Fase B **no se ha iniciado**: sin bump, tag, GitHub Release, PR Draft ni merge. No se ha confundido CI/E2E con los 27 escenarios manuales.

## 1. Sesión y alcance

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-13 (Europe/Madrid) |
| Tester | Agente ChatGPT GPT-6 — sesión conectada a GitHub y Supabase |
| Baseline `master` / candidate QA SHA | `8927beb4bcd2b9a8988fcc95357315752469d74b` |
| Rama dedicada | `agent/map-072-v1-2-release-gate`, creada desde el SHA exacto |
| Target semver / etiqueta deseada | `1.2.0 / v1.2` (no aplicado) |
| Actual semver / etiqueta | `1.1.0 / v1.1` |
| URL prevista | https://eduyube.github.io/castigo-divino-map/ |
| Entornos efectivamente consultados | GitHub: repositorio, snapshot versionado y Actions; Supabase producción: catálogo SQL y migraciones, exclusivamente SELECT/lectura |
| Browser instalado localmente | Chromium 144.0.7559.96; Playwright CLI 1.57.0 |
| Browser **usado para QA** | Ninguno: DNS/conectividad del contenedor a GitHub/Pages falló y no hubo sesión de navegador conectado a la URL publicada. Una lectura mediante herramienta web también resultó inaccesible |
| Dispositivo / viewport **ejecutado** | Ninguno. **No** se ejecutaron 320/390/430/desktop |
| Campaña pública inicial / administrativa inicial | No observadas en UI. Roster solo contrastado con SQL, sin login |
| Autorización mutadora | Ninguna aportada para fixtures locales ni dataset de QA; producción expresamente **read-only** |
| Autorización administrativa | No se obtuvo una sesión admin de navegador utilizable; no se ensayó login/logout |
| Entorno M/C | No preparado ni ejecutado; no hubo mutaciones locales ni simulaciones |

### Evidencia complementaria verificada — no equivale a QA manual

- **GH-BASE:** `master` apunta exactamente al SHA requerido y PR #193 está merged sobre ese commit: https://github.com/EduYube/castigo-divino-map/pull/193
- **GH-CI:** Actions CI `38310756257`, intento 1, `success`, HEAD `8927beb...`; jobs *Build, quality and tests* y *Supabase migrations, lint and RLS tests* verdes: https://github.com/EduYube/castigo-divino-map/actions/runs/38310756257
- **GH-PAGES:** `38312186928`, intento 1, `success`, HEAD `8927beb...`; `snapshot:verify:remote`, build, auditoría, Pages, smoke publicado y registro deployment con pasos verdes: https://github.com/EduYube/castigo-divino-map/actions/runs/38312186928
- **DB-MIG:** Supabase producción `atlas-nuevos-dioses-prod`, estado ACTIVE_HEALTHY; migraciones `20261008154209_map_068_separate_veyra_un_aliento_menos` y `20261009103615_map_069_add_nonspatial_organizations` presentes en historial. Consulta exclusivamente read-only el 2026-10-13.
- **DB-ROSTER:** consulta SQL de campañas/players confirma ambas activas: Castigo Divino = Skade, Ura; Un aliento menos = Veyra. Corrobora datos de partida; **no** comportamiento de selector UI ni ausencia de contaminación visual.
- **DB-COUNT:** conteo de producción solo lectura: `map_entities=17`, `organizations=0`, `entity_relations=0`, `entity_player_dispositions=32`, `entity_player_associations=0`, `public_requests=2`, `players=3`. No se consultó el contenido narrativo privado ni las solicitudes.
- **SNAPSHOT:** `public/data/public-catalog.snapshot.json` de baseline contiene schema v3, `sourceRevision` y `checksum` iguales a `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`; el blob Git registrado es `2f4fa585241e9e5c8bb87a7443f4634bf048220b`. Los dos campaignCatalogs contienen 14/1 entidades, 0 relaciones genéricas y rosters esperados. **No se regeneró snapshot**.

## 2. Quick smoke producción (P)

**Resultado: BLOCKED / NOT EXECUTED.** No fue posible completar el quick smoke de diez pasos de la guía MAP-071: esta sesión no tuvo navegador navegable conectado al sitio público ni cuenta admin utilizable. No se efectuaron cambios de campaña, login/logout, cambios de selección ni pruebas de foco, roster, relaciones, organizaciones, bandeja o Master mediante UI.

El `published smoke` automatizado del baseline (GH-PAGES) fue **success**, pero esto **no** convierte en PASS el quick smoke manual. La ausencia en producción de organizaciones y relaciones genéricas implica además que sus subpasos requieren fixtures locales autorizados. **No se insertaron canaries.** No hay regresión de UI demostrada ni tampoco evidencia manual suficiente para descartarla.

## 3. Matriz manual de 27 escenarios — fuente canónica MAP-071

La guía `docs/map-071-admin-qa-guide.md` tiene 27 IDs. **Estado de todos: BLOCKED**, por no haber sido observados manualmente a través de la interfaz ni ejecutados en fixtures pertinentes. `DB-ROSTER`, `DB-COUNT` y los E2E/CI son comprobaciones auxiliares y **nunca** sustentan por sí solas un PASS.

| QA ID | Carril MAP-071 | Estado | Evidencia ausente / bloqueo específico | Finding FAIL |
| --- | --- | --- | --- | --- |
| `QA-AUTH-01` | P | **BLOCKED** | Sin sesión administrativa ni navegador conectado; login/logout/foco no observados. | No |
| `QA-AUTH-02` | P/C | **BLOCKED** | No hay cuenta no-admin/fixture de revocación ni UI observada. | No |
| `QA-CAMP-01` | P | **BLOCKED** | Roster A/B confirmado solo por SELECT; banner, selector y aria-live sin inspección UI. | No |
| `QA-CAMP-02` | P | **BLOCKED** | Sin cambio A↔B visible; DB no acredita purge de listas/editores. | No |
| `QA-CAMP-03` | P | **BLOCKED** | Sin formulario autenticado; cancelación de borrador local sin ejecutar. | No |
| `QA-CAMP-04` | P | **BLOCKED** | Sin formulario autenticado; aceptación de descarte sin ejecutar. | No |
| `QA-CAMP-05` | C | **BLOCKED** | No se ejecutó fixture de fallo de roster B ni rollback visual. | No |
| `QA-CAT-01` | M | **BLOCKED** | Sin stack y dataset mutador autorizado; CRUD/validación/ciclo editorial no ejecutados. | No |
| `QA-CAT-02` | M | **BLOCKED** | Sin fixture de dependencia/conflicto ni dos pestañas de UI. | No |
| `QA-ENTITY-01` | M | **BLOCKED** | Sin UI y fixture: geometrías, cuatro tipos y validaciones no ejecutadas. | No |
| `QA-ENTITY-02` | M | **BLOCKED** | Sin dataset mutador: search_only/pin, publicación y archivado no observados. | No |
| `QA-ORG-01` | P/M | **BLOCKED** | Producción cuenta 0 organizaciones; sin fixture/editor para las comprobaciones requeridas. | No |
| `QA-ROSTER-01` | P/M | **BLOCKED** | Roster corroborado por SELECT, pero sin selector de roster ni negativos UI. | No |
| `QA-DISP-01` | P/M | **BLOCKED** | Producción tiene 32 filas de dispositions, pero no se observaron tokens/neutral/cambio de campaña en UI. | No |
| `QA-ASSOC-01` | P/M | **BLOCKED** | Producción cuenta 0 asociaciones PJ; sin fixture/editor y comprobación cross-campaign. | No |
| `QA-REL-01` | P/M | **BLOCKED** | Producción cuenta 0 relaciones genéricas; sin fixture para orientación/targets. | No |
| `QA-REL-02` | P/M | **BLOCKED** | Sin fixture de archived histórico/nuevo ni negativa cross-campaign. | No |
| `QA-REQ-01` | P/M | **BLOCKED** | Hay 2 solicitudes reales, no se moderaron; sin acceso a bandeja de UI ni fixture M. | No |
| `QA-REQ-02` | M | **BLOCKED** | Sin fixture de solicitud: conversión exactly-once y estado draft no observados. | No |
| `QA-REQ-03` | P | **BLOCKED** | Sin editor de nota ni confirmación de cambio de campaña observados. | No |
| `QA-PUBLIC-01` | P | **BLOCKED** | Sin selectores público A / admin B visibles; divergencia del banner no observada. | No |
| `QA-MASTER-01` | P/C | **BLOCKED** | No hay sesión Master autorizada ni fixture de stale responses; purge/logout no observados. | No |
| `QA-NAV-01` | P | **BLOCKED** | Sin navegador conectado: búsqueda, deep links, history y negativos sin ejecutar. | No |
| `QA-DEG-01` | C | **BLOCKED** | Sin servidor/fixture de offline controlado ni inspección de fallback snapshot. | No |
| `QA-RESP-01` | P | **BLOCKED** | No se ejecutaron viewports 320/390/430/desktop ni inspección visual. | No |
| `QA-A11Y-01` | P | **BLOCKED** | No se ejecutaron Tab, Shift+Tab, Enter, Espacio, Escape, foco ni forced-colors/reduced-motion. | No |
| `QA-SEC-01` | P/C | **BLOCKED** | Sin navegación anon/no-admin/admin ni revocación UI; auditoría SQL/CI no sustituye comprobación. | No |

### Recuentos

| PASS | FAIL | BLOCKED | N/A |
| ---: | ---: | ---: | ---: |
| **0** | **0** | **27** | **0** |

**Findings `MAP072-QA-XX`: ninguno abierto.** No hubo observación suficiente para declarar un FAIL reproducible. Los 27 BLOCKED **no son PASS** y son bloqueantes para avanzar. No se ha atribuido `N/A` a falta de tiempo, navegador, fixture o capacidad de observación.

## 4. Seguridad y producción

- Acciones realizadas: lecturas GitHub, lectura del JSON snapshot versionado, listados de tablas/migraciones Supabase y consultas SQL SELECT agregadas o de roster público; tentativa no satisfactoria de abrir URL pública mediante cliente web.
- Acciones no realizadas: login, escritura CRUD, publicación, archivo, moderación, modificación de roster, relaciones, Master Mode, simulaciones de errores en producción.
- Ningún dato narrativo Master, correo de administrador, contraseña, JWT, service-role ni token se almacenó en esta evidencia.
- Ausencia de acceso UI = **no se ha acreditado** seguridad observable de anon/no-admin/admin, ni purge Master, ni control negativo cross-campaign en interfaz.

**PRODUCTION WRITES: 0**

**LOCAL / FIXTURE MUTATIONS:** 0. No hubo datasets de prueba creados, ni limpieza pendiente ni reset realizado.

## 5. Alcance de release propuesto y razón semver (todavía no aplicado)

La transición `1.1.0 → 1.2.0`, label `v1.1 → v1.2` tiene fundamento funcional, y no corresponde a un patch `1.1.1`:

- **MAP-067:** indicadores visibles de relaciones con personajes jugadores en el mapa.
- **MAP-068:** campaña real **Un aliento menos** y separación de Veyra, aislamientos A/B.
- **MAP-069:** organizaciones no cartográficas y relaciones genéricas `entity_relations`.
- **Snapshot post-MAP-069:** reconciliación schema v3 con estado remoto.
- **MAP-070:** UX administrativa multicampaña, purga/cambio de contexto y hardening.
- **MAP-071:** guía QA administrativa canónica MD/PDF y chequeo de equivalencia.

El delta combina nuevas capacidades compatibles con versiones anteriores, en vez de solo correcciones. **Este resumen es borrador de futuras release notes; no se ha publicado ninguna release.**

## 6. Fase B no iniciada: versionado, reconciliación y validaciones

Por la condición explícita `Fase B solo si QA GATE PASS`, **no se editaron**:

- `package.json`, `package-lock.json`, `scripts/verify-release-version.mjs`;
- `src/app/renderApp.ts`, `tests/deployment/pages-smoke.spec.ts`, `docs/project-status.md`;
- `docs/map-071-admin-qa-guide.md` ni `docs/map-071-admin-qa-guide.pdf`.

La guía MAP-071 sigue mencionando `v1.1.1` hasta que se levante el bloqueo y se haga la reconciliación editorial de etiqueta `v1.2` y se regenere su PDF sin cambiar los 27 IDs ni sus pasos. **El producto sigue en `1.1.0 / v1.1`.**

**RELEASE VERIFIER:** permanece el contrato anterior `1.1.0 / v1.1`. Todavía **no** exige `1.2.0 / v1.2`; no se han reducido aserciones.

**TESTS en MAP-072:** no se ejecutaron `npm ci`, format, security, accessibility, lint, unit, build, E2E, Pages E2E, PDF `--check` ni validaciones Supabase CI sobre el HEAD de MAP-072. No fue posible clonar el repositorio al entorno de ejecución por fallo DNS. GH-CI y GH-PAGES citados corresponden **únicamente al baseline**, no al candidato posterior.

**DATABASE:** No migration. Production database not mutated. Los cambios de DB se mantienen forward-only.

**SNAPSHOT:** sin modificaciones ni regeneración; no hay cambio del checksum en el baseline consultado. Si se modifica en cualquier candidato posterior, detener gate y explicar diff.

## 7. Riesgos, desbloqueo y rollback

**Bloqueante de ejecución QA:** no es posible acreditar 27 escenarios de interfaz con esta sesión sin navegador funcional contra el atlas y/o entorno local con fixtures. Se requiere una sesión con browser integrado, autorización admin y entorno M/C de prueba expresamente autorizado. El ejecutor deberá producir capturas/observaciones anonimizadas, ejecutar 320/390/430/desktop, teclado y Master purge, registrar cada ID, y detener el gate ante cualquier regresión real.

**Bloqueante de cobertura de datos:** producción contiene 0 `organization` y 0 `entity_relations` (y 0 `entity_player_associations`), de modo que esos escenarios necesitan fixtures autorizados. Las solicitudes reales no deben moderarse. No se interpreta ausencia de datos como defecto funcional.

**Rollback posterior a eventual publicación:** revert del commit frontend mediante PR nueva, CI y Pages normales, verificando published smoke sobre SHA exacto. La base de datos ya migrada permanece **forward-only** y nunca se revierte mediante SQL destructivo.

**Reanudar únicamente tras completar Fase A:** 27 estados con evidencia, 0 FAIL, 0 BLOCKED relevantes, sin fuga observable ni regresión de aislamiento/Master, y quick smoke completo. Después hacer reconciliación v1.2, bump semver, checks y CI exacta; abrir PR **Draft**, pedir revisión **independiente**, y detener en checkpoint humano previo al merge/release.

## 8. Decisión

**RELEASE GATE BLOCKED — PHASE A INCOMPLETE.**

Este resultado no identifica un bug reproducible del producto; declara ausencia de evidencia manual suficiente. No implica que la release sea defectuosa o válida. No hay base para `QA GATE PASS`, ni se autoriza Fase B. No hay PR, Ready, merge, tag, GitHub Release ni despliegue de esta rama.

---

## Reanudación del gate tras MAP-073

> **Decisión tras R1: remediación candidata de cinco IDs. QA GATE PASS únicamente cuando CI del HEAD final sea success; hasta entonces RELEASE GATE BLOCKED.** La sesión BLOCKED anterior se conserva íntegra arriba como evidencia histórica. Esta reanudación no afirma que el agente haya repetido manualmente los 27 escenarios: consolida evidencia **HUMAN**, **AUTOMATED** o **HUMAN + AUTOMATED** según el origen real.

### 9.1 Motivo de la reanudación

La primera Fase A quedó bloqueada porque el agente no podía manipular un navegador interactivo y no disponía de fixtures manuales autorizados. Después se ejecutó QA humano sobre producción. Esa sesión detectó dos defects reales:

- `MAP072-QA-01` — contraste administrativo.
- `MAP072-QA-02` — selector público **Campaña** degradado en layout estrecho.

Ambos fueron corregidos por MAP-073 / issue #194 / PR #203. El HEAD aprobado de MAP-073 fue `61e9ad1a9a3049635e74ecfeb1120ed39e4a46d9` y el merge resultante es el baseline de MAP-074, `99a241459caa73b0b86fb2da1a12176a0cf87d26`.

Después del deploy, el responsable humano registró en #195:

- contraste administrativo: **PASS**;
- selector público **Campaña** apilado/legible: **PASS**;
- resto del smoke manual previamente recorrido: sin nuevas regresiones reportadas;
- **PRODUCTION WRITES: 0**.

La reanudación adopta el modelo híbrido indicado para MAP-074: la evidencia humana acredita únicamente lo realmente observado y las suites automatizadas acreditan comportamientos equivalentes donde tienen cobertura material.

### 9.2 Evidencia automatizada de partida

Sobre `99a241459caa73b0b86fb2da1a12176a0cf87d26`:

- **CI 38717936595**, attempt 1, `success`: **Build, quality and tests** con PDF MAP-071, format, credenciales, accesibilidad, lint, unit, build, artifact audit, E2E completos y Pages smoke local; **Supabase migrations, lint and RLS tests** con rebuild/migraciones, db lint y tests de base de datos.
- **Pages 38719476391**, attempt 1, `success`: `snapshot:verify:remote`, build, artifact audit, smoke local, deploy, published smoke y estado `github-pages/deployment`.
- Snapshot schema v3 y checksum `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`.

La CI de la PR MAP-074 sobre su **HEAD exacto** sigue siendo obligatoria como evidencia final de que el bump/documentación/PDF no rompe el contrato.

### 9.3 Matriz QA consolidada 27/27

| ID | Carril | Estado | Tipo evidencia | Evidencia concreta | Finding |
| --- | --- | --- | --- | --- | --- |
| QA-AUTH-01 | P | PASS | AUTOMATED | admin-auth: login/logout, foco, Escape y mapa público usable | — |
| QA-AUTH-02 | P/C | PASS | AUTOMATED | admin-auth: no-admin, 401/expiración, fallo de red y 320px sin tokens | — |
| QA-CAMP-01 | P | PASS | HUMAN + AUTOMATED | map054 campaign roster: selector público/admin, banner y roster A/B; smoke humano campaign/roster | — |
| QA-CAMP-02 | P | PASS | HUMAN + AUTOMATED | map054 transición limpia, referents/org scopeados y bloqueo de writes; campaign-scope facets | — |
| QA-CAMP-03 | P | PASS | AUTOMATED | map054 dirty roster: cancelar conserva campaña, borrador y restaura foco | — |
| QA-CAMP-04 | P | PASS | AUTOMATED | map054 dirty roster + transición lenta: aceptar descarta editores y recarga contexto | — |
| QA-CAMP-05 | C | PASS | AUTOMATED | map054 failed campaign switch: rollback atómico a campaña/roster/controladores originales | — |
| QA-CAT-01 | M | PASS | AUTOMATED | admin-catalog editorial lifecycle E2E: five resources draft→published→archived, edit/validation + scope integration | MAP074-REV-03 — remediation candidate, independent R2 pending |
| QA-CAT-02 | M | PASS | AUTOMATED | admin-catalog conflictos/confirmaciones/delete; admin-map-entities stale/invalid relation safe errors | — |
| QA-ENTITY-01 | M | PASS | AUTOMATED | admin-map-entities point/preview/validación + MAP-061 polygon + mission/hazard lifecycle | — |
| QA-ENTITY-02 | M | PASS | AUTOMATED | admin-map-entities search_only, publicar, descubrir y archivar | — |
| QA-ORG-01 | P/M | PASS | AUTOMATED | map054 organization No cartográfica; organizationBehavior + pgTAP MAP-069 spatial/relations | — |
| QA-ROSTER-01 | P/M | PASS | HUMAN + AUTOMATED | map054 roster A/B, validación y referents same-campaign; roster observado en QA humano | — |
| QA-DISP-01 | P/M | PASS | AUTOMATED | admin-map-entities ally/neutral/enemy + map054 candidatos A/B + campaign-switcher/pin visuals | — |
| QA-ASSOC-01 | P/M | PASS | AUTOMATED | map054 associations scopeadas/ausentes en organization; admin-map-entities save; map058 render; pgTAP RLS | — |
| QA-REL-01 | P/M | PASS | AUTOMATED | admin-map-entities MAP-074 generic relation editor E2E: organization↔location/character/organization, directed labels, reopen both ends + pgTAP | MAP074-REV-01 — remediation candidate, independent R2 pending |
| QA-REL-02 | P/M | PASS | AUTOMATED | admin-map-entities MAP-074 historical archived target disabled/preserved; PGtap MAP-069 cross-campaign and archived negatives | MAP074-REV-01 — remediation candidate, independent R2 pending |
| QA-REQ-01 | P/M | PASS | AUTOMATED | admin-public-requests inbox/filter/note/reject exactly-once; anon sin inbox | — |
| QA-REQ-02 | M | PASS | AUTOMATED | admin-public-requests conversión a draft vacío + MAP-056 request→moderation→publication aislado | — |
| QA-REQ-03 | P | PASS | AUTOMATED | map054 MAP-074 moderation note fixture: cancel A→B preserves note/context/focus; accept discards, return A blank and zero moderation calls | MAP074-REV-02 — remediation candidate, independent R2 pending |
| QA-PUBLIC-01 | P | PASS | AUTOMATED | map054 selectores público/admin independientes y banner de divergencia explícito | — |
| QA-MASTER-01 | P/C | PASS | AUTOMATED | campaign-master-mode + stale-response + startup-revocation: purge A/B/OFF/logout/revocación | — |
| QA-NAV-01 | P | PASS | AUTOMATED | campaign-switcher A/B map/search/details + url-state deep link/reload/history/invalid values | — |
| QA-DEG-01 | C | PASS | AUTOMATED | backend-status fallback/recovery + campaign-switcher schema v3 + Pages smoke; org subcheck N/A por snapshot sin orgs | — |
| QA-RESP-01 | P | PASS | HUMAN + AUTOMATED | map054 MAP-074 login and admin/editor plus relation/moderation 320/390/430/1280, keyboard Escape and overflow; selector human retest | MAP074-REV-04 — remediation candidate, independent R2 pending |
| QA-A11Y-01 | P | PASS | HUMAN + AUTOMATED | responsive-accessibility keyboard/focus + forced colors/reduced motion; contraste retesteado humano; sin afirmar lector de pantalla | MAP072-QA-01 RESOLVED |
| QA-SEC-01 | P/C | PASS | AUTOMATED | admin-auth anon/no-admin/token errors + adminCampaignScope + Master purge/stale + pgTAP/RLS | — |

### 9.4 Recuentos consolidados de la candidatura — sujetos a CI exacta

| PASS | FAIL | BLOCKED | N/A |
| ---: | ---: | ---: | ---: |
| **27** | **0** | **0** | **0** |

El `N/A` citado dentro de QA-DEG-01 corresponde únicamente a la subcomprobación opcional de abrir una organización desde snapshot cuando el snapshot no contiene organizaciones; el **ID completo queda PASS** por la cobertura restante del modo degradado.

### 9.5 Evidencia humana

- Antes de MAP-073 se recorrieron campaign/roster, navegación administrativa y aislamiento Veyra/Castigo; el resto del smoke fue reportado OK salvo los dos defects visuales detectados.
- Después de MAP-073, `MAP072-QA-01` contraste = **PASS humano** y `MAP072-QA-02` selector responsive = **PASS humano**.
- No se declara prueba humana de lector de pantalla, fixtures de error controlado, relaciones genéricas en producción ni moderación de solicitudes reales.
- No se incluyen capturas privadas ni contenido Master.

### 9.6 Findings

- `MAP072-QA-01`: **RESOLVED por MAP-073**, retest humano PASS.
- `MAP072-QA-02`: **RESOLVED por MAP-073**, retest humano PASS.
- `MAP073-REV-01`: **RESOLVED**.
- `MAP073-REV-02`: **RESOLVED**.
- No existen otros FAIL reproducibles conocidos ni findings release-blocking abiertos.

### 9.7 Decisión de Fase A

La primera consolidación declaró 27 PASS y permitió preparar Fase B. La revisión independiente del HEAD `18b6583c739a87e68b2d70f23d72e63cb427442b` identificó insuficiencia de evidencia para cinco IDs: `QA-CAT-01` (`MAP074-REV-03`), `QA-REL-01` y `QA-REL-02` (`MAP074-REV-01`), `QA-REQ-03` (`MAP074-REV-02`) y `QA-RESP-01` (`MAP074-REV-04`). No demostró nuevos defectos funcionales. **22 PASS, 0 FAIL, 5 BLOCKED, 0 N/A**. La Fase B ya preparada se conserva como candidata **sin autorización de publicación**. Para levantar el bloqueo se necesitan pruebas concretas de editor, moderación, ciclo editorial y matriz responsive, CI success del HEAD corregido y segunda revisión independiente.

### 9.8 Fase B — versionado y reconciliación

Antes: `1.1.0 / v1.1`.

Después: `1.2.0 / v1.2`.

El bump actualiza coherentemente `package.json`, las dos versiones raíz de `package-lock.json`, `scripts/verify-release-version.mjs`, `src/app/renderApp.ts`, `tests/deployment/pages-smoke.spec.ts` y `docs/project-status.md`.

La guía MAP-071 cambia únicamente sus referencias de release previstas de `v1.1.1` a `v1.2`; conserva los 27 IDs, carriles y criterios. Su PDF se regenera desde el mismo Markdown con la implementación de `scripts/generate-admin-qa-pdf.cjs` y debe seguir pasando el chequeo byte-a-byte.

El release verifier conserva todas sus assertions y exige package/lock `1.2.0`, UI/eyebrow/Pages `v1.2` y project-status `1.2.0 / v1.2`. El mensaje de error queda desacoplado de MAP-066: **Release version verification failed**.

### 9.9 Delta v1.2 y motivo semver

- **MAP-067:** indicadores de relaciones con PJs en mapa.
- **MAP-068:** Veyra + campaña **Un aliento menos**.
- **MAP-069:** organizations non-spatial + generic `entity_relations`.
- **PR #191:** snapshot schema v3 sincronizado.
- **MAP-070:** hardening multicampaña/UX admin.
- **MAP-071:** guía QA MD/PDF.
- **MAP-073:** contraste administrativo y selector responsive encontrados durante QA.

`1.2.0` es una minor porque incorpora nueva funcionalidad visible y operativa manteniendo compatibilidad, no únicamente correcciones.

### 9.10 Borrador de release notes — no publicado

**El Atlas de los Nuevos Dioses v1.2** añade soporte multicampaña con **Un aliento menos**, indicadores de relaciones con PJs en el mapa, organizaciones no cartográficas y relaciones genéricas entre entidades. Refuerza la UX administrativa al cambiar de campaña, el aislamiento de datos y Modo Máster, y mejora comportamiento responsive/accesibilidad. La release incorpora además la guía QA administrativa MAP-071 en Markdown/PDF y el snapshot público schema v3 ya sincronizado.

Este texto es únicamente borrador. **No se crea todavía GitHub Release ni tag.**

### 9.11 Snapshot, base de datos y producción

- `public/data/public-catalog.snapshot.json`: **no regenerado**.
- Checksum esperado: `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`.
- Blob baseline: `2f4fa585241e9e5c8bb87a7443f4634bf048220b`.
- MAP-074: **No migration**.
- Migraciones MAP-068/MAP-069: ya aplicadas; no se reejecutan manualmente.
- **Production database not mutated.**
- **PRODUCTION WRITES: 0**.

### 9.12 Seguridad y rollback

La cobertura automatizada conserva negativas anon/no-admin, errores sin secretos, scoping de campaña, RLS, purge Master y rechazo de respuestas stale. MAP-074 no añade credenciales ni reduce gates.

Rollback frontend: nueva PR de `git revert` + CI + Pages normales. Base de datos: **forward-only**, sin rollback destructivo.

### 9.13 Validación de MAP-074

El entorno de este agente no puede resolver `github.com` desde el shell, por lo que no se declara falsamente `npm ci` ni una ejecución local completa. La regeneración del PDF usa la misma función `generatePdf` del script versionado; la CI del PR debe ejecutar el comando canónico y su `--check`.

La evidencia final antes de revisión independiente es la **CI del HEAD exacto de la Draft PR**. Si esa CI no termina `success`, el estado operativo vuelve a **RELEASE GATE BLOCKED** hasta explicar o corregir el fallo.

### 9.14 Estado de publicación

**QA GATE PASS condicionado a CI success del HEAD final. Mientras no exista esa evidencia, RELEASE GATE BLOCKED. Fase B candidata; sin autorización de publicación.**

No Ready. No merge. No tag. No GitHub Release.


### 9.15 Review independiente de PR #206 — correcciones de evidencia pendientes

La revisión externa del HEAD `18b6583c739a87e68b2d70f23d72e63cb427442b` emitió `REQUEST CHANGES — BLOCKED`. Los cinco BLOCKED corresponden exclusivamente a los cuatro findings de cobertura enumerados en 9.7. Los 22 PASS no afectados siguen respaldados por sus pruebas originales. Ninguna prueba nueva ha sido ejecutada por esta actualización documental; no se confunde la CI anterior con acreditación de los cinco casos. El producto candidato `1.2.0 / v1.2` permanece en Draft sin merge, tag, release ni cambios de producción.

### 9.16 MAP-074 — remediación propuesta de findings R1

La revisión independiente R1 identificó cinco PASS insuficientemente acreditados, redujo legítimamente los recuentos a 22/0/5/0 y declaró `REQUEST CHANGES — BLOCKED`. **Ese resultado histórico se conserva en 9.15.** Las nuevas pruebas, introducidas después de R1, son:

- `MAP074-REV-01`, `QA-REL-01` y `QA-REL-02`: `tests/e2e/admin-map-entities.spec.ts`, caso **MAP-074 generic relation editor persists oriented organization links and archived history**, con fixtures exclusivamente interceptados por Playwright. Comprueba selector de tipos y edición de organization↔location/character/organization, etiquetado en ambos extremos, persistencia y preservación del target histórico archivado; se mantiene pgTAP MAP-069 para negativas same-campaign/archived.
- `MAP074-REV-02`, `QA-REQ-03`: `tests/e2e/map054-campaign-roster.spec.ts`, caso **MAP-074 moderation note cancels, discards and never writes across campaign A to B**, con solicitud simulada A, cancelación/foco/nota, aceptación, regreso a A y cero RPC de moderación.
- `MAP074-REV-03`, `QA-CAT-01`: `tests/e2e/admin-catalog.spec.ts`, caso **MAP-074 editorial draft, publish and archive cycles cover all five catalog resources**, que cubre los cinco recursos con estados draft/published/archived y conservación de restricciones de editor, junto con E2E históricos de validaciones y scoping.
- `MAP074-REV-04`, `QA-RESP-01`: `tests/e2e/map054-campaign-roster.spec.ts`, casos **MAP-074 administrative banner, roster and entity editor remain reachable at mobile and desktop widths**, **MAP-074 responsive authentication dialog across viewport matrix** y **MAP-074 responsive administrative relations and moderation across viewport matrix** para 320/390/430/1280 px, foco/teclado, ausencia de overflow funcional, editor, relaciones, diálogo de autenticación y confirmación de moderación.

**Condición de promoción de la matriz 9.3 a PASS:** estos tests deben ejecutarse satisfactoriamente en la CI del HEAD exacto que los contiene, con `format:check`, `verify:release-version`, seguridad, accesibilidad, lint, unit, E2E, Pages smoke y base de datos completos. Antes de que esa CI termine `success`, los cinco IDs deben interpretarse como **PENDING VALIDATION / RELEASE GATE BLOCKED** y no como manualmente ejecutados. En caso de fallo real, volver a los cinco BLOCKED y corregirlo antes de reclamar QA GATE PASS.

La revisión independiente R2 debe validar la equivalencia material de la evidencia nueva, no dar por cerrados automáticamente estos findings por su mera existencia. No hubo migración, modificación del snapshot ni escrituras en producción. El checkpoint sigue Draft, sin Ready/merge/tag/GitHub Release.
