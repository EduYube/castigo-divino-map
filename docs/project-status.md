# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Enlaces directos y restauración completa de estado completados; MAP-010 es la siguiente Issue
- Última actualización: 2026-08-04

## Objetivo actual

Preparar MAP-010 para consolidar el diseño responsive y la accesibilidad de la experiencia completa, partiendo de las fuentes únicas de consulta, filtros y selección y del contrato de URL estable integrados hasta MAP-009.

## Alcance de la Beta 0.1

### Must have

- Mapa navegable de Faerûn.
- Zoom y desplazamiento con ratón y táctil.
- Marcadores de campaña.
- Notas asociadas a marcadores.
- Etiquetas múltiples por nota o marcador.
- Búsqueda y filtrado por etiquetas.
- Resaltado de marcadores coincidentes y atenuado del resto.
- Búsqueda por nombre.
- Filtros por categorías.
- Fichas de información.
- Enlaces directos a lugares y filtros.
- Diseño responsive.
- Despliegue automático.

### Good to have

- Capa de nombres en castellano.
- Mapa base sin rótulos.
- Combinación avanzada de filtros.
- Persistencia local de preferencias.

### Fuera de la beta

- Inicio de sesión.
- Panel de administración.
- Notas privadas incluidas en el frontend público.
- Base de datos remota.
- Editor visual completo.
- Cronología y rutas.

## Fase actual

La fundación, la investigación del mapa base, el esqueleto ejecutable, la navegación cartográfica, el contrato público de datos, la presentación de marcadores y fichas, la búsqueda pública, los filtros y los enlaces directos están completados.

MAP-007 incorporó búsqueda pura sobre `campaignCatalog` por nombre principal, alias y título de nota pública, sin indexar cuerpos y con un resultado representativo por lugar en orden estable.

MAP-008 incorporó lógica pura de filtros sobre el mismo contrato. Varias categorías se combinan con OR, varias etiquetas con OR y las dimensiones categoría, etiquetas y búsqueda con AND. Una dimensión inactiva no restringe resultados. Las etiquetas asociadas a un lugar incluyen las etiquetas directas y las etiquetas de sus notas públicas, derivadas y deduplicadas en memoria.

MAP-009 incorpora un contrato de URL canónico y determinista sobre parámetros de consulta compatibles con GitHub Pages. La URL representa el lugar activo mediante su slug, la consulta mediante `q`, las categorías mediante parámetros `category` repetibles con slug y las etiquetas mediante parámetros `tag` repetibles con ID estable.

`src/app/urlState.ts` contiene lógica pura para normalizar, serializar, parsear, validar y comparar estados públicos. Los valores vacíos se omiten, los duplicados se eliminan y las categorías y etiquetas se ordenan según el catálogo. Los valores inválidos o desconocidos se descartan sin impedir que las dimensiones válidas restantes se restauren.

`src/app/placeSearch.ts` mantiene la única consulta, `src/app/placeFilters.ts` mantiene las categorías y etiquetas seleccionadas y `src/app/placeSelection.ts` mantiene el único lugar activo. La URL es solo una representación serializada: `main.ts` toma instantáneas de esas fuentes y restaura los mismos controladores sin mantener una copia permanente.

La política de historial usa `replaceState` durante cambios continuos de consulta y `pushState` para selección, cierre y filtros. `popstate` restaura campo de búsqueda, checkboxes, marcadores y ficha sin recargar ni crear entradas. Un indicador transitorio evita bucles y no constituye una cuarta fuente de verdad.

La carga inicial y la navegación de historial no roban el foco. Las interacciones directas conservan el comportamiento de MAP-006: abrir enfoca el título y cerrar devuelve el foco al marcador. La restauración funciona en móvil, con combinaciones sin coincidencias y cuando falla la imagen remota.

Todos los marcadores permanecen visibles y operables. Leaflet recibe únicamente el conjunto final mediante `setMatchingPlaces`, resalta coincidencias, atenúa el resto y conserva la prioridad del marcador activo. Si el lugar activo no coincide, su ficha permanece abierta y el estado accesible lo comunica.

## Trabajo en curso

- Ninguno tras la integración de MAP-009 mediante PR #26.
- Siguiente Issue: MAP-010 — Consolidar diseño responsive y accesibilidad.

## Backlog inicial

- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo técnico para comenzar MAP-010.
- La redistribución o transformación del mapa oficial sigue requiriendo autorización escrita; la estrategia remota de Beta 0.1 evita esas operaciones.
- El catálogo actual contiene datos ficticios de demostración; los datos reales deberán confirmarse como públicos antes de sustituirlos o ampliarlos.

## Decisiones cerradas

- Vite, TypeScript y Leaflet con CSS propio.
- Vitest, Playwright, ESLint, Prettier y GitHub Actions.
- Node.js 22 para desarrollo y CI.
- Datos estáticos completamente públicos para la beta.
- GitHub como fuente de verdad y una rama/PR por Issue.
- La Beta 0.1 usa `Sword-Coast-Map_LowRes.jpg` como imagen única remota desde `media.wizards.com`.
- El mapa oficial no se almacena en repositorio, despliegue, CDN propio, releases ni artefactos de CI.
- No se crean mosaicos ni derivados sin autorización escrita.
- Leaflet usa `CRS.Simple`, límites `[[0, 0], [2329, 3600]]` y `L.imageOverlay`.
- El mapa mantiene navegación acotada, zoom responsive y superficie neutra ante errores.
- El catálogo público se define y valida bajo `src/data/`.
- Categorías, etiquetas, lugares y notas son colecciones normalizadas con referencias unidireccionales.
- Las coordenadas se guardan como `{ x, y }` y se convierten centralmente a `[y, x]`.
- Todo dato incluido en el catálogo es público por definición; no existen flags de ocultación.
- Cada lugar genera un `L.divIcon` propio sin assets PNG de Leaflet.
- Las categorías de marcadores se diferencian mediante símbolo, forma, clase y nombre accesible, además del color.
- `src/app/placeSelection.ts` es la única fuente de verdad del lugar activo.
- Leaflet emite activaciones y refleja `aria-pressed`, pero no conserva una selección independiente.
- La ficha se construye con APIs DOM y `textContent`; los cuerpos de notas no se interpretan como HTML.
- Al abrir mediante interacción directa se enfoca el título; al cerrar se devuelve el foco al marcador sin trampa de foco.
- Los marcadores, la búsqueda, los filtros, las fichas y el estado restaurado permanecen disponibles cuando falla el overlay remoto.
- `src/data/search.ts` contiene la lógica pura de búsqueda pública y consume el contrato existente sin ampliarlo.
- La búsqueda indexa nombre principal, alias y títulos de notas; nunca el cuerpo de las notas.
- Los resultados se ordenan por coincidencia exacta, prefijo, parcial y orden estable del catálogo.
- Cada lugar aparece como máximo una vez y conserva su `placeId`.
- `src/app/placeSearch.ts` conserva únicamente la consulta y expone una operación mínima de restauración que sincroniza el campo.
- `src/data/filters.ts` contiene la lógica pura de filtrado y combinación con búsqueda.
- Las categorías seleccionadas se combinan con OR y las etiquetas seleccionadas con OR.
- Categoría, etiquetas y búsqueda se combinan con AND; una dimensión inactiva no restringe.
- Las etiquetas de filtro de un lugar incluyen sus etiquetas directas y las etiquetas de sus notas públicas.
- `src/app/placeFilters.ts` conserva la única fuente editable de categorías y etiquetas y sincroniza sus checkboxes al restaurar.
- Categorías y etiquetas se generan desde `campaignCatalog` en orden estable; las opciones sin lugares se muestran deshabilitadas.
- `deriveMatchingPublicPlaceIds` conserva orden de catálogo, identidad, deduplicación e inmutabilidad.
- `FaerunMapController.setMatchingPlaces` es la única ampliación de Leaflet para reflejar coincidencias.
- Leaflet no conoce la consulta, los filtros ni la URL; solo recibe estados derivados por `placeId`.
- Los marcadores no coincidentes permanecen visibles, atenuados y operables.
- El marcador activo conserva prioridad aunque no coincida; su ficha no se cierra al cambiar filtros.
- El contrato de URL usa `place`, `q`, `category` y `tag` sobre la cadena de consulta, sin router ni rutas que requieran reescritura.
- `place` usa el slug estable del lugar y `category` usa el slug estable de categoría; `tag` usa el ID estable del catálogo.
- La representación canónica ordena `place`, `q`, categorías y etiquetas, y ordena valores repetibles según el catálogo.
- Los parámetros vacíos, duplicados, desconocidos o inválidos se eliminan; los valores válidos restantes se conservan.
- Los parámetros ajenos y el fragmento se eliminan durante la canonicalización para mantener una única URL pública por estado.
- `src/app/urlState.ts` no depende de DOM, Leaflet ni `window` y no muta el catálogo ni el estado de entrada.
- La URL no almacena estado de forma independiente: serializa y restaura `placeSearch`, `placeFilters` y `placeSelection`.
- Los cambios de consulta usan `replaceState`; selección, cierre y filtros usan `pushState`.
- `popstate` restaura sin recargar ni escribir una entrada nueva; la canonicalización usa únicamente `replaceState`.
- La carga inicial y `popstate` no fuerzan el foco; una interacción directa conserva el foco definido en MAP-006.
- No se introduce `localStorage`, `sessionStorage`, IndexedDB, cookies, backend ni un router completo.

## Riesgos

- La URL oficial remota no ofrece garantía de permanencia o disponibilidad.
- Wizards puede cambiar su política o solicitar la retirada del contenido.
- El uso de una imagen única consume aproximadamente 32 MiB una vez decodificada.
- Exposición accidental de notas privadas mediante errores editoriales que no puedan detectarse semánticamente.
- Crecimiento del catálogo y colisiones visuales de marcadores en fases posteriores.
- Colisiones futuras de alias o slugs al ampliar el contenido.
- Una sustitución de la imagen base requeriría migrar coordenadas explícitamente.
- Las dependencias frontend deberán mantenerse actualizadas durante la beta.
- Un catálogo mucho mayor podría justificar índices derivados en memoria, pero no deben persistirse ni duplicar el contrato sin una necesidad medida.
- MAP-010 deberá verificar de forma transversal anchos desde 320 px, foco visible, orden de teclado, contraste, tamaños táctiles y varios motores de navegador sin reabrir las decisiones de estado ya cerradas.

## Próximos pasos

1. Abrir un chat nuevo para MAP-010.
2. Auditar todos los flujos desde 320 px y eliminar cualquier desbordamiento horizontal accidental.
3. Revisar orden, visibilidad y restauración del foco en búsqueda, filtros, marcadores, zoom, ficha e historial.
4. Verificar nombres accesibles, semántica, contraste y objetivos táctiles.
5. Ampliar Playwright a los navegadores y viewports requeridos y mantener CI en verde.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto |
| 2026-08-03 | Backlog Beta 0.1 creado y fundación integrada |
| 2026-08-04 | Fuente oficial, restricciones y estrategia del mapa base documentadas; ADR 0001 aceptado |
| 2026-08-04 | Aplicación Vite + TypeScript, calidad automática, pruebas y CI completadas en MAP-003 |
| 2026-08-04 | Mapa Leaflet navegable, responsive, acotado y con estados accesibles completado en MAP-004 |
| 2026-08-04 | Modelo público normalizado, coordenadas estables, validación runtime, ejemplos y documentación completados en MAP-005 |
| 2026-08-04 | Marcadores accesibles, selección única, fichas públicas responsive, foco y pruebas completados e integrados mediante PR #23 en MAP-006 |
| 2026-08-04 | Búsqueda pública por nombre, alias y título de nota, orden estable, centrado, accesibilidad y pruebas completados en MAP-007 |
| 2026-08-04 | Filtros por categorías y etiquetas, combinación con búsqueda, estados de marcadores, accesibilidad, responsive y pruebas completados en MAP-008 mediante PR #25 |
| 2026-08-04 | Contrato de URL canónico, restauración inicial, historial nativo, inválidos, foco, móvil y error remoto completados en MAP-009 mediante PR #26 |
