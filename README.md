# El Atlas de los Nuevos Dioses

Aplicación web para explorar un mapa interactivo de Faerûn y consultar información pública de la campaña **Castigo Divino** mediante búsqueda, marcadores, categorías, etiquetas, notas y enlaces directos reproducibles.

## Estado

La Beta 0.1 dispone de una aplicación Vite + TypeScript con Leaflet, navegación acotada sobre el mapa oficial remoto de baja resolución, catálogo público validado, marcadores accesibles, fichas, búsqueda, filtros, URL canónica, historial y una experiencia responsive verificada desde 320 píxeles.

Consulta [`docs/project-status.md`](docs/project-status.md) para el estado actual, [`docs/data-model.md`](docs/data-model.md) para el contrato público y [`docs/architecture.md`](docs/architecture.md) para la separación de responsabilidades, política de foco y matriz de navegadores.

## Requisitos

- Node.js 22.12 o posterior.
- npm 10 o posterior.

El repositorio incluye `.nvmrc`:

```bash
nvm use
```

## Instalación local

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

La aplicación solicita el mapa directamente a la URL oficial de Wizards. Si el recurso falla, muestra una alerta accesible y una superficie neutra con la misma geometría útil. Búsqueda, filtros, zoom, marcadores, fichas, URL e historial continúan disponibles sin descargar una copia alternativa.

## Responsive desde 320 píxeles

La interfaz evita anchuras rígidas innecesarias y usa cuadrículas flexibles, `clamp()`, `minmax()`, unidades de viewport pequeño y scroll interno acotado.

- 320 px es el ancho mínimo cubierto.
- No debe aparecer desplazamiento horizontal accidental.
- Cabecera, búsqueda, resultados, filtros, mapa, zoom, ficha y aviso legal permanecen dentro del ancho del viewport.
- Nombres, alias, etiquetas, títulos, descripciones y URLs largas pueden partir línea sin romper el layout.
- La ficha es lateral cuando hay espacio y se integra debajo del mapa por debajo de 64 rem.
- Búsqueda y filtros pasan a una columna por debajo de 48 rem.
- El mapa conserva al menos 22 rem de alto en móvil vertical y 18 rem en móvil horizontal de poca altura.
- Resultados y grupos de filtros tienen scroll propio para que todas las opciones sigan accesibles.
- Los cambios de orientación o tamaño invalidan Leaflet y vuelven a aplicar los límites del mapa.

Los viewports automatizados incluyen escritorio, 320 × 740 y 667 × 375. La configuración `mobile-webkit` usa el perfil emulado de iPhone 13.

## Teclado y foco

- El enlace **Saltar al contenido principal** es el primer acceso rápido.
- Tab recorre los controles en el mismo orden que su presentación visual.
- Desde el campo de búsqueda, Flecha abajo lleva al primer resultado.
- En resultados, Flecha arriba, Flecha abajo, Inicio y Fin desplazan el foco; Escape vuelve al campo.
- Enter y barra espaciadora activan resultados, botones y marcadores según su semántica.
- Cambiar un filtro conserva el foco en su checkbox.
- **Limpiar búsqueda** devuelve el foco al campo.
- **Limpiar filtros** conserva el foco en el botón.
- Abrir una ficha mediante interacción directa enfoca su título.
- Cerrar la ficha devuelve el foco al marcador activo.
- La carga inicial desde URL y `popstate` restauran el estado sin enfocar la ficha ni mover el foco del control actual.
- No existe una trampa de foco.

El foco visible usa contorno y halo de contraste sobre paneles, mapa y superficie de error. No depende únicamente de un cambio de color.

## Búsqueda

El campo **Buscar lugares** acepta nombre principal, alias público o título de nota pública. Ignora mayúsculas, minúsculas, acentos, signos diacríticos y secuencias de espacios. Los cuerpos de las notas no se indexan.

Cada lugar aparece como máximo una vez. Los resultados se ordenan por coincidencia exacta, prefijo, parcial y orden estable del catálogo. Seleccionar un resultado utiliza el controlador de selección existente, centra el mapa y abre la misma ficha que el marcador.

## Filtros

Categorías y etiquetas se generan desde `campaignCatalog` en orden estable. La lógica es:

- categorías seleccionadas: OR;
- etiquetas seleccionadas: OR;
- categoría, etiquetas y búsqueda: AND;
- dimensión vacía: no restringe.

Los grupos usan `fieldset`, `legend`, `label` y checkbox nativos. El nombre accesible procede del texto visible; descripción y recuento se asocian mediante `aria-describedby`. Las opciones sin lugares permanecen visibles y deshabilitadas con explicación textual.

Todos los marcadores siguen visibles y operables. Los coincidentes tienen contorno sólido; los atenuados combinan menor opacidad, escala y borde discontinuo; el activo conserva anillos y prioridad aunque no coincida; el foco añade un anillo específico.

## Navegación, marcadores y ficha

- Arrastra con ratón, trackpad o gesto táctil para desplazarte.
- Usa rueda, pellizco, doble pulsación o los controles visibles para cambiar el zoom.
- Los controles de zoom, marcadores y botones principales ofrecen al menos 44 × 44 píxeles.
- Cada marcador anuncia lugar y categoría, expone selección con `aria-pressed` y describe si coincide con la búsqueda y filtros.
- Los marcadores se activan con Enter o barra espaciadora.
- La ficha muestra nombre, categoría, alias, etiquetas y notas públicas.
- El contenido del catálogo se construye con APIs DOM y `textContent`, no con `innerHTML` confiado.

## Enlaces directos e historial

La URL comparte lugar activo, consulta, categorías y etiquetas:

| Parámetro | Valor estable | Ejemplo |
|---|---|---|
| `place` | slug del lugar | `place=puerto-de-demostracion` |
| `q` | consulta codificada | `q=puerto+costero` |
| `category` | slug de categoría, repetible | `category=asentamientos` |
| `tag` | ID de etiqueta, repetible | `tag=coastal` |

Ejemplo completo:

```text
?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass
```

Los valores vacíos se omiten, los repetidos se deduplican y los desconocidos se descartan por dimensión. La consulta usa `replaceState`; selección, cierre y filtros usan `pushState`; atrás y adelante restauran los controladores existentes sin recargar ni crear entradas nuevas.

No se usa `localStorage`, `sessionStorage`, IndexedDB, cookies ni un router completo.

## Matriz de Playwright

| Proyecto | Perfil | Alcance |
|---|---|---|
| `chromium` | Desktop Chrome | Suite e2e completa. |
| `firefox` | Desktop Firefox | Flujo crítico responsive y accesible. |
| `mobile-webkit` | iPhone 13 emulado con WebKit | Flujo crítico móvil, 320 px, horizontal, URL y error remoto. |

Comandos:

```bash
# Matriz completa
npm run test:e2e

# Cobertura exhaustiva principal
npx playwright test --project=chromium

# Flujo crítico en Firefox
npx playwright test --project=firefox

# Emulación móvil WebKit
npx playwright test --project=mobile-webkit

# Una suite concreta en todos los proyectos aplicables
npx playwright test tests/e2e/responsive-accessibility.spec.ts
```

La emulación móvil reproduce motor, viewport, user agent, capacidades táctiles y escala configurados por Playwright. No equivale a una prueba manual en un iPhone físico ni certifica Safari, VoiceOver, teclado virtual o integración del sistema operativo. Tampoco se afirma haber probado dispositivos físicos.

## Pruebas

Las pruebas unitarias cubren configuración cartográfica, validación, coordenadas, fichas, selección, búsqueda, filtros y URL.

Las pruebas e2e comprueban, entre otros aspectos:

- mapa cargado y error remoto;
- URL oficial interceptada mediante SVG neutro generado en memoria;
- búsqueda, filtros, estados sin coincidencias y marcador activo atenuado;
- teclado, foco y restauración de foco;
- landmarks, regiones, fieldsets, legends y nombres accesibles;
- objetivos táctiles y foco visible;
- ausencia de overflow horizontal;
- geometría útil en 320 px y móvil horizontal;
- restauración desde URL y atrás/adelante sin robo de foco;
- Chromium, Firefox y WebKit móvil.

Las comprobaciones visuales usan geometría, atributos, nombres, foco y estilos computados. No dependen de posiciones absolutas frágiles ni de snapshots masivos.

## Calidad

```bash
npm run validate:data
npm run format:check
npm run lint
npm run test
npm run build
npm run test:e2e
```

| Comando | Propósito |
|---|---|
| `npm run dev` | Inicia Vite. |
| `npm run build` | Comprueba TypeScript y genera producción. |
| `npm run preview` | Sirve el último build. |
| `npm run lint` | Ejecuta ESLint. |
| `npm run format` | Aplica Prettier. |
| `npm run format:check` | Comprueba formato. |
| `npm run test` | Ejecuta Vitest. |
| `npm run validate:data` | Valida el catálogo público. |
| `npm run test:e2e` | Ejecuta la matriz Playwright. |
| `npm run test:e2e:ui` | Abre Playwright UI. |
| `npm run test:all` | Ejecuta Vitest y Playwright. |

## Integración continua

`.github/workflows/ci.yml` se ejecuta en pull requests a `master`. Instala dependencias desde cero, comprueba formato, lint, pruebas unitarias y build, instala Chromium, Firefox y WebKit, y ejecuta la matriz e2e. Chromium conserva la cobertura completa; los otros motores ejecutan la suite crítica para mantener una duración razonable.

## Datos públicos

El catálogo vive en `src/data/catalog.ts`. Todo dato incluido llega al frontend público. No añadas notas privadas, spoilers, datos del director de juego, credenciales ni campos ocultos. Las reglas de IDs, slugs, referencias y coordenadas están en [`docs/data-model.md`](docs/data-model.md).

## Privacidad y licencias

La Beta 0.1 usa `Sword-Coast-Map_LowRes.jpg` directamente desde `media.wizards.com` mediante `L.imageOverlay` y `L.CRS.Simple`. El JPEG no forma parte del repositorio, build, despliegue, releases, cachés ni artefactos de CI. No se generan recortes, recompressiones, conversiones, mosaicos ni derivados.

La fuente, restricciones y atribución están documentadas en [`docs/map-source-and-licensing.md`](docs/map-source-and-licensing.md) y [ADR 0001](docs/decisions/0001-use-remote-low-resolution-map-image.md).
