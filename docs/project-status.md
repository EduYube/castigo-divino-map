# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión: Beta 0.1.
- Estado: implementación de publicación preparada en MAP-011; pendiente de integrar PR #28 y validar la URL pública.
- URL objetivo: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-04.

## Alcance completado

MAP-001 a MAP-010 están cerradas. La aplicación dispone de:

- esqueleto Vite + TypeScript y calidad automática;
- Leaflet con `CRS.Simple`, mapa remoto y superficie neutra de error;
- catálogo público normalizado y validado;
- marcadores accesibles y selección única;
- fichas públicas construidas como texto;
- búsqueda por nombre, alias y título de nota;
- filtros por categorías y etiquetas;
- URL canónica con `place`, `q`, `category` y `tag`;
- historial nativo mediante `replaceState`, `pushState` y `popstate`;
- diseño responsive desde 320 px;
- matriz Playwright con Chromium, Firefox y WebKit móvil emulado.

## MAP-011

Rama: `agent/map-011-publish-beta`.  
Pull request: #28.  
Workflow de calidad: `.github/workflows/ci.yml` / **CI**.  
Workflow de publicación: `.github/workflows/pages.yml` / **Deploy Beta 0.1 to GitHub Pages**.

La arquitectura elegida mantiene CI y Pages separados. CI valida pull requests y commits integrados. Pages se activa únicamente tras una conclusión satisfactoria de CI sobre `master`; la ejecución manual se limita a `master` y repite toda la validación.

El build de Pages deriva `/castigo-divino-map/` desde el entorno. Solo `dist` se sube al artefacto. La auditoría rechaza imágenes raster, archivos compatibles con mapas o mosaicos y patrones conocidos de credenciales. El JPEG oficial no se almacena ni transforma.

## Calidad esperada antes del cierre

- formato y lint;
- pruebas unitarias existentes más contratos de Vite/workflows;
- build bajo el subdirectorio de Pages;
- auditoría de `dist`;
- matriz e2e existente;
- smoke local con el mismo pathname;
- CI del merge en verde;
- despliegue de Pages en verde;
- smoke posterior sobre la URL emitida por `deploy-pages`.

Los resultados exactos, el SHA desplegado y el estado final se incorporarán después de validar la publicación.

## Fuentes únicas y contratos cerrados

- `src/app/placeSearch.ts`: consulta.
- `src/app/placeFilters.ts`: categorías y etiquetas seleccionadas.
- `src/app/placeSelection.ts`: lugar activo.
- `src/app/urlState.ts`: representación URL pura.
- `src/data/`: catálogo público y lógica derivada.
- `src/map/config.ts`: URL, dimensiones, límites y estrategia del mapa.
- `docs/data-model.md`: contrato semántico de datos.
- ADR 0001: imagen oficial remota de baja resolución, sin copia ni derivados.

Leaflet no conserva búsqueda, filtros, selección o URL. La publicación no introduce backend, router, autenticación, persistencia, analítica, rastreo, CDN propio ni service worker.

## Riesgos y limitaciones

- La URL cartográfica oficial es histórica y no ofrece SLA.
- GitHub Pages y Actions son dependencias externas.
- La imagen LowRes consume aproximadamente 32 MiB decodificada.
- La emulación móvil no sustituye dispositivos físicos ni tecnologías de asistencia reales.
- La validación automática no puede identificar semánticamente todos los spoilers o datos privados.
- El catálogo actual contiene datos ficticios de demostración.

## Recuperación

El rollback usa `git revert` mediante PR y un nuevo despliegue validado. No se reescribe `master`. Un fallo transitorio puede recuperarse con ejecución manual sobre `master`. Si aparece contenido privado o sin licencia, se revierte, puede deshabilitarse Pages temporalmente y se revocan credenciales expuestas.

El procedimiento completo vive en `docs/deployment-and-rollback.md`.

## Siguiente fase propuesta

Tras publicar y cerrar MAP-011, la siguiente Issue propuesta es MAP-012 — Incorporar el primer lote de contenido público real.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Fundación, alcance, arquitectura y acuerdo de trabajo |
| 2026-08-04 | MAP-002: fuente y estrategia legal del mapa |
| 2026-08-04 | MAP-003 a MAP-009: aplicación, datos, búsqueda, filtros y URL |
| 2026-08-04 | MAP-010: responsive y accesibilidad transversal |
| 2026-08-04 | MAP-011: implementación de Pages, auditoría, smoke tests, rollback y checklist preparada en PR #28 |
