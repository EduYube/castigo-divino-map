# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión objetivo: Beta 0.1.
- Estado: implementación de publicación integrada; activación pública bloqueada por la configuración inicial de GitHub Pages.
- URL objetivo: `https://eduyube.github.io/castigo-divino-map/`.
- URL pública activa: no, a 2026-08-04.
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

Estado de la Issue: abierta hasta validar la URL pública.  
PR de implementación: #28, fusionada en `ebbd363e9da4f9e4476ba86895de7ed87130cada`.  
PR de observabilidad: #29, fusionada en `9b7f4d2e29e7933c6665b4685b62adffa5ef656c`.  
Workflow de calidad: `.github/workflows/ci.yml` / **CI**.  
Workflow de publicación: `.github/workflows/pages.yml` / **Deploy Beta 0.1 to GitHub Pages**.

La arquitectura mantiene CI y Pages separados. CI valida pull requests y commits integrados. Pages solo se activa tras una conclusión satisfactoria de CI sobre `master`; la ejecución manual se limita a `master` y repite toda la validación.

El build de Pages deriva `/castigo-divino-map/` desde el entorno. Solo `dist` se sube al artefacto. La auditoría rechaza imágenes raster, archivos compatibles con mapas o mosaicos y patrones conocidos de credenciales. El JPEG oficial no se almacena ni transforma.

## Resultados verificados

La CI de las ramas de implementación y observabilidad terminó en verde. La última CI de pull request consultable fue el run `30940496160`:

- instalación reproducible con `npm ci`;
- formato y lint correctos;
- 73 pruebas unitarias en 9 archivos;
- build de Vite bajo `/castigo-divino-map/`;
- auditoría de 3 archivos de producción;
- 45 pruebas e2e;
- 2 smoke tests del preview de Pages.

El run de Pages `30940902156`, activado por una CI satisfactoria sobre `master`, confirmó:

- checkout del SHA validado;
- instalación reproducible;
- build de Pages correcto;
- auditoría de `dist` correcta;
- smoke local correcto;
- subida exclusiva de `dist` correcta.

El job de despliegue falló en `actions/configure-pages@v6` con `Get Pages site failed` porque el repositorio aún no tiene Pages habilitado con origen **GitHub Actions**. `actions/deploy-pages` y el smoke de la URL pública no llegaron a ejecutarse. El estado `github-pages/deployment` quedó en fallo y enlaza al run exacto.

## Acción pendiente para publicar

Una persona con permisos administrativos debe abrir:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Después debe reejecutar **Deploy Beta 0.1 to GitHub Pages** sobre `master`. MAP-011 podrá cerrarse cuando los jobs `build`, `deploy`, `smoke` y `report` estén en verde y la URL completa se haya validado.

El conector disponible no expone la configuración de Pages. El `GITHUB_TOKEN` del workflow tampoco puede realizar la activación inicial, porque esa operación exige permisos administrativos adicionales.

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

- GitHub Pages requiere una activación administrativa inicial fuera del alcance del conector disponible.
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

MAP-012 — Incorporar el primer lote de contenido público real debe comenzar después de habilitar Pages, completar el smoke público y cerrar MAP-011.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Fundación, alcance, arquitectura y acuerdo de trabajo |
| 2026-08-04 | MAP-002: fuente y estrategia legal del mapa |
| 2026-08-04 | MAP-003 a MAP-009: aplicación, datos, búsqueda, filtros y URL |
| 2026-08-04 | MAP-010: responsive y accesibilidad transversal |
| 2026-08-04 | MAP-011: PR #28 integra Pages, auditoría, smoke tests, rollback y checklist |
| 2026-08-04 | MAP-011: PR #29 añade estado verificable del despliegue; run `30940902156` detecta que Pages no está habilitado |
