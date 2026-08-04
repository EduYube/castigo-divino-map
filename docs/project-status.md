# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Búsqueda pública por nombre, alias y título de nota completada; MAP-008 es la siguiente Issue
- Última actualización: 2026-08-04

## Objetivo actual

Preparar MAP-008 para implementar categorías y filtrado por etiquetas sin mezclar sus responsabilidades con la búsqueda completada en MAP-007.

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

La fundación, la investigación del mapa base, el esqueleto ejecutable, la navegación cartográfica, el contrato público de datos, la presentación de marcadores y fichas y la búsqueda pública están completados.

MAP-007 incorpora una función pura que consume directamente `campaignCatalog`, normaliza consultas con el mismo contrato del validador y encuentra lugares por nombre principal, alias y título de nota pública. Los cuerpos de las notas no se indexan. Cada lugar genera como máximo un resultado representativo, ordenado por coincidencia exacta, prefijo, parcial y orden estable del catálogo.

La interfaz de búsqueda utiliza un campo etiquetado, un botón de limpieza, una lista de botones y estados vivos. La consulta es su única fuente de verdad y los resultados se derivan en cada cambio. Seleccionar un resultado utiliza el controlador de selección existente, activa el mismo marcador, centra Leaflet mediante una operación mínima y abre la misma ficha pública.

## Trabajo en curso

- Ninguno tras el cierre de MAP-007.
- Siguiente Issue: MAP-008 — Implementar categorías y filtrado por etiquetas.

## Backlog inicial

- MAP-008 — Implementar categorías y filtrado por etiquetas.
- MAP-009 — Implementar enlaces directos y restauración de estado.
- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo técnico para comenzar MAP-008.
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
- Al abrir se enfoca el título de la ficha; al cerrar se devuelve el foco al marcador sin trampa de foco.
- En escritorio la ficha ocupa una columna lateral acotada; en pantallas estrechas pasa debajo del mapa.
- Los marcadores y las fichas permanecen disponibles cuando falla el overlay remoto.
- `src/data/search.ts` contiene la lógica pura de búsqueda pública y consume el contrato existente sin ampliarlo.
- La normalización de búsqueda reutiliza NFKD, eliminación de diacríticos, minúsculas y espacios consistentes de `normalizeSearchTerm`.
- La búsqueda indexa nombre principal, alias y títulos de notas; nunca el cuerpo de las notas.
- Los resultados se ordenan por coincidencia exacta, prefijo, parcial y orden estable del catálogo.
- Cada lugar aparece como máximo una vez y conserva `placeId`, nombre principal y procedencia representativa de la coincidencia.
- `src/app/placeSearch.ts` conserva únicamente la consulta; los resultados se derivan y no se persisten en DOM, Leaflet ni catálogo.
- La lista de resultados usa botones HTML reales, no un combobox ARIA incompleto.
- Flechas, Inicio, Fin y Escape complementan el orden de tabulación sin crear una trampa de foco.
- Limpiar devuelve el foco al campo; seleccionar mueve el foco al título de la ficha; cerrar devuelve el foco al marcador.
- `FaerunMapController.locatePlace` es la ampliación mínima de Leaflet para centrar un marcador respetando límites y zoom.
- La búsqueda no oculta, filtra ni atenúa marcadores; esas responsabilidades quedan reservadas para MAP-008.
- La consulta y la selección no se persisten ni modifican la URL en MAP-007.

## Riesgos

- La URL oficial remota no ofrece garantía de permanencia o disponibilidad.
- Wizards puede cambiar su política o solicitar la retirada del contenido.
- El uso de una imagen única consume aproximadamente 32 MiB una vez decodificada.
- Exposición accidental de notas privadas mediante errores editoriales que no puedan detectarse semánticamente.
- Crecimiento del catálogo y colisiones visuales de marcadores en fases posteriores.
- Colisiones futuras de alias o slugs al ampliar el contenido.
- Una sustitución de la imagen base requeriría migrar coordenadas explícitamente.
- Las dependencias frontend deberán mantenerse actualizadas durante la beta.
- Un catálogo mucho mayor podría justificar un índice derivado en memoria, pero no debe persistirse ni duplicar el contrato público sin una necesidad medida.
- MAP-008 deberá coordinar búsqueda y filtros sin introducir estados paralelos ni cambiar la semántica de los resultados actuales.

## Próximos pasos

1. Abrir un chat nuevo para MAP-008.
2. Implementar filtros por categorías y etiquetas sobre `campaignCatalog`.
3. Definir una fuente única de estado de filtros y resultados derivados.
4. Resaltar coincidencias y atenuar el resto sin ocultar marcadores salvo decisión explícita.
5. Mantener enlaces directos y persistencia fuera de MAP-008.

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
