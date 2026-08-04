# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante búsqueda, marcadores, categorías, etiquetas y notas.

## Estado

La Beta 0.1 dispone de una aplicación Vite + TypeScript con Leaflet, navegación responsive sobre el mapa oficial remoto de baja resolución, un catálogo público validado, marcadores accesibles, fichas de información, búsqueda por nombre principal, alias público y título de nota pública, y filtros combinables por categorías y etiquetas.

Consulta [`docs/project-status.md`](docs/project-status.md) para conocer el estado actual, [`docs/data-model.md`](docs/data-model.md) para revisar el contrato de datos y [`docs/architecture.md`](docs/architecture.md) para revisar la separación entre datos, búsqueda, filtros, selección, mapa y presentación.

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

La aplicación solicita el mapa directamente a la URL oficial de Wizards. Es necesaria conexión de red para visualizar la cartografía; si el recurso falla, la interfaz muestra un estado de error accesible y una superficie neutra. La búsqueda, los filtros, los marcadores y sus fichas continúan disponibles sin descargar una copia alternativa.

## Búsqueda

- El campo **Buscar lugares** acepta el nombre principal, cualquier alias público o el título de una nota pública.
- La búsqueda ignora diferencias entre mayúsculas, minúsculas, acentos, signos diacríticos y secuencias de espacios.
- Los cuerpos de las notas no forman parte del índice.
- Cada resultado identifica siempre el nombre principal del lugar e indica si la coincidencia procede de un alias o de una nota pública.
- Los resultados se ordenan por coincidencia exacta, coincidencia al comienzo, coincidencia parcial y, para empates, por el orden estable del catálogo.
- Una consulta vacía no restringe los filtros ni los marcadores.
- El botón **Limpiar búsqueda** vacía el campo y devuelve el foco al mismo.
- Pulsa Tab para recorrer los controles. Desde el campo, Flecha abajo lleva al primer resultado.
- En la lista, Flecha arriba, Flecha abajo, Inicio y Fin permiten recorrer resultados; Escape vuelve al campo.
- Enter o la barra espaciadora activan el botón enfocado.
- Seleccionar un resultado centra el mapa, activa el marcador existente y abre la misma ficha pública que los marcadores, aunque ese lugar no coincida con los filtros activos.

La lista de resultados continúa explicando únicamente las coincidencias de la consulta. El estado visual del mapa se deriva por separado de la intersección entre esa consulta y los filtros activos, sin duplicar el algoritmo de búsqueda.

## Filtros por categorías y etiquetas

Los controles se generan directamente desde `campaignCatalog` y conservan el orden estable de sus colecciones. No existen listas paralelas en la presentación.

La combinación es determinista:

- varias categorías seleccionadas se combinan con **OR**;
- varias etiquetas seleccionadas se combinan con **OR**;
- las dimensiones categoría, etiquetas y búsqueda se combinan con **AND**;
- una dimensión sin selecciones o una consulta vacía no restringe los resultados;
- sin consulta ni filtros, todos los lugares públicos coinciden.

Una etiqueta coincide cuando está asociada directamente al lugar o a cualquiera de sus notas públicas. Esta relación se deriva en memoria del catálogo, se deduplica y no modifica el contrato de datos.

La interfaz usa fieldsets y checkboxes HTML nativos con nombres accesibles. Tab recorre los filtros y la barra espaciadora cambia el checkbox enfocado. El botón **Limpiar filtros** desmarca categorías y etiquetas, recalcula las coincidencias y conserva el foco en el propio botón. Las categorías o etiquetas sin lugares asociados se muestran deshabilitadas y explican su estado.

El estado informa cuántos lugares satisfacen todas las dimensiones activas y anuncia de forma comprensible cuando no existe ninguna coincidencia. Cambiar filtros no mueve el foco al mapa ni cierra una ficha abierta.

Todos los marcadores permanecen visibles y operables:

- los coincidentes se resaltan mediante contorno, clase y prioridad visual;
- los no coincidentes se atenúan mediante opacidad, escala, contraste y borde discontinuo, no solo color;
- un marcador atenuado sigue admitiendo ratón, táctil, Enter y barra espaciadora;
- el lugar activo conserva la máxima prioridad visual;
- si el lugar activo deja de coincidir, el estado accesible lo comunica sin crear otra selección ni cerrar su ficha.

La consulta, los filtros y la selección no se guardan ni modifican la URL. La persistencia y los enlaces directos pertenecen a MAP-009.

## Navegación, marcadores y fichas

- Arrastra con ratón, trackpad o gesto táctil para desplazarte.
- Usa rueda, pellizco, doble pulsación o controles visibles para cambiar el zoom.
- Recorre los marcadores con Tab.
- Activa el marcador enfocado con Enter o la barra espaciadora.
- Cada marcador anuncia el nombre del lugar, su categoría y si coincide con la búsqueda y los filtros actuales.
- La categoría se diferencia mediante símbolo, forma, clase visual y texto accesible, no solo mediante color.
- Al seleccionar un lugar, el foco pasa al título de su ficha.
- La ficha muestra nombre, alias públicos, categoría, etiquetas y todas las notas públicas asociadas.
- El botón de cierre devuelve el foco al marcador activo.
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

No añadas notas privadas, spoilers, datos del director de juego ni campos ocultos. Todo lo incluido en el catálogo llega al frontend público. Nombres, alias, títulos, descripciones y cuerpos se representan como texto mediante APIs DOM; no se interpretan como HTML confiable.

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

Las pruebas unitarias verifican dimensiones, límites, cálculos cartográficos, validación del catálogo, conversión de coordenadas, modelos de ficha, selección, búsqueda y filtrado. La lógica de filtros cubre dimensiones vacías, una o varias categorías, una o varias etiquetas, combinación AND con búsqueda, etiquetas de notas públicas, estado sin coincidencias, orden estable, asociación de `placeId`, ausencia de duplicados e inmutabilidad.

Las pruebas e2e interceptan exclusivamente la URL oficial y responden con un SVG neutro generado en memoria. Cubren marcadores, fichas, búsqueda, filtros generados desde el catálogo, resultados vacíos, combinación de dimensiones, resaltado y atenuación, selección de marcadores atenuados, teclado, foco, responsive, navegación y error del recurso remoto.

La CI no descarga, almacena, archiva ni publica el mapa oficial. Tampoco genera recortes, recompressiones, conversiones, mosaicos o derivados.

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests dirigidas a `master`. Instala las dependencias desde cero y valida formato, lint, pruebas unitarias, build y pruebas e2e en Chromium.

## Estructura

```text
src/
├── app/
│   ├── placeDetails.ts       # Vista DOM accesible de la ficha
│   ├── placeFilters.ts       # Fuente única y presentación accesible de filtros
│   ├── placeSearch.ts        # Estado y presentación accesible de búsqueda
│   ├── placeSelection.ts     # Fuente única de selección
│   └── renderApp.ts          # Estructura semántica
├── data/
│   ├── catalog.ts            # Catálogo público y ejemplos neutros
│   ├── coordinates.ts        # Conversión de x/y al orden de Leaflet
│   ├── filters.ts            # Coincidencia pura y combinación con búsqueda
│   ├── model.ts              # Entidades y relaciones TypeScript
│   ├── placeDetails.ts       # Modelos derivados de marcador y ficha
│   ├── search.ts             # Normalización, coincidencias y orden estable
│   └── validate.ts           # Validación runtime estricta
├── map/
│   ├── config.ts             # URL, dimensiones, límites y cálculos puros
│   └── leaflet.ts            # Mapa, overlay y reflejo mínimo de estados
├── styles/
│   ├── filters.css           # Filtros responsive y estados de coincidencia
│   ├── main.css              # Diseño general, marcadores y ficha
│   └── search.css            # Búsqueda responsive y resultados acotados
└── main.ts                   # Orquestación de consulta, filtros, selección y vistas
tests/
└── e2e/
    ├── app.spec.ts           # Flujos base de mapa, búsqueda, marcadores y ficha
    └── filters.spec.ts       # Filtros, combinación, accesibilidad y responsive
```

## Privacidad y licencias

El contenido publicado debe ser apto para jugadores. No deben incorporarse secretos narrativos ni recursos sin licencia.

La Beta 0.1 usa directamente `Sword-Coast-Map_LowRes.jpg` desde `media.wizards.com` mediante `L.imageOverlay` y `L.CRS.Simple`. El JPEG no forma parte del repositorio, build, despliegue, releases ni artefactos de CI. La fuente y las restricciones están documentadas en [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md) y en [ADR 0001](docs/decisions/0001-use-remote-low-resolution-map-image.md).
