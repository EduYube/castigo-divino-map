# CRUD administrativo de personajes y emplazamientos

MAP-019 incorpora el editor administrativo de `map_entities` para personajes y emplazamientos sin cambiar la frontera pública definida para Beta 0.2 ni adelantar la transición completa reservada a MAP-028.

## Responsabilidades

El flujo administrativo se divide en las mismas capas que el resto de la aplicación:

- `src/domain/adminMapEntities.ts` define la entidad editable, referencias, relaciones, disposiciones y reglas de borrado;
- `src/domain/adminMapEntityValidation.ts` aplica validaciones inmediatas de UX sin sustituir constraints, triggers o RLS;
- `src/data-access/adminMapEntities.ts` define el puerto administrativo y el vocabulario normalizado de errores;
- `src/application/adminMapEntityController.ts` coordina cargas, mutaciones, cancelación, doble submit y descarte de respuestas obsoletas;
- `src/infrastructure/supabase/adminMapEntityRepository.ts` implementa el puerto contra Supabase y obtiene el JWT administrativo vigente solo al realizar una operación protegida;
- `src/app/adminMapEntities.ts` construye la UI accesible;
- `src/map/adminEntityEditorMap.ts` encapsula exclusivamente la interacción Leaflet del selector visual.

`SupabasePublicCatalogRepository` permanece separado. Las lecturas públicas continúan enviando únicamente `apikey`; el JWT administrativo no se reutiliza ni se adjunta a ellas.

## Sistema de coordenadas y editor visual

El editor reutiliza exactamente el espacio del mapa público:

- imagen oficial remota ya aprobada: `Sword-Coast-Map_LowRes.jpg`;
- `L.CRS.Simple`;
- ancho `3600` y alto `2329`;
- coordenadas de dominio `{ x, y }`;
- coordenadas Leaflet `[y, x]`;
- bounds `[0, 0] → [2329, 3600]`;
- mismo `maxZoom`, `zoomSnap`, `zoomDelta`, `maxBounds` y comportamiento responsive del mapa público.

Los límites canónicos viven en `src/domain/mapCoordinates.ts` y `src/map/config.ts` deriva de ellos el tamaño de la imagen. `src/data/coordinates.ts` contiene las dos transformaciones entre dominio y Leaflet para evitar un segundo sistema cartográfico.

Al crear una entidad no se asigna una posición por defecto. El administrador debe elegir coordenadas explícitamente mediante una de estas vías equivalentes:

1. pulsar sobre el mapa;
2. arrastrar el marcador de edición;
3. introducir X e Y con los campos numéricos del formulario.

La tercera vía es también la alternativa accesible para teclado y tecnologías asistivas. X debe permanecer entre `0` y `3600` e Y entre `0` y `2329`; la UI lo comprueba de inmediato y PostgreSQL conserva la validación definitiva.

La imagen oficial nunca se descarga, versiona, redistribuye ni transforma. Si la imagen remota falla, el formulario y las coordenadas numéricas siguen disponibles y el fallo se anuncia sin romper el mapa público.

## Datos editables

El editor cubre:

- `id` estable;
- `slug`;
- tipo `character` o `location`;
- nombre principal en inglés;
- resumen y descripción;
- categoría;
- etiquetas;
- X e Y;
- `pin` o `search_only`;
- disposición `ally`, `neutral` o `enemy` para cada jugador;
- estado `draft`, `published` o `archived`.

MAP-018 conserva la responsabilidad de categorías, etiquetas, aliases de entidad, nombres geográficos y aliases geográficos. MAP-019 solo referencia las categorías y etiquetas que ya existen y edita la entidad principal y sus relaciones directas.

## Previsualización

La previsualización se construye exclusivamente desde el draft en memoria y no ejecuta ninguna mutación. Presenta el mismo conjunto de datos públicos relevantes que se guardaría:

- nombre;
- tipo;
- categoría;
- etiquetas;
- coordenadas;
- visibilidad cartográfica;
- disposiciones.

Guardar un borrador o abrir su preview no cambia `publication_status` a `published` ni lo hace visible para `anon`.

## Publicación y archivado

La publicación sigue el lifecycle ya definido por ADR 0005:

- `draft → published` permitido;
- `published → archived` permitido;
- `archived → published` prohibido directamente;
- para republicar, una entidad archivada debe volver antes a `draft`.

Una entidad publicada requiere categoría publicada. Sus relaciones de tags seleccionadas también deben referenciar tags publicados. Estas comprobaciones se realizan en UI para feedback inmediato y de nuevo en PostgreSQL como autoridad final.

El catálogo público Beta 0.2 ya consulta `map_entities` y `entity_tags` filtrando `publication_status = 'published'` bajo RLS. Por ello publicar o archivar actualiza esa proyección sin reemplazar todavía toda la experiencia Beta 0.1; esa transición sigue perteneciendo a MAP-028.

## Persistencia atómica

Guardar una entidad afecta tres superficies relacionadas:

- `map_entities`;
- `entity_tags`;
- `entity_player_dispositions`.

Hacer tres llamadas REST independientes permitiría estados parciales si una relación fallase después de modificar la entidad. MAP-019 añade la migración `20260807154000_add_admin_map_entity_editor_rpc.sql` con dos funciones `SECURITY INVOKER`:

- `admin_get_map_entity_editor(text)` devuelve un snapshot administrativo, blockers de borrado y una revisión de relaciones;
- `admin_save_map_entity(...)` guarda entidad, tags y disposiciones dentro de una única transacción.

Las funciones no elevan privilegios. Exigen `current_user_is_admin()`, se ejecutan como el rol llamador, respetan RLS y grants existentes y solo conceden `EXECUTE` a `authenticated`. `anon` no puede ejecutarlas.

No se añaden service-role keys ni otros secretos, ni se cambian Auth, usuarios o allowlists.

## Concurrencia

El editor evita sobrescrituras silenciosas en dos niveles:

1. `map_entities.updated_at` bloquea una escritura cuando otra edición ya modificó la entidad;
2. `relations_revision` resume tags y disposiciones con sus `updated_at` y detecta relaciones modificadas mientras el editor estaba abierto.

La RPC serializa las operaciones sobre una misma entidad mediante un advisory transaction lock y vuelve a comprobar las revisiones después de adquirir los locks de filas relevantes.

En el cliente, `AdminMapEntityController` utiliza generaciones y `AbortController` para:

- descartar una respuesta antigua que llegue después de una carga nueva;
- cancelar una carga al cerrar el editor;
- impedir doble submit;
- dejar de aceptar mutaciones si desaparece autorización o conectividad.

Los `401` y `403` invalidan el modo administrativo mediante `AdminAuthController`. Conflictos de concurrencia, constraints, relaciones inválidas, timeouts y errores de red se convierten a mensajes de dominio; no se muestran bodies ni mensajes internos de PostgreSQL/PostgREST.

## Archivado y eliminación física

Archivar es el flujo normal de retirada. El borrado físico es excepcional y la UI solo lo ofrece si el snapshot confirma:

- `published_at is null`;
- ningún alias;
- ningún tag explícito;
- ningún nombre geográfico;
- ninguna nota pública;
- ningún evento de localización;
- ninguna solicitud convertida.

La matriz `entity_player_dispositions` es una relación técnica creada automáticamente y usa `ON DELETE CASCADE`; no convierte por sí sola un borrador en contenido protegido.

La eliminación se envía además con `id + updated_at`. Incluso si una relación aparece durante la confirmación, las foreign keys y el trigger de protección de contenido publicado vuelven a bloquear la operación en PostgreSQL. No se eliminan relaciones automáticamente para forzar un borrado.

## Seguridad y disponibilidad

Las mutaciones solo quedan habilitadas cuando se cumplen simultáneamente:

- sesión restaurada o iniciada;
- autorización administrativa real;
- backend público en estado `connected`.

Manipular el DOM no evita RLS ni los grants. Si Auth o el CRUD administrativo fallan, el runtime público sigue separado y conserva snapshot/fallback y navegación del mapa.

El repositorio administrativo lee la sesión de `sessionStorage` justo antes de cada request protegido; no cachea un JWT dentro del repositorio ni lo comparte con el catálogo público.

## Pruebas

MAP-019 amplía las capas de prueba con:

- Vitest de bounds, validación, lifecycle, borrado y controlador;
- integración del repositorio Supabase para headers, RPC, lock optimista, borrado, `401`, `403` y normalización de SQLSTATE;
- pgTAP para autorización, RLS, borradores, publicación, archivado, atomicidad, relaciones inválidas, borrado y concurrencia;
- Playwright para acceso anónimo, personaje, emplazamiento, click/drag, entrada de coordenadas por teclado, draft, recarga, preview, publicar, archivar, errores, sesión caducada, confirmación destructiva, foco y ancho móvil.

La evidencia definitiva es la CI completa del SHA que se fusione; una ejecución verde de un SHA anterior deja de ser válida en cuanto cambia la rama.
