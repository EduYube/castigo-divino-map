# MAP-075 — Contrato de mapas locales opcionales

## Alcance

Base de datos y modelo v1.3, sin mapas físicos reales ni UI. La ausencia
de contexto local es normal. No hay backfill del mundo v1.2.

| Contrato | Persistencia y acceso |
| --- | --- |
| Mapa físico compartido | `map_contexts`: ID/slug únicos, parent, dimensiones CRS.Simple, lifecycle y licencia |
| Aparición narrativa | `entity_map_placements`: PK campaign/context/entity, geometry/x/y y lifecycle |
| Entidad canónica | `map_entities`: nunca duplicada; vínculos/notes/tags siguen allí |
| Mapa del mundo | x/y/geometry legacy con `world_map_enabled=true`, sin nueva fila root |
| Entidad solo local | `world_map_enabled=false`, world x/y/geometry NULL, placements locales |
| Organización | No espacial, ni placement general ni local |

## Geometría

El espacio es imagen: origen (0,0), `width` y `height` específicos por
contexto; extremos incluidos. `point` usa `coordinates:{x,y}`;
`polygon` usa `vertices:[{x,y},...]` y solo en location.
El guard reutiliza algoritmo MAP-060: 3–64 vértices, CCW, rotación
lexicográfica, sin duplicados/autointersección/área cero.
x/y se computan desde geometry y **nunca** son fuente editable separada.
Cambiar width/height con placements está prohibido.

## Consulta prevista para MAP-077/MAP-079

1. Resolver campaña activa y location canónica.
2. Obtener vínculo futuro `campaign_location_map_context_links`.
3. Leer contextos published y su jerarquía.
4. Leer placements filtrados por `campaign_id` + `map_context_id`,
   integrando RLS + estado editorial. No consultar una campaña vecina.
5. Renderizar `geometry` contra dimensiones del contexto; centrar a
   x/y solo como proyección representativa.
6. Mantener URL y render world legado mientras no se solicita contexto.
7. MAP-079 deberá revisar conjuntamente reader y RLS para exponer
   local-only; ahora son invisibles al lector anónimo de v1.2.

Casos representables: character/mission en mundo + mapa local; location
solo en local; NPC solo en City of Shadows; Neverwinter compartido con
placements separados por campaña. MAP-075 no inserta esos contenidos.

## RLS y publicación

`map_contexts` published es legible por público; drafts y archived no.
`entity_map_placements` published solo se muestra cuando contexto y
entidad canónica cumplen toda la elegibilidad pública actual; no expone
contenido Master. Authenticated no-admin no adquiere privilegios de
escritura. Admin puede CRUD permitido por SQL. La FK compuesta impide
cross-campaign; organization rechazada por trigger; unique bloquea duplicados.

## Derechos y entrega

Si `image_uri` existe se exige `source_url`, `rights_holder`,
`license_notes` y `loading_strategy`. `attribution` es editable.
MAP-076 acreditará derechos antes de incorporar cualquier imagen.
No se ejecuta migración remota ni se regenera snapshot; v1.2 permanece
1.2.0 y checksum fijado.

## Verificación

`supabase/tests/database/041_map075_local_map_contexts.test.sql` comprueba
jerarquía, geometría, ACL, aislamiento, publicación y caso local-only.
`scripts/test-map075-v1-2-upgrade.mjs` ensaya upgrade sobre fixtures v1.2.
`npm run supabase:db:validate` incluye ambas rutas en CI. Requiere
stack Supabase local; no usar `supabase db push` contra producción.
