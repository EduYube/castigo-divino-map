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
- Derivar resultados, estados visuales y URL desde esas fuentes, sin copias paralelas en DOM, Leaflet o un controlador de navegación.
- Tratar el contenido del catálogo como texto público, nunca como HTML confiable.
- Evitar que Leaflet o la URL sean fuentes de verdad para búsqueda, filtros o selección.
- Usar las APIs nativas de URL e historial antes que introducir un router.
- Preferir HTML nativo y CSS flexible frente a widgets ARIA personalizados o valores rígidos redundantes.

## Estructura ejecutable

```text
src/
├── app/
│   ├── placeDetails.ts
│   ├── placeFilters.ts
│   ├── placeSearch.ts
│   ├── placeSelection.test.ts
│   ├── placeSelection.ts
│   ├── renderApp.ts
│   ├── urlState.test.ts
│   └── urlState.ts
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
│   ├── accessibility.css
│   ├── filters.css
│   ├── main.css
│   └── search.css
└── main.ts
tests/
└── e2e/
    ├── app.spec.ts
    ├── filters.spec.ts
    ├── responsive-accessibility.spec.ts
    └── url-state.spec.ts
docs/decisions/
```

`src/styles/accessibility.css` se importa en último lugar. Es una capa transversal de garantías responsive, foco, contraste, objetivos táctiles, estados no dependientes solo del color y reducción de movimiento. No duplica ni conserva estado de búsqueda, filtros, selección, URL o Leaflet.

## Capas de presentación y estado de aplicación

### Estructura semántica

`src/app/renderApp.ts` genera la estructura semántica de la aplicación, la búsqueda, los grupos de filtros, el contenedor del mapa, las instrucciones de interacción, los estados accesibles, el espacio responsive para la ficha y el aviso legal. No conoce detalles de la API de Leaflet ni interpreta relaciones del catálogo.

La búsqueda se declara como una región `role="search"` con etiqueta visible, campo `type="search"`, botón de limpieza, estado con `role="status"` y lista de resultados. Los resultados son botones HTML reales dentro de una lista; no se usa un patrón combobox ARIA incompleto. El texto del estado solo se sustituye cuando el mensaje cambia para reducir anuncios repetitivos.

Los filtros se declaran como una sección con encabezado visible, dos `fieldset` con `legend` para categorías y etiquetas, checkboxes HTML nativos, botón de limpieza y un estado con `role="status"` que comunica el número final de coincidencias. Los controles se insertan mediante APIs DOM y `textContent` desde las colecciones de `campaignCatalog`. El nombre de cada checkbox procede del texto visible; descripción y recuento se relacionan mediante `aria-describedby`.

El mapa se expone como una región con nombre accesible e instrucciones asociadas. La ficha se declara como una región nombrada por el título del lugar, permanece oculta cuando no hay selección y contiene un botón de cierre de al menos 44 × 44 píxeles. La ficha completa no es una región viva: las aperturas directas se comunican mediante foco y las restauraciones no generan anuncios repetitivos.

### Fuente única de consulta

`src/app/placeSearch.ts` mantiene únicamente la cadena de consulta actual. El valor del campo se copia al controlador mediante el evento `input`, y cada render vuelve a derivar los resultados llamando a la función pura de `src/data/search.ts`.

No existe una copia editable de resultados de búsqueda en el DOM, Leaflet o el catálogo. El DOM representa la derivación actual y se sustituye de forma completa cuando cambia la consulta. La consulta vacía produce una lista vacía y un mensaje instructivo; para la combinación con filtros equivale a considerar coincidentes todos los lugares.

El controlador expone `setQuery(query, { notify })` como operación mínima de restauración externa. La operación actualiza la misma variable interna, sincroniza el campo y vuelve a renderizar. Durante carga inicial y `popstate`, `notify: false` evita iniciar una segunda escritura de URL. La interacción normal sigue notificando una vez por cambio.

### Fuente única de filtros

`src/app/placeFilters.ts` mantiene dos conjuntos en memoria: categorías seleccionadas y etiquetas seleccionadas. Son la única fuente editable del estado de filtros. Los checkboxes representan ese estado, pero no se leen como un almacén paralelo para calcular resultados; cada cambio actualiza los conjuntos y solicita una nueva derivación.

`getState()` devuelve una instantánea inmutable ordenada según `catalog.categories` y `catalog.tags`. `setState(state, { notify })` es la operación mínima para restaurar un estado externo ya validado: vuelve a validar por pertenencia al catálogo, sustituye los conjuntos, sincroniza checkboxes y puede omitir la notificación durante una restauración coordinada.

El controlador construye categorías y etiquetas directamente desde `campaignCatalog`. También deriva el número de lugares asociado a cada opción. Una opción sin lugares se mantiene visible, se deshabilita y muestra el texto “Sin lugares asociados”. Cambiar un checkbox vuelve a sincronizar la presentación desde los conjuntos internos, por lo que el DOM sigue sin convertirse en fuente de verdad.

### Fuente única de selección

`src/app/placeSelection.ts` mantiene el único `activePlaceId` de la aplicación. Expone operaciones para seleccionar, cerrar y suscribirse a cambios. Leaflet, la búsqueda, los filtros, la ficha y la URL no mantienen selecciones independientes:

1. un marcador o resultado de búsqueda emite su `placeId`;
2. `main.ts` solicita a Leaflet localizar el marcador cuando corresponde;
3. el controlador de selección publica el nuevo valor;
4. `main.ts` actualiza el estado visual y accesible del marcador;
5. `main.ts` construye y muestra la ficha correspondiente;
6. la URL se deriva del estado ya confirmado;
7. cerrar limpia el mismo estado y devuelve el foco al marcador cuando el cierre es una interacción directa.

Seleccionar un marcador atenuado o un resultado de búsqueda que no satisface los filtros sigue utilizando esta misma ruta. El lugar activo no se sustituye ni se cierra cuando cambian los filtros.

### Ficha de lugar y foco

`src/app/placeDetails.ts` crea todos los nodos de contenido mediante APIs DOM y `textContent`. No usa `innerHTML` con nombres, alias, etiquetas, descripciones o notas del catálogo.

`show(details, { focus })` conserva el comportamiento directo de MAP-006 por defecto: al abrir mediante clic, teclado o resultado de búsqueda, enfoca el título. La restauración inicial y `popstate` usan `focus: false`, de modo que la ficha se presenta sin robar el foco. Cuando el mismo lugar ya está visible, el contenido se reutiliza para evitar reemplazos y saltos de foco innecesarios.

Cerrar mediante el botón sigue limpiando `placeSelection` y devuelve el foco al marcador previamente activo. Cerrar como consecuencia de una entrada de historial no fuerza ese retorno. No existe una trampa de foco.

## Capa de datos de campaña

`src/data/` define un contrato público independiente de la presentación, la URL y Leaflet:

- `model.ts` contiene las entidades `CampaignCategory`, `CampaignTag`, `CampaignPlace`, `PublicNote` y `CampaignCatalog`;
- `catalog.ts` contiene únicamente datos públicos y usa `satisfies CampaignCatalog`;
- `coordinates.ts` convierte la convención estable `{ x, y }` al orden `[y, x]` requerido por Leaflet;
- `placeDetails.ts` resuelve categoría, etiquetas y notas y construye modelos derivados;
- `search.ts` normaliza consultas, evalúa fuentes públicas y construye resultados de búsqueda;
- `filters.ts` deriva etiquetas asociadas, coincidencias de filtros y la intersección final con búsqueda;
- `validate.ts` comprueba estructura, formatos, unicidad, referencias, límites y ambigüedad de alias.

El catálogo está normalizado: los lugares referencian una categoría y etiquetas; las notas referencian su lugar y etiquetas. No se almacenan listas inversas ni estado de interfaz. `docs/data-model.md` no cambia semánticamente para MAP-010.

## Normalización, búsqueda y filtrado

La búsqueda reutiliza `normalizeSearchTerm` de `src/data/validate.ts`: normalización Unicode NFKD, eliminación de diacríticos, minúsculas con locale español, sustitución de signos por espacios, recorte y colapso de espacios.

`searchPublicPlaces` considera únicamente `place.name`, `place.aliases` y `note.title`. Cada lugar produce como máximo un resultado representativo y se ordena por coincidencia exacta, prefijo, parcial y orden estable del catálogo.

`getPublicPlaceFilterTagIds` parte de `place.tagIds` e incorpora los `tagIds` de las notas públicas asociadas. Deduplica y devuelve los IDs en el orden de `catalog.tags`.

La combinación es estable:

- categorías seleccionadas: OR;
- etiquetas seleccionadas: OR;
- categoría, etiquetas y consulta: AND;
- dimensión vacía: no restringe;
- `deriveMatchingPublicPlaceIds`: conserva orden de catálogo, identidad y ausencia de duplicados.

`main.ts` lee la consulta, los filtros y la selección, deriva las coincidencias y envía a Leaflet solo un `ReadonlySet<PlaceId>`.

## Contrato de URL pública

### Parámetros

La aplicación usa exclusivamente la cadena de consulta de la página actual, compatible con un despliegue estático de GitHub Pages. No usa rutas internas que requieran reescritura del servidor.

| Parámetro | Cardinalidad | Identificador | Significado |
|---|---:|---|---|
| `place` | 0 o 1 | `CampaignPlace.slug` | Lugar activo y ficha abierta. |
| `q` | 0 o 1 | texto público | Consulta de búsqueda, recortada en los extremos. |
| `category` | 0 o más | `CampaignCategory.slug` | Categorías seleccionadas. |
| `tag` | 0 o más | `CampaignTag.id` | Etiquetas seleccionadas. |

Ejemplo canónico:

```text
?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass
```

Los nombres visibles no se usan como identidad. Los lugares y categorías usan sus slugs publicados; las etiquetas usan su ID, que el contrato de datos ya define como token estable y apto para URL. El parser acepta también IDs estables de lugar y categoría para tolerar enlaces técnicos, pero los convierte a slugs en la representación canónica.

### Representación canónica

`src/app/urlState.ts` usa `URL` y `URLSearchParams` para codificar espacios, acentos y signos. La salida es determinista:

1. `place`;
2. `q`;
3. cada `category` en el orden de `catalog.categories`;
4. cada `tag` en el orden de `catalog.tags`.

Las dimensiones vacías se omiten. Los valores repetidos se deduplican. Los valores se validan contra `campaignCatalog`. El hash y los parámetros ajenos a la aplicación se eliminan al canonicalizar, porque la página no define otra semántica pública y conservarlos impediría disponer de una única URL estable para el mismo estado.

Una URL válida pero desordenada, con identificadores técnicos, duplicados, valores vacíos o parámetros desconocidos se sustituye mediante `replaceState` por su forma canónica. La comparación se hace contra la URL completa resultante para evitar ciclos de reemplazo.

### Funciones puras

`src/app/urlState.ts` no depende de DOM, Leaflet ni `window` y expone:

- `normalizePublicAppUrlState`: valida, deduplica, recorta la consulta y ordena valores según el catálogo;
- `serializePublicAppUrlState`: produce `URLSearchParams` canónicos;
- `createCanonicalPublicAppUrl`: conserva origen y pathname del despliegue y sustituye búsqueda y hash;
- `parsePublicAppUrlState`: obtiene un estado válido y la URL canónica asociada;
- `arePublicAppUrlStatesEqual`: compara estados normalizados sin depender del orden o duplicados de entrada.

Las funciones no mutan el catálogo ni el estado recibido.

### Parámetros inválidos

El parser aplica recuperación por dimensión:

- un lugar desconocido se ignora y no abre una ficha incorrecta;
- si hay varios `place`, se conserva el primer valor válido;
- categorías y etiquetas desconocidas se eliminan;
- valores válidos e inválidos pueden mezclarse y los válidos se conservan;
- valores vacíos se omiten;
- consultas repetidas conservan el primer valor no vacío;
- codificación porcentual defectuosa se procesa mediante las APIs estándar sin propagar una excepción no controlada;
- una combinación válida sin coincidencias se restaura sin alterarla y usa el estado accesible existente;
- parámetros desconocidos y fragmentos se eliminan durante la canonicalización.

## Relación entre URL y fuentes únicas

La URL es una representación, no un almacén editable adicional:

- `placeSearch` sigue siendo dueño de `query`;
- `placeFilters` sigue siendo dueño de categorías y etiquetas seleccionadas;
- `placeSelection` sigue siendo dueño de `activePlaceId`;
- `main.ts` toma instantáneas de esas fuentes para serializar;
- al restaurar, `main.ts` parsea una vez y escribe los valores en sus controladores existentes;
- no existe un controlador de URL con una copia permanente del estado;
- ni Leaflet ni `campaignCatalog` incorporan estado de navegación.

La restauración no duplica los algoritmos de búsqueda o filtrado. Tras actualizar los controladores, `updateMatchingPlaces` vuelve a llamar a `deriveMatchingPublicPlaceIds` y refleja el mismo resultado en marcadores y estado accesible.

## Política de historial

### Carga inicial

Al montar la aplicación, `main.ts` parsea `window.location` una sola vez después de crear los controladores. Restaura consulta y filtros con `notify: false`, actualiza la selección existente, vuelve a derivar coincidencias, abre la ficha válida sin enfocar su título y centra el marcador cuando existe. Si la URL no es canónica, reemplaza la entrada actual; no crea una entrada adicional.

### Escrituras normales

- Cambios continuos de consulta, incluida la limpieza del campo, usan `replaceState`. Escribir carácter a carácter no incrementa `history.length`.
- Seleccionar un lugar, cambiar de lugar, cerrar la ficha, activar o desactivar un filtro y limpiar filtros son acciones discretas y usan `pushState`.
- Antes de escribir se construye la URL canónica y se compara con la actual. Si son iguales, no se realiza ninguna operación.

### Atrás, adelante y prevención de bucles

`popstate` vuelve a parsear la URL de la entrada activa y restaura los controladores con notificaciones suprimidas. Un indicador temporal `isRestoringFromHistory` impide que las suscripciones de consulta, filtros o selección escriban otra entrada durante la restauración.

El indicador no conserva estado público ni sobrevive a la operación. Su única responsabilidad es delimitar la transacción de restauración. La canonicalización necesaria dentro de `popstate` usa `replaceState`, nunca `pushState`, por lo que atrás y adelante no crean entradas nuevas ni recargan la página.

## Configuración cartográfica y adaptador Leaflet

`src/map/config.ts` concentra la URL oficial, las dimensiones `3600 × 2329`, los niveles de zoom y los cálculos puros. Los límites para `CRS.Simple` son `[[0, 0], [2329, 3600]]`.

`src/map/leaflet.ts` es el único módulo que crea y gestiona `L.Map`. Configura `L.CRS.Simple`, carga exclusivamente la URL oficial mediante `L.imageOverlay`, limita navegación y zoom, gestiona carga/error, crea marcadores, refleja selección y coincidencia, enfoca y localiza marcadores y responde a cambios de tamaño.

Leaflet no conoce consulta, categorías, etiquetas ni URL. Recibe valores derivados y refleja clases, `aria-pressed`, descripciones accesibles y prioridad visual. Todos los marcadores permanecen visibles y operables, incluso atenuados. El marcador activo conserva la prioridad máxima.

## Ciclo de carga y error remoto

La presentación comienza con `aria-busy="true"` y un estado visible. El evento `load` del overlay marca el mapa como preparado. El evento `error` retira la capa remota, activa un mensaje con `role="alert"` y deja visible un fondo CSS neutro.

Marcadores, búsqueda, filtros, URL y fichas se crean desde el catálogo independientemente del estado de la imagen. Una URL compartida se restaura completa aunque falle el JPEG remoto. No existe URL de respaldo, copia alternativa ni precarga automática.

## Accesibilidad, teclado y responsive

Los filtros usan controles HTML nativos. La búsqueda conserva sus reglas de flechas y Escape. Los marcadores admiten ratón, táctil, Enter y barra espaciadora. No se implementa un widget ARIA personalizado.

La carga inicial y `popstate` no fuerzan el foco sobre la ficha, el mapa, un marcador o un control. Una interacción directa sigue enfocando el título al abrir y devuelve el foco al marcador al cerrar. La restauración puede actualizar los estados existentes, pero no genera anuncios específicos para cada parámetro inválido ni convierte la ficha completa en una región viva.

Las URLs no se imprimen en la interfaz, por lo que una cadena larga no introduce desbordamiento. El usuario comparte la URL canónica de la barra de direcciones. Búsqueda, limpieza, filtros, zoom, mapa y ficha conservan sus objetivos táctiles y su distribución responsive. La restauración se prueba en un viewport móvil y sobre la superficie neutra de error.

### Estrategia responsive final

La interfaz se resuelve primero con CSS flexible: cuadrículas `minmax(0, 1fr)`, tamaños con `clamp()`, anchos máximos, contenido con `overflow-wrap: anywhere` y alturas basadas en `svh`. Los breakpoints solo cambian la composición cuando ya no existe espacio suficiente.

El ancho mínimo soportado es `20rem`, equivalente a 320 píxeles con el tamaño raíz estándar. `html`, `body` y `#app` impiden el desbordamiento horizontal accidental. Nombres, alias, etiquetas, títulos, descripciones y textos legales pueden partir línea sin ensanchar el documento.

| Criterio | Decisión |
|---|---|
| Fluido, sin breakpoint | Anchura general, espacios, tipografía, mapa y columnas con `minmax`. |
| `max-width: 64rem` | La ficha deja de ser lateral y se integra debajo del mapa. |
| `max-width: 48rem` | Cabecera, introducción, búsqueda, controles y grupos pasan a una columna. |
| `max-width: 22rem` | Ajustes compactos para anchos cercanos a 320 px. |
| Horizontal con `max-height: 32rem` | Se acotan listas y se mantiene una superficie cartográfica útil. |

El mapa conserva al menos 22 rem en móvil vertical y 18 rem en móvil horizontal de poca altura. La superficie de error usa la misma caja. Resultados y grupos de filtros tienen scroll interno acotado; los botones de limpieza ocupan todo el ancho en pantallas estrechas. `ResizeObserver` invalida Leaflet y reaplica los límites cuando cambia la caja.

### Orden y restauración del foco

El orden de Tab sigue el DOM y el orden visual: enlace para saltar, cabecera, búsqueda, resultados, filtros, mapa, controles de zoom, marcadores, ficha y enlaces legales. No se usan `tabindex` positivos.

| Interacción | Política |
|---|---|
| Flecha abajo en búsqueda | Enfoca el primer resultado. |
| Flechas, Inicio y Fin | Recorren botones de resultado. |
| Escape en resultados | Devuelve el foco al campo. |
| Limpiar búsqueda | Vacía y enfoca el campo. |
| Cambiar filtro | Conserva el foco en el checkbox. |
| Limpiar filtros | Conserva el foco en el botón. |
| Abrir directamente | Enfoca el título de la ficha. |
| Cerrar directamente | Devuelve el foco al marcador activo. |
| Carga inicial o `popstate` | No mueve el foco. |

El foco visible usa contorno de 3 píxeles, separación y halo de contraste. Se aplica a enlaces, botones, campos, marcadores y controles Leaflet incluso sobre mapa o error. No existe trampa de foco y los nodos ocultos se retiran antes de que puedan conservarlo.

### Patrones semánticos y nombres

Los patrones son nativos: `header`, `main`, `footer`, región de búsqueda, listas de botones, `fieldset` y `legend`, checkboxes, regiones de mapa y ficha, botones y enlaces. La carga y los recuentos usan `role="status"`; el error remoto usa `role="alert"` solo cuando ocurre.

Los marcadores exponen lugar y categoría mediante `aria-label`, selección mediante `aria-pressed`, atajo mediante `aria-keyshortcuts` y coincidencia mediante `aria-description`. Los controles de zoom reciben nombres inequívocos a partir de sus títulos. No se añaden ARIA redundantes a botones, inputs o checkboxes nativos.

### Contraste y estados visuales

Los estados no dependen solo del color:

- coincidente: contorno sólido;
- atenuado: menor opacidad, escala y borde discontinuo;
- activo: anillos, escala y prioridad de apilado;
- activo sin coincidencia: anillos de activo y borde discontinuo;
- enfocado: anillo de foco por encima de los demás estados.

Los checkboxes seleccionados conservan el estado nativo y añaden fondo, borde y texto “Seleccionado”. Los controles deshabilitados mantienen legibilidad y explicación. Hover nunca es el único indicador. `prefers-reduced-motion` reduce transiciones no esenciales y los colores forzados conservan contornos y bordes.

### Objetivos táctiles

Los botones de limpieza, resultados, opciones de filtro, cierre, controles de zoom y marcadores tienen una referencia mínima de 44 × 44 píxeles. Los checkboxes miden 24 × 24 píxeles dentro de una etiqueta táctil de al menos 44 píxeles. Los controles mantienen separación mediante `gap` y no quedan parcialmente fuera del viewport. Leaflet conserva paneo y zoom táctil.

### Matriz de Playwright y límites de emulación

| Proyecto | Motor y perfil | Cobertura |
|---|---|---|
| `chromium` | Chromium, Desktop Chrome | Suite e2e completa. |
| `firefox` | Firefox, Desktop Firefox | Suite crítica `responsive-accessibility.spec.ts`. |
| `mobile-webkit` | WebKit, iPhone 13 emulado | Suite crítica móvil y accesible. |

Chromium mantiene la cobertura exhaustiva. Firefox y WebKit ejecutan los flujos transversales de mayor riesgo para evitar duplicar innecesariamente toda la suite.

`mobile-webkit` configura motor, viewport, user agent, capacidades táctiles y escala de dispositivo mediante Playwright. No equivale a una prueba manual en un iPhone físico ni garantiza Safari, VoiceOver, teclado virtual o integración del sistema operativo. Los perfiles de escritorio también son ejecuciones automatizadas del motor, no pruebas manuales en instalaciones de usuario.

### Restauración, error remoto y pruebas estables

Una URL completa se restaura en móvil sin robar foco. Atrás y adelante mantienen el foco del control actual y no crean entradas. Si falla el overlay, la misma caja conserva zoom, marcadores, selección, ficha y estado restaurado.

Las pruebas visuales comprueban geometría, visibilidad, `scrollWidth`, nombres accesibles, atributos, foco, estilos computados y tamaños táctiles. Evitan posiciones absolutas frágiles y snapshots masivos. La URL oficial se intercepta exclusivamente con un SVG neutro generado en memoria; no se descarga ni se usa una copia alternativa.

## Construcción y calidad

- `npm run build` ejecuta TypeScript estricto antes de Vite.
- `npm run lint` ejecuta ESLint.
- `npm run format:check` comprueba Prettier.
- `npm run test` ejecuta Vitest.
- `npm run validate:data` ejecuta la suite del modelo de datos.
- `npm run test:e2e` ejecuta Playwright.
- `.github/workflows/ci.yml` reproduce formato, lint, unitarias, build y e2e en PR a `master`.

Vitest cubre estado vacío, dimensiones aisladas, estado completo, codificación, orden canónico, deduplicación, inválidos, mezcla válida e inválida, parámetros vacíos y desconocidos, ida y vuelta, comparación e inmutabilidad.

Playwright cubre URL estable por marcador, restauración de consulta, filtros y ficha, recarga, apertura en otra página, escritura de URL, política de historial, atrás y adelante, ausencia de entradas durante `popstate`, inválidos, estado sin coincidencias, selección única, foco, móvil y fallo del mapa remoto. MAP-010 añade semántica, 320 píxeles, overflow, objetivos táctiles, foco visible, orden de teclado, marcadores atenuados, restauración móvil y móvil horizontal.

CI instala Chromium, Firefox y WebKit. La suite completa se ejecuta en Chromium; Firefox y `mobile-webkit` ejecutan la suite crítica para mantener una duración razonable.

## Estrategia de pruebas del mapa remoto

Las pruebas e2e registran una ruta de Playwright para la URL oficial y entregan un SVG neutro generado dentro de la prueba. Se valida que la aplicación solicita la URL acordada y reacciona a carga o error, pero CI no descarga ni archiva el JPEG oficial.

## Límite del mapa base

La Beta 0.1 usa la imagen oficial remota de baja resolución conforme a ADR 0001. No se descarga ni incorpora al repositorio, build, despliegue, releases, cachés precargadas o artefactos de CI. Tampoco se transforma, recorta, recomprime, convierte o divide en mosaicos.
