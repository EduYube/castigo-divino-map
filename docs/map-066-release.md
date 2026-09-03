# MAP-066 — Release v1.1

## Propósito

MAP-066 es el gate transversal de v1.1. Parte del baseline estable v1.0, valida la cadena MAP-052→MAP-065, ensaya la migración completa sin recreación manual, revalida aislamiento multicampaña/Modo Máster/notas públicas, y deja el frontend preparado para publicar 1.1.0.

## Baseline y dependencias

Baseline fijado al comenzar: `9d71d845307481c646fd2c457e8249e94f963ba7` (master posterior a MAP-065). MAP-052→MAP-065 se consideran satisfechas únicamente cuando su issue está cerrada y su PR/follow-up está integrada en la historia de master. El gate de MAP-066 conserva como evidencia las suites acumuladas, no sustituye sus tests por una lista manual.

Cadena de integración auditada en GitHub: MAP-052 `#163/#164`; MAP-053 `#165/#166/#168`; MAP-054 `#169/#170`; MAP-055 `#171`; MAP-056 `#172`; MAP-057 `#173`; MAP-058 `#174`; MAP-059 `#175`; MAP-060 `#176`; MAP-061 `#178/#179`; MAP-062 `#180/#181`; MAP-063 `#182/#183`; MAP-064 `#184`; MAP-065 `#185`. Los reemplazos operativos cerrados sin merge se conservan como historia; la revisión verifica el candidato finalmente integrado, no confunde una PR sustituta con una dependencia ausente.

## Rehearsal v1.0 → v1.1

`npm run supabase:db:test:map066:upgrade` parte del último baseline SQL de v1.0 (`20260811213000`) mediante el fixture determinista de MAP-053, aplica en orden todas las migraciones posteriores del repositorio y comprueba el estado final de v1.1. El dataset incluye campaña inicial, entidades públicas/Máster, IDs/slugs, coordenadas, retrato/Storage path, categoría/tag/alias, roster/disposiciones, relaciones e historial, notas/tags de nota, solicitud moderada y `converted_entity_id`, además de timestamps históricos. MAP-066 añade comprobación explícita de geometría point derivada sin alterar X/Y, ausencia de duplicados y disponibilidad de los tipos v1.1. El resultado aceptable es cero pérdida, duplicación, regeneración de IDs/slugs o recreación manual.

## Matriz multicampaña

La fixture de E2E mantiene campañas A/B con contenido distinto. La suite completa cubre selector, pines, búsqueda, filtros, notas, relaciones, disposiciones, geografía global compartida, solicitudes A→A/B→B, negativas cross-campaign, URL/deep links, Back/Forward, reload y snapshot degradado. Las regresiones de Modo Máster cubren purga síncrona A→B y respuestas privadas obsoletas.

Cobertura principal reutilizada como gate: `campaign-switcher.spec.ts`, `campaign-scope.spec.ts`, `campaign-master-mode.spec.ts`, `campaign-master-mode-stale-response.spec.ts`, `map061-master-status-purge.spec.ts`, `map063-public-player-notes.spec.ts`, `map064-master-isolation.spec.ts` y las suites MAP-065 de capas/URL/responsive. La CI ejecuta la suite E2E completa para impedir que una matriz documental sustituya comportamiento real.

## Seguridad

La release no introduce nuevas RLS, grants, RPC, functions, policies, Storage ni autenticación por sí misma. El checkpoint humano revisa el diff sensible acumulado de MAP-053, MAP-056, MAP-063 y MAP-064 y cualquier corrección nueva que pudiera aparecer. La CI ejecuta pgTAP/RLS, negativas anon/authenticated-no-admin/admin, Storage HTTP, concurrencia y auditoría de artifact/snapshot para evitar canarios Máster.

La autoría de notas públicas de jugador expresa una identidad declarada del roster de campaña; no equivale a un login criptográficamente verificado del jugador. La RPC cerrada y RLS siguen siendo la frontera de escritura pública.

## Snapshot y degradación

El snapshot público versionado sigue siendo fallback de solo lectura. La suite cubre backend disponible, lento/caído, recuperación, selector de campaña, capas/filtros/notas y ausencia de escrituras simuladas. Recuperar Supabase no debe cambiar la campaña seleccionada ni duplicar entidades. No existe snapshot privado persistente.

## Accesibilidad y regresión visual

La suite acumulada mantiene teclado, Enter/Espacio/Escape, foco, selects/combobox, spiderfy, regiones, formularios/live regions, zoom/reflow equivalente al 200 %, `forced-colors`, `prefers-reduced-motion` y targets táctiles. Los proyectos móviles ejercitan 320/390/430 px y WebKit donde el contrato histórico lo exige; las referencias PNG de MAP-033/MAP-037 y las capturas específicas posteriores se conservan como artifacts de CI.

## Rendimiento

Se comparan las métricas reproducibles de `npm run report:build` con el baseline de master y se inspeccionan las suites de clustering, regiones, retratos, campaña y capas. Cualquier regresión material debe justificarse o corregirse antes del checkpoint.

## Versionado

- paquete/aplicación: **1.1.0**;
- badge visible: **v1.1**;
- `npm run verify:release-version` impide divergencia entre package, lockfile, UI, smoke y estado documental.

## Deploy y rollback

El frontend se integra mediante PR normal y Pages despliega únicamente el SHA de master cuya CI termina verde. Un rollback de frontend usa `git revert` en una nueva PR; no se reescribe master. Las migraciones de base de datos ya aplicadas nunca se revierten ni se renombran: cualquier corrección de DB se realiza con una nueva migración forward-only. MAP-066 no debe volver a empujar migraciones históricas cuyo timestamp remoto difiera del nombre local; se compara por cambio ya desplegado y se añade una nueva migración solo si existe un delta real.

## Gate humano

Antes de Ready/merge/deploy final se presenta una única revisión humana con: cambios sensibles acumulados, pgTAP/RLS, rehearsal, aislamiento multicampaña, purga Máster A→B, riesgos, deploy, rollback frontend y estrategia DB forward-only. Hasta esa aprobación la PR permanece Draft.
