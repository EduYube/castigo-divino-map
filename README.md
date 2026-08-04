# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante marcadores, categorías, etiquetas y notas.

## Estado

La Beta 0.1 dispone de una aplicación Vite + TypeScript con Leaflet, navegación responsive sobre el mapa oficial remoto de baja resolución, un catálogo público validado y marcadores accesibles que abren fichas de información. La búsqueda se incorporará en MAP-007.

Consulta [`docs/project-status.md`](docs/project-status.md) para conocer el estado actual, [`docs/data-model.md`](docs/data-model.md) para revisar el contrato de datos y [`docs/architecture.md`](docs/architecture.md) para revisar la separación entre datos, selección, mapa y presentación.

## Requisitos

- Node.js 22.12 o posterior.
- npm 10 o posterior.

El repositorio incluye `.nvmrc`, por lo que con `nvm` se puede seleccionar la versión acordada mediante:

```bash
nvm use
```

## Instalación local

Desde un clon limpio:

```bash
npm install
npx playwright install --with-deps chromium
```

## Ejecución

```bash
npm run dev
```

Para validar el artefacto de producción:

```bash
npm run build
npm run preview
```

La aplicación solicita el mapa directamente a la URL oficial de Wizards. Es necesaria conexión de red para visualizar la cartografía; si el recurso falla, la interfaz muestra un estado de error accesible y una superficie neutra. Los marcadores y sus fichas continúan disponibles sin descargar una copia alternativa.

## Navegación, marcadores y fichas

- Arrastra con ratón, trackpad o gesto táctil para desplazarte.
- Usa rueda, pellizco, doble pulsación o controles visibles para cambiar el zoom.
- Recorre los marcadores con Tab.
- Activa el marcador enfocado con Enter o la barra espaciadora.
- Cada marcador anuncia el nombre del lugar y su categoría.
- La categoría se diferencia mediante símbolo, forma, clase visual y texto accesible, no solo mediante color.
- Al seleccionar un lugar, el foco pasa al título de su ficha.
- La ficha muestra nombre, alias públicos, categoría, etiquetas y todas las notas públicas asociadas.
- El botón de cierre devuelve el foco al marcador que abrió la ficha.
- En escritorio la ficha se muestra lateralmente; en pantallas estrechas pasa debajo del mapa.

## Datos de campaña

El catálogo público vive en `src/data/catalog.ts`. Los tipos, relaciones, reglas de coordenadas y política de contenido están documentados en [`docs/data-model.md`](docs/data-model.md).

Antes de añadir o modificar datos:

1. confirma que la información es pública y conocida por los jugadores;
2. crea IDs y slugs estables en kebab-case;
3. añade primero las categorías y etiquetas referenciadas;
4. usa coordenadas `{ x, y }` sobre la imagen de `3600 × 2329`, con origen en la esquina superior izquierda;
5. ejecuta la validación específica y la cadena completa de calidad.

```bash
npm run validate:data
npm run format:check
npm run lint
npm run test
npm run build
npm run test:e2e
```

No añadas notas privadas, spoilers, datos del director de juego ni campos ocultos. Todo lo incluido en el catálogo llega al frontend público. Los cuerpos de las notas se representan como texto mediante APIs DOM; no se interpretan como HTML confiable.

## Comandos disponibles

| Comando | Propósito |
|---|---|
| `npm run dev` | Inicia el servidor de desarrollo de Vite. |
| `npm run build` | Comprueba TypeScript y genera el artefacto de producción. |
| `npm run preview` | Sirve localmente el último build. |
| `npm run lint` | Ejecuta ESLint. |
| `npm run format` | Aplica Prettier a los archivos del repositorio. |
| `npm run format:check` | Comprueba el formato sin modificar archivos. |
| `npm run test` | Ejecuta las pruebas unitarias con Vitest. |
| `npm run test:watch` | Ejecuta Vitest en modo observación. |
| `npm run validate:data` | Valida el catálogo público y los principales casos inválidos. |
| `npm run test:e2e` | Ejecuta las pruebas end-to-end con Playwright. |
| `npm run test:e2e:ui` | Abre la interfaz de Playwright. |
| `npm run test:all` | Ejecuta pruebas unitarias y end-to-end. |

## Pruebas y recurso externo

Las pruebas unitarias verifican dimensiones, límites, cálculos cartográficos, validación del catálogo, conversión de coordenadas, resolución de categorías y etiquetas, notas por `placeId`, modelos de ficha y selección.

Las pruebas e2e interceptan exclusivamente la URL oficial y responden con un SVG neutro generado en memoria. Cubren el número y posición de los marcadores, apertura y contenido de fichas, cierre, teclado, foco, responsive, navegación y error del recurso remoto.

La CI no descarga, almacena, archiva ni publica el mapa oficial. Tampoco genera recortes, recompressiones, conversiones, mosaicos o derivados.

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests dirigidas a `master`. Instala las dependencias desde cero y valida formato, lint, pruebas unitarias, build y pruebas e2e en Chromium.

## Estructura

```text
src/
├── app/
│   ├── placeDetails.ts       # Vista DOM accesible de la ficha
│   ├── placeSelection.ts     # Fuente única de selección
│   └── renderApp.ts          # Estructura semántica
├── data/
│   ├── catalog.ts            # Catálogo público y ejemplos neutros
│   ├── coordinates.ts        # Conversión de x/y al orden de Leaflet
│   ├── model.ts              # Entidades y relaciones TypeScript
│   ├── placeDetails.ts       # Modelos derivados de marcador y ficha
│   └── validate.ts           # Validación runtime estricta
├── map/
│   ├── config.ts             # URL, dimensiones, límites y cálculos puros
│   └── leaflet.ts            # Mapa, overlay y marcadores accesibles
├── styles/
│   └── main.css              # Diseño responsive, marcadores y ficha
└── main.ts                   # Orquestación de selección y vistas
tests/
└── e2e/
    └── app.spec.ts           # Flujos de mapa, marcadores y ficha
```

## Privacidad y licencias

El contenido publicado debe ser apto para jugadores. No deben incorporarse secretos narrativos ni recursos sin licencia.

La Beta 0.1 usa directamente `Sword-Coast-Map_LowRes.jpg` desde `media.wizards.com` mediante `L.imageOverlay` y `L.CRS.Simple`. El JPEG no forma parte del repositorio, build, despliegue, releases ni artefactos de CI. La fuente y las restricciones están documentadas en [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md) y en [ADR 0001](docs/decisions/0001-use-remote-low-resolution-map-image.md).
