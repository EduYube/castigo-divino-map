# ADR 0008 — Map contexts and campaign-scoped entity placements

- Estado: Propuesto en MAP-075 para revisión independiente
- Fecha: 2026-10-16
- Issue: #196
- Baseline: v1.2.0 / `e6d91b57810e18ecebd1341ec81fc4a191d829f8`

## Contexto y problema

La v1.2 dispone de un mapa general CRS.Simple (3600 × 2329) y geometría
persistida en `map_entities`. Son coordenadas válidas para **esa superficie**,
no para la cartografía física de cualquier ciudad. `map_entities` es una
identidad editorial campaign-scoped; la cartografía física es compartible.
No todas las localizaciones poseen plano local. Crear una entidad distinta por
mapa fragmentaría identidad, permisos, relaciones y notas.

## Alternativas consideradas

1. Crear un `map_context` por entidad `location`: rechazado por forzar planos
   inexistentes y acoplar geografía global a una campaña.
2. Duplicar NPCs/misiones por mapa: rechazado por divergencia de identidad.
3. Migrar todas las coordenadas v1.2 a placements/root materializados:
   rechazado por churn y riesgo P0 sobre snapshot y deep links.
4. **Elegido:** mundo legado implícito y `map_contexts` globales opcionales
   con `entity_map_placements` campaign-scoped, sin backfill.

## Decisión

### Geografía física y jerarquía

`public.map_contexts` tiene `id`, `slug` únicos y estables, `name`,
`parent_id` opcional, `width`/`height` finitos positivos,
`publication_status` (enum existente), timestamps editoriales y procedencia.
Los mapas no nacen automáticamente con una `location`. La FK de parent y
un guard transaccional impiden self-parent, parents inexistentes y ciclos
directos/indirectos, sin límite arbitrario de profundidad. Un candado advisory
global serializa solo ediciones de jerarquía, no edición de placements.
Un hijo publicado requiere padre publicado y no puede archivarse el padre
mientras quede un hijo publicado. Las dimensiones son inmutables si ya
existen placements: evitamos invalidaciones silenciosas y carreras.

La raíz física del mundo **permanece implícita**. Un contexto sin `parent_id`
es hijo conceptual del mapa mundial mientras dura la transición; no se genera
una fila root física, ni se reinterpreta la imagen del mundo ni sus coordenadas.
MAP-077 decidirá el vínculo de entrada y podrá materializar root posteriormente
con migración explícita sin afectar el legado. `geographic_names` también
permanece global.

### Placements y unicidad

`public.entity_map_placements` tiene PK
`(campaign_id, map_context_id, entity_id)`, FK a `campaigns`, FK a
`map_contexts` y FK **compuesta** a `map_entities(id,campaign_id)`.
Una entidad canónica se coloca como máximo una vez en cada superficie.
Sus tags, audience, lifecycle, asociaciones, notas, disposiciones y slug
permanecen en `map_entities`; el placement solo almacena geometría
de esa superficie, x/y deterministas, publicación y timestamps. Puede aparecer
en varios contextos sin clonarse. Diferentes campañas pueden compartir el
mismo `map_context_id`, nunca su placement narrativo.

Se reutiliza la lógica MAP-060 de canonicalización, prohibición de
autointersección, 3–64 vértices, area no nula y centro del bounding box de
polygon, con límites `width/height` parametrizados por contexto.
`point` admite 0,0. Solo `location` admite polygon; character, mission
y hazard usan point. `organization` se rechaza en trigger incluso para
escrituras privilegiadas. No se introducen rutas, holes, PostGIS ni lat/lon.

### Compatibilidad de entidades local-only

`map_entities.world_map_enabled boolean not null default true` preserva
TODOS los registros existentes, sus x/y/geometry y la exigencia de geometría
espacial legacy. Para **nuevas** entidades editoriales locales:
`world_map_enabled=false` exige los tres campos legacy `x/y/geometry=NULL`.
No se utilizan sentinel, ni se crea un placement general ficticio.
El trigger actual de normalización mundial sigue idéntico para
`world_map_enabled=true` y las `organization` siguen no espaciales.

Para evitar que la aplicación v1.2 reciba filas sin coordenadas mundiales,
`map_entities_public_select` filtra `world_map_enabled=true`.
La política de placements también exige esa condición **temporalmente**.
Esto significa que una entidad local-only puede modelarse, persistirse y
editarse por SQL admin en v1.3, pero no se expone aún públicamente aunque
su estado sea published: MAP-079 deberá sustituir el lector mundial por
lectura multi-mapa segura y ampliar ambas políticas RLS. No debe añadirse
contenido local-only publicado antes de MAP-079. La semántica actual no cambia
para ninguna fila existente.

### Publicación y seguridad

Ambas nuevas tablas tienen RLS habilitada. `anon` y `authenticated` leen
solo `published`; un placement solo se expone si su contexto está publicado
y su entidad es pública, publicada, world-enabled y pertenece a campaña activa
con categoría publicada. Draft/archived/Master permanecen ocultos; ninguna
colocación eleva el nivel de audiencia de la entidad. Un `authenticated`
no-admin no puede escribir; el admin se reconoce mediante
`private.is_admin()`. Privilegios explícitos, funciones invoker y search_path
vacío. FKs, checks y triggers siguen protegiendo incluso escrituras
administrativas. Se reutiliza el lifecycle editorial existente, sin nuevo enum.

Concurrencia: unique compuesta resuelve dos altas simultáneas;
`FOR SHARE` sobre mapa y entidad en validación de placement impide carreras
contra cambios de dimensiones y tipos. Status de contexto y placement se
evalúa dinámicamente por RLS (también ante archivados concurrentes).
Las publicaciones jerárquicas se serializan con lock de árbol. Ninguna
operación se conecta a producción en MAP-075.

### Procedencia y licencia

Un contexto puede guardar `image_uri`, `loading_strategy`
(`remote|bundled`), `source_url`, `rights_holder`,
`attribution`, `license_notes`. Si se adjunta una imagen se exigen
origen, titular, condiciones y estrategia de carga antes del commit de SQL.
Una superficie puede existir sin imagen; MAP-075 no añade URLs ni archivos.
MAP-076 investigará fuentes oficiales y licencias; Pinterest no acredita uso.

### «Entrar en lugar» y mapa físico compartido

No se acopla `map_contexts` a `map_entities`. MAP-077 debe añadir
`campaign_location_map_context_links(campaign_id,location_entity_id,
map_context_id)` o equivalente, con FK compuesta a la location de esa
campaña y FK global a map_contexts y validación de `entity_type=location`.
Así, una `location` Neverwinter de cada campaña puede vincular al mismo
mapa físico Neverwinter; el CTA resuelve el vínculo **de la campaña activa**.
No se añade esta tabla antes de necesitar navegación y reglas de UX.

## Consecuencias / compatibilidad P0

Migración forward-only por expansión: sin actualizar map_entities ni sus
IDs, slugs, coordenadas, geometría, metadata, campaign_id, relaciones o
timestamps. La v1.2 mantiene rutas, servicios, snapshot schema v3 y versión
1.2.0 intactos. Nuevas tablas vacías, sin mapas de Neverwinter/City of Shadows.
`package.json` no incrementa versión. Índices: slug unique, parent,
PK campaign/context/entity, búsqueda por contexto/campaña y campaña/entidad.

Riesgos pendientes: para mostrar local-only publicado es necesaria la
lectura multi-mapa y ajuste RLS sincronizado en MAP-079; para cambiar bounds
con contenido habrá que reproyectar placements explícitamente en futura
migración; carga y derechos de imágenes deben validarse en MAP-076.

## Continuación

- **MAP-076:** investigación/licencias de cartografías sin ingesta prematura.
- **MAP-077:** asociación campaña-location/contexto y CTA de entrada.
- **MAP-078:** editor admin de contextos, placements y validación de provenance.
- **MAP-079:** lector/map switch y entidad local-only pública segura.
- **MAP-080:** snapshot/degraded multi-mapa versionado y compatibilidad.
