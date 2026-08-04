# Modelo de datos de campaña

- Versión de contrato: Beta 0.2
- Estado: arquitectura aceptada; SQL pendiente de MAP-014 y detalle de dominio pendiente de MAP-015
- Fecha: 2026-08-04

## Propósito

Este documento define el modelo conceptual y las invariantes que compartirán PostgreSQL, el frontend, las migraciones y el snapshot público de la Beta 0.2. Sustituye al catálogo TypeScript como fuente de verdad persistente, pero preserva sus IDs, slugs, coordenadas, relaciones públicas y reglas de seguridad.

El esquema SQL exacto se creará mediante migraciones versionadas. Los nombres aquí indicados son contratos recomendados; MAP-015 podrá ajustar normalización o nombres físicos sin cambiar las decisiones semánticas.

## Principios

- Todo dato entregado al navegador se considera público.
- Tipo, disposición y estado de publicación son dimensiones independientes.
- IDs y slugs publicados son estables y no se reutilizan.
- Las coordenadas pertenecen al contenido y mantienen el espacio `3600 × 2329` de Beta 0.1.
- PostgreSQL aplica restricciones, referencias, transiciones y RLS.
- El snapshot contiene exclusivamente una proyección de filas publicadas.
- Las notas privadas y secretos de campaña no pertenecen a este modelo.

## Tipos cerrados

### `entity_type`

- `character`
- `location`

### `disposition`

- `ally`
- `enemy`
- `neutral`
- `unknown`

La disposición es obligatoria para personajes. Los emplazamientos usarán `unknown` salvo que MAP-015 documente un significado público explícito; no se infiere a partir del tipo, categoría o color.

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

Una solicitud nunca comparte `publication_status` con contenido editorial y nunca se publica automáticamente.

## Identificadores

### IDs públicos

Los IDs son texto estable con prefijo, igual que en Beta 0.1:

- entidades: `entity-...` o el ID histórico `place-...` durante la migración;
- categorías: `category-...`;
- notas o secciones: `note-...`;
- relaciones: identificador técnico estable cuando sea necesario;
- etiquetas: ID legible en kebab-case, conservando el contrato existente.

Los IDs históricos se importan sin conversión. Los nuevos IDs se generan una sola vez, se validan en PostgreSQL y no se reutilizan, aunque la fila quede archivada o sea purgada por incidente.

No se introduce un UUID público obligatorio en Beta 0.2. Las tablas internas pueden usar UUID adicionales cuando aporten valor operativo, pero las referencias y URLs públicas conservan el identificador estable del dominio.

### Slugs

- Son únicos dentro de su espacio público y aptos para URL.
- Pueden cambiar mientras la entidad nunca se haya publicado.
- Quedan congelados tras la primera publicación.
- Un nombre visible puede cambiar sin cambiar el slug.
- Un slug retirado no se asigna a otra entidad.

### Nombres y alias

- `name` es el texto público principal.
- Los alias son registros normalizados independientes, no etiquetas.
- Beta 0.2 carga e indexa únicamente nombres en inglés.
- La columna de idioma se conserva para evolución futura, con valor inicial `en`.
- La normalización de búsqueda mantiene NFKD, eliminación de diacríticos, minúsculas, separación de puntuación y colapso de espacios.

## Entidades conceptuales

### `map_entities`

Registro común de personajes y emplazamientos posicionables.

| Campo | Invariante |
|---|---|
| `id` | Texto estable y único. |
| `slug` | Único, estable tras publicar. |
| `entity_type` | `character` o `location`. |
| `disposition` | Valor cerrado e independiente. |
| `name` | Texto público no vacío. |
| `summary` | Texto público breve, sin HTML confiable. |
| `description` | Texto público, sin contenido privado. |
| `x`, `y` | Números finitos dentro de `3600 × 2329`. |
| `category_id` | Referencia válida a categoría. |
| `publication_status` | `draft`, `published` o `archived`. |
| `published_at` | Obligatorio cuando se publica por primera vez; no se borra al retirar. |
| `archived_at` | Presente cuando el estado es `archived`. |
| `created_at`, `updated_at` | Timestamps UTC gestionados por base de datos. |

El nombre físico puede dividirse en tablas especializadas si MAP-015 demuestra una ventaja clara. En tal caso debe existir una proyección de dominio unificada para búsqueda, filtros, mapa y snapshot.

### `entity_aliases`

| Campo | Invariante |
|---|---|
| `id` | Identificador estable. |
| `entity_id` | Entidad existente. |
| `language` | `en` en Beta 0.2. |
| `value` | Texto público no vacío. |
| `normalized_value` | Valor derivado para colisiones y búsqueda. |
| `publication_status` | No puede hacer público un alias de entidad no publicada. |

No puede existir una colisión ambigua entre nombre y alias públicos tras normalización.

### `categories`

Clasificación principal y única por entidad.

| Campo | Invariante |
|---|---|
| `id` | Prefijo `category-`, estable. |
| `slug` | Único y estable tras publicar. |
| `name`, `description` | Texto público. |
| `publication_status` | Control editorial propio. |

Una entidad publicada no puede referenciar una categoría no publicada. Archivar una categoría con consumidores publicados requiere reasignarlos o retirarlos en la misma operación controlada.

### `tags`

Clasificación transversal reusable.

| Campo | Invariante |
|---|---|
| `id` | Kebab-case legible y estable. |
| `name`, `description` | Texto público. |
| `publication_status` | Control editorial propio. |

### `entity_tags`

Tabla de unión sin duplicados. Una relación solo es pública cuando entidad y etiqueta están publicadas.

### `public_notes`

Conserva la semántica de las notas públicas de Beta 0.1 y permite contenido editorial separado de la descripción principal.

| Campo | Invariante |
|---|---|
| `id`, `slug` | Estables. |
| `entity_id` | Entidad existente. |
| `title`, `body` | Texto público, no HTML confiable. |
| `publication_status` | Independiente, pero nunca visible si la entidad no está publicada. |
| `sort_order` | Entero no negativo y estable dentro de la entidad. |

### `character_locations`

Relación explícita entre personajes y emplazamientos.

- El extremo personaje debe tener `entity_type = 'character'`.
- El extremo emplazamiento debe tener `entity_type = 'location'`.
- La relación puede incluir un rótulo público y orden.
- Solo es pública cuando ambos extremos y la relación están publicados.
- No se duplican relaciones equivalentes.

### `geographic_names`

Nombres cartográficos buscables aunque no exista un pin visible.

- ID y slug estables.
- Nombre y alias en inglés.
- Coordenadas y zoom recomendado validados.
- Estado de publicación propio.
- Puede relacionarse opcionalmente con una entidad, pero no exige pin.

### `public_requests`

Entrada no confiable de visitantes.

| Campo | Regla |
|---|---|
| `id` | Generado por base de datos, nunca suministrado por el visitante. |
| `sender_name` | Longitud limitada; no acredita identidad. |
| `proposed_name` | Texto limitado. |
| `entity_type` | Lista cerrada permitida por el formulario. |
| `x`, `y` | Coordenadas válidas. |
| `description`, `reason` | Texto limitado y tratado como no confiable. |
| `request_status` | Forzado inicialmente a `pending`. |
| `created_at` | Generado por base de datos. |
| campos de moderación | Solo administrador; nunca aceptados desde la operación pública. |

No contiene categorías, etiquetas, código de campaña, estado de publicación ni referencias administrativas suministradas por el visitante.

### `private.admin_users`

Lista blanca de usuarios Auth autorizados.

- Vive en esquema no expuesto.
- Clave primaria `user_id` referenciada a `auth.users`.
- No se consulta directamente desde el navegador.
- Una función `private.is_admin()` encapsula la comprobación para RLS.

### Reserva de identificadores

Una tabla privada o mecanismo equivalente conserva IDs y slugs que no pueden reutilizarse después de una purga excepcional. No contiene el texto sensible eliminado.

## Ciclo de publicación

### Transiciones válidas

```text
draft ──> published
draft ──> archived
published ──> draft
published ──> archived
archived ──> draft
```

No se permite `archived -> published` ni una transición a un valor fuera del enum.

### Invariantes temporales

- `published_at` se fija en la primera publicación y no se reinicia al volver a borrador.
- `archived_at` se fija al archivar y se limpia al restaurar a borrador.
- `updated_at` cambia en toda mutación real.
- La transición debe ser atómica con las validaciones referenciales que exige el estado final.

### Eliminación física

Permitida solo para:

- borradores o solicitudes nunca publicados y sin referencias;
- importaciones fallidas antes de exposición;
- purga legal o de seguridad.

El contenido publicado se archiva. Una purga de contenido publicado requiere procedimiento manual, reserva de ID/slug, regeneración del snapshot y revisión de artefactos y logs.

## Proyección pública

La Data API y el snapshot deben producir la misma proyección semántica:

- entidades `published`;
- categorías y etiquetas `published` referenciadas por esas entidades;
- alias y notas `published` cuyas entidades estén publicadas;
- relaciones cuyos extremos estén publicados;
- nombres geográficos `published`;
- ningún usuario, solicitud, estado administrativo, correo, timestamp interno innecesario ni campo privado.

La proyección no debe depender de filtrar en JavaScript filas que PostgreSQL ya entregó. RLS impide la entrega; el frontend valida como defensa adicional.

## Contrato del snapshot

```ts
interface PublicCatalogSnapshot {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly categories: readonly PublicCategory[];
  readonly tags: readonly PublicTag[];
  readonly entities: readonly PublicMapEntity[];
  readonly notes: readonly PublicNote[];
  readonly characterLocations: readonly PublicCharacterLocation[];
  readonly geographicNames: readonly PublicGeographicName[];
}
```

Reglas:

- JSON UTF-8 determinista, con orden estable para producir diffs revisables.
- `schemaVersion` cambia solo cuando cambia el contrato.
- `generatedAt` usa ISO 8601 UTC.
- `sourceRevision` identifica la exportación o revisión de datos.
- `checksum` se calcula sobre la representación canónica sin el propio campo.
- El mismo validador runtime acepta respuesta remota y snapshot.
- Un snapshot inválido hace fallar CI.

## Validación por capas

### Frontend

- Feedback inmediato y accesible.
- Normalización de campos y coordenadas.
- No se considera una protección de seguridad.

### Operación/RPC

- Lista explícita de argumentos.
- Rechazo de campos adicionales.
- Forzado de valores de sistema.
- Errores genéricos que no revelan filas protegidas.

### PostgreSQL

- enums o checks para valores cerrados;
- `not null`, unicidad e índices;
- foreign keys y checks de coordenadas/longitud;
- triggers o funciones para transiciones y slugs;
- RLS para lectura y escritura;
- grants mínimos a `anon` y `authenticated`.

### Revisión editorial

La validación técnica no detecta spoilers o secretos redactados como texto público. Antes de publicar, la revisión humana confirma que todo el contenido es apto para cualquier visitante.

## Migración desde Beta 0.1

| Beta 0.1 | Beta 0.2 |
|---|---|
| `CampaignPlace` | `map_entities` con `entity_type = 'location'` |
| `CampaignCategory` | `categories` |
| `CampaignTag` | `tags` |
| `PublicNote` | `public_notes` |
| `aliases` | `entity_aliases` |
| `categoryId` | `category_id` |
| `tagIds` | `entity_tags` |
| `{ x, y }` | mismas coordenadas |
| slug público | mismo slug |
| ID prefijado | mismo ID |

La importación inicial se prueba como `draft`, se compara con el catálogo actual y se publica explícitamente. El adaptador estático permanece durante la transición hasta demostrar equivalencia de búsqueda, filtros, fichas y URLs.

## Política de contenido público

Está prohibido almacenar en tablas del alcance, snapshot, bundle, logs, Issues o PRs:

- notas privadas del director de juego;
- identidades, motivaciones, ubicaciones o consecuencias secretas;
- datos personales de participantes;
- credenciales, tokens, claves o URLs privadas;
- contenido oculto solo mediante CSS, flags o filtros del frontend;
- HTML arbitrario o scripts.

Todo texto se almacena como texto plano. Una futura incorporación de Markdown o contenido enriquecido requiere ADR, sanitización con allowlist y pruebas XSS antes de aceptarse.
