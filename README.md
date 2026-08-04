# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante marcadores, categorías y etiquetas.

## Estado

La base técnica de la Beta 0.1 está preparada con Vite, TypeScript, Leaflet y una cadena automática de calidad. La integración navegable del mapa se realizará en MAP-004.

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

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests dirigidas a `master`. Instala las dependencias desde cero y valida formato, lint, pruebas unitarias, build y prueba e2e en Chromium.

## Estructura inicial

```text
src/
├── app/          # Presentación y modelo de preparación
├── map/          # Límite de integración de Leaflet
└── styles/       # Estilos globales responsive
tests/
└── e2e/          # Flujos mínimos de navegador
```

## Límite cartográfico de MAP-003

Leaflet está instalado y disponible, pero MAP-003 no implementa `CRS.Simple`, `L.imageOverlay`, marcadores ni navegación cartográfica.

La aplicación tampoco copia, descarga automáticamente ni incorpora el mapa oficial al repositorio, al build, a releases o a artefactos de CI. La fuente y las restricciones están documentadas en [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md) y en [ADR 0001](docs/decisions/0001-use-remote-low-resolution-map-image.md).

## Privacidad y licencias

El contenido publicado debe ser apto para jugadores. No deben incorporarse secretos narrativos ni recursos sin licencia. El mapa oficial no forma parte de este repositorio.
