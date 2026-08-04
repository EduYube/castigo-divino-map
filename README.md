# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante búsqueda, marcadores, categorías, etiquetas, notas y enlaces directos reproducibles.

## Estado

La Beta 0.1 dispone de una aplicación Vite + TypeScript con Leaflet, navegación responsive sobre el mapa oficial remoto de baja resolución, un catálogo público validado, marcadores accesibles, fichas de información, búsqueda por nombre principal, alias público y título de nota pública, filtros combinables por categorías y etiquetas, restauración completa del estado desde la URL y una experiencia consolidada desde 320 píxeles.

Consulta [`docs/project-status.md`](docs/project-status.md) para conocer el estado actual, [`docs/data-model.md`](docs/data-model.md) para revisar el contrato de datos y [`docs/architecture.md`](docs/architecture.md) para revisar la separación entre datos, búsqueda, filtros, selección, URL, mapa y presentación.

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
npx playwright install --with-deps chromium firefox webkit
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

La aplicación solicita el mapa directamente a la URL oficial de Wizards. Es necesaria conexión de red para visualizar la cartografía; si el recurso falla, la interfaz muestra un estado de error accesible y una superficie neutra con la misma geometría útil. La búsqueda, los filtros, los enlaces directos, el zoom, los marcadores y sus fichas continúan disponibles sin descargar una copia alternativa.

## Responsive y accesibilidad

La experiencia se cubre desde 320 píxeles de ancho mediante CSS fluido, `minmax()`, `clamp()`, unidades `svh`, contenido capaz de romper línea y listas internas acotadas. No debe aparecer desplazamiento horizontal accidental.

- La cabecera, introducción, búsqueda, resultados, filtros, mapa, controles de zoom, ficha y aviso legal permanecen dentro del ancho del viewport.
- Nombres, alias, etiquetas, títulos, descripciones, cuerpos y URLs largas pueden partir línea sin ensanchar la página.
- La ficha es lateral cuando existe espacio y se integra debajo del mapa por debajo de 64 rem.
- Búsqueda y grupos de filtros pasan a una sola columna por debajo de 48 rem.
- Los resultados y cada grupo de filtros conservan scroll interno para que todas las opciones sigan alcanzables.
- El mapa mantiene al menos 22 rem de altura en móvil vertical y 18 rem en móvil horizontal de poca altura.
- La superficie de error remoto usa la misma caja del mapa cargado.
- `ResizeObserver` invalida Leaflet y vuelve a aplicar los límites después de cambios de tamaño u orientación.

Los viewports automatizados representativos incluyen escritorio, 320 × 740 y 667 × 375. La configuración móvil usa WebKit con perfil iPhone 13 emulado.

### Teclado y foco

- El enlace **Saltar al contenido principal** es el primer acceso rápido.
- Tab recorre los controles según el orden visual y no existen `tabindex` positivos.
- Desde el campo de búsqueda, Flecha abajo lleva al primer resultado.
- En resultados, Flecha arriba, Flecha abajo, Inicio y Fin desplazan el foco; Escape vuelve al campo.
- Enter y barra espaciadora activan resultados, botones y marcadores según su semántica.
- Cambiar un filtro conserva el foco en su checkbox.
- **Limpiar búsqueda** devuelve el foco al campo.
- **Limpiar filtros** conserva el foco en el botón.
- Abrir una ficha mediante interacción directa enfoca su título.
- Cerrar la ficha devuelve el foco al marcador activo cuando corresponde.
- La carga inicial desde URL y `popstate` restauran el estado sin enfocar la ficha ni mover el foco del control actual.
- No existe una trampa de foco ni se conserva foco dentro de contenido oculto o sustituido.

El foco visible combina un contorno de 3 píxeles, separación y un halo de contraste sobre paneles, mapa y superficie de error. No depende solo del color. Los controles principales, marcadores y zoom ofrecen una referencia mínima de 44 × 44 píxeles.

La presentación respeta `prefers-reduced-motion` para transiciones no esenciales y conserva bordes y contornos en modo de colores forzados. Los estados coincidente, atenuado, activo y enfocado combinan borde, forma, escala, opacidad, anillos y texto accesible.

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

La lista de resultados explica únicamente las coincidencias de la consulta. El estado visual del mapa se deriva por separado de la intersección entre esa consulta y los filtros activos, sin duplicar el algoritmo de búsqueda. El estado vivo solo cambia cuando cambia el mensaje para evitar anuncios repetitivos.

## Filtros por categorías y etiquetas

Los controles se generan directamente desde `campaignCatalog` y conservan el orden estable de sus colecciones. No existen listas paralelas en la presentación.

La combinación es determinista:

- varias categorías seleccionadas se combinan con **OR**;
- varias etiquetas seleccionadas se combinan con **OR**;
- las dimensiones categoría, etiquetas y búsqueda se combinan con **AND**;
- una dimensión sin selecciones o una consulta vacía no restringe los resultados;
- sin consulta ni filtros, todos los lugares públicos coinciden.

Una etiqueta coincide cuando está asociada directamente al lugar o a cualquiera de sus notas públicas. Esta relación se deriva en memoria del catálogo, se deduplica y no modifica el contrato de datos.

La interfaz usa `fieldset`, `legend`, `label` y checkboxes HTML nativos. El nombre accesible procede del texto visible; la descripción y el recuento se asocian mediante `aria-describedby`. Tab recorre los filtros y la barra espaciadora cambia el checkbox enfocado. El botón **Limpiar filtros** desmarca categorías y etiquetas, recalcula las coincidencias y conserva el foco en el propio botón. Las categorías o etiquetas sin lugares asociados se muestran deshabilitadas y explican su estado.

Todos los marcadores permanecen visibles y operables. Los coincidentes se resaltan; los no coincidentes se atenúan mediante varias propiedades visuales; el lugar activo conserva la máxima prioridad aunque no coincida; y el estado accesible informa del recuento o de una combinación sin resultados.

## Enlaces directos y restauración de estado

La URL comparte estas cuatro dimensiones públicas:

- el lugar activo y su ficha;
- la consulta de búsqueda;
- las categorías seleccionadas;
- las etiquetas seleccionadas.

La aplicación usa parámetros de consulta para ser compatible con GitHub Pages y otros despliegues estáticos. No requiere rutas internas ni reescrituras del servidor.

### Formato

| Parámetro | Valor estable | Ejemplo |
|---|---|---|
| `place` | slug del lugar | `place=puerto-de-demostracion` |
| `q` | consulta codificada | `q=puerto+costero` |
| `category` | slug de categoría, repetible | `category=asentamientos` |
| `tag` | ID de etiqueta, repetible | `tag=coastal` |

Ejemplos relativos:

```text
?place=puerto-de-demostracion
?q=paso
?category=asentamientos&tag=coastal
?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass
```

Los nombres visibles no actúan como identificadores. Los lugares y categorías usan sus slugs estables; las etiquetas usan sus IDs estables definidos por el contrato de datos.

### Representación canónica

Para un mismo estado existe una única representación:

1. `place`;
2. `q`;
3. categorías en el orden de `campaignCatalog.categories`;
4. etiquetas en el orden de `campaignCatalog.tags`.

Los valores vacíos se omiten, los repetidos se deduplican y espacios, acentos y signos se codifican mediante `URLSearchParams`. Una URL válida pero desordenada se reemplaza por su forma canónica sin añadir una entrada de historial.

Los parámetros desconocidos, categorías o etiquetas inexistentes, lugares inválidos, valores vacíos y fragmentos se eliminan durante la canonicalización. Cada dimensión se procesa de forma independiente: un valor inválido no impide restaurar los demás valores válidos. Una combinación válida sin coincidencias se conserva y muestra el estado accesible normal.

### Recargar, compartir y abrir

Después de seleccionar un marcador, escribir una consulta o activar filtros, copia la URL de la barra de direcciones. Abrirla en otra pestaña, otro navegador compatible o después de recargar restaura el mismo estado público.

No se añade una dependencia del Web Share API ni una API externa. La URL canónica de la página es el mecanismo universal de copia y compartición.

### Atrás y adelante

La política de historial distingue acciones continuas y discretas:

- escribir o limpiar la consulta usa `replaceState`, de modo que una pulsación no crea una entrada nueva;
- seleccionar o cerrar un lugar, cambiar filtros o limpiar filtros usa `pushState`;
- atrás y adelante restauran consulta, checkboxes, coincidencias, marcador activo y ficha sin recargar la página;
- `popstate` no escribe una entrada nueva ni provoca un bucle de restauración.

La carga inicial y la navegación de historial no mueven el foco de forma inesperada. Abrir una ficha mediante una interacción directa sigue enfocando su título; cerrarla mediante el botón sigue devolviendo el foco al marcador.

### Fuentes únicas

La URL no es un cuarto almacén mutable:

- `src/app/placeSearch.ts` conserva la consulta;
- `src/app/placeFilters.ts` conserva categorías y etiquetas seleccionadas;
- `src/app/placeSelection.ts` conserva el único lugar activo;
- `src/app/urlState.ts` solo normaliza, serializa, parsea y compara representaciones;
- `src/main.ts` restaura los controladores existentes y vuelve a derivar resultados mediante la lógica ya establecida.

No se usa `localStorage`, `sessionStorage`, IndexedDB, cookies ni un router completo.

## Navegación, marcadores y fichas

- Arrastra con ratón, trackpad o gesto táctil para desplazarte.
- Usa rueda, pellizco, doble pulsación o controles visibles para cambiar el zoom.
- Recorre los marcadores con Tab.
- Activa el marcador enfocado con Enter o la barra espaciadora.
- Cada marcador anuncia el nombre del lugar y su categoría, expone la selección mediante `aria-pressed` y describe si coincide con la búsqueda y los filtros actuales.
- La categoría se diferencia mediante símbolo, forma, clase visual y texto accesible, no solo mediante color.
- Al seleccionar un lugar directamente, el foco pasa al título de su ficha.
- La ficha muestra nombre, alias públicos, categoría, etiquetas y todas las notas públicas asociadas.
- El botón de cierre devuelve el foco al marcador activo.
- En escritorio la ficha se muestra lateralmente; en pantallas estrechas pasa debajo del mapa.
- Los controles de zoom reciben nombres accesibles inequívocos y permanecen dentro del viewport.

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
| `npm run test:e2e` | Ejecuta la matriz end-to-end con Playwright. |
| `npm run test:e2e:ui` | Abre la interfaz de Playwright. |
| `npm run test:all` | Ejecuta pruebas unitarias y end-to-end. |

### Proyectos de Playwright

```bash
# Suite completa en Chromium
npx playwright test --project=chromium

# Suite crítica en Firefox
npx playwright test --project=firefox

# Suite crítica con WebKit y perfil móvil emulado
npx playwright test --project=mobile-webkit

# Suite crítica en todos los proyectos aplicables
npx playwright test tests/e2e/responsive-accessibility.spec.ts
```

`chromium` es el navegador principal de CI y ejecuta toda la suite. `firefox` y `mobile-webkit` ejecutan la suite crítica responsive y accesible para evitar duplicación innecesaria.

La configuración `mobile-webkit` emula el perfil de un iPhone 13: motor WebKit, viewport, user agent, capacidades táctiles y escala configurados por Playwright. No equivale a una prueba manual en un iPhone físico ni garantiza Safari, VoiceOver, teclado virtual o integración del sistema operativo. Tampoco se afirma haber probado dispositivos físicos.

## Pruebas y recurso externo

Las pruebas unitarias verifican dimensiones, límites, cálculos cartográficos, validación del catálogo, conversión de coordenadas, modelos de ficha, selección, búsqueda, filtrado y contrato de URL. La suite de URL cubre estado vacío, cada dimensión aislada, estado completo, codificación, varias categorías y etiquetas, orden de catálogo, deduplicación, valores inválidos, mezcla válida e inválida, parámetros vacíos y desconocidos, canonicalización, ida y vuelta e inmutabilidad.

Las pruebas e2e interceptan exclusivamente la URL oficial y responden con un SVG neutro generado en memoria. Cubren marcadores, fichas, búsqueda, filtros, URLs estables, restauración, recarga, nueva página, historial, inválidos, teclado, foco, responsive, combinación sin coincidencias y error del recurso remoto.

La suite crítica añadida en MAP-010 comprueba 320 píxeles, ausencia de overflow, cajas dentro del viewport, landmarks y nombres, fieldsets y legends, objetivos táctiles, foco visible, navegación de resultados, limpieza, activación de marcadores coincidentes y atenuados, restauración de foco, URL móvil completa, atrás y adelante y móvil horizontal con error remoto.

Las comprobaciones visuales usan geometría, visibilidad, atributos, nombres accesibles, foco y estilos computados. No dependen de coordenadas absolutas frágiles ni de snapshots visuales masivos.

La CI no descarga, almacena, archiva ni publica el mapa oficial. Tampoco genera recortes, recompressiones, conversiones, mosaicos o derivados.

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests dirigidas a `master`. Instala las dependencias desde cero y valida formato, lint, pruebas unitarias y build, instala Chromium, Firefox y WebKit y ejecuta la matriz Playwright. Chromium conserva la cobertura exhaustiva; los demás motores ejecutan el flujo crítico.

## Estructura

```text
src/
├── app/
│   ├── placeDetails.ts       # Vista DOM accesible de la ficha y política de foco
│   ├── placeFilters.ts       # Fuente única y presentación accesible de filtros
│   ├── placeSearch.ts        # Fuente única y presentación accesible de búsqueda
│   ├── placeSelection.ts     # Fuente única de selección
│   ├── renderApp.ts          # Estructura semántica
│   └── urlState.ts           # Contrato puro de URL y canonicalización
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
│   ├── accessibility.css     # Garantías responsive, foco y objetivos táctiles
│   ├── filters.css           # Filtros responsive y estados de coincidencia
│   ├── main.css              # Diseño general, marcadores y ficha
│   └── search.css            # Búsqueda responsive y resultados acotados
└── main.ts                   # Orquestación, restauración e historial
tests/
└── e2e/
    ├── app.spec.ts                         # Flujos base de mapa, búsqueda, marcadores y ficha
    ├── filters.spec.ts                     # Filtros, combinación y estados
    ├── responsive-accessibility.spec.ts    # Responsive, teclado y accesibilidad multibrowser
    └── url-state.spec.ts                   # Enlaces directos, historial, inválidos y error remoto
```

## Privacidad y licencias

El contenido publicado debe ser apto para jugadores. No deben incorporarse secretos narrativos ni recursos sin licencia.

La Beta 0.1 usa directamente `Sword-Coast-Map_LowRes.jpg` desde `media.wizards.com` mediante `L.imageOverlay` y `L.CRS.Simple`. El JPEG no forma parte del repositorio, build, despliegue, releases ni artefactos de CI. La fuente y las restricciones están documentadas en [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md) y en [ADR 0001](docs/decisions/0001-use-remote-low-resolution-map-image.md).
