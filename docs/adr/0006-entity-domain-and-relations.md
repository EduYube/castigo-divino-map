# ADR 0006 — Dominio de entidades y relaciones de Beta 0.2

- Estado: aceptado
- Fecha: 2026-08-05
- Issue: MAP-015

## Contexto

MAP-014 creó el esquema físico y la seguridad base de Supabase a partir de la arquitectura aprobada en MAP-013. El primer contrato todavía contenía decisiones provisionales: una única disposición global por entidad, `unknown`, una relación estática `character_locations`, aliases geográficos almacenados como arrays y ausencia de tags propios para notas públicas.

Beta 0.2 necesita representar dos perspectivas de jugador independientes, entidades completas sin marcador permanente, un nomenclátor cartográfico ligero y un rastro público de avistamientos y salidas de personajes. El modelo debe seguir siendo genérico, público por diseño y administrable en el futuro sin incorporar nombres reales de campaña a migraciones o fixtures.

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

El modelo permite dos jugadores en la carga inicial y más jugadores en el futuro sin migrar el esquema. Los fixtures usan identidades ficticias y genéricas.

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

La última posición pública se deriva del evento publicado más reciente:

- un último `sighting` señala la última posición conocida;
- un último `departure` indica desde dónde partió, pero no dónde está;
- sin eventos publicados no hay posición pública conocida.

### Identidad histórica

Tras la primera publicación no pueden cambiar silenciosamente los extremos identificadores de aliases, tags, notas, nombres geográficos ni eventos de localización. Una corrección semántica requiere archivar o retirar el registro y crear otro.

Los textos descriptivos pueden corregirse sin alterar la identidad histórica.

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
2. contracción de la columna global, el array de aliases y `character_locations`;
3. hardening de identidades históricas y solicitudes.

Las cinco migraciones de MAP-014 permanecen inmutables.

## Compatibilidad

El catálogo estático de Beta 0.1 y el parámetro público `place` permanecen sin cambios en MAP-015. El nuevo contrato TypeScript se añade de forma paralela. MAP-028 deberá demostrar equivalencia de búsqueda, filtros, fichas, coordenadas y URLs antes de retirar el adaptador estático.

La representación visual de disposiciones múltiples se resolverá en MAP-022. No se reducirá una combinación de perspectivas a un único color global.

## Consecuencias

### Positivas

- NPC y ubicaciones expresan relaciones independientes con cada jugador.
- `unknown` deja de introducir ambigüedad.
- El esquema puede añadir jugadores sin nuevas columnas.
- Las entidades buscables sin pin no se confunden con el nomenclátor.
- El recorrido público de un personaje conserva pistas anteriores.
- Las notas mantienen sus tags de Beta 0.1.
- Las relaciones publicadas son auditables y estables.

### Costes

- La proyección pública debe agrupar la matriz de disposiciones.
- El frontend deberá distinguir marcadores permanentes, resaltados temporales y eventos históricos.
- Las operaciones administrativas necesitan transacciones para publicar extremos y relaciones de forma coherente.
- La retirada definitiva del catálogo estático queda condicionada a MAP-028.
