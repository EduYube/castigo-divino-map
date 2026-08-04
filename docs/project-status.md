# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión: Beta 0.1.
- Estado: publicada y validada mediante GitHub Pages.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-04.

## Alcance completado

MAP-001 a MAP-011 están cerradas. La aplicación dispone de:

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
- matriz Playwright con Chromium, Firefox y WebKit móvil emulado;
- despliegue automático mediante GitHub Pages después de CI verde sobre `master`.

## MAP-011

Estado de la Issue: completada.  
PR de implementación: #28, fusionada en `ebbd363e9da4f9e4476ba86895de7ed87130cada`.  
PR de observabilidad: #29, fusionada en `9b7f4d2e29e7933c6665b4685b62adffa5ef656c`.  
PR de documentación del bloqueo inicial: #30, fusionada en `d697ed81f27c2626afaa5d25f59205127c37da89`.  
Workflow de calidad: `.github/workflows/ci.yml` / **CI**.  
Workflow de publicación: `.github/workflows/pages.yml` / **Deploy Beta 0.1 to GitHub Pages**.  
Run de despliegue validado: `30945777039`.  
Commit desplegado: `d697ed81f27c2626afaa5d25f59205127c37da89`.

La arquitectura mantiene CI y Pages separados. CI valida pull requests y commits integrados. Pages solo se activa tras una conclusión satisfactoria de CI sobre `master`; la ejecución manual se limita a `master` y repite toda la validación.

El build de Pages deriva `/castigo-divino-map/` desde el entorno. Solo `dist` se sube al artefacto. La auditoría rechaza imágenes raster, archivos compatibles con mapas o mosaicos y patrones conocidos de credenciales. El JPEG oficial no se almacena ni transforma.

## Resultados verificados

La validación de MAP-011 terminó en verde con:

- instalación reproducible mediante `npm ci` y 0 vulnerabilidades detectadas;
- formato y lint correctos;
- 73 pruebas unitarias en 9 archivos;
- build de Vite bajo `/castigo-divino-map/`;
- auditoría de 3 archivos de producción;
- 45 pruebas e2e;
- 2 smoke tests del preview de Pages;
- subida exclusiva de `dist` mediante la acción oficial de Pages;
- despliegue correcto en el entorno `github-pages`;
- 2 smoke tests contra la URL pública real;
- estado `github-pages/deployment` en éxito y enlazado al run `30945777039`.

El smoke público confirmó que la página y los recursos cargan desde el subdirectorio esperado, que una URL completa restaura y conserva el estado, que atrás y adelante mantienen la política de historial, y que la experiencia crítica sigue disponible a 320 px incluso cuando falla el mapa remoto.

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
- El repositorio es público; cualquier contenido integrado en código, historial, issues o pull requests debe tratarse como público.

## Recuperación

El rollback usa `git revert` mediante PR y un nuevo despliegue validado. No se reescribe `master`. Un fallo transitorio puede recuperarse con ejecución manual sobre `master`. Si aparece contenido privado o sin licencia, se revierte, puede deshabilitarse Pages temporalmente y se revocan credenciales expuestas.

El procedimiento completo vive en `docs/deployment-and-rollback.md`.

## Siguiente fase propuesta

MAP-012 — Incorporar el primer lote de contenido público real.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Fundación, alcance, arquitectura y acuerdo de trabajo |
| 2026-08-04 | MAP-002: fuente y estrategia legal del mapa |
| 2026-08-04 | MAP-003 a MAP-009: aplicación, datos, búsqueda, filtros y URL |
| 2026-08-04 | MAP-010: responsive y accesibilidad transversal |
| 2026-08-04 | MAP-011: PR #28 integra Pages, auditoría, smoke tests, rollback y checklist |
| 2026-08-04 | MAP-011: PR #29 añade estado verificable del despliegue |
| 2026-08-04 | MAP-011: run `30945777039` publica y valida la Beta 0.1 en GitHub Pages |
