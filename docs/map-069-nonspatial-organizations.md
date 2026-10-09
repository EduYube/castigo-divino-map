# MAP-069 — Organizaciones no cartográficas

MAP-069 introduce `organization` como tipo real de `map_entity` sin convertir una organización en un marcador.

## Contrato spatial / non-spatial

La capability de dominio `isSpatialEntityType()` / `isSpatialMapEntity()` es la frontera común para responder si una entidad puede participar en el mapa.

- `character`, `location`, `mission` y `hazard` siguen siendo espaciales.
- `organization` es no espacial.
- Una organización válida persiste `x = NULL`, `y = NULL` y `geometry = NULL`.
- Una organización usa `visibility = search_only`: puede descubrirse en catálogo y búsqueda, pero no crea marker.
- Los tipos espaciales siguen requiriendo x/y/geometry completos. MAP-069 no debilita sus invariantes.

No existen coordenadas sentinel. En particular, `0,0` continúa siendo una coordenada real para una entidad espacial y nunca significa “sin posición”.

## Catálogo frente a markers

Desde MAP-069 el número de entidades del catálogo y el número de markers no son equivalentes. La proyección de markers filtra por capability espacial antes de leer coordenadas.

Una organización puede estar:

- publicada en el catálogo;
- indexada por nombre, alias y los metadatos ya soportados;
- accesible por deep link;
- representada en snapshot/degraded mode;
- relacionada con otras entidades;

sin participar en Leaflet, clustering, spiderfy, bounds, focus geográfico ni cálculos de distancia.

Seleccionar una organización en búsqueda abre su ficha y conserva el viewport actual.

## Sedes y relaciones genéricas

Una sede o edificio continúa siendo la entidad cartográfica apropiada, normalmente `location`. La organización relacionada permanece no cartográfica.

`entity_relations` almacena una relación genérica una sola vez:

- ambos extremos pertenecen a la misma campaña mediante FKs compuestas `(entity_id, campaign_id)`;
- los IDs se almacenan en orden canónico `left_entity_id < right_entity_id`, por lo que A→B y B→A no pueden coexistir;
- cada extremo conserva su propia etiqueta de presentación (`left_label` / `right_label`);
- la UI proyecta esa misma fila desde cualquiera de las dos fichas.

Esto permite organization↔location, organization↔character y organization↔organization sin crear tablas especializadas ni una columna `organization_id`.

**Concurrencia editorial.** Las escrituras `admin_save_map_entity_v8` serializan las relaciones
por campaña mediante un advisory lock transaccional común, adquirido antes del lock por
entidad. Los dos extremos de una misma relación no pueden superar simultáneamente
la comprobación optimista de `entity_relations_revision`; la segunda transacción
debe recibir conflicto de revisión obsoleta en lugar de sobrescribir cambios.

**Archivado.** Las relaciones ya existentes permanecen almacenadas cuando uno de sus
extremos se archiva. El editor puede conservar y guardar ese vínculo histórico sin
perderlo por una edición de descripción u otros campos, pero no puede crear nuevos
vínculos con destinos archivados. La política pública RLS deja de mostrar el
vínculo cuando cualquiera de los dos extremos está archivado.

## Campaign isolation y visibilidad

La campaña forma parte de la PK/FK lógica de `entity_relations`; una relación cross-campaign es inválida en PostgreSQL, no solo invisible en UI.

RLS de relaciones públicas exige que:

- ambos extremos estén publicados;
- ambos sean audiencia `public`;
- la campaña esté activa.

Modo Máster obtiene las organizaciones privadas mediante el RPC administrativo campaign-scoped. Al abandonar/revocar Master Mode o cambiar de campaña se reutiliza el purge del catálogo autorizado existente; no se crea una caché paralela para organizaciones.

## Admin

El editor permite crear `organization` y mantiene `entity_type` inmutable una vez creada la entidad, igual que antes de MAP-069. Por tanto no se introduce conversión spatial↔organization.

Para una organización:

- no se muestran controles X/Y ni el editor visual de geometría;
- no se monta el canvas de mapa;
- no se muestran dispositions de jugadores;
- no se admite retrato cartográfico;
- la visibilidad se fija a catálogo/búsqueda;
- se conservan categorías, tags, audiencia, lifecycle editorial y relaciones genéricas.

El editor de relaciones solo ofrece entidades de la campaña ya seleccionada y PostgreSQL vuelve a validar el scope.

## Dispositions y roster

Las relaciones organization↔entity son independientes de `entity_player_dispositions` y `entity_player_associations`. Una organización no se convierte en player ni se añade al roster. Un trigger de integridad rechaza dispositions que apunten a una organización.

## Snapshot y degraded mode

Schema v3 conserva organizaciones y `entityRelations`. Para una organización no se serializan coordenadas ni geometría. El parser acepta snapshots históricos sin `entityRelations` como lista vacía.

En degraded mode la misma proyección permite buscar y abrir la ficha/relaciones de una organización sin intentar centrar el mapa.

## Public requests

MAP-069 no amplía la mutación anónima de solicitudes públicas. El contrato público actual solo permite proponer los tipos ya habilitados por el flujo de pines y sigue exigiendo coordenadas. Las organizaciones se crean desde la superficie administrativa; no se abre una mutación genérica anónima para este tipo.

## Despliegue

Esta feature es una capacidad, no una migración de contenido canónico. La migración puede terminar con cero organizaciones. Los datos sintéticos viven únicamente en tests y rehearsals.

MAP-069 no declara v1.1.1 publicada y no debe aplicarse a producción hasta un checkpoint posterior.
