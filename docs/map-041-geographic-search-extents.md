# MAP-041 — Extensiones de búsqueda geográfica

Estado: implementación en curso.

## Objetivo

Añadir una extensión de búsqueda opcional a las identidades geográficas de MAP-039 sin crear identidades, aliases, pines ni geometrías paralelas. Los objetivos puntuales conservan `setView(...)`; las identidades con extensión defendible usarán `fitBounds(...)` y un highlight de área aproximada no interactivo.

## Contratos que deben preservarse

- Universo canónico: exactamente las 213 identidades auditadas por MAP-039.
- Aliases: MAP-040 resuelve a la misma identidad; la geometría nunca pertenece al alias.
- Raster: 3600 × 2329, `CRS.Simple`, fuente oficial ya aceptada por MAP-002/MAP-032/MAP-039.
- Waterdeep y `Aguas Profundas` permanecen como objetivo puntual en `(1626, 1465)` con zoom recomendado `0.75`.
- No se incorporan al repositorio raster, recortes, mosaicos, imágenes transformadas ni derivados.
- No se modifican Auth, RLS, grants, roles, policies, ownership ni secretos salvo necesidad explícita, que requeriría revisión humana antes de producción.

## Metodología de auditoría

MAP-041 mantendrá un manifiesto de auditoría fail-closed derivado del universo de MAP-039 y clasificará cada identidad como `point`, `extent` o `unverified`. El manifiesto es tooling/contrato; el runtime seguirá leyendo la identidad geográfica persistida y no una segunda tabla frontend.

Los bounds publicados serán rectángulos representativos en el mismo espacio `CRS.Simple`. Solo se publicarán cuando la cartografía oficial permita defender un área de enfoque aproximada. El tratamiento visual y la documentación evitarán presentarlos como fronteras políticas o naturales oficiales.

## Estado técnico inicial

- `master` contiene los squash merges de MAP-039 y MAP-040.
- MAP-039 ya clasifica las 213 identidades por `point`/`area` como dato de auditoría del raster; MAP-041 no asumirá que toda fila `area` tiene evidencia suficiente para publicar bounds.
- El runtime actual usa `MapSearchTarget { coordinates, recommendedZoom, label }`, `setView(...)` y un marcador circular temporal.
- La implementación se diseñará con un pane específico de focus area por debajo de los pines interactivos y con `interactive: false`/`pointer-events: none`.

## Trazabilidad de ejecución

La PR se actualizará durante el trabajo con HEAD candidato, migración, estado de Supabase, checksum/sourceRevision del snapshot, CI exacta, incidencias, merge y Pages.
