# CRUD administrativo de personajes y emplazamientos

MAP-019 incorpora el editor administrativo de `map_entities` para personajes y emplazamientos sin cambiar la frontera pública definida para Beta 0.2 ni adelantar la transición completa reservada a MAP-028. MAP-020 amplía este runtime con la administración normalizada de relaciones personaje–emplazamiento.

## Responsabilidades

El flujo administrativo de entidades se divide en las mismas capas que el resto de la aplicación:

- `src/domain/adminMapEntities.ts` define la entidad editable, referencias, relaciones, disposiciones y reglas de borrado;
- `src/domain/adminMapEntityValidation.ts` aplica validaciones inmediatas de UX sin sustituir constraints, triggers o RLS;
- `src/data-access/adminMapEntities.ts` define el puerto administrativo y el vocabulario normalizado de errores;
- `src/application/adminMapEntityController.ts` coordina cargas, mutaciones, cancelación, doble submit y descarte de respuestas obsoletas;
- `src/infrastructure/supabase/adminMapEntityRepository.ts` implementa el puerto contra Supabase y obtiene el JWT administrativo vigente solo al realizar una operación protegida;
- `src/app/adminMapEntities.ts` construye la UI accesible;
- `src/map/adminEntityEditorMap.ts` encapsula exclusivamente la interacción Leaflet del selector visual.

MAP-020 añade una segunda cadena, separada de la edición de la entidad principal:

- `src/domain/characterLocationRelations.ts` define estados, draft, referencias y clave lógica;
- `src/domain/characterLocationRelationValidation.ts` ofrece feedback inmediato sobre tipos, lifecycle y duplicados;
- `src/data-access/adminCharacterLocationRelations.ts` define el puerto y errores normalizados;
- `src/application/adminCharacterLocationRelationController.ts` coordina carga, alta, cambio de estado, retirada y cancelación;
- `src/infrastructure/supabase/adminCharacterLocationRelationRepository.ts` usa Data API ordinaria bajo RLS y concurrencia optimista;
- `src/app/adminCharacterLocationRelations.ts` presenta el editor accesible y responsive.

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

El editor de entidad cubre:

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

El editor de relaciones de MAP-020 permite seleccionar:

- un personaje existente no archivado;
- un emplazamiento existente no archivado;
- `present`, `associated` o `last-seen`;
- lifecycle `draft` o `published`, y retirada explícita a `archived`.

Los extremos de una relación existente son inmutables. La UI evita ofrecer una pareja ya existente, pero la clave primaria `(character_id, location_id)` sigue siendo la protección autoritativa frente a duplicados o carreras.

## Previsualización

La previsualización de MAP-019 se construye exclusivamente desde el draft de entidad en memoria y no ejecuta ninguna mutación. Presenta el mismo conjunto de datos públicos relevantes que se guardaría:

- nombre;
- tipo;
- categoría;
- etiquetas;
- coordenadas;
- visibilidad cartográfica;
- disposiciones.

Guardar un borrador o abrir su preview no cambia `publication_status` a `published` ni lo hace visible para `anon`.

Las relaciones personaje–emplazamiento no se duplican dentro de ese draft. MAP-020 mantiene su fuente de verdad en `character_location_relations`; las fichas públicas consumen la proyección compartida del catálogo Beta 0.2.

## Publicación y archivado

La publicación sigue el lifecycle ya definido por ADR 0005:

- `draft → published` permitido;
- `published → archived` permitido;
- `archived → published` prohibido directamente;
- para republicar, una entidad o relación archivada debe volver antes a `draft`.

Una entidad publicada requiere categoría publicada. Sus relaciones de tags seleccionadas también deben referenciar tags publicados. Estas comprobaciones se realizan en UI para feedback inmediato y de nuevo en PostgreSQL como autoridad final.

Una relación personaje–emplazamiento publicada exige que ambos extremos estén publicados y sean respectivamente `character` y `location`. Una relación activa no puede apuntar a un extremo archivado.

MAP-020 define “retirar” como archivar la relación. No se usa `DELETE` como operación editorial normal. Si un personaje o emplazamiento conserva cualquier relación no archivada, PostgreSQL bloquea el archivado de la entidad hasta que el administrador retire explícitamente esas relaciones. No existen cascadas implícitas de contenido editorial.

El catálogo público Beta 0.2 consulta `map_entities` y el resto de relaciones bajo RLS. Para `character_location_relations`, `anon` solo puede seleccionar `character_id`, `location_id` y `relation_status`; RLS oculta borradores, archivados y relaciones con extremos no públicos. Publicar o archivar actualiza esa proyección sin reemplazar todavía toda la experiencia Beta 0.1; esa transición sigue perteneciendo a MAP-028.

## Persistencia atómica

Guardar una entidad afecta tres superficies relacionadas:

- `map_entities`;
- `entity_tags`;
- `entity_player_dispositions`.

Hacer tres llamadas REST independientes permitiría estados parciales si una relación fallase después de modificar la entidad. MAP-019 añade la migración `20260807154000_add_admin_map_entity_editor_rpc.sql` con dos funciones `SECURITY INVOKER`:

- `admin_get_map_entity_editor(text)` devuelve un snapshot administrativo, blockers de borrado y una revisión de relaciones;
- `admin_save_map_entity(...)` guarda entidad, tags y disposiciones dentro de una única transacción.

Las funciones no elevan privilegios. Exigen `current_user_is_admin()`, se ejecutan como el rol llamador, respetan RLS y grants existentes y solo conceden `EXECUTE` a `authenticated`. `anon` no puede ejecutarlas.

MAP-020 no añade una RPC. Crear, cambiar `relation_status`, publicar o retirar una relación son mutaciones atómicas de una sola fila y se realizan contra `character_location_relations` mediante Data API normal, RLS y grants de columna. Las funciones añadidas por su migración son triggers internos bajo el esquema `private`, no funciones expuestas a Data API.

No se añaden service-role keys ni otros secretos, ni se cambian Auth, usuarios o allowlists.

## Concurrencia

El editor de entidades evita sobrescrituras silenciosas en dos niveles:

1. `map_entities.updated_at` bloquea una escritura cuando otra edición ya modificó la entidad;
2. `relations_revision` resume tags y disposiciones con sus `updated_at` y detecta relaciones modificadas mientras el editor estaba abierto.

La RPC serializa las operaciones sobre una misma entidad mediante un advisory transaction lock y vuelve a comprobar las revisiones después de adquirir los locks de filas relevantes.

MAP-020 añade dos protecciones complementarias:

1. la PK compuesta impide crear concurrentemente la misma pareja personaje–emplazamiento;
2. los `PATCH` administrativos filtran por la pareja y el `updated_at` leído; una respuesta de cero filas se trata como `stale-write` y exige recarga.

El trigger de validación bloquea ambos extremos con `FOR SHARE` durante la mutación, evitando que una relación se valide como activa o publicable a la vez que otra transacción archiva uno de sus extremos.

En el cliente, los controladores utilizan generaciones y `AbortController` para:

- descartar una respuesta antigua que llegue después de una carga nueva;
- cancelar una carga al cerrar el editor;
- impedir doble submit;
- dejar de aceptar mutaciones si desaparece autorización o conectividad.

Los `401` y `403` invalidan el modo administrativo mediante `AdminAuthController`. Conflictos de concurrencia, constraints, relaciones inválidas, timeouts y errores de red se convierten a mensajes de dominio; no se muestran bodies ni mensajes internos de PostgreSQL/PostgREST.

## Archivado y eliminación física

Archivar es el flujo normal de retirada. El borrado físico de una entidad es excepcional y la UI solo lo ofrece si el snapshot de MAP-019 confirma:

- `published_at is null`;
- ningún alias;
- ningún tag explícito;
- ningún nombre geográfico;
- ninguna nota pública;
- ningún evento de localización;
- ninguna solicitud convertida.

La matriz `entity_player_dispositions` es una relación técnica creada automáticamente y usa `ON DELETE CASCADE`; no convierte por sí sola un borrador en contenido protegido.

MAP-020 añade una FK `RESTRICT` desde `character_location_relations` hacia ambos extremos y no borra relaciones automáticamente para forzar una purga. Aunque el snapshot de MAP-019 no replique esa relación dentro de la entidad, PostgreSQL vuelve a bloquear cualquier eliminación que todavía tenga una fila relacionada. Para relaciones publicadas o anteriormente publicadas, el flujo normal y documentado es conservarlas archivadas.

La eliminación de entidad se envía además con `id + updated_at`. Incluso si una relación aparece durante la confirmación, las foreign keys y los triggers de protección vuelven a bloquear la operación en PostgreSQL.

## Seguridad y disponibilidad

Las mutaciones solo quedan habilitadas cuando se cumplen simultáneamente:

- sesión restaurada o iniciada;
- autorización administrativa real;
- backend público en estado `connected`.

Manipular el DOM no evita RLS ni los grants. Si Auth o el CRUD administrativo fallan, el runtime público sigue separado y conserva snapshot/fallback y navegación del mapa.

Los repositorios administrativos leen la sesión de `sessionStorage` justo antes de cada request protegido; no cachean un JWT dentro del repositorio ni lo comparten con el catálogo público.

La lectura pública de MAP-020 usa solo la clave publicable. No solicita `publication_status` ni timestamps de la relación y depende de RLS para decidir qué filas puede ver `anon`.

## Accesibilidad y móvil

El editor de relaciones usa controles nativos etiquetados, mensajes asociados mediante `aria-describedby`, estados live para carga/errores y restauración de foco al cerrar. Todas las acciones principales son operables por teclado.

En viewports de hasta `640px`, filas, toolbar y acciones pasan a una sola columna y los controles ocupan el ancho disponible. Playwright cubre activación por teclado y un viewport móvil de `390 × 844`.

## Pruebas

MAP-019 amplía las capas de prueba con:

- Vitest de bounds, validación, lifecycle, borrado y controlador;
- integración del repositorio Supabase para headers, RPC, lock optimista, borrado, `401`, `403` y normalización de SQLSTATE;
- pgTAP para autorización, RLS, borradores, publicación, archivado, atomicidad, relaciones inválidas, borrado y concurrencia;
- Playwright para acceso anónimo, personaje, emplazamiento, click/drag, entrada de coordenadas por teclado, draft, recarga, preview, publicar, archivar, errores, sesión caducada, confirmación destructiva, foco y ancho móvil.

MAP-020 añade:

- unitarios de dominio, validación, controlador y proyección estable;
- integración del repositorio para JWT just-in-time, columnas suministrables, SQLSTATE y `updated_at` obsoleto;
- pgTAP para enum, PK, tipos de extremos, duplicados, archivado, publicación segura, RLS, grants y retirada;
- Playwright para lectura pública sin JWT administrativo, alta, cambio de estado, prevención de duplicados, retirada, teclado y móvil.

La evidencia definitiva es la CI completa del SHA que se fusione; una ejecución verde de un SHA anterior deja de ser válida en cuanto cambia la rama.
