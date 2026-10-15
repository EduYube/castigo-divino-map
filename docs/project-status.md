# Estado del proyecto

## Resumen

- Proyecto: **El Atlas de los Nuevos Dioses**.
- Repositorio: `EduYube/castigo-divino-map`.
- Release candidata: **v1.2** (`1.2.0`).
- Cierre operativo de la candidata: **MAP-074 / #195**.
- Baseline de partida de MAP-074: `99a241459caa73b0b86fb2da1a12176a0cf87d26`, merge de MAP-073.
- Producción publicada al iniciar MAP-074: ese mismo SHA, todavía correspondiente a la release estable v1.1 hasta que MAP-074 sea revisada y mergeada.
- URL pública: https://eduyube.github.io/castigo-divino-map/.
- Snapshot público esperado: `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`.
- Última actualización documental: **2026-10-15**.

MAP-074 reanuda el gate iniciado por MAP-072. La primera sesión de MAP-072 quedó históricamente BLOCKED por falta de navegador interactivo; la evidencia humana posterior, las correcciones MAP-073 y las suites automatizadas permiten consolidar el gate mediante un modelo híbrido HUMAN/AUTOMATED sin fingir ejecuciones manuales.

## Delta de la release v1.2

v1.2 agrupa el trabajo posterior a v1.1:

- **MAP-067:** indicadores visibles de relaciones con personajes jugadores en el mapa.
- **MAP-068:** Veyra y la campaña **Un aliento menos**, con separación real de campañas.
- **MAP-069:** organizaciones no cartográficas y relaciones genéricas `entity_relations`.
- **PR #191:** snapshot schema v3 sincronizado con producción.
- **MAP-070:** endurecimiento de UX administrativa multicampaña, transición de contexto y protecciones de borradores.
- **MAP-071:** guía QA administrativa canónica en Markdown/PDF.
- **MAP-073:** correcciones de contraste administrativo y del selector público **Campaña** en layout estrecho detectadas durante QA humano.

El salto `1.1.0 -> 1.2.0` es **minor** porque incorpora funcionalidad visible y operativa compatible, no únicamente fixes.

## Versionado

La fuente canónica de versión es `package.json`, ahora `1.2.0`. La UI candidata muestra `v1.2` tanto en badge como en `Faerûn · v1.2`.

`package-lock.json` conserva la misma versión del paquete raíz. `npm run verify:release-version` comprueba package, lockfile, UI, smoke de Pages y este estado documental. El mensaje del verificador es genérico y ya no queda acoplado a MAP-066.

La guía MAP-071 fue reconciliada de la release prevista `v1.1.1` a `v1.2` sin cambiar los 27 QA IDs, sus carriles ni criterios funcionales; su PDF sigue siendo una copia generada del Markdown.

## Gate QA y evidencia

La decisión detallada está en [`map-072-release-gate.md`](map-072-release-gate.md). La matriz consolidada mantiene los 27 IDs y distingue explícitamente `HUMAN`, `AUTOMATED` y `HUMAN + AUTOMATED`.

La evidencia automatizada de partida sobre `99a241459caa73b0b86fb2da1a12176a0cf87d26` incluye CI `38717936595`, intento 1, `success`, con quality/build/unit/E2E/PDF y Supabase migrations/lint/RLS; Pages `38719476391`, intento 1, `success`, con `snapshot:verify:remote`, build, artifact audit, deploy y published smoke.

La evidencia humana registrada en #195 confirma tras MAP-073: contraste administrativo PASS, selector público **Campaña** apilado/legible PASS y resto del smoke manual previamente recorrido sin nuevas regresiones. No se presenta esa evidencia como ejecución del agente.

La CI del HEAD exacto de la PR MAP-074 sigue siendo la evidencia final antes de revisión independiente.

## Calidad y seguridad

Los gates activos siguen incluyendo:

- `format:check`, auditoría de credenciales, invariantes de accesibilidad, lint y unit tests;
- build Pages, auditoría de artefacto, E2E completos y smoke local;
- reconstrucción/rehearsals de Supabase, `db lint --fail-on warning`, pgTAP/RLS, concurrencia y Storage HTTP;
- aislamiento A/B, filtros y relaciones scopeadas por campaña;
- purge de contenido Master en cambio de campaña, OFF/logout/revocación y respuestas stale;
- ausencia de CRUD administrativo para anon/no-admin y errores visibles normalizados sin secretos.

MAP-074 no introduce credenciales ni relaja assertions.

## Snapshot y modo degradado

`public/data/public-catalog.snapshot.json` permanece sin regenerar. Su checksum esperado es:

`sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`

El blob del baseline es `2f4fa585241e9e5c8bb87a7443f4634bf048220b`. El snapshot schema v3 continúa siendo fallback público de solo lectura; no contiene datos Master y la recuperación del backend conserva el contexto de campaña.

## Base de datos

Las migraciones MAP-068 y MAP-069 ya están aplicadas en producción y forman parte del estado previo a esta release. MAP-074 no añade ni reejecuta migraciones.

**No migration. Production database not mutated.**

Cualquier corrección futura de base de datos es forward-only; no se reescribe ni revierte destructivamente el historial aplicado.

## Producción y publicación

MAP-074 prepara la candidata pero no la publica por sí sola. Antes de tag/release deben ocurrir, en este orden: review independiente, checkpoint humano, merge autorizado, CI de `master`, Pages sobre el SHA exacto publicado, `snapshot:verify:remote` y published smoke.

Hasta entonces no se crea tag `v1.2.0` ni GitHub Release.

## Historial v1.1 preservado

**MAP-066 / #162** se conserva como gate histórico de v1.1.0; no se reescribe como si hubiese sido v1.2. MAP-052 continúa definiendo el baseline histórico v1.0 y los documentos Beta permanecen como evidencia de compatibilidad.

Los identificadores históricos `beta01`/`beta02`, migraciones, fixtures, issues, PRs y documentos de evidencia no se renombran por el bump.

## Rollback

Una regresión frontend de v1.2 se retira mediante una nueva PR de `git revert`, seguida de CI y Pages normales sobre el nuevo SHA. No se hace force-push ni se reescribe `master`.

La base de datos es **forward-only**. Las migraciones MAP-068/MAP-069 no se revierten destructivamente para retirar una versión frontend.
