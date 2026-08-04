# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Búsqueda y filtrado público por categorías y etiquetas completados; MAP-009 es la siguiente Issue
- Última actualización: 2026-08-04

## Objetivo actual

Preparar MAP-009 para implementar enlaces directos y restauración de estado sin alterar las fuentes únicas de consulta, filtros y selección consolidadas hasta MAP-008.

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

La fundación, la investigación del mapa base, el esqueleto ejecutable, la navegación cartográfica, el contrato público de datos, la presentación de marcadores y fichas, la búsqueda pública y los filtros por categorías y etiquetas están completados.

MAP-007 incorporó búsqueda pura sobre `campaignCatalog` por nombre principal, alias y título de nota pública, sin indexar cuerpos y con un resultado representativo por lugar en orden estable.

MAP-008 incorpora lógica pura de filtros sobre el mismo contrato. Varias categorías se combinan con OR, varias etiquetas con OR y las dimensiones categoría, etiquetas y búsqueda con AND. Una dimensión inactiva no restringe resultados. Las etiquetas asociadas a un lugar incluyen las etiquetas directas y las etiquetas de sus notas públicas, derivadas y deduplicadas en memoria.

`src/app/placeFilters.ts` mantiene la única fuente editable de categorías y etiquetas seleccionadas. `src/app/placeSearch.ts` conserva la consulta y `src/app/placeSelection.ts` conserva el único lugar activo. `main.ts` deriva en cada cambio el conjunto final de `placeId` desde catálogo, consulta y filtros.

Todos los marcadores permanecen visibles y operables. Leaflet recibe únicamente el conjunto final mediante `setMatchingPlaces`, resalta coincidencias, atenúa el resto y conserva la prioridad del marcador activo. Si el lugar activo deja de coincidir, su ficha permanece abierta y el estado accesible lo comunica.

La interfaz usa fieldsets, legends y checkboxes nativos generados desde el catálogo. Incluye recuento accesible, estado sin coincidencias, limpieza con foco predecible, objetivos táctiles suficientes, grupos con scroll acotado y diseño responsive. La búsqueda, los filtros, los marcadores y las fichas continúan disponibles cuando falla la imagen remota.

## Trabajo en curso

- Ninguno tras la integración de MAP-008.
- Siguiente Issue: MAP-009 — Implementar enlaces directos y restauración de estado.

## Backlog inicial

- MAP-009 — Implementar enlaces directos y restauración de estado.
- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo técnico para comenzar MAP-009.
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
- Los marcadores y las fichas permanecen disponibles cuando falla el overlay remoto.
- `src/data/search.ts` contiene la lógica pura de búsqueda pública y consume el contrato existente sin ampliarlo.
- La búsqueda indexa nombre principal, alias y títulos de notas; nunca el cuerpo de las notas.
- Los resultados se ordenan por coincidencia exacta, prefijo, parcial y orden estable del catálogo.
- Cada lugar aparece como máximo una vez y conserva su `placeId`.
- `src/app/placeSearch.ts` conserva únicamente la consulta y notifica cambios sin almacenar filtros ni coincidencias finales.
- `src/data/filters.ts` contiene la lógica pura de filtrado y combinación con búsqueda.
- Las categorías seleccionadas se combinan con OR y las etiquetas seleccionadas con OR.
- Categoría, etiquetas y búsqueda se combinan con AND; una dimensión inactiva no restringe.
- Las etiquetas de filtro de un lugar incluyen sus etiquetas directas y las etiquetas de sus notas públicas.
- `src/app/placeFilters.ts` conserva la única fuente editable de categorías y etiquetas seleccionadas.
- Categorías y etiquetas se generan desde `campaignCatalog` en orden estable; las opciones sin lugares se muestran deshabilitadas.
- `deriveMatchingPublicPlaceIds` conserva orden de catálogo, identidad, deduplicación e inmutabilidad.
- `FaerunMapController.setMatchingPlaces` es la única ampliación de Leaflet para reflejar coincidencias.
- Leaflet no conoce la consulta ni los filtros; solo recibe un conjunto derivado de `placeId`.
- Los marcadores no coincidentes permanecen visibles, atenuados y operables.
- El estado visual combina opacidad, escala, contraste, borde, contorno y descripción accesible, no solo color.
- El marcador activo conserva prioridad aunque no coincida; su ficha no se cierra al cambiar filtros.
- Cambiar filtros conserva el foco; limpiar filtros enfoca el botón; no se introduce una trampa de foco.
- La consulta, los filtros y la selección no se persisten ni modifican la URL en MAP-008.

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
- MAP-009 deberá serializar y restaurar consulta, filtros y selección sin crear una segunda fuente de verdad ni bucles de actualización.

## Próximos pasos

1. Abrir un chat nuevo para MAP-009.
2. Definir un formato de URL estable para lugar, consulta, categorías y etiquetas.
3. Parsear y validar el estado externo contra `campaignCatalog`.
4. Restaurar los controladores existentes sin duplicar sus estados.
5. Sincronizar historial, navegación atrás/adelante, foco y estados inválidos mediante pruebas unitarias y e2e.

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
