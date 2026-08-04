# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante marcadores, categorías y etiquetas.

## Estado

La Beta 0.1 dispone de una aplicación Vite + TypeScript con Leaflet, navegación responsive sobre el mapa oficial remoto de baja resolución, un modelo público de datos de campaña y una cadena automática de calidad. Los marcadores y fichas visuales se incorporarán en MAP-006.

Consulta [`docs/project-status.md`](docs/project-status.md) para conocer el estado actual, [`docs/data-model.md`](docs/data-model.md) para revisar el contrato de datos y [`docs/working-agreement.md`](docs/working-agreement.md) para revisar el flujo de trabajo.

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

El segundo comando instala el navegador utilizado por las pruebas end-to-end.

## Ejecución

```bash
npm run dev
```

Vite mostrará la URL local en la terminal. Para validar el artefacto de producción:

```bash
npm run build
npm run preview
```

La aplicación solicita el mapa directamente a la URL oficial de Wizards. Es necesaria conexión de red para visualizar la cartografía; si el recurso falla, la interfaz muestra un estado de error accesible y una superficie neutra sin copias alternativas.

## Navegación del mapa

- Arrastre con ratón, trackpad o gesto táctil para desplazarse.
- Rueda, gesto de pellizco, doble pulsación o controles visibles para cambiar el zoom.
- Encuadre inicial del mapa completo.
- Límites y zoom mínimo recalculados al cambiar el tamaño del viewport.
- Zoom máximo limitado a la resolución útil de la imagen LowRes.

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
```

No añadas notas privadas, spoilers, datos del director de juego ni campos ocultos. Todo lo incluido en el catálogo llega al frontend público.

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

Las pruebas unitarias verifican dimensiones, límites, cálculos cartográficos, tipos de datos, relaciones, coordenadas, alias y política estructural de contenido público. Las pruebas e2e interceptan exclusivamente la URL oficial y responden con un SVG neutro generado en memoria para cubrir carga, navegación, responsive y error.

La CI no descarga, almacena, archiva ni publica el mapa oficial. Tampoco genera recortes, recompressiones, conversiones, mosaicos o derivados.

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests dirigidas a `master`. Instala las dependencias desde cero y valida formato, lint, pruebas unitarias, build y pruebas e2e en Chromium. La prueba unitaria del catálogo hace fallar la CI cuando los datos públicos son inválidos.

## Estructura

```text
src/
├── app/
│   └── renderApp.ts      # Presentación y estructura accesible
├── data/
│   ├── catalog.ts        # Catálogo público y ejemplos neutros
│   ├── coordinates.ts    # Conversión de x/y al orden de Leaflet
│   ├── model.ts          # Entidades y relaciones TypeScript
│   ├── validate.test.ts  # Catálogo válido y casos inválidos
│   └── validate.ts       # Validación runtime estricta
├── map/
│   ├── config.ts         # URL, dimensiones, límites y cálculos puros
│   ├── config.test.ts    # Pruebas unitarias cartográficas
│   └── leaflet.ts        # Adaptador Leaflet y ciclo de vida
├── styles/
│   └── main.css          # Diseño responsive y alternativa neutra
└── main.ts               # Montaje de la aplicación
tests/
└── e2e/
    └── app.spec.ts       # Carga simulada, navegación y error
```

## Privacidad y licencias

El contenido publicado debe ser apto para jugadores. No deben incorporarse secretos narrativos ni recursos sin licencia.

La Beta 0.1 usa directamente `Sword-Coast-Map_LowRes.jpg` desde `media.wizards.com` mediante `L.imageOverlay` y `L.CRS.Simple`. El JPEG no forma parte del repositorio, build, despliegue, releases ni artefactos de CI. La fuente y las restricciones están documentadas en [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md) y en [ADR 0001](docs/decisions/0001-use-remote-low-resolution-map-image.md).
