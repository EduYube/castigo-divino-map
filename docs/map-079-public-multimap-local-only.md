# MAP-079 — Lector público multi-map y entidades local-only

**Issue:** #200 · **Baseline:** `ba4cf40ddbb5e1f513dabb050c9320234e3b4758` · **Versión:** 1.2.0

## Decisión y frontera de arquitectura

`World catalog != Local map reader`.

El catálogo Beta 0.2/V3 sigue siendo **solo mapa general** hasta MAP-080.
`PUBLIC_CATALOG_TABLE_QUERIES.entities.worldMapEnabled = true` se traduce
explícitamente a `world_map_enabled=eq.true`. Tanto el repositorio de runtime
como la generación/verificación remota del snapshot filtran sus tablas
auxiliares respecto a los IDs de ese mismo conjunto mundial. Por tanto,
una entidad con `world_map_enabled=false` y `x=y=geometry=NULL` no puede
llegar al parser de geometría mundial, ni a la cache de sesión V3.

`SupabasePublicLocalMapRepository` es una capa independiente (AbortSignal,
lectura paginada, validación estricta) que consulta para una campaña activa
los bindings publicados, placements y metadatos de entidades local-only.
No copia el esquema ni serializa un snapshot alternativo. El mapa local
reconstruye una **proyección efímera** de las entidades canónicas: el
`entity_id` y los metadatos son inmutables, y exclusivamente la
`geometry` de placement prevalece al renderizar sobre su contexto.
La proyección de búsqueda incluye una entidad local-only una sola vez
aunque tenga varios placements; no contiene una coordenada mundial ficticia.

## Seguridad y ACL

Migración forward-only:
`supabase/migrations/20261029140000_enable_public_local_map_reader.sql`.

El predicado SQL `private.map079_public_local_placement_exists`, sin
SQL dinámico y con `search_path` vacío, rompe el ciclo de RLS
`map_entities ↔ entity_map_placements`. Solo autoriza filas que cumplen
simultáneamente: placement published, contexto published, entidad
published/public y espacial, categoría published, campaña active,
FK de campaña, binding MAP-077 de esa campaña y nombre geográfico published.
La política de entidad permite world-enabled o una entidad local-only
con al menos un placement autorizado. La política de placements emplea
el predicado específico al contexto. El helper está fuera del esquema
expuesto por Data API y dispone de `GRANT EXECUTE` explícito para
`anon` y `authenticated`. Las políticas admin, permisos de escritura
por columna, triggers y FKs existentes no se alteran.

La URL `?campaign=A&map=B` nunca autoriza una lectura por sí misma:
el binding y el contexto deben estar publicados para **A**. La capa
local verifica de nuevo `campaign_id` y el contexto declarado en todas
las filas. Una respuesta corrupta, cancelada o tardía se descarta.

## Flujo de navegación y datos

MAP-077 mantiene el control de entrada/salida y la URL, incluidos
Back, Forward y refresh. Al mostrarse un contexto, `publicLocalMapRuntime`
dibuja sobre el objeto `Leaflet.Map` existente de ese contexto y usa
`createSinglePinIcon`, `createAtlasPinMarkerModels` y
`mountCampaignRegions`; el mundo conserva su propio controlador y
sus coordenadas. Se reutiliza la semántica de región/polygon de
MAP-060 y se muestra una elección accesible para pines exactamente
coincidentes. Las operaciones del render local pueden descartarse sin
modificar el estado cartográfico mundial.

La búsqueda de campaña combina las entidades mundo con las local-only
por su `entity_id`, conservando aliases y notas públicas. Una coincidencia
local-only muestra el nombre de los contextos; con uno se puede acceder
directamente, con varios se muestran destinos explícitos. En mapa local
activo, el click de un resultado con placement focaliza ese placement;
en mapa general las entidades world-enabled conservan su navegación
legada. La ficha compacta y la página completa `?entity=<slug>&campaign=<slug>`
usan la entidad canónica y la lectura pública autorizada. No hay fallback
a Master ni a otra campaña.

Al cambiar de campaña, iniciar un degraded/offline o abandonar la
superficie local se abortan lecturas, se purgan placements y referencias
locales, y se restaura el mapa general. La captura de generación impide
respuestas tardías. Degraded conserva solo el snapshot V3 mundial; la
búsqueda local-only deja de estar disponible. MAP-080 es el único
responsable de añadir el contenido local al snapshot versionado.

## Exclusiones y validación

No se añade ningún placement canónico de Veyra, imagen raster, dato
narrativo o elemento de City of Shadows. Neverwinter mantiene su
identidad global, binding con `un-aliento-menos` y dimensiones 2048×1582.
Las pruebas usan únicamente fixtures sintéticos en transacciones pgTAP
con rollback y doubles unitarios, sin escrituras a producción.

Las comprobaciones esperadas en CI incluyen RLS anónimo/no-admin/admin,
negativos de visibilidad y binding, world query, aislamiento de identidad,
parseo local, polygons, aliases/notas, build, E2E y Pages. Una revisión
manual completa de Leaflet no está acreditada por la implementación y
permanece pendiente de QA independiente.

**Deudas preexistentes no incluidas:** #208, #213, #214, #215.
