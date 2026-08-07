# CRUD administrativo de categorías, etiquetas y nombres

MAP-018 añade edición administrativa sobre el modelo introducido por MAP-015 y la sesión segura de MAP-017. PostgreSQL y RLS siguen siendo la frontera real de autorización; la interfaz solo mejora la experiencia y nunca sustituye esas reglas.

## Alcance real de “nombres”

MAP-018 reutiliza los conceptos existentes y no crea una semántica paralela:

- `categories`: categorías del catálogo.
- `tags`: etiquetas del catálogo.
- `entity_aliases`: nombres alternativos de entidades existentes.
- `geographic_names`: nombres geográficos ligeros, con nombre principal, coordenadas y enlace opcional a una entidad de localización.
- `geographic_name_aliases`: nombres alternativos de un nombre geográfico.

`map_entities.name` sigue siendo el nombre principal de una entidad completa. MAP-018 lo usa como referencia al gestionar `entity_aliases`, pero no lo edita: la creación y modificación de la entidad completa pertenece a MAP-019, junto con el editor visual de pines. Esta separación conserva la distinción de MAP-015 entre entidad completa, alias de entidad y nomenclátor geográfico.

Beta 0.2 solo permite contenido nominal en inglés. Los campos `language` y `name_language` se conservan en el modelo; la UI de MAP-018 fija `en` y no elimina la capacidad futura de ampliar idiomas mediante una migración posterior.

## Arquitectura

El CRUD mantiene las capas existentes:

- `src/domain/adminCatalog.ts`: contratos editoriales y recursos administrativos.
- `src/domain/adminCatalogValidation.ts`: validación inmediata y normalización equivalente a `private.normalize_search_text` para feedback de UI.
- `src/data-access/adminCatalog.ts`: puerto `AdminCatalogRepository` y conjunto cerrado de errores de dominio/UI.
- `src/application/adminCatalogController.ts`: acceso, búsqueda, ordenación, carga, mutaciones, cancelación de respuestas obsoletas y estado de UI.
- `src/infrastructure/supabase/adminCatalogRepository.ts`: Data API administrativa con JWT de la sesión de la pestaña, clave publicable y control optimista por `updated_at`.
- `src/app/adminCatalog.ts`: UI accesible integrada en el shell de MAP-017.

No existe un cliente Supabase global compartido. `SupabasePublicCatalogRepository` sigue usando únicamente la clave publicable y nunca recibe el JWT administrativo. El repositorio administrativo lee el token de la misma sesión `sessionStorage` establecida por MAP-017 justo antes de cada request y no lo expone a dominio, aplicación, DOM, URL ni repositorio público.

No se añade ninguna dependencia de runtime.

## Acceso y degradación

Una mutación solo se habilita cuando se cumplen simultáneamente:

1. `AdminAuthController` está en estado `authorized`.
2. MAP-016 ha publicado `backendState: connected`.

Si el backend público está `degraded` u `offline`, el CRUD se bloquea. El mapa público y su fallback siguen funcionando de forma independiente.

Una respuesta administrativa 401 invalida la sesión como expirada; una 403 la invalida como no autorizada. Se reutiliza `AdminAuthController.invalidateFromAdministrativeResponse()` y se ejecuta el logout local de MAP-017. No se reintentan automáticamente mutaciones.

Las cargas solapadas se cancelan y las respuestas de generaciones anteriores se descartan. Las ediciones, archivados y borrados incluyen el `updated_at` observado en el filtro de PostgREST; cero filas devueltas se normaliza como conflicto de escritura obsoleta en lugar de sobrescribir silenciosamente un cambio concurrente.

## Invariantes y validación

La UI valida inmediatamente:

- formatos de IDs y slugs compatibles con PostgreSQL;
- longitud de nombres y descripciones;
- coordenadas y zoom de `geographic_names`;
- idioma `en`;
- estabilidad del ID durante edición;
- transición `archived -> draft -> published`;
- colisiones de nombres publicados que ya están cargadas en la vista.

La validación de frontend no es la defensa final. PostgreSQL mantiene, entre otras, estas invariantes:

- claves primarias e índices únicos para IDs y slugs;
- reserva de IDs/slugs después de primera publicación;
- normalización de `entity_aliases`, `geographic_names` y `geographic_name_aliases`;
- unicidad del espacio de nombres publicado entre `map_entities` y `entity_aliases`;
- unicidad del espacio de búsqueda publicado entre `geographic_names` y sus aliases;
- idioma `en` durante Beta 0.2;
- ciclo `draft`, `published`, `archived` y timestamps gestionados por base de datos;
- relaciones `ON DELETE RESTRICT`;
- bloqueo de retirada de categorías o etiquetas que sostienen relaciones publicadas;
- bloqueo del borrado físico de cualquier fila que haya sido publicada.

## Publicación, archivado y borrado

El archivado es la eliminación habitual. La UI pide confirmación antes de archivar y explica que PostgreSQL puede rechazar la operación si existen relaciones publicadas que la hacen destructiva.

La eliminación física solo se ofrece cuando el registro no está publicado y `published_at` es `null`, es decir, nunca se publicó. Incluso entonces PostgreSQL conserva la decisión final: las foreign keys pueden rechazar filas referenciadas y el trigger de ciclo impide borrar contenido con historial de publicación aunque el navegador sea manipulado.

No se resuelven relaciones automáticamente ni se realizan cascadas destructivas desde la UI.

## Errores y conflictos

El adaptador no presenta mensajes SQL crudos. Normaliza respuestas en códigos cerrados:

- `validation`;
- `conflict`;
- `referenced`;
- `operation-prohibited`;
- `session-expired`;
- `unauthorized`;
- `backend-unavailable`;
- `request-timeout`;
- `invalid-response`;
- `stale-write`;
- `unexpected`.

SQLSTATE `23505`, `23503`, `23514` y `42501` se convierten a mensajes seguros. El cuerpo, nombres de constraints, UUIDs administrativos y otros detalles internos no se muestran.

## Interpretación del criterio de publicación pública

El criterio de la Issue #37 «Los cambios publicados aparecen en la experiencia pública» se interpreta de acuerdo con MAP-016 y MAP-028, sin cambiar la arquitectura silenciosamente:

- MAP-016 ya introdujo `SupabasePublicCatalogRepository`, que consulta `categories`, `tags`, `entity_aliases`, `geographic_names` y `geographic_name_aliases` con `publication_status=eq.published` usando solo la clave publicable.
- Una mutación de MAP-018 que termina en `published` queda por tanto disponible de inmediato en la proyección pública Beta 0.2 y sometida a las mismas políticas RLS de lectura anónima.
- La experiencia principal visible de Beta 0.1 sigue consumiendo el catálogo de compatibilidad hasta MAP-028. MAP-018 no sustituye ese catálogo, no cambia IDs/URLs del mapa y no adelanta la transición completa.
- MAP-028 conserva la responsabilidad de migrar el catálogo Beta 0.1, demostrar equivalencia y hacer que la UI principal consuma el dominio Beta 0.2.

La cobertura pgTAP de MAP-018 verifica que contenido publicado es visible para `anon` y borradores no lo son. La cobertura frontend verifica que el repositorio público permanece sin JWT administrativo.

## Base de datos y Supabase alojado

MAP-018 no necesita una migración nueva. Las doce migraciones aplicadas antes de comenzar la Issue ya contienen los grants por columna, políticas RLS, triggers, constraints, reservas, normalización y bloqueos relacionales necesarios. Añadir SQL duplicado solo para simplificar la UI debilitaría la trazabilidad del modelo.

Se añade `supabase/tests/database/009_admin_catalog_crud.test.sql` para ejercer el contrato existente con visitante, no administrador y administrador, además de publicación, archivado, colisiones y borrado. El test se ejecuta en Supabase local dentro de CI y termina con rollback.

La inspección de `atlas-nuevos-dioses-prod` previa a implementar confirmó el proyecto sano y exactamente doce migraciones alineadas con Git. MAP-018 no aplica migraciones, semillas ni cambios de configuración al proyecto alojado.

## Accesibilidad y responsive

La UI usa labels asociados, errores por campo mediante `aria-describedby`, regiones `status`/`alert`, estado de botones no basado solo en color y confirmación accesible para acciones destructivas. El editor mueve el foco al primer campo editable y lo devuelve al control de origen al cancelar o cerrar. Las acciones se pueden ejecutar con teclado y el layout evita overflow horizontal a 320 px.

La previsualización muestra antes de guardar el nombre, ID, estado y, en nombres geográficos, las coordenadas que se enviarán.

## Flujo de validación desde MAP-018

GitHub Actions es el bucle principal de validación. No existe un preflight local completo obligatorio antes de lanzar CI. Cuando el head cambia, solo una ejecución nueva sobre ese SHA puede considerarse evidencia definitiva; no se reutilizan con `Re-run jobs` runs correspondientes a un SHA anterior.

Este cambio de flujo no modifica los controles de producción de Supabase: historia remota, migraciones pendientes, revisión SQL, dry-run cuando corresponda, backups para cambios destructivos, validación posterior, rollback y prohibición de semillas en producción siguen vigentes.
