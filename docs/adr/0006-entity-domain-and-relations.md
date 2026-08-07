# ADR 0006 — Dominio de entidades y relaciones de Beta 0.2

- Estado: aceptado
- Fecha: 2026-08-05; ampliado por MAP-020 el 2026-08-07
- Issues: MAP-015, MAP-020

## Contexto

MAP-014 creó el esquema físico y la seguridad base de Supabase a partir de la arquitectura aprobada en MAP-013. El primer contrato todavía contenía decisiones provisionales: una única disposición global por entidad, `unknown`, una relación estática `character_locations`, aliases geográficos almacenados como arrays y ausencia de tags propios para notas públicas.

Beta 0.2 necesita representar dos perspectivas de jugador independientes, entidades completas sin marcador permanente, un nomenclátor cartográfico ligero y un rastro público de avistamientos y salidas de personajes. El modelo debe seguir siendo genérico, público por diseño y administrable en el futuro sin incorporar nombres reales de campaña a migraciones o fixtures.

La revisión técnica de la PR #59 identificó dos invariantes que también deben sobrevivir operaciones concurrentes: la completitud de la matriz entidad–jugador y la validez bidireccional entre una salida y su avistamiento relacionado. También exigió hacer explícita la política aplicada a la disposición global heredada.

MAP-020 añade una necesidad distinta del historial cronológico: las fichas deben poder expresar de forma estable qué personajes importantes están presentes, asociados o fueron vistos por última vez en un emplazamiento. Esa relación no puede derivarse siempre de `character_location_events`, porque `associated` no es un acontecimiento y porque la ficha necesita un estado editorial vigente único por pareja sin borrar el historial de pistas.

## Decisión

### Entidades y visibilidad

`map_entities` mantiene los tipos cerrados `character` y `location`.

La visibilidad cartográfica es independiente del tipo y usa:

- `pin`: entidad completa con marcador permanente;
- `search_only`: entidad completa que participa en búsqueda, fichas y relaciones, pero no genera un marcador permanente.

Una entidad `search_only` sigue siendo pública bajo las mismas reglas RLS. La ausencia del marcador es una decisión de proyección y frontend, no una ocultación de datos.

### Disposición por jugador

Se elimina la disposición global de `map_entities` y el valor `unknown`.

Se crean `players` y `entity_player_dispositions`. Cada pareja entidad–jugador tiene exactamente uno de estos valores:

- `ally`;
- `enemy`;
- `neutral`.

La falta de evidencia a favor o en contra se expresa como `neutral`. No existe un estado implícito por ausencia de fila: triggers completan la matriz con `neutral` al crear una entidad o un jugador.

Los dos caminos de inserción adquieren el mismo `pg_advisory_xact_lock` antes de consultar la tabla opuesta. Así, una entidad y un jugador creados en transacciones concurrentes no pueden omitir su intersección. Una migración hacia delante ejecuta además un backfill idempotente y aborta si queda alguna pareja ausente.

El modelo permite dos jugadores en la carga inicial y más jugadores en el futuro sin migrar el esquema. Los fixtures usan identidades ficticias y genéricas.

#### Política para la disposición global heredada

Los valores globales de MAP-014 no identificaban a qué jugador pertenecía la relación. No existe una transformación semánticamente segura de un único `ally` o `enemy` global a varias perspectivas independientes.

La política adoptada es deliberada y uniforme:

- ningún valor global se propaga a un jugador concreto;
- cada nueva pareja entidad–jugador comienza como `neutral`;
- las disposiciones específicas se cargan o editan explícitamente después del upgrade;
- el upgrade automatizado parte de un fixture MAP-014 con una disposición global `ally` y verifica que aliases, eventos e identificadores se conservan mientras la nueva matriz comienza neutral.

Esta pérdida semántica está aceptada porque evita atribuir una relación a una perspectiva sin evidencia. No debe describirse como una conservación automática de las disposiciones de MAP-014.

### Nombres en inglés

Los nombres principales y aliases persistidos por Beta 0.2 declaran idioma `en`. La columna se conserva para evolución futura, pero otros idiomas no son válidos en esta beta.

### Nombres geográficos

`geographic_names` representa nombres escritos o localizables en el mapa. Es un registro ligero con nombre, coordenadas y zoom recomendado, no una ficha completa.

`geographic_names.entity_id` es opcional y solo puede apuntar a una `map_entity` de tipo `location`. Su significado es que el nombre cartográfico y la ficha describen la misma ubicación. No representa contención, propiedad ni posición de personajes.

Los aliases geográficos se normalizan en `geographic_name_aliases`. El array histórico se migra y se elimina mediante expand/contract.

### Tags de notas

`public_note_tags` restaura explícitamente la relación de tags propia de las notas públicas de Beta 0.1. Una relación solo es pública cuando nota, entidad y tag son públicos.

### Rastro público de personajes

`character_locations` se sustituye por `character_location_events`.

Cada evento es:

- `sighting`: el personaje fue visto o localizado;
- `departure`: se sabe que abandonó un punto.

Los eventos forman un historial; no se sobrescribe una única ubicación actual. Un evento puede localizarse mediante una entidad de tipo `location`, un `geographic_name`, coordenadas libres o una combinación válida. Esto permite registrar ciudades, bosques, regiones, caminos o puntos en mitad de la nada.

`observed_at` representa cuándo ocurrió la información dentro del mundo y es opcional. `published_at` representa cuándo se publicó en la aplicación.

Una salida puede enlazar opcionalmente un avistamiento anterior del mismo personaje. Cuando ambas fechas existen, la salida no puede preceder al avistamiento.

La relación se valida desde ambos lados y en todos los estados editoriales:

- al crear o modificar una salida, PostgreSQL bloquea el avistamiento con `FOR SHARE` y comprueba tipo, personaje, cronología y publicación;
- al modificar un avistamiento referenciado, PostgreSQL vuelve a comprobar todas sus salidas dependientes;
- un avistamiento referenciado no puede cambiar a `departure`, pasar a otro personaje ni moverse cronológicamente después de una salida dependiente;
- una salida publicada sigue exigiendo un avistamiento publicado;
- el bloqueo de fila serializa la creación de una salida con una modificación concurrente de su avistamiento.

La última posición pública se deriva del evento publicado más reciente:

- un último `sighting` señala la última posición conocida;
- un último `departure` indica desde dónde partió, pero no dónde está;
- sin eventos publicados no hay posición pública conocida.

### Relación editorial personaje–emplazamiento

MAP-020 añade `character_location_relations` como una relación normalizada separada del historial. Su identidad es la clave primaria compuesta `(character_id, location_id)`, por lo que no pueden coexistir dos estados editoriales para la misma pareja y no se duplican listas dentro de `map_entities`.

Los estados públicos cerrados son:

- `present`: presencia pública actual afirmada;
- `associated`: asociación pública relevante sin afirmar presencia actual;
- `last-seen`: último emplazamiento público relevante conocido para esa relación, sin afirmar presencia actual.

Un personaje puede mantener relaciones con varios emplazamientos y cada emplazamiento puede mostrar varios personajes. Los extremos son inmutables: cambiar de pareja crea otra relación.

La relación tiene lifecycle editorial propio `draft / published / archived`. Publicarla exige personaje y emplazamiento publicados y de tipos compatibles. Una relación activa no puede referenciar extremos archivados. PostgreSQL valida y bloquea ambos extremos durante la mutación para serializarla con archivados concurrentes.

“Retirar” significa archivar la relación, no borrarla. Una entidad con relaciones no archivadas no puede archivarse: el administrador debe retirarlas explícitamente primero. Esta decisión evita cascadas implícitas, relaciones públicas colgantes y pérdida de la identidad histórica de relaciones ya publicadas.

La creación concurrente de una pareja queda protegida por la PK. Las ediciones administrativas usan `updated_at` como revisión optimista; una escritura con revisión obsoleta afecta cero filas y se trata como conflicto.

No se añade una RPC para MAP-020. Crear, cambiar estado y retirar son operaciones atómicas de una sola fila y la Data API ordinaria con RLS y grants mínimos ofrece una superficie menor. Las funciones nuevas son exclusivamente triggers internos en `private`, con `search_path = ''`; no se exponen por la Data API.

La proyección pública de esta relación contiene únicamente `character_id`, `location_id` y `relation_status`. RLS exige que la relación y ambos extremos sean públicos. `anon` no recibe permisos sobre timestamps ni lifecycle editorial y las lecturas públicas no usan JWT administrativo.

### Identidad histórica

Tras la primera publicación no pueden cambiar silenciosamente los extremos identificadores de aliases, tags, notas, nombres geográficos, eventos de localización ni relaciones personaje–emplazamiento. Una corrección semántica requiere archivar o retirar el registro y crear otro cuando cambian sus extremos.

Los textos descriptivos y, en MAP-020, el estado de relación pueden corregirse sin alterar la identidad de la pareja.

### Solicitudes públicas

Una solicitud convertida debe apuntar a una entidad:

- en estado `draft`;
- del mismo `entity_type` solicitado;
- con visibilidad `pin`.

El destino queda inmutable y solo puede convertir una solicitud. Las solicitudes moderadas no pueden eliminarse físicamente. La futura interfaz administrativa consumirá estas reglas, pero no las sustituirá.

### Ownership

No se introduce todavía una relación de propiedad o control. Los tags pueden describir características, pero no sustituyen una relación de ownership. Esa relación requerirá definir primero qué tipos de sujeto pueden poseer o controlar una ubicación.

## Estrategia de migración

Se aplican únicamente migraciones hacia delante:

1. expansión del dominio y copia de datos heredados;
2. validación del backfill antes de la contracción;
3. contracción de la columna global, el array de aliases y `character_locations`;
4. hardening de identidades históricas y solicitudes;
5. hardening posterior a revisión para serializar la matriz y las relaciones entre salidas y avistamientos;
6. MAP-020 añade `character_location_relations`, su enum, RLS, grants, validación y guard de archivado sin modificar migraciones históricas.

Las migraciones ya aplicadas permanecen inmutables. Toda corrección se añade como una migración posterior.

El CI ejecuta dos rutas distintas:

- reconstrucción final desde cero con seed ficticio, pgTAP, lint y pruebas concurrentes;
- upgrade realista desde las cinco migraciones de MAP-014, con datos legacy insertados antes de aplicar MAP-015 y las migraciones posteriores.

La segunda ruta verifica el backfill de aliases y `character_locations`, la reserva de identificadores y la política explícita de reinicio neutral de disposiciones. MAP-020 no reinterpreta esos datos históricos para inventar relaciones editoriales vigentes.

## Compatibilidad

El catálogo estático de Beta 0.1 y el parámetro público `place` permanecen operativos. El contrato TypeScript Beta 0.2 se amplía con `characterLocationRelations` y helpers de proyección compartidos, pero MAP-020 no adelanta la transición pública completa de MAP-028.

La representación visual de disposiciones múltiples se resolverá en MAP-022. El rediseño de la ficha compacta y la ficha completa que consumirán estas relaciones permanece reservado a MAP-023 y MAP-024. No se reduce una combinación de perspectivas a un único color global ni se duplica la relación dentro de cada ficha.

El contrato TypeScript representa los eventos mediante una unión discriminada: un `sighting` siempre tiene `relatedSightingId: null`, mientras que solo un `departure` puede contener una referencia opcional.

## Consecuencias

### Positivas

- NPC y ubicaciones expresan relaciones independientes con cada jugador.
- `unknown` deja de introducir ambigüedad.
- El esquema puede añadir jugadores sin nuevas columnas.
- La matriz completa sobrevive inserciones concurrentes de sus dos extremos.
- Las entidades buscables sin pin no se confunden con el nomenclátor.
- El recorrido público de un personaje conserva pistas anteriores.
- Las salidas no pueden quedar invalidadas por cambios posteriores o concurrentes de su avistamiento.
- Las notas mantienen sus tags de Beta 0.1.
- Una pareja personaje–emplazamiento tiene una única fuente de verdad estable y sin duplicados.
- Archivar extremos no puede dejar relaciones públicas colgantes.
- Las relaciones publicadas son auditables y estables.
- La ruta de upgrade con datos MAP-014 forma parte de la validación automática.

### Costes

- La proyección pública debe agrupar la matriz de disposiciones y las relaciones personaje–emplazamiento.
- El frontend deberá distinguir marcadores permanentes, resaltados temporales, estados de relación y eventos históricos.
- Las operaciones administrativas complejas siguen necesitando transacciones cuando afectan varias tablas; MAP-020 evita una RPC innecesaria porque sus mutaciones son monofila.
- Las inserciones de entidades y jugadores se serializan brevemente mediante un lock advisory común.
- Las salidas relacionadas toman un lock compartido sobre el avistamiento durante la transacción.
- Archivar una entidad con relaciones activas requiere una retirada editorial explícita previa.
- Las disposiciones globales legacy requieren revisión editorial posterior porque se reinician a `neutral`.
- La retirada definitiva del catálogo estático queda condicionada a MAP-028.
