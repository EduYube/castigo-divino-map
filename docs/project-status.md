# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Marcadores públicos y fichas accesibles implementados; MAP-007 es la siguiente Issue
- Última actualización: 2026-08-04

## Objetivo actual

Preparar MAP-007 para buscar lugares por nombre principal y alias públicos sobre el catálogo estable.

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

La fundación, la investigación del mapa base, el esqueleto ejecutable, la navegación cartográfica, el contrato público de datos y la presentación de marcadores y fichas están completados.

La aplicación consume directamente `campaignCatalog`, convierte las coordenadas mediante `toLeafletSimpleCoordinate`, crea un marcador accesible por lugar y muestra una ficha responsive con nombre, alias, categoría, etiquetas y todas las notas públicas asociadas.

## Trabajo en curso

- MAP-006 — implementación completada en `agent/map-006-markers-and-place-details`, pendiente únicamente del cierre operativo de PR, CI e Issue mientras se actualiza este documento.

## Backlog inicial

- MAP-007 — Implementar búsqueda por nombre y alias.
- MAP-008 — Implementar categorías y filtrado por etiquetas.
- MAP-009 — Implementar enlaces directos y restauración de estado.
- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo técnico para comenzar MAP-007 después de integrar MAP-006.
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

## Riesgos

- La URL oficial remota no ofrece garantía de permanencia o disponibilidad.
- Wizards puede cambiar su política o solicitar la retirada del contenido.
- El uso de una imagen única consume aproximadamente 32 MiB una vez decodificada.
- Exposición accidental de notas privadas mediante errores editoriales que no puedan detectarse semánticamente.
- Crecimiento del catálogo y colisiones visuales de marcadores en fases posteriores.
- Colisiones futuras de alias o slugs al ampliar el contenido.
- Una sustitución de la imagen base requeriría migrar coordenadas explícitamente.
- Las dependencias frontend deberán mantenerse actualizadas durante la beta.

## Próximos pasos

1. Integrar y cerrar MAP-006 con CI en verde.
2. Abrir un chat nuevo para MAP-007.
3. Implementar búsqueda por nombre principal y alias sin modificar el contrato de datos.
4. Definir estados accesibles para resultados vacíos y coincidencias.
5. Mantener filtros, atenuación y enlaces directos fuera de MAP-007.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto |
| 2026-08-03 | Backlog Beta 0.1 creado y fundación integrada |
| 2026-08-04 | Fuente oficial, restricciones y estrategia del mapa base documentadas; ADR 0001 aceptado |
| 2026-08-04 | Aplicación Vite + TypeScript, calidad automática, pruebas y CI completadas en MAP-003 |
| 2026-08-04 | Mapa Leaflet navegable, responsive, acotado y con estados accesibles completado en MAP-004 |
| 2026-08-04 | Modelo público normalizado, coordenadas estables, validación runtime, ejemplos y documentación completados en MAP-005 |
| 2026-08-04 | Marcadores accesibles, selección única, fichas públicas responsive, foco y pruebas completados en MAP-006 |
