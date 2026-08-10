# MAP-041 — Extensiones de búsqueda geográfica

## Objetivo

MAP-041 añade una extensión de búsqueda opcional a las identidades geográficas de MAP-039 sin crear identidades, aliases, pines ni geometrías paralelas. Los objetivos puntuales conservan `setView(...)`; las identidades con una extensión defendible usan `fitBounds(...)` y un highlight de área aproximada no interactivo.

## Universo y auditoría fail-closed

El universo canónico sigue siendo exactamente el manifiesto de 213 identidades de MAP-039. MAP-041 no mantiene un segundo índice runtime: su manifiesto de auditoría se deriva de MAP-039 y fija un fingerprint semántico (`00398d27e44e7e85`) sobre identidad, slug, nombre, clase, celda auditada, aliases requeridos y coordenadas bloqueadas. Si MAP-039 añade, elimina o cambia semánticamente una identidad, MAP-041 falla hasta que se repita la revisión.

La clasificación final es:

- `point`: 87 identidades;
- `extent`: 13 identidades;
- `unverified`: 113 identidades.

Las 113 identidades `unverified` son casos que MAP-039 reconocía como accidentes o áreas, pero para los que MAP-041 no publica bounds porque la evidencia disponible no justifica un rectángulo suficientemente defendible. Conservan el comportamiento puntual existente.

## Extensiones publicadas y procedencia

La única fuente cartográfica utilizada es el raster oficial de la Costa de la Espada ya aceptado por MAP-002/MAP-032/MAP-039: `Sword-Coast-Map_LowRes.jpg`, 3600 × 2329, interpretado en el mismo espacio `CRS.Simple` de la aplicación. El raster se inspeccionó únicamente como fuente externa: no se versionaron recortes, mosaicos, transformaciones ni derivados.

Cada extent es un **rectángulo representativo de enfoque de búsqueda** medido a partir del rótulo impreso y del accidente visible circundante. No representa una frontera política, natural o administrativa oficial. Cuando el accidente alcanza el borde del raster, como Forest of Tethir, el rectángulo queda recortado al área cartografiada y sigue describiéndose como aproximación de búsqueda.

| Identidad | Bounds `minX,maxX,minY,maxY` |
| --- | --- |
| Anauroch | `2450,3100,1050,1700` |
| Cormyr | `2700,3290,600,950` |
| The Evermoors | `1720,2030,1810,2020` |
| Forest of Tethir | `1880,2580,0,300` |
| The High Forest | `1700,2250,1500,2010` |
| The High Moor | `1750,2300,1100,1450` |
| Icewind Dale | `1120,1450,2010,2290` |
| Moonshae Isles | `850,1390,570,1250` |
| Sea of Swords | `1370,1740,680,1180` |
| Sword Coast | `1380,1710,750,1500` |
| The Dalelands | `3050,3430,850,1200` |
| The High Ice | `2350,3130,1650,2290` |
| The Shining Plains | `2700,3270,70,380` |

Esta muestra cubre regiones, bosques, llanuras, mar y archipiélagos sin generalizar automáticamente a todas las identidades extensas.

## Modelo persistente

`public.geographic_names` conserva `x`, `y` y `recommended_zoom` y añade cuatro columnas `double precision` opcionales:

- `search_min_x`;
- `search_max_x`;
- `search_min_y`;
- `search_max_y`.

El CHECK `geographic_names_search_extent_check`, marcado como contrato `MAP-041-v1`, exige todos los bounds o ninguno, valores finitos, `minX < maxX`, `minY < maxY`, rango dentro de 3600 × 2329 y que la coordenada canónica permanezca dentro del rectángulo. Los codecs de Supabase, snapshot y runtime repiten esas invariantes y fallan de forma explícita ante datos inválidos.

La migración `20260810170000_add_geographic_search_extents.sql` es reejecutable y fail-closed: valida el esquema existente, la identidad/nombre/coordenada/zoom canónicos de cada extent y rechaza bounds preexistentes diferentes en lugar de sobrescribirlos silenciosamente. No cambia Auth, RLS, grants, roles, policies, ownership ni secretos.

## MAP-040 y geometría canónica

La geometría pertenece a la identidad geográfica, nunca al alias. Los aliases españoles de MAP-040 siguen resolviendo la misma fila de `geographic_names`:

- `Waterdeep` y `Aguas Profundas` permanecen puntuales en `(1626, 1465)` con zoom `0.75` y sin extent;
- `Sword Coast` y `Costa de la Espada` comparten exactamente `1380,1710,750,1500`;
- el resto de aliases no duplica columnas ni geometrías.

## Navegación y highlight

`MapSearchTarget` transporta coordenada canónica, `recommendedZoom` y `searchExtent`. El controlador Leaflet conserva el flujo puntual existente. Cuando existe extent, delega en `locateMapSearchTarget(...)`, usa `fitBounds(...)` con padding y límites de zoom del mapa, respeta los bounds del raster y permite interacción manual inmediatamente después.

El área de enfoque vive en `searchFocusPane`, con z-index `450`, por debajo del `markerPane` de Leaflet. La capa se crea con `interactive: false`, `pointer-events: none`, no es focusable y no entra en el orden de tabulación. Usa relleno tenue y borde discontinuo para comunicar aproximación sin ocultar el raster. `forced-colors` conserva una silueta discontinua visible y `prefers-reduced-motion` no introduce ninguna animación de área. Esto deja preparado MAP-042: un pin dentro del extent sigue visible, focusable y activable.

Cada nueva búsqueda sustituye el highlight anterior. Navegar o activar un pin limpia también el focus area pendiente.

## Accesibilidad

Los anuncios diferencian semánticamente ambos casos:

- puntual: `Mapa centrado en <nombre>; posición resaltada.`;
- área: `Mapa encuadrado en <nombre>; extensión aproximada de búsqueda resaltada.`.

La capa de área no recibe eventos de ratón, touch ni teclado y no altera la semántica de los pines.

## Supabase y snapshot

La migración se validó primero mediante reset local, reejecución real, conflicto semántico, db lint, pgTAP y el suite RLS existente. Después se aplicó al proyecto alojado `atlas-nuevos-dioses-prod` sin cambiar ninguna policy. La verificación remota confirmó 213 identidades publicadas, 13 con extent, Waterdeep sin bounds y los aliases MAP-040 enlazados a la misma identidad.

El snapshot se regeneró mediante el generador canónico desde Supabase y se verificó con los gates MAP-039 + MAP-040 + MAP-041. Su `checksum` y `sourceRevision` son ambos:

`sha256:b0a0c6f1351836d8549f80e05507d11a26a66d3e47b120a609757390653f44bb`

## Tests

MAP-041 añade cobertura unitaria para target puntual, target con extent, bounds invertidos, degenerados, fuera del raster, no finitos, parciales, coordenada fuera del extent, serialización/codec, fingerprint del universo completo, Waterdeep y equivalencia de aliases. La base de datos cubre columnas/constraint, 13 extents, muestras representativas, Waterdeep, aliases, reejecución y conflicto semántico. E2E cubre point → extent → point, reemplazo de highlight, alias español con idéntico encuadre, pin dentro del área no obstruido, desktop, 320 px, ausencia de overflow, Supabase disponible y fallback desde snapshot.

La trazabilidad dinámica del HEAD candidato, run exacto de CI, squash merge, Pages y smoke publicado se registra en la PR #114 para que pueda reconstruirse sin enlaces suministrados manualmente.
