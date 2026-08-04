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
- Mantener una única fuente de verdad para el lugar seleccionado.
- Mantener una única fuente de verdad para la consulta de búsqueda y derivar los resultados.
- Tratar el contenido del catálogo como texto público, nunca como HTML confiable.
- Evitar que Leaflet sea fuente de verdad para búsqueda, filtros o selección.

## Estructura ejecutable

```text
src/
├── app/
│   ├── placeDetails.ts
│   ├── placeSearch.ts
│   ├── placeSelection.test.ts
│   ├── placeSelection.ts
│   └── renderApp.ts
├── data/
│   ├── catalog.ts
│   ├── coordinates.ts
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
│   ├── main.css
│   └── search.css
└── main.ts
tests/
└── e2e/
    └── app.spec.ts
docs/decisions/
```

## Capas de presentación y estado de aplicación

### Estructura semántica

`src/app/renderApp.ts` genera la estructura semántica de la aplicación, el formulario visual de búsqueda, el contenedor del mapa, las instrucciones de interacción, los estados accesibles, el espacio responsive para la ficha y el aviso legal. No conoce detalles de la API de Leaflet ni interpreta relaciones del catálogo.

La búsqueda se declara como una región `role="search"` con etiqueta visible, campo `type="search"`, botón de limpieza, estado vivo y lista de resultados. Los resultados son botones HTML reales dentro de una lista; no se usa un patrón combobox ARIA incompleto.

La ficha se declara como una región con nombre accesible y `aria-live="polite"`. Permanece oculta cuando no hay selección y contiene un botón de cierre de al menos 44 × 44 píxeles.

### Fuente única de consulta

`src/app/placeSearch.ts` mantiene únicamente la cadena de consulta actual. El valor del campo se copia al controlador mediante el evento `input`, y cada render vuelve a derivar los resultados llamando a la función pura de `src/data/search.ts`.

No existe una copia editable de resultados en el DOM, Leaflet o el catálogo. El DOM representa la derivación actual y se sustituye de forma completa cuando cambia la consulta. La consulta vacía produce una lista vacía, un mensaje instructivo y ningún efecto sobre marcadores, mapa o selección.

El controlador de búsqueda:

- actualiza el estado accesible con el número de coincidencias o la ausencia de resultados;
- crea nombres, alias y títulos mediante APIs DOM y `textContent`;
- ofrece un botón por resultado, por lo que Enter y barra espaciadora funcionan de forma nativa;
- mueve el foco del campo al primer resultado con Flecha abajo;
- permite recorrer la lista con Flecha arriba, Flecha abajo, Inicio y Fin;
- devuelve el foco al campo con Escape;
- al limpiar, vacía consulta y campo, vuelve a derivar resultados y enfoca el campo;
- emite solo el `placeId` seleccionado y no mantiene selección propia.

### Fuente única de selección

`src/app/placeSelection.ts` mantiene el único `activePlaceId` de la aplicación. Expone operaciones puras para seleccionar, cerrar y suscribirse a cambios. Leaflet, la búsqueda y la ficha no mantienen selecciones independientes:

1. un marcador o resultado de búsqueda emite su `placeId`;
2. `main.ts` solicita a Leaflet localizar el marcador cuando el origen es la búsqueda;
3. el controlador de selección publica el nuevo valor;
4. `main.ts` actualiza el estado visual y accesible del marcador;
5. `main.ts` construye y muestra la ficha correspondiente;
6. cerrar limpia el mismo estado y devuelve el foco al marcador activo.

Seleccionar el mismo lugar no crea una segunda selección. Desde búsqueda, `main.ts` vuelve a mostrar la misma ficha únicamente para mantener un comportamiento de foco predecible cuando el lugar ya estaba activo.

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

Al abrir, el foco se mueve al título de la ficha para anunciar y localizar el contenido. No se aplica una trampa de foco. Al cerrar, el foco vuelve mediante el adaptador del mapa al marcador correspondiente, tanto si la selección se originó en un marcador como en un resultado de búsqueda.

## Capa de datos de campaña

`src/data/` define un contrato público independiente de la presentación y de Leaflet:

- `model.ts` contiene las entidades `CampaignCategory`, `CampaignTag`, `CampaignPlace`, `PublicNote` y `CampaignCatalog`;
- `catalog.ts` contiene únicamente datos públicos y usa `satisfies CampaignCatalog` para conservar inferencia literal y comprobación TypeScript;
- `coordinates.ts` convierte la convención estable `{ x, y }` al orden `[y, x]` requerido por Leaflet;
- `placeDetails.ts` resuelve categoría, etiquetas y notas y construye modelos de marcador y ficha sin duplicar relaciones;
- `search.ts` normaliza consultas, evalúa fuentes públicas y construye resultados derivados;
- `validate.ts` comprueba estructura, formatos, unicidad, referencias, límites y ambigüedad de alias sin dependencias externas;
- las pruebas unitarias validan el catálogo real, los principales casos inválidos y la lógica extraída.

El catálogo está normalizado: los lugares referencian una categoría y etiquetas; las notas referencian su lugar y etiquetas. No se almacenan listas inversas de lugares o notas en categorías, etiquetas o lugares. Las notas de una ficha y los títulos indexables se obtienen filtrando por `placeId`.

Toda propiedad presente en esta capa forma parte del frontend público. No existe un flag que convierta datos incluidos en privados. La política y el contrato completo están documentados en `docs/data-model.md`.

## Normalización y búsqueda pública

### Contrato de normalización

La búsqueda reutiliza `normalizeSearchTerm` de `src/data/validate.ts`, el mismo contrato utilizado para detectar alias ambiguos durante la validación del catálogo:

1. normalización Unicode NFKD;
2. eliminación de marcas diacríticas;
3. conversión a minúsculas con locale español;
4. sustitución consistente de signos y separadores por espacios;
5. eliminación de espacios exteriores;
6. colapso de secuencias de espacios.

`normalizePlaceSearchQuery` expone ese comportamiento con un nombre propio del dominio de búsqueda sin duplicar la implementación. De esta forma, lo que el validador considera equivalente también se comporta como equivalente en la interfaz.

### Fuentes indexadas

`searchPublicPlaces` consume directamente `CampaignCatalog` y solo considera:

- `place.name`;
- todos los valores de `place.aliases`;
- `note.title` de notas cuyo `placeId` corresponde al lugar.

No utiliza `note.body`, categorías, etiquetas, slugs, IDs ni datos externos. No persiste un índice manual ni añade relaciones paralelas al catálogo.

### Resultado representativo por lugar

Cada lugar produce como máximo un `PlaceSearchResult`. Cuando varias fuentes del mismo lugar coinciden, se conserva una única coincidencia representativa mediante estas reglas estables:

1. mejor clase de coincidencia;
2. nombre principal antes que alias y alias antes que título de nota para empates dentro del mismo lugar;
3. orden original de alias o notas para resolver el empate restante.

El resultado conserva siempre `placeId` y `placeName`. También indica `matchKind` y `matchedText` para que la interfaz pueda explicar de forma comprensible si la coincidencia procede del nombre, de un alias o del título de una nota sin crear una entidad nueva en el catálogo.

### Orden global

Los lugares coincidentes se ordenan de forma determinista:

1. texto normalizado exactamente igual a la consulta;
2. texto normalizado que comienza por la consulta;
3. texto normalizado que contiene la consulta;
4. orden estable de `catalog.places` para resolver empates.

No existe búsqueda difusa, corrección ortográfica, tokenización avanzada ni servicio externo.

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
- enfocar un marcador por `placeId` cuando la aplicación lo solicita;
- localizar un marcador mediante `locatePlace`, respetando `minZoom`, `maxZoom` y los límites configurados.

`locatePlace` es la única ampliación necesaria para MAP-007. Recibe un `placeId`, obtiene el marcador ya existente, centra la vista y aplica como máximo un nivel de detalle por encima del zoom mínimo, limitado siempre por `FAERUN_MAP_CONFIG.maxZoom`. No conoce la consulta, los resultados ni el controlador de selección.

Los marcadores usan `L.divIcon` con HTML estático propio, sin iconos PNG ni rutas de assets. Cada categoría recibe una combinación de símbolo, forma, clase y nombre accesible; la diferencia no depende únicamente del color. Los elementos interactivos exponen `role="button"`, nombre con lugar y categoría, `aria-pressed`, soporte de Enter y barra espaciadora y un objetivo de 44 × 44 píxeles.

Leaflet no decide qué lugar está seleccionado. Solo emite activaciones, refleja el valor que recibe del controlador de selección y ejecuta operaciones cartográficas explícitas.

## Ciclo de carga y error

La presentación comienza con `aria-busy="true"` y un estado visible con `role="status"`. El evento `load` del overlay oculta el mensaje y marca el mapa como preparado. El evento `error` retira la capa remota, activa un mensaje con `role="alert"` y deja visible un fondo CSS neutro.

Los marcadores y la búsqueda se crean desde el catálogo independientemente del estado de la imagen. Un error del recurso remoto no elimina ni reconstruye su modelo, y las fichas siguen disponibles sobre la superficie neutra. No existe URL de respaldo a una copia del mapa ni precarga automática.

## Responsive y límites

El mapa tiene una altura fluida para escritorio, tablet y móvil. Al cambiar su tamaño se invalida el tamaño interno de Leaflet, se recalcula el zoom mínimo y se conserva el encuadre o el nivel de detalle según corresponda.

La búsqueda ocupa una franja propia encima del mapa para no reducir su columna útil. En escritorio, etiqueta e instrucciones comparten espacio con el campo y el botón. En pantallas estrechas, controles y textos se apilan, el botón de limpieza ocupa el ancho disponible y la lista mantiene un scroll vertical acotado.

Los campos, botones y resultados tienen objetivos mínimos de 44 píxeles. Nombres, alias y títulos largos usan `overflow-wrap` y no fuerzan el ancho del viewport. La lista limita su altura para que el teclado virtual y una consulta con muchos resultados no expulsen indefinidamente el mapa ni los controles de zoom.

En escritorio, la selección abre una columna lateral con ancho acotado y scroll propio, mientras el mapa conserva una columna flexible. Por debajo de 70 rem, la ficha pasa debajo del mapa, evita salir del viewport y mantiene disponibles los controles de zoom. Los textos usan ajuste y ruptura segura; varias notas hacen crecer o desplazar la ficha sin romper el mapa.

## Construcción y calidad

- `npm run build` ejecuta la comprobación estricta de TypeScript antes de Vite.
- `npm run lint` ejecuta ESLint con configuración plana.
- `npm run format:check` comprueba Prettier sin modificar archivos.
- `npm run test` ejecuta Vitest, incluida la validación del catálogo y la lógica de marcadores, fichas, selección y búsqueda.
- `npm run validate:data` ejecuta de forma aislada la suite del modelo de datos.
- `npm run test:e2e` ejecuta Playwright sobre el servidor de desarrollo.
- `.github/workflows/ci.yml` reproduce estas validaciones en pull requests a `master`.

## Estrategia de pruebas del mapa remoto

Las pruebas e2e registran una ruta de Playwright para la URL oficial y entregan un SVG neutro generado dentro de la prueba. De este modo se valida que la aplicación solicita la URL acordada y reacciona a carga o error, pero CI no descarga ni archiva el JPEG oficial.

Vitest cubre:

- normalización de mayúsculas, acentos, signos y espacios;
- coincidencias por nombre, alias y título de nota;
- ausencia de coincidencia por cuerpo de nota;
- orden exacto, prefijo, parcial y orden de catálogo;
- consulta vacía;
- un único resultado coherente por lugar;
- asociación correcta con `placeId`.

Playwright comprueba:

- etiqueta visible y nombre accesible del campo;
- búsquedas sin acentos y con diferencias de mayúsculas;
- resultados por alias y título de nota;
- explicación de la fuente coincidente;
- selección, centrado, ficha correcta y marcador activo;
- estado sin resultados y limpieza con foco predecible;
- operación mediante teclado;
- layout móvil con resultados acotados;
- conservación de búsqueda, marcadores y fichas cuando falla la imagen;
- interceptación del mapa oficial mediante el SVG neutro y ausencia de una copia alternativa.

## Límite del mapa base

La Beta 0.1 usa la imagen oficial remota de baja resolución conforme a ADR 0001. No se descarga ni incorpora al repositorio, build, despliegue, releases, cachés precargadas o artefactos de CI. Tampoco se transforma, recorta, recomprime, convierte o divide en mosaicos.
