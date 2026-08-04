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
- Separar motor del mapa, presentación, estado de aplicación y datos de campaña.
- No incluir secretos en el bundle público.
- No almacenar ni transformar el mapa oficial sin autorización escrita.
- Usar IDs y slugs estables y URLs reproducibles.
- Priorizar rendimiento móvil y accesibilidad.
- Mantener cada capacidad verificable mediante pruebas automáticas.
- Tratar la red y el recurso cartográfico externo como dependencias falibles.
- Mantener las relaciones de datos normalizadas y validables, sin referencias bidireccionales redundantes.
- Mantener una única fuente de verdad para la consulta, los filtros y el lugar seleccionado.
- Derivar resultados y estados visuales del catálogo y de esas fuentes, sin copias paralelas en DOM o Leaflet.
- Tratar el contenido del catálogo como texto público, nunca como HTML confiable.
- Evitar que Leaflet sea fuente de verdad para búsqueda, filtros o selección.

## Estructura ejecutable

```text
src/
├── app/
│   ├── placeDetails.ts
│   ├── placeFilters.ts
│   ├── placeSearch.ts
│   ├── placeSelection.test.ts
│   ├── placeSelection.ts
│   └── renderApp.ts
├── data/
│   ├── catalog.ts
│   ├── coordinates.ts
│   ├── filters.test.ts
│   ├── filters.ts
│   ├── model.ts
│   ├── placeDetails.test.ts
│   ├── placeDetails.ts
│   ├── search.test.ts
│   ├── search.ts
│   ├── validate.test.ts
│   └── validate.ts
├── map/
│   ├── config.ts
│   ├── config.test.ts
│   └── leaflet.ts
├── styles/
│   ├── filters.css
│   ├── main.css
│   └── search.css
└── main.ts
tests/
└── e2e/
    ├── app.spec.ts
    └── filters.spec.ts
docs/decisions/
```

## Capas de presentación y estado de aplicación

### Estructura semántica

`src/app/renderApp.ts` genera la estructura semántica de la aplicación, la búsqueda, los grupos de filtros, el contenedor del mapa, las instrucciones de interacción, los estados accesibles, el espacio responsive para la ficha y el aviso legal. No conoce detalles de la API de Leaflet ni interpreta relaciones del catálogo.

La búsqueda se declara como una región `role="search"` con etiqueta visible, campo `type="search"`, botón de limpieza, estado vivo y lista de resultados. Los resultados son botones HTML reales dentro de una lista; no se usa un patrón combobox ARIA incompleto.

Los filtros se declaran como una sección con encabezado visible, dos `fieldset` con `legend` para categorías y etiquetas, checkboxes HTML nativos, botón de limpieza y un estado `aria-live="polite"` que comunica el número final de coincidencias. Los controles se insertan mediante APIs DOM y `textContent` desde las colecciones de `campaignCatalog`.

La ficha se declara como una región con nombre accesible y `aria-live="polite"`. Permanece oculta cuando no hay selección y contiene un botón de cierre de al menos 44 × 44 píxeles.

### Fuente única de consulta

`src/app/placeSearch.ts` mantiene únicamente la cadena de consulta actual. El valor del campo se copia al controlador mediante el evento `input`, y cada render vuelve a derivar los resultados llamando a la función pura de `src/data/search.ts`.

No existe una copia editable de resultados de búsqueda en el DOM, Leaflet o el catálogo. El DOM representa la derivación actual y se sustituye de forma completa cuando cambia la consulta. La consulta vacía produce una lista vacía y un mensaje instructivo; para la combinación con filtros equivale a considerar coincidentes todos los lugares.

El controlador de búsqueda:

- actualiza el estado accesible con el número de coincidencias de la consulta o la ausencia de resultados;
- crea nombres, alias y títulos mediante APIs DOM y `textContent`;
- ofrece un botón por resultado, por lo que Enter y barra espaciadora funcionan de forma nativa;
- mueve el foco del campo al primer resultado con Flecha abajo;
- permite recorrer la lista con Flecha arriba, Flecha abajo, Inicio y Fin;
- devuelve el foco al campo con Escape;
- al limpiar, vacía consulta y campo, vuelve a derivar resultados y enfoca el campo;
- emite solo el `placeId` seleccionado y no mantiene selección propia;
- notifica a `main.ts` cuando cambia la consulta para recalcular la intersección visual.

### Fuente única de filtros

`src/app/placeFilters.ts` mantiene dos conjuntos en memoria: categorías seleccionadas y etiquetas seleccionadas. Son la única fuente editable del estado de filtros. Los checkboxes representan ese estado, pero no se leen como un almacén paralelo para calcular resultados; cada cambio actualiza los conjuntos y solicita una nueva derivación.

`getState()` devuelve una instantánea inmutable ordenada según `catalog.categories` y `catalog.tags`. El estado no se guarda en el catálogo, Leaflet, atributos DOM, almacenamiento local ni URL. Persistencia y restauración pertenecen a MAP-009.

El controlador construye categorías y etiquetas directamente desde `campaignCatalog`. También deriva el número de lugares asociado a cada opción. Una opción sin lugares se mantiene visible, se deshabilita y muestra el texto “Sin lugares asociados”, de modo que su comportamiento es explícito sin eliminar información del catálogo.

El botón de limpieza vacía ambos conjuntos, desmarca los controles, recalcula coincidencias y conserva el foco en el propio botón. Cambiar filtros no mueve el foco al mapa ni cierra la ficha.

### Fuente única de selección

`src/app/placeSelection.ts` mantiene el único `activePlaceId` de la aplicación. Expone operaciones puras para seleccionar, cerrar y suscribirse a cambios. Leaflet, la búsqueda, los filtros y la ficha no mantienen selecciones independientes:

1. un marcador o resultado de búsqueda emite su `placeId`;
2. `main.ts` solicita a Leaflet localizar el marcador cuando el origen es la búsqueda;
3. el controlador de selección publica el nuevo valor;
4. `main.ts` actualiza el estado visual y accesible del marcador;
5. `main.ts` construye y muestra la ficha correspondiente;
6. cerrar limpia el mismo estado y devuelve el foco al marcador activo.

Seleccionar un marcador atenuado o un resultado de búsqueda que no satisface los filtros sigue utilizando esta misma ruta. El lugar activo no se sustituye ni se cierra cuando cambian los filtros. Si deja de coincidir, el estado general y el marcador lo comunican de forma accesible.

### Ficha de lugar

`src/app/placeDetails.ts` monta la vista de la ficha y crea todos los nodos de contenido mediante APIs DOM y `textContent`. No usa `innerHTML` con nombres, alias, etiquetas, descripciones o notas del catálogo.

La ficha muestra nombre principal, alias públicos, categoría, etiquetas directas del lugar, notas públicas y etiquetas de cada nota. Al abrir, el foco se mueve al título de la ficha. No se aplica una trampa de foco. Al cerrar, el foco vuelve mediante el adaptador del mapa al marcador correspondiente.

## Capa de datos de campaña

`src/data/` define un contrato público independiente de la presentación y de Leaflet:

- `model.ts` contiene las entidades `CampaignCategory`, `CampaignTag`, `CampaignPlace`, `PublicNote` y `CampaignCatalog`;
- `catalog.ts` contiene únicamente datos públicos y usa `satisfies CampaignCatalog`;
- `coordinates.ts` convierte la convención estable `{ x, y }` al orden `[y, x]` requerido por Leaflet;
- `placeDetails.ts` resuelve categoría, etiquetas y notas y construye modelos derivados;
- `search.ts` normaliza consultas, evalúa fuentes públicas y construye resultados de búsqueda;
- `filters.ts` deriva etiquetas asociadas, coincidencias de filtros y la intersección final con búsqueda;
- `validate.ts` comprueba estructura, formatos, unicidad, referencias, límites y ambigüedad de alias;
- las pruebas unitarias validan el catálogo real, los principales casos inválidos y la lógica extraída.

El catálogo está normalizado: los lugares referencian una categoría y etiquetas; las notas referencian su lugar y etiquetas. No se almacenan listas inversas ni estado de interfaz. Toda propiedad presente en esta capa forma parte del frontend público.

## Normalización y búsqueda pública

### Contrato de normalización

La búsqueda reutiliza `normalizeSearchTerm` de `src/data/validate.ts`: normalización Unicode NFKD, eliminación de diacríticos, minúsculas con locale español, sustitución de signos por espacios, recorte y colapso de espacios.

`normalizePlaceSearchQuery` expone ese comportamiento con un nombre propio del dominio de búsqueda sin duplicar la implementación.

### Fuentes indexadas

`searchPublicPlaces` consume directamente `CampaignCatalog` y solo considera `place.name`, `place.aliases` y `note.title` de las notas asociadas. No utiliza el cuerpo de las notas, categorías, etiquetas, slugs, IDs ni datos externos.

Cada lugar produce como máximo un resultado representativo. Los resultados se ordenan por coincidencia exacta, prefijo, parcial y orden estable de `catalog.places`.

No existe búsqueda difusa, corrección ortográfica, tokenización avanzada ni servicio externo.

## Filtrado público y combinación

### Etiquetas asociadas a un lugar

`getPublicPlaceFilterTagIds` parte de `place.tagIds` e incorpora los `tagIds` de todas las notas públicas cuyo `placeId` corresponde al lugar. La inclusión de etiquetas de notas es deliberada: permite que una relación pública descrita en una nota participe en el filtro sin añadir una relación redundante al lugar.

La función deduplica mediante un conjunto temporal y devuelve los IDs en el orden estable de `catalog.tags`. No muta el catálogo ni persiste un índice inverso.

### Semántica de coincidencia

`publicPlaceMatchesFilters` aplica una semántica inequívoca:

- una o varias categorías seleccionadas se combinan mediante OR;
- una o varias etiquetas seleccionadas se combinan mediante OR;
- categoría y etiquetas se combinan mediante AND;
- una dimensión sin selecciones no restringe el resultado.

`filterPublicPlaces` recorre `catalog.places`, conserva su orden y devuelve únicamente `placeId`, sin duplicados.

### Combinación con búsqueda

`searchPublicPlaceIds` adapta la búsqueda existente sin duplicarla. Una consulta normalizada vacía representa todos los `placeId`; una consulta activa transforma los resultados de `searchPublicPlaces` en sus IDs.

`deriveMatchingPublicPlaceIds` calcula la intersección entre IDs coincidentes por búsqueda e IDs coincidentes por filtros y vuelve a recorrer `catalog.places` para conservar orden, identidad y ausencia de duplicados. Por tanto:

- consulta vacía y filtros vacíos: todos los lugares;
- consulta activa y filtros vacíos: coincidencias de búsqueda;
- consulta vacía y filtros activos: coincidencias de filtros;
- ambas dimensiones activas: solo los lugares que satisfacen todas.

`main.ts` es el punto de orquestación. Lee la consulta del controlador de búsqueda, la instantánea del controlador de filtros y el lugar activo del controlador de selección. En cada cambio deriva de nuevo el conjunto final, actualiza el resumen accesible y envía a Leaflet únicamente un `ReadonlySet<PlaceId>`.

La lista de resultados de búsqueda no se recorta por filtros. Así, seleccionar un resultado sigue centrando y abriendo el lugar aunque su marcador esté atenuado; el estado visual del mapa explica la intersección sin cambiar la semántica de búsqueda.

## Configuración cartográfica

`src/map/config.ts` concentra la URL oficial, las dimensiones `3600 × 2329`, los niveles de zoom y los cálculos puros. Los límites para `CRS.Simple` son `[[0, 0], [2329, 3600]]`.

Las coordenadas del catálogo usan el espacio de píxeles de la imagen. `src/data/placeDetails.ts` llama siempre a `toLeafletSimpleCoordinate`; ningún consumidor intercambia ejes manualmente.

## Adaptador Leaflet

`src/map/leaflet.ts` es el único módulo que crea y gestiona `L.Map`. Configura `L.CRS.Simple`, carga exclusivamente la URL oficial mediante `L.imageOverlay`, limita navegación y zoom, gestiona carga/error, crea marcadores, refleja selección y coincidencia, enfoca y localiza marcadores y responde a cambios de tamaño.

`locatePlace(placeId)` sigue siendo la operación cartográfica mínima para centrar un marcador existente. MAP-008 añade únicamente `setMatchingPlaces(placeIds)`: recibe el conjunto derivado por la capa de aplicación y actualiza los marcadores existentes sin reconstruirlos.

Leaflet no conoce consulta, categorías seleccionadas, etiquetas seleccionadas ni lógica de combinación. Para cada marcador calcula solo si su ID pertenece al conjunto recibido y refleja:

- clase `campaign-marker-icon--matching` o `campaign-marker-icon--dimmed`;
- atributo `data-filter-match` para pruebas y diagnóstico;
- descripción accesible de coincidencia o no coincidencia;
- prioridad visual de 200 para coincidencias y 0 para no coincidencias;
- prioridad 1000 para el marcador activo, coincida o no.

Los marcadores no coincidentes permanecen en el mapa, conservan sus listeners de clic y teclado y pueden seleccionarse. La diferencia visual combina opacidad, escala, contraste, borde discontinuo y contorno, no solo color. El marcador activo recupera opacidad y contraste y conserva un anillo destacado; si no coincide, mantiene el borde discontinuo y una descripción explícita.

Los marcadores usan `L.divIcon` con HTML estático propio, sin iconos PNG. Cada categoría recibe símbolo, forma, clase y nombre accesible. Los elementos interactivos exponen `role="button"`, `aria-pressed`, soporte de Enter y barra espaciadora y un objetivo de 44 × 44 píxeles.

Leaflet no decide qué lugar está seleccionado ni qué lugares coinciden. Solo emite activaciones y refleja los valores recibidos.

## Ciclo de carga y error

La presentación comienza con `aria-busy="true"` y un estado visible. El evento `load` del overlay marca el mapa como preparado. El evento `error` retira la capa remota, activa un mensaje con `role="alert"` y deja visible un fondo CSS neutro.

Marcadores, búsqueda, filtros y fichas se crean desde el catálogo independientemente del estado de la imagen. Un error remoto no elimina ni reconstruye sus modelos. No existe URL de respaldo, copia alternativa ni precarga automática.

## Accesibilidad, foco y responsive

Los filtros usan controles HTML nativos. Sus nombres accesibles combinan nombre y descripción pública; el texto visible añade el número de lugares asociados. No se implementa un widget ARIA personalizado.

El estado final usa `aria-live="polite"` y `aria-atomic="true"`. Solo se actualiza cuando cambia consulta, filtros o selección, evitando anuncios por cada marcador. Informa del recuento, del estado sin coincidencias y, cuando procede, de que el lugar activo permanece abierto aunque no coincida.

Cambiar un checkbox conserva el foco en ese control. Limpiar filtros conserva el foco en el botón. La búsqueda mantiene sus reglas de flechas y Escape. Abrir y cerrar fichas conserva el comportamiento de foco ya establecido. No existe una trampa de foco.

Búsqueda y filtros ocupan franjas propias sobre el mapa para no reducir su anchura útil. Los grupos de filtros se presentan en dos columnas en escritorio y en una sola columna en móvil. Cada grupo tiene scroll vertical acotado, los textos usan ruptura segura y los objetivos táctiles miden al menos 44 píxeles. El mapa mantiene una altura útil y los controles de zoom permanecen disponibles.

En escritorio, la ficha ocupa una columna lateral acotada; en pantallas estrechas pasa debajo del mapa. El diseño mantiene filtros, resultados, mapa y ficha dentro del viewport, incluso sobre la superficie neutra de error.

## Construcción y calidad

- `npm run build` ejecuta TypeScript estricto antes de Vite.
- `npm run lint` ejecuta ESLint.
- `npm run format:check` comprueba Prettier.
- `npm run test` ejecuta Vitest, incluida la validación del catálogo y la lógica de búsqueda y filtros.
- `npm run validate:data` ejecuta la suite del modelo de datos.
- `npm run test:e2e` ejecuta Playwright.
- `.github/workflows/ci.yml` reproduce formato, lint, unitarias, build y e2e en PR a `master`.

Vitest cubre filtros vacíos, una y varias categorías, una y varias etiquetas, OR interno, AND entre dimensiones, consulta vacía, filtros vacíos, ausencia de coincidencias, orden estable, asociación de `placeId`, deduplicación, etiquetas de notas e inmutabilidad.

Playwright cubre nombres accesibles de grupos, generación desde catálogo, teclado, recuentos, combinación con búsqueda, resaltado y atenuación, selección de marcador atenuado, prioridad del activo, limpieza, foco, móvil, estado sin coincidencias y error remoto.

## Estrategia de pruebas del mapa remoto

Las pruebas e2e registran una ruta de Playwright para la URL oficial y entregan un SVG neutro generado dentro de la prueba. Se valida que la aplicación solicita la URL acordada y reacciona a carga o error, pero CI no descarga ni archiva el JPEG oficial.

## Límite del mapa base

La Beta 0.1 usa la imagen oficial remota de baja resolución conforme a ADR 0001. No se descarga ni incorpora al repositorio, build, despliegue, releases, cachés precargadas o artefactos de CI. Tampoco se transforma, recorta, recomprime, convierte o divide en mosaicos.
