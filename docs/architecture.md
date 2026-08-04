# Arquitectura inicial

## Stack

- Vite + TypeScript.
- Leaflet con `CRS.Simple`, `L.imageOverlay` y marcadores `L.divIcon`.
- CSS propio.
- Datos estáticos TypeScript validados mediante tipos, funciones propias y Vitest.
- Vitest para lógica.
- Playwright para flujos críticos.
- ESLint y Prettier para calidad estática y formato.
- GitHub Actions para CI.
- GitHub Pages para despliegue posterior.

## Principios

- Mantener la beta sin backend.
- Separar motor del mapa, presentación y datos de campaña.
- No incluir secretos en el bundle público.
- No almacenar ni transformar el mapa oficial sin autorización escrita.
- Usar IDs y slugs estables y URLs reproducibles.
- Priorizar rendimiento móvil y accesibilidad.
- Mantener cada capacidad verificable mediante pruebas automáticas.
- Tratar la red y el recurso cartográfico externo como dependencias falibles.
- Mantener las relaciones de datos normalizadas y validables, sin referencias bidireccionales redundantes.
- Mantener una única fuente de verdad para el lugar seleccionado.
- Tratar el contenido del catálogo como texto público, nunca como HTML confiable.

## Estructura ejecutable

```text
src/
├── app/
│   ├── placeDetails.ts
│   ├── placeSelection.test.ts
│   ├── placeSelection.ts
│   └── renderApp.ts
├── data/
│   ├── catalog.ts
│   ├── coordinates.ts
│   ├── model.ts
│   ├── placeDetails.test.ts
│   ├── placeDetails.ts
│   ├── validate.test.ts
│   └── validate.ts
├── map/
│   ├── config.ts
│   ├── config.test.ts
│   └── leaflet.ts
├── styles/
│   └── main.css
└── main.ts
tests/
└── e2e/
    └── app.spec.ts
docs/decisions/
```

## Capas de presentación y selección

### Estructura semántica

`src/app/renderApp.ts` genera la estructura semántica de la aplicación, el contenedor del mapa, las instrucciones de interacción, los estados accesibles, el espacio responsive para la ficha y el aviso legal. No conoce detalles de la API de Leaflet ni interpreta el catálogo.

La ficha se declara como una región con nombre accesible y `aria-live="polite"`. Permanece oculta cuando no hay selección y contiene un botón de cierre de al menos 44 × 44 píxeles.

### Fuente única de selección

`src/app/placeSelection.ts` mantiene el único `activePlaceId` de la aplicación. Expone operaciones puras para seleccionar, cerrar y suscribirse a cambios. Leaflet y la ficha no mantienen selecciones independientes:

1. un marcador emite su `placeId`;
2. el controlador de selección publica el nuevo valor;
3. `main.ts` actualiza el estado visual y accesible del marcador;
4. `main.ts` construye y muestra la ficha correspondiente;
5. cerrar limpia el mismo estado y devuelve el foco al marcador que abrió la ficha.

Seleccionar el mismo lugar no produce transiciones redundantes y solo puede existir un lugar activo.

### Ficha de lugar

`src/app/placeDetails.ts` monta la vista de la ficha y crea todos los nodos de contenido mediante APIs DOM y `textContent`. No usa `innerHTML` con nombres, alias, etiquetas, descripciones o notas del catálogo.

La ficha muestra:

- nombre principal;
- alias públicos cuando existen;
- categoría y descripción pública;
- etiquetas del lugar;
- todas las notas públicas obtenidas por `placeId`;
- título y cuerpo de cada nota;
- control de cierre accesible.

Al abrir, el foco se mueve al título de la ficha para anunciar y localizar el contenido. No se aplica una trampa de foco. Al cerrar, el foco vuelve mediante el adaptador del mapa al marcador correspondiente.

## Capa de datos de campaña

`src/data/` define un contrato público independiente de la presentación y de Leaflet:

- `model.ts` contiene las entidades `CampaignCategory`, `CampaignTag`, `CampaignPlace`, `PublicNote` y `CampaignCatalog`;
- `catalog.ts` contiene únicamente datos públicos y usa `satisfies CampaignCatalog` para conservar inferencia literal y comprobación TypeScript;
- `coordinates.ts` convierte la convención estable `{ x, y }` al orden `[y, x]` requerido por Leaflet;
- `placeDetails.ts` resuelve categoría, etiquetas y notas y construye modelos de marcador y ficha sin duplicar relaciones;
- `validate.ts` comprueba estructura, formatos, unicidad, referencias, límites y ambigüedad de alias sin dependencias externas;
- las pruebas unitarias validan el catálogo real, los principales casos inválidos y la lógica de presentación extraída.

El catálogo está normalizado: los lugares referencian una categoría y etiquetas; las notas referencian su lugar y etiquetas. No se almacenan listas inversas de lugares o notas en categorías, etiquetas o lugares. Las notas de una ficha se obtienen filtrando por `placeId`.

Toda propiedad presente en esta capa forma parte del frontend público. No existe un flag que convierta datos incluidos en privados. La política y el contrato completo están documentados en `docs/data-model.md`.

## Configuración cartográfica

`src/map/config.ts` concentra la URL oficial, las dimensiones `3600 × 2329`, los niveles de zoom y los cálculos puros. Los límites para `CRS.Simple` son `[[0, 0], [2329, 3600]]`: la primera coordenada representa altura y la segunda anchura.

La función de cálculo de encuadre utiliza la escala mínima entre viewport e imagen y su logaritmo en base dos. Esta lógica se prueba sin DOM, red ni Leaflet.

Las coordenadas del catálogo usan el espacio de píxeles de la imagen: origen superior izquierdo, `x` hacia la derecha e `y` hacia abajo. `src/data/placeDetails.ts` llama siempre a `toLeafletSimpleCoordinate`; ningún consumidor intercambia ejes manualmente.

## Adaptador Leaflet

`src/map/leaflet.ts` es el único módulo que crea y gestiona `L.Map`. Sus responsabilidades son:

- configurar `L.CRS.Simple`;
- cargar el JPEG exclusivamente mediante `L.imageOverlay` desde la URL oficial;
- mostrar el mapa completo al iniciar;
- limitar desplazamiento y zoom;
- habilitar ratón, trackpad, teclado y gestos táctiles;
- observar cambios de tamaño y ejecutar `invalidateSize`;
- gestionar estados `loading`, `ready` y `error`;
- retirar únicamente el overlay fallido y conservar la superficie neutra;
- crear un marcador por cada `PlaceMarkerModel`;
- reflejar el lugar activo mediante clase visual y `aria-pressed`;
- enfocar un marcador por `placeId` cuando la aplicación lo solicita.

Los marcadores usan `L.divIcon` con HTML estático propio, sin iconos PNG ni rutas de assets. Cada categoría recibe una combinación de símbolo, forma, clase y nombre accesible; la diferencia no depende únicamente del color. Los elementos interactivos exponen `role="button"`, nombre con lugar y categoría, `aria-pressed`, soporte de Enter y barra espaciadora y un objetivo de 44 × 44 píxeles.

Leaflet no decide qué lugar está seleccionado. Solo emite activaciones y refleja el valor que recibe del controlador de selección.

## Ciclo de carga y error

La presentación comienza con `aria-busy="true"` y un estado visible con `role="status"`. El evento `load` del overlay oculta el mensaje y marca el mapa como preparado. El evento `error` retira la capa remota, activa un mensaje con `role="alert"` y deja visible un fondo CSS neutro.

Los marcadores se crean desde el catálogo independientemente del estado de la imagen. Un error del recurso remoto no elimina ni reconstruye su modelo, y las fichas siguen disponibles sobre la superficie neutra. No existe URL de respaldo a una copia del mapa ni precarga automática.

## Responsive y límites

El mapa tiene una altura fluida para escritorio, tablet y móvil. Al cambiar su tamaño se invalida el tamaño interno de Leaflet, se recalcula el zoom mínimo y se conserva el encuadre o el nivel de detalle según corresponda.

En escritorio, la selección abre una columna lateral con ancho acotado y scroll propio, mientras el mapa conserva una columna flexible. Por debajo de 70 rem, la ficha pasa debajo del mapa, evita salir del viewport y mantiene disponibles los controles de zoom. Los textos usan ajuste y ruptura segura; varias notas hacen crecer o desplazar la ficha sin romper el mapa.

## Construcción y calidad

- `npm run build` ejecuta la comprobación estricta de TypeScript antes de Vite.
- `npm run lint` ejecuta ESLint con configuración plana.
- `npm run format:check` comprueba Prettier sin modificar archivos.
- `npm run test` ejecuta Vitest, incluida la validación del catálogo y la lógica de marcadores, fichas y selección.
- `npm run validate:data` ejecuta de forma aislada la suite del modelo de datos.
- `npm run test:e2e` ejecuta Playwright sobre el servidor de desarrollo.
- `.github/workflows/ci.yml` reproduce estas validaciones en pull requests a `master`.

## Estrategia de pruebas del mapa remoto

Las pruebas e2e registran una ruta de Playwright para la URL oficial y entregan un SVG neutro generado dentro de la prueba. De este modo se valida que la aplicación solicita la URL acordada y reacciona a carga o error, pero CI no descarga ni archiva el JPEG oficial.

Playwright comprueba el número de marcadores, sus coordenadas convertidas y límites, contenido completo de la ficha, selección visual y accesible, apertura y cierre por ratón y teclado, devolución de foco, layout móvil y conservación de marcadores y fichas cuando falla la imagen.

## Límite del mapa base

La Beta 0.1 usa la imagen oficial remota de baja resolución conforme a ADR 0001. No se descarga ni incorpora al repositorio, build, despliegue, releases, cachés precargadas o artefactos de CI. Tampoco se transforma, recorta, recomprime, convierte o divide en mosaicos.
