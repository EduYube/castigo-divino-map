# Arquitectura inicial

## Stack

- Vite + TypeScript.
- Leaflet con `CRS.Simple`, `L.imageOverlay` y marcadores `L.divIcon`.
- CSS propio, sin framework de interfaz ni librería de componentes.
- Datos estáticos TypeScript validados mediante tipos, funciones propias y Vitest.
- Vitest para lógica pura.
- Playwright para flujos de navegador.
- ESLint y Prettier para calidad estática y formato.
- GitHub Actions para CI.
- GitHub Pages como destino de despliegue posterior.

## Principios

- Mantener la Beta 0.1 sin backend, router, autenticación ni persistencia local.
- Separar datos, estado de aplicación, presentación y motor cartográfico.
- Mantener una única fuente de verdad para consulta, filtros y lugar activo.
- Derivar resultados, estados visuales y URL sin leer el DOM como almacén ni convertir Leaflet en fuente de verdad.
- Tratar todo el catálogo como contenido público y como texto, nunca como HTML confiable.
- No almacenar, transformar ni redistribuir el mapa oficial sin autorización escrita.
- Priorizar accesibilidad, rendimiento móvil y pruebas verificables.
- Tratar la red y el recurso cartográfico remoto como dependencias falibles.
- Preferir HTML nativo y CSS flexible antes que widgets ARIA personalizados o valores rígidos redundantes.

## Estructura ejecutable

```text
src/
├── app/
│   ├── placeDetails.ts
│   ├── placeFilters.ts
│   ├── placeSearch.ts
│   ├── placeSelection.ts
│   ├── renderApp.ts
│   └── urlState.ts
├── data/
│   ├── catalog.ts
│   ├── coordinates.ts
│   ├── filters.ts
│   ├── model.ts
│   ├── placeDetails.ts
│   ├── search.ts
│   └── validate.ts
├── map/
│   ├── config.ts
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
```

`accessibility.css` se importa en último lugar. Es una capa transversal de garantías responsive, foco, contraste, objetivos táctiles, estados no dependientes solo del color y reducción de movimiento. No duplica la lógica de búsqueda, filtros, selección, URL ni Leaflet.

## Fuentes únicas y orquestación

- `src/app/placeSearch.ts` conserva la única consulta.
- `src/app/placeFilters.ts` conserva las únicas categorías y etiquetas seleccionadas.
- `src/app/placeSelection.ts` conserva el único `activePlaceId`.
- `src/app/urlState.ts` normaliza, serializa, parsea y compara una representación pública; no mantiene una copia editable del estado.
- `src/data/search.ts` y `src/data/filters.ts` realizan las derivaciones puras.
- `src/map/leaflet.ts` recibe únicamente IDs derivados para reflejar selección y coincidencia.
- `src/main.ts` coordina controladores, historial y presentación sin crear fuentes paralelas.

La política de historial se mantiene: la consulta usa `replaceState`; filtros, selección y cierre usan `pushState`; `popstate` restaura los controladores existentes sin crear entradas nuevas. La carga inicial y el historial no fuerzan el foco.

## Estrategia responsive

### Criterio fluido

La aplicación se diseña primero con tamaños fluidos, `minmax(0, 1fr)`, `clamp()`, `max-width: 100%`, unidades `svh` y contenido con `overflow-wrap: anywhere`. Los breakpoints solo cambian la composición cuando el espacio ya no permite conservar una lectura y operación cómodas.

El ancho mínimo soportado es `20rem`, equivalente a 320 píxeles con el tamaño raíz estándar. `html`, `body` y `#app` limitan el desbordamiento horizontal accidental. Los enlaces, alias, etiquetas, nombres, títulos y textos legales pueden romper línea en cualquier punto necesario sin ensanchar el documento.

### Criterios y breakpoints

| Criterio | Uso |
|---|---|
| Fluido, sin breakpoint | Anchura general, paddings, tipografía, mapa y columnas con `minmax`. |
| `max-width: 64rem` | La ficha deja de ser lateral y se integra debajo del mapa. |
| `max-width: 48rem` | Cabecera, introducción, búsqueda, filtros y grupos pasan a una sola columna. |
| `max-width: 22rem` | Ajustes mínimos para cabecera y etiquetas en anchos cercanos a 320 px. |
| `orientation: landscape` y `max-height: 32rem` | Se acotan listas y se conserva una superficie cartográfica útil en móvil horizontal. |

El mapa usa una altura fluida basada en `svh`: en escritorio puede crecer hasta 58 rem; en móvil conserva al menos 22 rem; en móvil horizontal conserva al menos 18 rem. La superficie de error usa la misma caja del lienzo, por lo que no cambia la geometría útil cuando falla el overlay remoto.

Los resultados y cada grupo de filtros tienen scroll interno acotado. Así todas las opciones permanecen recorribles sin expandir indefinidamente la página. Los botones de limpieza ocupan todo el ancho en pantallas estrechas y permanecen accesibles con teclado virtual.

`ResizeObserver` invalida el tamaño de Leaflet y vuelve a aplicar límites después de cualquier cambio real de caja. La orientación, apertura de la ficha y cambios de viewport no alteran el contrato de coordenadas ni permiten navegar indefinidamente fuera de los límites.

## Orden de teclado y política de foco

El orden de Tab sigue el DOM y el orden visual: enlace para saltar, cabecera, búsqueda, resultados, filtros, mapa, zoom, marcadores, ficha y enlaces legales. No se aplican `tabindex` positivos.

| Interacción | Política de foco |
|---|---|
| Entrada en resultados | Flecha abajo desde el campo enfoca el primer resultado. |
| Navegación de resultados | Flechas, Inicio y Fin mueven foco entre botones; Escape vuelve al campo. |
| Limpiar búsqueda | Vacía la consulta y devuelve el foco al campo. |
| Cambiar filtro | El checkbox nativo conserva el foco. |
| Limpiar filtros | El botón conserva el foco. |
| Abrir ficha directamente | El título de la ficha recibe foco con `tabindex="-1"`. |
| Cerrar ficha directamente | El foco vuelve al marcador previamente activo. |
| Carga inicial o `popstate` | No se enfoca el título ni se mueve el foco del control actual. |
| Contenido oculto o sustituido | No se mantiene foco dentro de nodos ocultos; no existe trampa de foco. |

Marcadores y botones se activan mediante su semántica nativa o con Enter y barra espaciadora. Los marcadores Leaflet exponen `role="button"`, `tabindex="0"`, `aria-keyshortcuts="Enter Space"` y `aria-pressed`.

El foco visible usa un contorno de 3 px con separación y un halo de contraste. Se aplica a enlaces, botones, campos, marcadores y controles de Leaflet, incluso sobre el mapa o la superficie de error. No se elimina el contorno sin una sustitución equivalente.

## Semántica y nombres accesibles

`src/app/renderApp.ts` define cabecera, contenido principal, búsqueda, filtros, mapa, ficha, aviso legal y pie. Los patrones son HTML nativo:

- región de búsqueda con etiqueta visible, `input type="search"`, botón y lista de botones;
- dos `fieldset` con `legend` visible para categorías y etiquetas;
- checkboxes nativos envueltos por `label`;
- región de mapa con nombre accesible e instrucciones asociadas;
- ficha como región nombrada por el título del lugar;
- avisos de carga y recuento con `role="status"`;
- error remoto con `role="alert"` solo cuando ocurre el error.

Los checkboxes toman su nombre del texto visible. La descripción de categoría o etiqueta y el recuento se asocian mediante `aria-describedby`, sin sustituir el nombre visible con un `aria-label` redundante.

Los marcadores anuncian lugar y categoría mediante `aria-label`, selección mediante `aria-pressed` y coincidencia mediante `aria-description`. La misma información se refleja en `data-accessible-state` para pruebas sin leer el catálogo desde el DOM.

La ficha no es una región viva completa: abrir mediante interacción directa se comunica por el foco en su título y restaurarla desde URL no genera anuncios repetitivos ni roba foco. Los estados vivos solo actualizan texto cuando el mensaje cambia.

El catálogo se representa con APIs DOM y `textContent`. El único HTML usado por Leaflet es un símbolo estático sin nombres ni contenido del catálogo.

## Contraste y estados no dependientes solo del color

La paleta oscura mantiene texto principal claro, texto secundario legible y enlaces subrayados. El foco usa contorno y halo, no solo un cambio de color.

Los estados de marcador combinan propiedades:

- coincidente: contorno exterior sólido;
- atenuado: menor opacidad, escala y borde discontinuo;
- activo: anillos, escala y prioridad de apilado;
- activo sin coincidencia: conserva los anillos de activo y el borde discontinuo de no coincidencia;
- enfocado: anillo específico de foco por encima de los demás estados.

Los checkboxes seleccionados muestran fondo, borde, estado nativo y un texto auxiliar “Seleccionado”. Los controles deshabilitados conservan opacidad suficiente y texto explícito. Hover nunca es el único indicador de interacción.

Las transiciones no esenciales se reducen a una duración prácticamente nula con `prefers-reduced-motion: reduce`. En modo de colores forzados se conservan contornos y bordes discontinuos.

## Objetivos táctiles

La referencia mínima para controles principales es 44 × 44 píxeles (`2.75rem`):

- botones de limpieza;
- resultados de búsqueda;
- opciones de filtro;
- cierre de ficha;
- controles de zoom;
- marcadores.

Los checkboxes miden 24 × 24 píxeles dentro de una etiqueta táctil de al menos 44 píxeles. Los controles mantienen separación mediante `gap`, no quedan fuera del viewport y usan `touch-action: manipulation` cuando no deben interferir con el paneo del mapa. Leaflet conserva zoom por pellizco y desplazamiento táctil.

## Matriz de Playwright

| Proyecto | Motor y perfil | Cobertura |
|---|---|---|
| `chromium` | Chromium, perfil Desktop Chrome | Suite e2e completa: mapa, búsqueda, filtros, URL, historial, responsive y accesibilidad. |
| `firefox` | Firefox, perfil Desktop Firefox | Suite crítica `responsive-accessibility.spec.ts`. |
| `mobile-webkit` | WebKit con emulación iPhone 13 | Suite crítica responsive y accesible, incluyendo 320 px, URL completa y móvil horizontal. |

La matriz evita repetir todos los escenarios en cada motor. Chromium es el navegador principal de CI; Firefox y WebKit verifican los flujos transversales de mayor riesgo.

`mobile-webkit` es emulación automatizada del motor WebKit con viewport, user agent, capacidades táctiles y escala del dispositivo configurados por Playwright. No equivale a una prueba manual en un iPhone físico ni garantiza todos los comportamientos de Safari, teclado virtual, lector de pantalla o integración del sistema operativo. “Desktop Chrome” y “Desktop Firefox” también son perfiles automatizados del motor, no sesiones manuales en instalaciones de usuario.

## Estrategia de pruebas resistentes

Las pruebas no dependen de coordenadas absolutas ni snapshots visuales masivos. Comprueban:

- ausencia de overflow mediante `scrollWidth` y `clientWidth`;
- cajas dentro del ancho del viewport;
- altura útil del mapa;
- visibilidad y tamaño de objetivos táctiles;
- landmarks, fieldsets, legends, roles y nombres;
- foco real y estilo computado del contorno;
- clases, atributos y descripciones de estados;
- restauración de URL e historial;
- comportamiento equivalente durante error remoto.

El mapa oficial se intercepta exclusivamente en su URL canónica y se responde con un SVG neutro generado en memoria. No se descarga ni se añade una copia alternativa. Las capturas y trazas se reservan para diagnóstico en reintentos.

## Recurso cartográfico remoto

La URL, dimensiones y límites permanecen centralizados en `src/map/config.ts`. Leaflet continúa usando `L.CRS.Simple` y `L.imageOverlay`. El JPEG oficial no forma parte de Git, `public`, `dist`, cachés, releases ni artefactos de CI. La estrategia legal y técnica sigue definida en `docs/map-source-and-licensing.md` y ADR 0001.

Cuando el recurso falla, se retira el overlay, se mantiene el mismo lienzo y se muestra una superficie neutra con alerta. Búsqueda, filtros, zoom, marcadores, ficha, URL e historial continúan operables.
