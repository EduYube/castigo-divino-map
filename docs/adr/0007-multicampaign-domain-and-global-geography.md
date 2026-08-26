# ADR 0007 — Dominio multicampaña y geografía global compartida

- Estado: Aceptada por implementación de MAP-053; pendiente del checkpoint humano de seguridad antes del merge
- Fecha: 2026-08-26
- Issue: MAP-053 / #149
- Baseline: v1.0 / MAP-052

## Contexto

La v1.0 persiste un único mundo de campaña de forma implícita. Entidades, jugadores, categorías, tags, notas, relaciones, acontecimientos, disposiciones y solicitudes públicas no contienen una identidad de campaña porque todo el contenido pertenece al mismo ámbito.

MAP-053 debe hacer que la campaña sea una dimensión real de dominio e integridad sin romper el baseline publicado. No es suficiente añadir un filtro al frontend: PostgreSQL debe impedir relaciones entre campañas distintas, RLS debe respetar el ámbito y el snapshot degradado debe representar más de una campaña sin duplicar la geografía base compartida.

Al mismo tiempo, el nomenclátor cartográfico (`geographic_names` y sus aliases) representa el mapa físico común. Un mismo topónimo puede existir en todas las campañas aunque su relación con una entidad editorial sea diferente en cada una. Por tanto, scopear el nomenclátor por campaña duplicaría identidad geográfica y haría divergir un índice que debe ser universal.

## Decisión

### Identidad de campaña

Se introduce `public.campaigns` como raíz persistente del dominio con:

- `id` UUID estable;
- `slug` estable y único;
- `name`;
- `status` `active | archived`;
- `display_order`;
- `created_at`, `updated_at` y `archived_at` gestionados por PostgreSQL.

La campaña que absorbe todo el baseline v1.0 es determinista:

- ID: `00000000-0000-4000-8000-000000000053`
- slug: `castigo-divino`
- nombre: `Castigo Divino`

`id` y `slug` no pueden mutarse. El archivado es reversible a nivel de estado, pero `archived_at` lo controla el backend y no el cliente.

### Datos scopeados por campaña

Las siguientes tablas pasan a tener un `campaign_id` obligatorio:

- `categories`;
- `tags`;
- `players`;
- `map_entities`;
- `entity_aliases`;
- `entity_tags`;
- `entity_player_dispositions`;
- `public_notes`;
- `public_note_tags`;
- `character_location_relations`;
- `character_location_events`;
- `public_requests`.

El scope de una fila existente es inmutable. Las referencias entre datos de campaña usan claves foráneas compuestas que incluyen `campaign_id`; de este modo una relación cross-campaign inválida falla incluso ejecutada por el propietario de la base y no depende de RLS para mantener integridad.

Se conservan los IDs y slugs históricos globalmente únicos. MAP-053 no introduce namespaces de URL ni recrea contenido existente. Esto mantiene los deep links de v1.0 y evita que una futura campaña pueda reapropiarse de una identidad ya publicada.

### Geografía global

`geographic_names` y `geographic_name_aliases` permanecen globales y no reciben `campaign_id`.

La relación histórica `geographic_names.entity_id`, que mezclaba el índice físico común con una entidad editorial de la única campaña, se normaliza en:

`campaign_geographic_entity_links(campaign_id, geographic_name_id, entity_id)`.

Esta tabla expresa que un topónimo global puede resolver a una ubicación diferente según la campaña. La combinación campaña/topónimo es única y un trigger estructural exige que el destino sea una entidad `location` de la misma campaña.

Durante la migración del baseline, todo `geographic_names.entity_id` existente se mueve a esta tabla para la campaña inicial, preservando los timestamps históricos del vínculo cuando están disponibles, y el campo legado queda a `NULL`. El índice geográfico no se duplica.

### Compatibilidad v1.0

Todas las filas preexistentes reciben automáticamente el `campaign_id` de la campaña inicial mediante migración forward-only. No se archivan, duplican ni recrean entidades.

Se preservan, según corresponda, IDs, slugs, coordenadas, categorías, tags, aliases, notas, relaciones personaje–localización, acontecimientos, disposiciones por jugador, `portrait_path`, audiencia `public/master`, estado editorial, trazas de moderación, `converted_entity_id` y timestamps históricos.

El valor por defecto del nuevo `campaign_id` se mantiene temporalmente en las tablas compatibles con clientes v1.0 para que las operaciones heredadas que no conocen aún la dimensión campaña continúen apuntando de forma determinista al mundo original. La aplicación nueva siempre scopea sus lecturas públicas explícitamente.

### Solicitudes públicas y moderación

Se añade `submit_public_request_v2(campaign_id, ...)`, que solo acepta una campaña activa. La firma heredada `submit_public_request(...)` se conserva y delega en la campaña inicial para compatibilidad.

`admin_moderate_public_request(...)` conserva el flujo de moderación existente, pero una conversión hereda obligatoriamente `request.campaign_id`. El draft convertido no puede aparecer en otra campaña.

La función de moderación conserva el propietario dedicado `atlas_public_request_moderator`. Las migraciones obtienen temporalmente membresía en ese rol únicamente para reemplazar la función y la revocan inmediatamente después.

### RLS y grants

El acceso público a datos scopeados exige simultáneamente:

1. campaña `active`;
2. estado publicable de la fila y de sus extremos cuando aplica;
3. `audience = 'public'` para entidades;
4. pertenencia coherente a la misma campaña.

`anon` y `authenticated` pueden descubrir campañas activas y leer el contenido público permitido. Un usuario autenticado que no está en `private.admin_users` no obtiene acceso administrativo. El administrador conserva la capacidad global de gestión sobre todas las campañas.

La geografía base publicada sigue siendo legible globalmente aunque un topónimo esté relacionado con una entidad Máster. Lo que no se expone es el vínculo campaña→topónimo→entidad si su destino no es público; así no se puede inferir contenido Máster por asociación.

Los grants se mantienen explícitos y mínimos. Las funciones `SECURITY DEFINER` fijan un `search_path` controlado, y el `EXECUTE` se revoca de `PUBLIC`/roles que no deban invocarlas y se concede solo a los roles previstos.

## Snapshot multicampaña

El snapshot evoluciona a `schemaVersion: 3` con tres dimensiones separadas:

- `campaigns`: catálogo público determinista de campañas activas;
- `campaignCatalogs`: un catálogo de dominio por `campaignId`;
- `geographicNames`: una sola copia del nomenclátor global.

Cada `campaignCatalog` contiene sus `geographicEntityLinks`, de forma que la relación geográfica es campaign-aware sin duplicar el topónimo.

El productor remoto enumera campañas activas, carga geografía global una vez y consulta las tablas de dominio con `campaign_id=eq.<id>`. El checksum SHA-256 cubre el contenido canónico completo y `sourceRevision` debe coincidir con él.

La aplicación conserva el contrato de consumo Beta 0.2 mientras no exista selector de campaña: el codec v3 valida todas las campañas y proyecta la campaña inicial a la forma v2. Esto mantiene UI, URLs y deep links existentes. La selección interactiva de campaña pertenece a una evolución posterior.

El lector continúa aceptando un snapshot v2 válido de v1.0 como compatibilidad de despliegue. El verificador remoto solo permite mantenerlo mientras Supabase tenga exactamente la campaña inicial; en cuanto existan varias campañas públicas exige regenerar v3, evitando que una representación incompleta pase CI.

El snapshot nunca serializa `audience` ni contenido Máster. Un vínculo geográfico a una entidad filtrada se rechaza en vez de degradarse silenciosamente.

## Migraciones y verificación

MAP-053 añade únicamente migraciones posteriores al baseline v1.0; no modifica migraciones ya aplicadas.

La suite de base de datos incluye:

- reconstrucción completa desde cero;
- lint de esquema;
- pgTAP de campañas, RLS, grants, RPCs y aislamiento;
- negativas cross-campaign;
- pruebas bajo `anon`, `authenticated` no admin y admin;
- rehearsal que reconstruye exactamente el baseline v1.0, crea un fixture representativo usando el RPC de moderación legado, aplica solo las migraciones MAP-053 y verifica preservación de identidad, relaciones, contenido y trazas.

El productor/verificador de snapshot añade además dos campañas sintéticas que comparten un único topónimo global, prueba proyecciones diferentes por campaña y usa canarios Máster para demostrar que no entran en el artefacto público.

## Consecuencias

### Positivas

- Campaña se convierte en frontera real de integridad y no en convención de frontend.
- Los errores cross-campaign se rechazan estructuralmente incluso sin RLS.
- El índice geográfico permanece único y reutilizable entre campañas.
- v1.0 conserva identidad, URLs y contenido sin recreación.
- El modo degradado puede representar múltiples campañas de forma determinista y verificable.
- La UI existente puede seguir consumiendo el contrato Beta 0.2 hasta que exista selección de campaña.

### Costes y riesgos operativos

- El despliegue que empiece a usar queries `campaign_id` requiere que las migraciones MAP-053 ya estén aplicadas en el Supabase destino. Si se despliega frontend antes que esquema, el lector remoto fallará y la aplicación caerá al snapshot degradado.
- El snapshot v2 histórico solo representa la campaña inicial; debe regenerarse a v3 antes de publicar una segunda campaña activa.
- Añadir nuevas tablas o relaciones de dominio exige decidir explícitamente si son globales o campaign-scoped y añadir la integridad compuesta correspondiente.
- Cualquier cambio futuro de RLS/grants/RPC debe mantener las pruebas negativas de Máster y cross-campaign.

Por estos motivos, el orden operativo tras aprobar el checkpoint de seguridad es: merge con CI verde, aplicar/validar migraciones mediante el mecanismo protegido de producción, verificar/regenerar snapshot cuando corresponda y solo entonces validar el despliegue/Pages contra el esquema efectivo.
