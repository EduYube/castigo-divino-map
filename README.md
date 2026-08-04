# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante búsqueda, marcadores, categorías, etiquetas, fichas y enlaces reproducibles.

## Beta 0.1

URL objetivo:

`https://eduyube.github.io/castigo-divino-map/`

La aplicación, el build y el workflow de despliegue están integrados. La URL todavía no está activa porque GitHub Pages requiere una activación administrativa inicial con origen **GitHub Actions**.

Acción pendiente:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Después se debe reejecutar **Deploy Beta 0.1 to GitHub Pages** sobre `master`. MAP-011 permanece abierta hasta que el despliegue y el smoke público terminen en verde.

Documentación principal:

- [`docs/project-status.md`](docs/project-status.md)
- [`docs/product-scope.md`](docs/product-scope.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/data-model.md`](docs/data-model.md)
- [`docs/deployment-and-rollback.md`](docs/deployment-and-rollback.md)
- [`docs/beta-0.1-checklist.md`](docs/beta-0.1-checklist.md)
- [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md)

## Requisitos

- Node.js 22.12 o posterior.
- npm 10 o posterior.

```bash
nvm use
npm ci
npx playwright install --with-deps chromium firefox webkit
```

## Desarrollo local

```bash
npm run dev
```

El desarrollo ordinario usa `/` como base. El build y preview habituales son:

```bash
npm run build
npm run preview
```

## Simular GitHub Pages localmente

```bash
npm run build:pages
npm run verify:build
npm run preview:pages
```

El modo `pages` deriva el nombre del repositorio y genera recursos bajo `/castigo-divino-map/`. El smoke automatizado sobre ese preview se ejecuta con:

```bash
npm run build:pages
npm run test:e2e:pages
```

## URLs compartidas

La aplicación usa query string y no necesita router ni reescrituras:

| Parámetro | Ejemplo | Significado |
|---|---|---|
| `place` | `place=paso-de-demostracion` | lugar activo |
| `q` | `q=paso` | consulta |
| `category` | `category=lugares-destacados` | categoría repetible |
| `tag` | `tag=mountain-pass` | etiqueta repetible |

Ejemplo previsto bajo GitHub Pages:

`https://eduyube.github.io/castigo-divino-map/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass`

El preview automatizado confirma que abrir o recargar esa forma de URL conserva el pathname `/castigo-divino-map/`, restaura búsqueda, filtros, marcador y ficha, y canonicaliza únicamente la query. Escribir usa `replaceState`; selección, cierre y filtros usan `pushState`; atrás y adelante restauran sin recargar ni robar el foco. La misma comprobación se ejecutará sobre la URL pública cuando Pages esté habilitado.

## Búsqueda y filtros

La búsqueda pública considera nombre principal, alias y título de nota. No indexa cuerpos de notas. Los resultados se ordenan por coincidencia exacta, prefijo, parcial y orden estable del catálogo.

Las categorías seleccionadas se combinan con OR, las etiquetas con OR y las dimensiones categoría, etiqueta y búsqueda con AND. Una dimensión inactiva no restringe. Todos los marcadores permanecen visibles y operables; los no coincidentes se atenúan.

## Responsive y accesibilidad

La cobertura automatizada incluye escritorio, 320 × 740 y móvil horizontal. La ficha pasa debajo del mapa cuando no hay espacio lateral. Resultados y filtros mantienen scroll interno y la página evita overflow horizontal accidental.

Tab sigue el orden visual. Los resultados soportan flechas, Inicio, Fin y Escape. Los objetivos principales alcanzan 44 × 44 px. El foco visible no depende solo del color. Abrir directamente enfoca el título de la ficha; cerrar devuelve el foco al marcador; la carga inicial y `popstate` no roban foco.

Chromium ejecuta la suite completa. Firefox y `mobile-webkit` ejecutan el flujo crítico responsive y accesible. `mobile-webkit` emula un iPhone 13 y no equivale a una prueba en dispositivo físico.

## Mapa remoto

La aplicación solicita exclusivamente:

`https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg`

El JPEG oficial **no forma parte del repositorio, el build ni el artefacto de Pages**. No se descarga durante el build, no se transforma, no se precarga, no se recodifica y no se generan mosaicos. Las pruebas interceptan la URL con un SVG neutro creado en memoria.

Si el recurso remoto falla, el mapa muestra una superficie neutra y conserva zoom, marcadores, búsqueda, filtros, fichas, URL y aviso legal.

## Calidad

```bash
npm run format:check
npm run lint
npm run test
npm run build:pages
npm run verify:build
npm run test:e2e
npm run test:e2e:pages
```

La validación integrada ha superado 73 pruebas unitarias, 45 pruebas e2e y 2 smoke tests de Pages local. `verify-production-build.mjs` comprueba el contenido mínimo, la base de recursos, la ausencia de imágenes raster o archivos con nombres compatibles con mapas y mosaicos, la presencia de la URL oficial remota y patrones conocidos de credenciales.

## CI y despliegue

`.github/workflows/ci.yml` se ejecuta en pull requests hacia `master`, en pushes a `master` y manualmente. Valida formato, lint, pruebas unitarias, build, artefacto, matriz e2e y preview con la base de Pages.

`.github/workflows/pages.yml` se activa automáticamente solo después de una ejecución verde de CI sobre `master`. Reconstruye el SHA validado, sube únicamente `dist`, usa el entorno `github-pages`, ejecuta un smoke test sobre la URL publicada y registra el estado `github-pages/deployment` sobre el commit.

El job de despliegue es el único con `pages: write` e `id-token: write`. El job de reporte es el único con `statuses: write`. La concurrencia no cancela un despliegue ya iniciado.

El run `30940902156` confirmó correctamente build, auditoría, smoke local y subida de `dist`, pero falló en `actions/configure-pages@v6` porque Pages no estaba habilitado. `actions/deploy-pages` y el smoke público quedaron pendientes.

## Activación y despliegue manual

Primera activación:

1. Abrir **Settings → Pages**.
2. En **Build and deployment**, seleccionar **Source: GitHub Actions**.
3. Abrir **Actions → Deploy Beta 0.1 to GitHub Pages**.
4. Seleccionar **Run workflow** sobre `master`.
5. Confirmar que `Build and upload production artifact`, `Deploy GitHub Pages`, `Validate published Beta 0.1` y `Record deployment status` terminan en verde.

La ejecución manual repite toda la calidad antes de publicar; una rama de trabajo no puede desplegarse. El conector disponible no expone la activación administrativa de Pages y el `GITHUB_TOKEN` del workflow tampoco puede realizarla.

## Rollback resumido

1. Identificar el último workflow verde y su SHA.
2. Crear una rama desde `master`.
3. Revertir la regresión con `git revert`.
4. Abrir y fusionar una PR con CI verde.
5. Confirmar el despliegue y el smoke posterior.
6. Ejecutar de nuevo la auditoría para asegurar que no aparece una copia local del mapa.

Para un fallo transitorio de Pages, reejecutar manualmente el workflow sobre `master`. Para contenido privado o sin licencia, revertir de inmediato y deshabilitar temporalmente Pages cuando sea necesario. Consulta [`docs/deployment-and-rollback.md`](docs/deployment-and-rollback.md).

## Datos públicos

El catálogo vive en `src/data/`. Todo dato incluido llega al bundle público. No se permiten notas privadas, spoilers, credenciales, información personal ni campos ocultos. `docs/data-model.md` define IDs, slugs, relaciones, coordenadas y validación.

## Comandos

| Comando | Propósito |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build ordinario |
| `npm run build:pages` | build con base de GitHub Pages |
| `npm run preview` | preview ordinario |
| `npm run preview:pages` | preview bajo el subdirectorio público |
| `npm run verify:build` | auditoría de `dist` |
| `npm run format:check` | comprobación de Prettier |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run validate:data` | contrato público de datos |
| `npm run test:e2e` | matriz Playwright |
| `npm run test:e2e:pages` | smoke del preview o de `PAGES_URL` |
