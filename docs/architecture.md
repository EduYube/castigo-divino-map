# Arquitectura de la Beta 0.1

## Stack

- Vite + TypeScript.
- Leaflet con `CRS.Simple`, `L.imageOverlay` y `L.divIcon`.
- CSS propio.
- Catálogo estático TypeScript validado en runtime.
- Vitest, Playwright, ESLint y Prettier.
- GitHub Actions y GitHub Pages.
- Node.js 22.

## Principios

- Beta sin backend, router, autenticación, persistencia, analítica ni rastreo.
- GitHub y la documentación del repositorio son la fuente de verdad.
- Los datos del frontend son públicos por definición.
- El mapa oficial se carga de forma remota y nunca se almacena, transforma o redistribuye.
- Datos, estado de aplicación, presentación, Leaflet, URL y despliegue mantienen responsabilidades separadas.
- La red, el mapa remoto y GitHub Pages se tratan como dependencias falibles.
- Cada contrato relevante se valida mediante pruebas automáticas y revisión humana.

## Capas de la aplicación

### Datos públicos

`src/data/` define categorías, etiquetas, lugares y notas normalizadas. `docs/data-model.md` es la fuente de verdad semántica. Las coordenadas se expresan como `{ x, y }` sobre la imagen de referencia de 3600 × 2329 y se convierten centralmente a `[y, x]`.

El catálogo no contiene flags de privacidad. Cualquier contenido privado debe permanecer fuera del repositorio y del bundle.

### Lógica pura

- `src/data/search.ts`: búsqueda pública por nombre, alias y título de nota.
- `src/data/filters.ts`: filtros y combinación estable.
- `src/app/urlState.ts`: normalización, serialización, parseo, validación y comparación de URL.
- `src/data/validate.ts`: estructura, referencias, coordenadas, IDs, slugs y campos prohibidos.

### Fuentes únicas de estado

- `src/app/placeSearch.ts`: única consulta.
- `src/app/placeFilters.ts`: únicas categorías y etiquetas seleccionadas.
- `src/app/placeSelection.ts`: único lugar activo.

Leaflet no conserva consulta, filtros, selección ni URL. La URL es una representación serializada y no un almacén adicional.

### Presentación

`src/app/renderApp.ts` crea la estructura semántica. Los controladores de búsqueda, filtros y ficha usan controles HTML nativos. El contenido público se inserta con APIs DOM y `textContent`, no como HTML confiable.

`src/styles/accessibility.css` se carga al final y garantiza foco visible, objetivos táctiles, reducción de movimiento, colores forzados, adaptación desde 320 px y ausencia de overflow horizontal accidental.

### Mapa

`src/map/config.ts` centraliza la URL oficial, dimensiones y límites. `src/map/leaflet.ts` usa `L.CRS.Simple`, `L.imageOverlay` y marcadores HTML. Solo recibe estados derivados por `placeId`.

Cuando falla el overlay remoto, la superficie neutra conserva la geometría, el zoom, los marcadores, la búsqueda, los filtros y las fichas.

## Contrato de URL

La aplicación usa exclusivamente la query string:

| Parámetro | Identidad | Significado |
|---|---|---|
| `place` | slug estable de lugar | ficha activa |
| `q` | texto público | consulta |
| `category` | slug estable, repetible | categorías |
| `tag` | ID estable, repetible | etiquetas |

`createCanonicalPublicAppUrl` conserva el origen y el pathname actual. Solo sustituye la búsqueda y elimina el fragmento. Esta propiedad permite desplegar bajo `/castigo-divino-map/` sin redirigir a la raíz del dominio.

Los cambios continuos de consulta usan `replaceState`. Selección, cierre y filtros usan `pushState`. `popstate` restaura los controladores existentes sin recargar, crear entradas o robar el foco.

## Responsive y accesibilidad

- Diseño fluido desde 320 px.
- Ficha lateral con espacio suficiente e integrada debajo del mapa en tamaños estrechos.
- Resultados y filtros con scroll interno acotado.
- Mapa con altura mínima útil en móvil vertical y horizontal.
- Tab sigue el orden visual; no existen `tabindex` positivos ni trampas de foco.
- Resultados soportan flechas, Inicio, Fin y Escape.
- Abrir directamente enfoca el título; cerrar devuelve el foco al marcador.
- La carga inicial y el historial no fuerzan foco.
- Marcadores y estados combinan forma, borde, opacidad, escala, anillos y texto accesible.

Chromium ejecuta la suite completa. Firefox y `mobile-webkit` ejecutan la suite crítica. `mobile-webkit` es una emulación automatizada de iPhone 13, no una prueba física.

## Arquitectura de despliegue

### Separación CI / Pages

`.github/workflows/ci.yml` es la puerta de calidad. Se ejecuta en pull requests hacia `master`, en pushes a `master` y manualmente. Usa Node.js 22, `npm ci`, formato, lint, Vitest, build de Pages, auditoría de `dist`, matriz e2e y smoke local del build.

`.github/workflows/pages.yml` es un workflow separado. La ruta automática se activa mediante `workflow_run` y solo acepta una ejecución de CI con conclusión `success` y rama `master`. De esta forma se reutiliza un resultado de calidad verificable sin duplicar toda la matriz.

La ruta manual solo funciona desde `master` y repite la validación completa, porque no dispone de un resultado `workflow_run` que pueda reutilizar de forma segura.

### Configuración de base

`vite.config.ts` usa `/` en desarrollo y builds ordinarios. El modo `pages` deriva el nombre del repositorio desde `GITHUB_REPOSITORY`; el preview local puede usar `npm_package_name`. Para este repositorio produce:

`/castigo-divino-map/`

Los recursos generados se sirven desde `/castigo-divino-map/assets/`. No existe router ni fallback de SPA; la página única y su query string funcionan directamente bajo el pathname del repositorio.

### Build y artefacto

El job `build` reconstruye exactamente el SHA validado. `verify-production-build.mjs` exige `index.html`, JavaScript, CSS, referencias correctas y archivos existentes. También rechaza imágenes raster, nombres compatibles con mapas o mosaicos y patrones conocidos de credenciales. Exige que la URL oficial remota continúe presente.

Solo `dist` se entrega a `actions/upload-pages-artifact`. No se publican `node_modules`, cachés, trazas, informes, dependencias completas ni el mapa oficial.

### Despliegue

El job `deploy` usa:

- `actions/configure-pages@v6`;
- `actions/deploy-pages@v5`;
- entorno `github-pages`;
- URL `steps.deployment.outputs.page_url`.

Los permisos globales y de build/smoke son `contents: read`. Solo el job de despliegue recibe `pages: write` e `id-token: write`.

El grupo de concurrencia es `pages` con `cancel-in-progress: false`. Una ejecución nueva no cancela un despliegue que ya comenzó.

### Smoke tests

`playwright.pages.config.ts` sirve el build mediante `vite preview --mode pages` o usa `PAGES_URL` después del despliegue. La misma suite comprueba preview y URL publicada.

Se verifican respuesta, assets bajo el subdirectorio, estructura principal, URL completa, recarga, historial, 320 px, foco crítico, aviso legal, error remoto y solicitud exclusiva del mapa oficial. El recurso se intercepta con un SVG neutro en memoria o una respuesta 503 controlada.

## Validación local, CI y URL publicada

- **Local:** desarrollo rápido en `/` con `npm run dev`; build ordinario con `npm run build`; simulación de Pages con `npm run build:pages`, `npm run verify:build`, `npm run preview:pages` y `npm run test:e2e:pages`.
- **CI:** valida el repositorio y el build de Pages antes de integrar y después de cada integración.
- **URL publicada:** el job `smoke` usa la URL emitida por `deploy-pages` y valida la versión realmente servida.

## Mapa remoto y legalidad

La única imagen cartográfica aceptada para la Beta 0.1 es la URL oficial documentada en `src/map/config.ts` y en ADR 0001. El JPEG no se copia al repositorio, `dist`, Pages, releases, CDN propio ni artefactos de CI. No se recorta, recomprime, convierte, precarga ni divide en mosaicos.

Si la URL falla, la aplicación conserva una superficie neutra. Una sustitución requiere revisar la fuente, licencia, dimensiones y migración de coordenadas antes de modificar el contrato.

## Rollback y recuperación

El rollback usa `git revert` mediante una nueva pull request. No se reescribe `master`. Tras fusionar el revert, CI vuelve a validar y Pages publica el commit corregido.

Cuando el código es correcto y el fallo fue transitorio, el workflow de Pages puede reejecutarse manualmente sobre `master`. El historial del entorno `github-pages` identifica el último despliegue verde y el SHA validado.

Si aparece contenido privado, una credencial o un recurso sin licencia, se revierte y redespliega inmediatamente; Pages puede deshabilitarse temporalmente. Las credenciales expuestas se revocan. Cada recuperación debe volver a ejecutar la auditoría que impide incorporar el mapa oficial.

El procedimiento completo vive en `docs/deployment-and-rollback.md`.

## Límites conocidos

- El mapa remoto y GitHub Pages no ofrecen un SLA del proyecto.
- La auditoría de patrones no reemplaza revisión editorial de privacidad.
- La accesibilidad automatizada no sustituye una auditoría certificada ni dispositivos físicos.
- El catálogo de Beta 0.1 sigue usando contenido ficticio de demostración.
