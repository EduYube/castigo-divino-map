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
