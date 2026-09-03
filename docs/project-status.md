# Estado del proyecto

## Resumen

- Proyecto: **El Atlas de los Nuevos Dioses**.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión estable actual: **v1.0** (`1.0.0`).
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Release de consolidación: **MAP-052 / #148**.
- Baseline funcional promovido: estado de `master` posterior a MAP-051, sin nuevas funcionalidades ni reinterpretación de datos.
- Última actualización documental: **2026-08-25**.

La evidencia final dependiente del SHA —CI de `master`, workflow de Pages, smoke publicado y estado `github-pages/deployment`— se registra en #148 después del merge. No se incrusta el SHA final en este documento porque cualquier commit destinado únicamente a escribir ese SHA produciría un SHA distinto y volvería a disparar el ciclo de release.

## Qué significa v1.0

v1.0 cierra formalmente la etapa Beta y convierte el producto existente en el baseline estable que deberán preservar las evoluciones v1.1. MAP-052 es una promoción de versión y documentación: no añade capacidades de producto.

El baseline estable conserva, entre otras, estas capacidades ya publicadas:

- mapa oficial remoto de Faerûn;
- búsqueda por geografía, entidades, aliases y notas públicas;
- filtros y navegación mediante URL/historial;
- pines de personajes y emplazamientos, incluidos grupos en coordenadas coincidentes;
- fichas compactas y fichas públicas completas;
- retratos públicos cuando existen;
- controles responsive y accesibilidad de teclado;
- solicitudes públicas de nuevos pines;
- administración autenticada y Modo Máster conforme a los permisos existentes;
- catálogo persistente en Supabase;
- snapshot público versionado y modo degradado cuando Supabase no responde;
- recuperación explícita mediante retry.

## Compatibilidad y datos

MAP-052 no modifica ni recrea datos. En particular, permanecen intactos:

- IDs y slugs;
- entidades, personajes y emplazamientos;
- coordenadas y retratos;
- categorías, etiquetas y aliases;
- relaciones y notas;
- disposiciones por jugador y audiencia `public`/`master`;
- estados editoriales y solicitudes públicas;
- `converted_entity_id` y demás referencias existentes;
- rutas de Storage;
- URLs públicas;
- contenido funcional de `public/data/public-catalog.snapshot.json`.

No existe migración de base de datos para MAP-052 y no se ejecuta un seed de producción. El cambio de nombre de la release no requiere DDL, cambios de Auth, RLS, grants, policies ni Storage.

## Versionado

La fuente canónica de versión de la aplicación es `package.json`, que declara `1.0.0`.

La UI pública presenta `v1.0` en el badge y en el encabezado del mapa. El smoke de Pages verifica explícitamente esa identificación tanto en la experiencia normal como en los escenarios degradados.

Los identificadores históricos o de compatibilidad que contienen `beta01`/`beta02` se preservan cuando forman parte de nombres de migraciones, fixtures, pruebas, contratos de datos o evidencia pasada. No se renombran porque hacerlo reescribiría historia o cambiaría el significado de contratos heredados.

## Calidad y release gate

La validación ordinaria del repositorio sigue siendo la fuente de verdad:

- `format:check`;
- auditoría de credenciales versionadas;
- invariantes de accesibilidad;
- lint;
- unit tests;
- verificación del snapshot público;
- build de GitHub Pages;
- auditoría del artefacto;
- métricas de build;
- E2E completos;
- smoke local de Pages;
- reconstrucción, lint, pgTAP/RLS y concurrencia de Supabase local.

Tras el merge, `.github/workflows/pages.yml` solo despliega el SHA de `master` cuya CI terminó correctamente. El workflow vuelve a verificar el snapshot contra Supabase, reconstruye el artefacto, hace smoke local, despliega Pages, ejecuta smoke contra la URL publicada y registra `github-pages/deployment` sobre el SHA desplegado.

## Historial Beta preservado

Beta 0.1 y Beta 0.2 siguen existiendo como releases históricas y como origen de contratos de compatibilidad. No se reescriben sus issues, PRs, migraciones, fixtures ni documentos de evidencia.

La evidencia técnica de Beta 0.2 se conserva íntegramente en [`map-030-release.md`](map-030-release.md). MAP-030 / #49 está cerrado como completado; las referencias históricas a sus SHA, runs, migraciones y decisiones siguen siendo válidas para ese release.

La arquitectura aprobada durante Beta 0.2 se mantiene documentada en [`architecture.md`](architecture.md) con su título y contexto originales. Del mismo modo, [`product-scope.md`](product-scope.md) continúa describiendo el alcance histórico de Beta 0.1.

## Evidencia de v1.0

La definición del release y la separación entre cambios actuales e historia Beta están en [`map-052-release.md`](map-052-release.md).

La evidencia final verificable del lanzamiento —PR, SHA final de `master`, CI, Pages, smoke publicado y cierre— queda registrada en #148 una vez completado el despliegue. Ese registro es el cierre operativo de MAP-052.

## Rollback

MAP-052 no añade migraciones, por lo que una regresión introducida por el cambio de release puede retirarse mediante una PR de `git revert`, seguida de la CI y Pages normales. No se usa force-push ni se reescribe `master`.

El procedimiento operativo completo está en [`deployment-and-rollback.md`](deployment-and-rollback.md).

## Riesgos residuales

MAP-052 no acepta deuda funcional nueva ni modifica el perfil de seguridad. Los riesgos y decisiones históricas de releases anteriores permanecen documentados en sus evidencias originales; promover la nomenclatura a v1.0 no los reinterpreta ni los oculta.

## Estado v1.1 — MAP-066

MAP-066 promueve el baseline posterior a MAP-065 a **v1.1 (1.1.0)** una vez superados rehearsal, seguridad, CI, checkpoint humano, merge y Pages. La fuente canónica de versión sigue siendo `package.json`; el badge público usa `v1.1` y `npm run verify:release-version` comprueba coherencia con lockfile, UI, smoke y este documento. Las secciones anteriores de v1.0 se conservan como evidencia histórica del baseline de partida.
