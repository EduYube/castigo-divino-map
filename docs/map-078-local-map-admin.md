# MAP-078 — Administración de mapas locales

## Separación conceptual

La sección **Mapas locales** se monta en la sesión administrativa existente y separa tres operaciones:

- **Map context**: superficie física global, independiente de campañas, con ID/slug estables, dimensiones, publicación, jerarquía y procedencia.
- **Binding**: relación entre la campaña administrativa activa, un `geographic_name` global y un `map_context`. El binding no crea entidades ni duplica geonombres y únicamente se desasocia en su eliminación.
- **Placement**: una entidad elegible de la campaña con geometría CRS.Simple dentro de un contexto global. Solo `location` admite polígonos; `character`, `mission` y `hazard` son puntos; `organization` no admite geometría.

Un mapa local es opcional; crear una geografía o una entidad no crea automáticamente un contexto o placement.

## Administración y seguridad

La UI reutiliza la autenticación, el diálogo y el selector administrativo de campañas de MAP-070. Los adaptadores envían el token administrativo de la sesión y la clave publicable a la Data API existente; no se incorpora service role ni una vía privilegiada alternativa. Las respuestas de 401/403 invalidan la autorización. Abort y generaciones impiden que respuestas antiguas se apliquen después de cambiar campaña o cerrar sesión. El interceptor administrativo incorpora las dos nuevas tablas campaign-scoped; `map_contexts` permanece global.

La base de datos continúa siendo la autoridad sobre ACL por columna, RLS, UNIQUE, FK, ciclo jerárquico, published-parent, inmutabilidad de ID/slug, resize con placements y validez de geometrías. Las escrituras usan `updated_at` para detectar cambios concurrentes; ante fallo se solicita recargar, sin autocorregir relaciones. Se mantiene el contrato INFRA #210 (`GRANT` explícito + RLS + policies); **no hay migración nueva**.

## Metadatos de imagen

Campos editables: `image_uri`, `loading_strategy`, `source_url`, `rights_holder`, `attribution`, `license_notes`. Cuando `image_uri` es `NULL`, `loading_strategy` debe ser `NULL`. Con imagen, deben declararse `remote` o `bundled`, además de fuente, titular y notas de licencia no vacías. `attribution` se permite como campo editorial opcional conforme a la constraint SQL. No hay uploader, tiles, pipeline de resize ni transformación de activos.

## Geometría CRS.Simple

El editor administra posiciones referidas a `width` y `height` del contexto elegido, no a las dimensiones del mapa mundial. Cuando falta el recurso de imagen presenta un plano cuadriculado editable; no inventa ni publica raster. Se puede seleccionar/mover un punto y dibujar/editar un polígono de location (máximo 64 vértices), con soporte para arrastre y teclado. Los controles validan límites y topología y PostgreSQL normaliza geometría, representante y permisos.

## Límite de release

Neverwinter debe seguir publicado como contexto global `map-neverwinter` de `2048 × 1582`, con imagen/estrategia vacías y `RIGHTS_METADATA_PENDING`. Su único binding productivo queda `Un aliento menos + geo-neverwinter → map-neverwinter`; Castigo Divino permanece sin binding. MAP-078 no escribe ese estado ni crea placement de Veyra. Tampoco añade City of Shadows / Shade, entidades local-only canónicas ni raster. El lector público local-only/multi-map y su RLS de lectura ampliada corresponden a MAP-079, el snapshot multi-map a MAP-080 y el gate de v1.3 a MAP-081.

Se mantiene v1.2.0, snapshot v3 y `public/data/public-catalog.snapshot.json` intactos. Sin tag, release, merge ni deploy.

## R1 corrections (MAP078-REV-01–05)

- On logout, expiry or authorization revocation, hidden forms, private select options, titles and messages are scrubbed. Canceled requests and generation checks prevent late responses repopulating sensitive data.
- Context dependencies are counted across campaigns via FK embeddings on global `map_contexts`, bypassing the campaign-scoped request interceptor. Missing or malformed counts fail closed; reloading refreshes counts and contexts. PostgreSQL remains authoritative in races.
- Canceling an administrative campaign transition reloads the confirmed campaign after its scoped data was cleared.
- A rejected context switch preserves the previous context and geometry for new or existing placements.
- Creating bindings requires a confirmation identifying campaign, geography, map and potential public-navigation impact before POST.

## QA

Probar creación/edición/archivado, jerarquía y conflictos, selección de campaña, altas y bajas de bindings, geometría sintética y accesibilidad/responsive. Los E2E no deben mutar Neverwinter ni Veyra productivos. Los issues #208 (editor post-save), #213 (pines coincidentes/Escape), #214 (Master Mode) y #215 (accesibilidad de pins) son deudas preexistentes fuera de alcance salvo regresión directa.
