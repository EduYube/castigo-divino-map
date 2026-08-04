# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante marcadores, categorías y etiquetas.

## Estado

La Beta 0.1 dispone de una aplicación Vite + TypeScript con Leaflet, navegación responsive sobre el mapa oficial remoto de baja resolución y una cadena automática de calidad. Los marcadores y datos de campaña se incorporarán en Issues posteriores.

Consulta [`docs/project-status.md`](docs/project-status.md) para conocer el estado actual y [`docs/working-agreement.md`](docs/working-agreement.md) para revisar el flujo de trabajo.

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
| `npm run test:e2e` | Ejecuta las pruebas end-to-end con Playwright. |
| `npm run test:e2e:ui` | Abre la interfaz de Playwright. |
| `npm run test:all` | Ejecuta pruebas unitarias y end-to-end. |

## Pruebas y recurso externo

Las pruebas unitarias verifican dimensiones, límites y cálculos cartográficos sin red. Las pruebas e2e interceptan exclusivamente la URL oficial y responden con un SVG neutro generado en memoria para cubrir carga, navegación, responsive y error.

La CI no descarga, almacena, archiva ni publica el mapa oficial. Tampoco genera recortes, recompressiones, conversiones, mosaicos o derivados.

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests dirigidas a `master`. Instala las dependencias desde cero y valida formato, lint, pruebas unitarias, build y pruebas e2e en Chromium.

## Estructura cartográfica

```text
src/
├── app/
│   └── renderApp.ts      # Presentación y estructura accesible
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
