# Modelo de datos de campaña

- Versión de contrato: Beta 0.2
- Estado: dominio físico y semántico definido por MAP-014 y MAP-015
- Fecha: 2026-08-05

## Propósito

Este documento define el contrato compartido por PostgreSQL, las migraciones, la Data API, el snapshot público y el frontend de la Beta 0.2. Sustituye progresivamente al catálogo TypeScript de Beta 0.1 como fuente de verdad persistente, conservando sus IDs, slugs, coordenadas, tags, notas y URLs mientras se demuestra equivalencia funcional.

Todo dato que PostgreSQL entregue al navegador o que se incluya en un snapshot debe considerarse público. Las notas privadas, secretos de campaña, identidades reales de participantes y credenciales no pertenecen a este modelo.

## Principios

- Los tipos de entidad, la visibilidad cartográfica y las disposiciones por jugador son dimensiones independientes.
- Una disposición siempre expresa la relación entre una entidad y un jugador concreto.
- IDs y slugs publicados son estables y no se reutilizan.
- Las relaciones publicadas conservan su identidad histórica.
- Las coordenadas usan el espacio `3600 × 2329` de Beta 0.1.
- PostgreSQL aplica restricciones, referencias, transiciones, RLS y grants mínimos.
- La Data API y el snapshot exponen la misma semántica pública.
- Beta 0.2 persiste e indexa únicamente nombres en inglés.

## Tipos cerrados

### `entity_type`

- `character`
- `location`

### `map_visibility`

- `pin`: entidad completa con marcador permanente.
- `search_only`: entidad completa, buscable y con ficha, pero sin marcador permanente.

`search_only` no oculta datos. La fila sigue siendo pública bajo las mismas reglas RLS y puede centrar o resaltar temporalmente el mapa.

### `player_disposition`

- `ally`
- `enemy`
- `neutral`

No existe `unknown`. La ausencia de evidencia a favor o en contra se expresa como `neutral`.

### `character_location_event_type`

- `sighting`
- `departure`

### `publication_status`

- `draft`
- `published`
- `archived`

### `request_status`

- `pending`
- `accepted`
- `rejected`
- `converted`
- `archived`

Una solicitud pública no comparte `publication_status` con contenido editorial y nunca publica una entidad automáticamente.

## Identificadores

### IDs públicos

Los IDs son texto estable con prefijo:

- entidades: `entity-...` o el ID histórico `place-...`;
- jugadores: `player-...`;
- categorías: `category-...`;
- notas: `note-...`;
- nombres geográficos: `geo-...`;
- eventos de localización: `location-event-...` o IDs históricos `relation-...` migrados;
- etiquetas: kebab-case legible;
- relaciones editoriales: prefijos específicos y estables.

Los IDs publicados quedan reservados incluso tras una purga excepcional. No se introduce un UUID público obligatorio para el contenido editorial.

### Slugs

- Son únicos en su espacio público.
- Pueden cambiar mientras el registro nunca se haya publicado.
- Quedan congelados tras la primera publicación.
- Un nombre visible puede cambiar sin cambiar el slug.
- Un slug retirado no se reasigna.

### Idioma y normalización

- Los nombres principales declaran `name_language = 'en'`.
- Los aliases declaran `language = 'en'`.
- Otros idiomas requerirán una evolución posterior del contrato.
- La normalización aplica eliminación de diacríticos, minúsculas, separación de puntuación y colapso de espacios.
- Nombres y aliases publicados no pueden crear colisiones ambiguas dentro de su espacio de búsqueda.

## Entidades y clasificación

### `map_entities`

Registro común de personajes y emplazamientos.

| Campo | Invariante |
|---|---|
| `id` | Texto estable y único. |
| `slug` | Único y estable tras publicar. |
| `entity_type` | `character` o `location`; inmutable. |
| `visibility` | `pin` o `search_only`. |
| `name`, `normalized_name` | Nombre principal público y valor derivado de búsqueda. |
| `name_language` | `en` en Beta 0.2. |
| `summary`, `description` | Texto público plano. |
| `x`, `y` | Coordenadas finitas dentro de `3600 × 2329`. |
| `category_id` | Categoría existente; publicada cuando la entidad se publica. |
| `publication_status` | Ciclo editorial. |
| timestamps | Gestionados por PostgreSQL. |

`map_entities` no contiene una disposición global. Tanto personajes como emplazamientos usan disposiciones por jugador.

### `players`

Define las perspectivas públicas respecto a las que se expresa una disposición.

| Campo | Invariante |
|---|---|
| `id`, `slug` | Estables y reservados después de publicar. |
| `display_name` | Nombre público de la perspectiva. |
| `name_language` | `en` en Beta 0.2. |
| `publication_status` | Solo jugadores publicados participan en la proyección pública. |

El esquema admite más jugadores sin añadir columnas. Las semillas de desarrollo utilizan identidades ficticias.

### `entity_player_dispositions`

Matriz completa entre entidades y jugadores.

| Campo | Invariante |
|---|---|
| `entity_id` | Entidad existente. |
| `player_id` | Jugador existente. |
| `disposition` | `ally`, `enemy` o `neutral`. |

La clave primaria es `(entity_id, player_id)`. Triggers crean una fila neutral al añadir una entidad o un jugador. El navegador administrativo solo puede actualizar `disposition`; no puede insertar ni eliminar filas de la matriz.

Ejemplo válido:

```text
Entidad: un NPC
Jugador A: ally
Jugador B: neutral
```

También es válido que una ubicación sea `enemy` para un jugador y `ally` para otro.

### `categories`, `tags` y `entity_tags`

- Cada entidad tiene una categoría principal.
- Los tags son clasificación transversal reutilizable.
- `entity_tags` no admite parejas duplicadas.
- Una relación solo es pública cuando sus extremos y la relación están publicados.
- Una categoría o tag usado por relaciones publicadas no puede retirarse sin resolver antes sus consumidores.

## Nombres y contenido editorial

### `entity_aliases`

Los aliases de entidades son registros normalizados independientes.

- pertenecen a una entidad;
- declaran idioma;
- tienen ciclo editorial propio;
- no pueden publicar un alias de una entidad no publicada;
- `entity_id` queda inmutable después de la primera publicación.

### `public_notes`

Contenido editorial público separado de la descripción principal.

- `id` y `slug` estables;
- `entity_id` identifica la ficha propietaria;
- `title` y `body` son texto plano público;
- `sort_order` es no negativo y único dentro de la entidad;
- una nota publicada exige una entidad publicada;
- `entity_id` queda congelado después de publicar.

### `public_note_tags`

Restaura el contrato de Beta 0.1 por el que las notas poseen tags propios.

- pareja única `(note_id, tag_id)`;
- una relación publicada exige nota, entidad y tag publicados;
- sus extremos quedan inmutables tras la primera publicación.

## Nomenclátor cartográfico

### Diferencia entre entidad `search_only` y `geographic_names`

Una entidad `search_only` es una ficha completa: tiene categoría, tags, disposiciones, notas, relaciones y coordenadas. Solo se omite su marcador permanente.

Un `geographic_name` es un registro ligero para localizar texto o accidentes geográficos del mapa. No necesita categoría, tags, disposiciones, notas ni ficha propia.

Regla práctica:

```text
¿Tiene información propia, clasificación o relaciones? -> map_entity
¿Solo hay que encontrar el nombre escrito en el mapa?  -> geographic_name
```

### `geographic_names`

| Campo | Invariante |
|---|---|
| `id`, `slug` | Estables y reservados. |
| `name`, `normalized_name` | Nombre público y valor de búsqueda. |
| `language` | `en`. |
| `x`, `y` | Punto al que centrar el mapa. |
| `recommended_zoom` | Zoom opcional dentro del rango permitido. |
| `entity_id` | Enlace opcional únicamente a una entidad `location`. |
| `publication_status` | Ciclo editorial propio. |

`entity_id` significa que el nombre cartográfico y la ficha representan la misma ubicación. No significa contención territorial, propiedad ni posición de un personaje.

Un resultado sin `entity_id` centra y resalta el mapa. Un resultado enlazado puede además abrir la ficha de la ubicación.

### `geographic_name_aliases`

Los aliases geográficos se almacenan como filas normalizadas, no como un array.

- idioma y estado editorial por alias;
- unicidad por nombre geográfico;
- ausencia de colisiones públicas entre nombres principales y aliases;
- identidad del nombre geográfico congelada tras publicar.

## Rastro público de personajes

### `character_location_events`

Representa noticias públicas cronológicas sobre la posición de un personaje. Sustituye a la relación estática `character_locations`.

| Campo | Invariante |
|---|---|
| `id` | Identificador estable del acontecimiento. |
| `character_id` | Entidad existente de tipo `character`. |
| `event_type` | `sighting` o `departure`. |
| `location_entity_id` | Ubicación completa opcional de tipo `location`. |
| `geographic_name_id` | Nombre geográfico opcional. |
| `x`, `y` | Coordenadas libres opcionales y siempre en pareja. |
| `location_label` | Descripción pública opcional del punto. |
| `summary` | Texto público breve de la pista. |
| `language` | `en`. |
| `observed_at` | Momento del mundo conocido públicamente; opcional. |
| `related_sighting_id` | Avistamiento anterior opcional del mismo personaje. |
| `publication_status` | Ciclo editorial. |

Cada evento debe tener al menos una fuente de ubicación: entidad, nombre geográfico o coordenadas.

Un personaje puede:

- no tener ninguna posición conocida;
- tener múltiples avistamientos publicados;
- abandonar un lugar con destino desconocido;
- aparecer en una entidad, un nombre geográfico o un punto en mitad de la nada.

Una salida relacionada:

- debe apuntar a un evento `sighting`;
- debe pertenecer al mismo personaje;
- no puede precederlo cuando ambas fechas sean conocidas;
- exige que el avistamiento esté publicado si la salida se publica.

La última pista se deriva ordenando eventos publicados por `observed_at` y, como desempate, por creación. No se sobrescriben acontecimientos anteriores ni se dibuja una ruta exacta que los datos no demuestren.

Después de publicar quedan congelados personaje, tipo, referencias de ubicación, coordenadas, idioma, fecha observada y avistamiento relacionado. Una corrección semántica requiere retirar el evento y crear otro.

## Solicitudes públicas

### `public_requests`

Entrada no confiable de visitantes mediante una RPC cerrada.

- El ID, estado inicial y timestamps los genera PostgreSQL.
- El visitante solo aporta los campos expresamente permitidos.
- Toda solicitud comienza `pending` sin campos de moderación.
- Las transiciones son cerradas y el moderador se deriva de `auth.uid()`.
- Una solicitud convertida exige una entidad `draft`, del mismo tipo solicitado y con visibilidad `pin`.
- El destino convertido queda inmutable y no puede pertenecer a otra solicitud convertida.
- Una solicitud moderada no puede eliminarse físicamente; se archiva.

La futura interfaz administrativa consumirá estas reglas sin sustituirlas por validación de frontend.

## Seguridad y publicación

### Lectura pública

RLS entrega únicamente:

- categorías, tags, jugadores y entidades publicados;
- disposiciones cuyos dos extremos son públicos;
- aliases, notas y relaciones con extremos públicos;
- nombres geográficos y aliases publicados;
- eventos publicados cuyos extremos referenciados también son públicos.

`search_only` no modifica la política de lectura.

### Escritura administrativa

- La allowlist `private.admin_users` decide quién es administrador.
- RLS limita filas y grants de columna limitan campos suministrables.
- Campos normalizados, timestamps, IDs y auditoría no se confían al navegador.
- Los cambios de estado y validaciones referenciales se ejecutan en PostgreSQL.

### Ciclo editorial

Transiciones permitidas:

```text
draft -> published
draft -> archived
published -> draft
published -> archived
archived -> draft
```

`archived -> published` exige volver primero a `draft`.

`published_at` se fija en la primera publicación y no se reinicia. El contenido publicado o anteriormente publicado no se elimina físicamente mediante la aplicación.

## Proyección y snapshot público

El contrato TypeScript vive en `src/data/beta02-model.ts`.

La proyección pública contiene:

```ts
interface PublicCatalogSnapshotV2 {
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly categories: readonly PublicCategory[];
  readonly tags: readonly PublicTag[];
  readonly players: readonly PublicPlayer[];
  readonly entities: readonly PublicMapEntity[];
  readonly dispositions: readonly PublicEntityPlayerDisposition[];
  readonly notes: readonly PublicNote[];
  readonly geographicNames: readonly PublicGeographicName[];
  readonly characterLocationEvents: readonly PublicCharacterLocationEvent[];
}
```

Reglas:

- JSON UTF-8 determinista y con orden estable;
- checksum sobre la representación canónica sin el propio checksum;
- Data API y snapshot usan la misma semántica;
- un snapshot inválido hace fallar CI;
- no se incluyen usuarios, solicitudes, campos privados ni timestamps internos innecesarios.

## Compatibilidad con Beta 0.1

El catálogo estático actual permanece operativo hasta MAP-028. No se modifica en MAP-015 porque contiene contenido ficticio en castellano y un contrato limitado a lugares.

Se conservan:

- IDs históricos `place-...`;
- slugs y coordenadas;
- categorías, tags y tags de notas;
- el parámetro público `place`;
- búsqueda, filtros, fichas, historial y URLs actuales.

No se construye una adaptación con pérdida que convierta personajes, pistas o entidades `search_only` en marcadores de lugar. MAP-028 deberá demostrar equivalencia antes de hacer que la UI consuma el dominio Beta 0.2.

## Propiedad y control

MAP-015 no introduce `owners`. Los tags pueden describir características públicas, pero no deben codificar una relación de propiedad como si fuera texto libre. Un futuro modelo deberá definir primero si pueden poseer o controlar una ubicación personajes, jugadores, organizaciones, facciones u otras entidades.

## Política de contenido público

Está prohibido almacenar en tablas públicas, snapshots, bundles, logs, Issues o PRs:

- notas privadas del director de juego;
- identidades, motivaciones o consecuencias secretas;
- datos personales de participantes;
- credenciales, tokens, claves o URLs privadas;
- contenido oculto únicamente mediante CSS o filtros de frontend;
- HTML arbitrario o scripts.

Todo texto se almacena como texto plano. Markdown o contenido enriquecido requerirán ADR, sanitización con allowlist y pruebas XSS.
