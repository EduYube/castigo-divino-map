# Estado del proyecto

## Estado actual — candidata v1.2

- Proyecto: **El Atlas de los Nuevos Dioses**.
- Repositorio: `EduYube/castigo-divino-map`.
- Release candidata: **v1.2** (`1.2.0`).
- Cierre operativo de la candidata: **MAP-074 / #195**.
- Baseline de partida de MAP-074: `99a241459caa73b0b86fb2da1a12176a0cf87d26`, merge de MAP-073.
- Producción publicada al iniciar MAP-074: ese mismo SHA, correspondiente a la release estable v1.1 hasta que v1.2 supere review, checkpoint humano, merge y deploy.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Snapshot público esperado: `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`.
- Última actualización documental: **2026-10-15**.

MAP-074 reanuda el gate iniciado por MAP-072. La primera sesión de MAP-072 quedó históricamente BLOCKED por falta de navegador interactivo; la evidencia humana posterior, las correcciones MAP-073 y las suites automatizadas permiten consolidar el gate mediante un modelo híbrido HUMAN/AUTOMATED sin fingir ejecuciones manuales.

### Delta de la release v1.2

v1.2 agrupa el trabajo posterior a v1.1:

- **MAP-067:** indicadores visibles de relaciones con personajes jugadores en el mapa.
- **MAP-068:** Veyra y la campaña **Un aliento menos**, con separación real de campañas.
- **MAP-069:** organizaciones no cartográficas y relaciones genéricas `entity_relations`.
- **PR #191:** snapshot schema v3 sincronizado con producción.
- **MAP-070:** endurecimiento de UX administrativa multicampaña, transición de contexto y protecciones de borradores.
- **MAP-071:** guía QA administrativa canónica en Markdown/PDF.
- **MAP-073:** correcciones de contraste administrativo y del selector público **Campaña** en layout estrecho detectadas durante QA humano.

El salto `1.1.0 -> 1.2.0` es **minor** porque incorpora funcionalidad visible y operativa compatible, no únicamente fixes.

### Versionado y gate

La fuente canónica de versión candidata es `package.json`, ahora `1.2.0`. La UI candidata muestra `v1.2` tanto en badge como en `Faerûn · v1.2`. `package-lock.json` mantiene la misma versión del paquete raíz.

`npm run verify:release-version` comprueba package, lockfile, UI, smoke de Pages y este estado documental. El mensaje del verificador es genérico y ya no queda acoplado a MAP-066.

La guía MAP-071 fue reconciliada de la release prevista `v1.1.1` a `v1.2` sin cambiar los 27 QA IDs, sus carriles ni criterios funcionales; su PDF sigue siendo una copia generada del Markdown.

La decisión detallada está en [`map-072-release-gate.md`](map-072-release-gate.md): matriz 27/27, `PASS=27`, `FAIL=0`, `BLOCKED=0`, `N/A=0`, con evidencia `HUMAN`, `AUTOMATED` o `HUMAN + AUTOMATED` según procedencia real.

### Evidencia, seguridad y snapshot

La evidencia automatizada de partida sobre `99a241459caa73b0b86fb2da1a12176a0cf87d26` incluye CI `38717936595`, intento 1, `success`, y Pages `38719476391`, intento 1, `success`, incluyendo `snapshot:verify:remote`, build, artifact audit, deploy y published smoke.

La evidencia humana registrada en #195 confirma tras MAP-073: contraste administrativo PASS, selector público **Campaña** apilado/legible PASS y resto del smoke manual previamente recorrido sin nuevas regresiones. No se presenta esa evidencia como ejecución del agente.

Los gates activos conservan format, auditoría de credenciales, accesibilidad, lint, unit, build, artifact audit, E2E, smoke Pages, rehearsals Supabase, db lint, pgTAP/RLS, concurrencia, aislamiento A/B, purge Master y negativas anon/no-admin. MAP-074 no relaja assertions.

`public/data/public-catalog.snapshot.json` permanece sin regenerar. El blob del baseline es `2f4fa585241e9e5c8bb87a7443f4634bf048220b` y el checksum esperado sigue siendo `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`.

### Base de datos, producción y rollback de v1.2

Las migraciones MAP-068 y MAP-069 ya están aplicadas en producción y forman parte del estado previo. MAP-074 no añade ni reejecuta migraciones.

**No migration. Production database not mutated.**

La base de datos permanece **forward-only**. Una regresión frontend de v1.2 se retira mediante una nueva PR de `git revert`, seguida de CI y Pages normales; no se hace force-push ni rollback SQL destructivo.

MAP-074 prepara la candidata pero no la publica. Antes de tag/release deben ocurrir review independiente, checkpoint humano, merge autorizado, CI de `master`, Pages sobre el SHA exacto publicado, `snapshot:verify:remote` y published smoke.

Hasta entonces: **no tag `v1.2.0`, no GitHub Release**.

---

## Historial preservado — v1.1 / MAP-066

> El bloque siguiente conserva el estado documental previo a MAP-074. Sus referencias a “esta rama de release”, “objetivo” y MAP-066 describen el gate histórico de v1.1, no el estado operativo actual de la candidata v1.2.

## Resumen

- Proyecto: **El Atlas de los Nuevos Dioses**.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión estable objetivo de esta rama de release: **v1.1** (`1.1.0`).
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Release gate: **MAP-066 / #162**.
- Baseline preservado: v1.0, consolidada por **MAP-052 / #148**.
- Baseline técnico de MAP-066: `master` posterior a MAP-065 (`9d71d845307481c646fd2c457e8249e94f963ba7`).
- Última actualización documental: **2026-09-03**.

MAP-066 no se considera publicada hasta superar rehearsal v1.0→v1.1, CI, seguridad, checkpoint humano, merge, CI de `master`, Pages y smoke contra la URL realmente publicada. El SHA final y la evidencia operativa quedan registrados en GitHub (#162/#186) para no crear un commit circular dedicado únicamente a escribir su propio SHA.

## Qué aporta v1.1

v1.1 consolida como release estable el trabajo de MAP-053 a MAP-065 sobre el baseline v1.0. Entre las capacidades nuevas ya integradas en el baseline de MAP-066 están:

- dominio persistente multicampaña y campaña inicial compatible con v1.0;
- administración y selector público de campaña con URL/deep links y navegación histórica;
- aislamiento de runtime, solicitudes, catálogo y Modo Máster por campaña;
- roster de personajes jugadores, disposiciones comprensibles y asociaciones narrativas explícitas;
- clustering de proximidad y spiderfy accesible;
- geometría persistente `point | polygon`, edición y render de regiones transparentes;
- ficha compacta bajo el mapa en escritorio, manteniendo bottom sheet móvil;
- notas públicas de jugadores con autoría declarada y moderación administrativa;
- tipos `mission` y `hazard` con lifecycle propio;
- control independiente de capas para personajes, emplazamientos puntuales, regiones, misiones y peligros.

La geografía física sigue siendo global y compartida entre campañas. La autorización sigue siendo responsabilidad de PostgreSQL/RLS y de las RPC cerradas; la UI nunca concede permisos.

## Compatibilidad y migración desde v1.0

El release gate ejecuta `npm run supabase:db:test:map066:upgrade`, que parte del último baseline SQL exacto de v1.0 (`20260811213000`), carga un dataset representativo previo al dominio multicampaña y aplica ordenadamente todas las migraciones posteriores.

La comparación exige preservar sin recreación manual:

- campaña inicial, entidades, IDs y slugs;
- coordenadas y geometría derivada;
- retratos y referencias Storage;
- categorías, tags y aliases;
- jugadores, disposiciones y asociaciones;
- relaciones personaje-localización e historial/acontecimientos;
- notas y tags de notas;
- audiencia pública/Máster y estados editoriales;
- solicitudes y `converted_entity_id`;
- timestamps históricos relevantes.

Las relaciones cross-campaign se bloquean en PostgreSQL. No se renombran ni reescriben migraciones históricas ya aplicadas; cualquier corrección de base de datos posterior es forward-only.

## Versionado

La fuente canónica de versión es `package.json`, que declara `1.1.0`.

La UI pública presenta `v1.1` en badge y encabezado. `package-lock.json` mantiene la misma versión del paquete raíz y `npm run verify:release-version` comprueba que package, lockfile, UI, smoke de Pages y este estado documental no diverjan. Tanto el build normal como el build de Pages ejecutan ese gate.

Los identificadores históricos o de compatibilidad que contienen `beta01`/`beta02` se preservan cuando forman parte de migraciones, fixtures, pruebas, contratos de datos o evidencia pasada.

## Calidad y release gate

La validación ordinaria del repositorio sigue siendo la fuente de verdad y MAP-066 añade el rehearsal transversal/versionado sin relajar gates existentes:

- `format:check`;
- auditoría de credenciales versionadas;
- invariantes de accesibilidad;
- lint;
- unit tests;
- verificación del snapshot público;
- TypeScript y build de GitHub Pages;
- auditoría del artefacto y métricas de build;
- E2E completos en los navegadores/proyectos configurados;
- smoke local de Pages;
- reconstrucción y rehearsals históricos de Supabase;
- `db lint --fail-on warning`;
- pgTAP/RLS y negativas de autorización;
- Storage HTTP y pruebas de concurrencia.

Tras el merge, `.github/workflows/pages.yml` despliega únicamente el SHA de `master` cuya CI terminó correctamente. El workflow vuelve a verificar el snapshot contra Supabase, reconstruye/audita el artefacto, hace smoke local, despliega Pages, ejecuta smoke contra la URL publicada y registra `github-pages/deployment` sobre el SHA desplegado.

## Seguridad v1.1

MAP-066 revalida anon, authenticated no-admin y admin; campañas A/B; catálogo público y catálogo Máster efímero; snapshot/artifact; Storage de retratos; logout/expiración/401/403; y escritura pública de notas.

En una transición de campaña con Modo Máster ON, el contenido privado de A debe purgarse de memoria, DOM, búsqueda y fichas antes de solicitar/adoptar B. Una respuesta privada obsoleta nunca puede reintroducir A. No existe snapshot privado persistente.

La autoría pública de jugador es una identidad declarada del roster de la campaña, no un login criptográficamente verificado del jugador. La RPC cerrada valida campaña/autor y mantiene fuera del alcance anónimo cualquier identidad de Máster.

## Snapshot y modo degradado

El snapshot público versionado es un fallback de solo lectura. Conserva campañas públicas, geografía global, entidades/regiones/misiones/peligros públicos, notas, filtros y capas. Una escritura no se presenta como exitosa cuando el backend está offline.

La recuperación de Supabase mantiene la campaña seleccionada, no duplica entidades y no reutiliza secretos de la campaña anterior si la carga Máster de la nueva campaña falla temporalmente.

## Historial v1.0 y Beta preservado

v1.0 sigue siendo el baseline histórico estable desde el que se migra. Su definición de release se conserva en [`map-052-release.md`](map-052-release.md) y su cierre operativo en #148. MAP-052 no recreó datos ni añadió migraciones; promovió el estado posterior a MAP-051 como baseline estable.

Beta 0.1 y Beta 0.2 continúan como releases históricas y origen de contratos de compatibilidad. No se reescriben sus issues, PRs, migraciones, fixtures ni documentos de evidencia. La evidencia técnica de Beta 0.2 permanece en [`map-030-release.md`](map-030-release.md) y [`product-scope.md`](product-scope.md) conserva el alcance histórico de Beta 0.1.

## Rollback

Una regresión de frontend de v1.1 se retira mediante una nueva PR de `git revert`, seguida de CI y Pages normales. No se hace force-push ni se reescribe `master`.

La base de datos no usa migraciones inversas destructivas para volver a v1.0. Si una migración v1.1 desplegada requiere corrección, se crea una migración nueva forward-only que preserve datos e identidades. El procedimiento operativo completo está en [`deployment-and-rollback.md`](deployment-and-rollback.md) y el contrato específico de release en [`map-066-release.md`](map-066-release.md).

## Riesgos residuales

Los advisories de plataforma o rendimiento que no constituyan regresiones de v1.1 se documentan en el checkpoint humano y no se “corrigen” reescribiendo historia o ampliando el scope sin evidencia. Cualquier hallazgo real de pérdida de datos, fuga de secretos, aislamiento roto o regresión material bloquea la release hasta ser corregido.

