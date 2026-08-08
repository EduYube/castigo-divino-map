# Moderación administrativa de solicitudes públicas

MAP-027 añade la bandeja administrativa que revisa las solicitudes creadas por MAP-026 y las convierte, cuando procede, en borradores editoriales. La solicitud pública y el catálogo siguen siendo dominios separados: recibir una propuesta nunca publica contenido ni crea una entidad visible.

## Alcance

La bandeja vive dentro de la administración existente y reutiliza la autenticación y la allowlist de MAP-017. Permite:

- listar solicitudes solo con una sesión administrativa autorizada;
- filtrar por estado y ordenar por fecha;
- revisar remitente, tipo propuesto, coordenadas, descripción y motivo;
- rechazar una solicitud con una nota administrativa opcional;
- convertir una solicitud pendiente en un borrador editable del editor de entidades de MAP-019;
- conservar administrador, fecha de revisión, nota y referencia al borrador para auditoría.

`needs_changes` no se añade en Beta 0.2. El formulario de MAP-026 no solicita correo, teléfono ni otro canal de respuesta; solo conserva un nombre o apodo. Sin un canal utilizable, ese estado no permitiría pedir cambios al remitente y sería un estado operativo engañoso.

## Seguridad

PostgreSQL sigue siendo la frontera definitiva de autorización.

- `anon` no tiene `SELECT` sobre `public_requests` ni `EXECUTE` sobre la RPC administrativa.
- `authenticated` conserva lectura administrativa únicamente cuando RLS confirma `private.is_admin()`.
- `authenticated` ya no tiene `UPDATE` directo sobre `request_status`, `moderation_note` ni `converted_entity_id`; el navegador no puede saltarse la operación atómica con PostgREST directo.
- La única superficie de moderación es `public.admin_moderate_public_request(...)` y solo acepta las acciones cerradas `reject` y `convert`.
- La RPC es `SECURITY DEFINER`, pero no pertenece a `postgres`: su propietario es `atlas_public_request_moderator`, un rol `NOLOGIN`, sin `SUPERUSER` y sin `BYPASSRLS`.
- Ese rol dedicado hereda los grants y la pertenencia RLS de `authenticated` y recibe únicamente el `UPDATE` de las tres columnas de moderación revocadas al navegador. Por tanto, la elevación sirve para atravesar el grant de columnas, no para desactivar RLS.
- La función comprueba explícitamente `public.current_user_is_admin()` antes de bloquear o modificar una solicitud, y las políticas administrativas existentes vuelven a comprobar la allowlist durante `SELECT`, `INSERT` y `UPDATE`.
- El `search_path` de la RPC queda vacío y todas las relaciones/funciones sensibles se referencian con esquema explícito.
- El `EXECUTE` implícito de `PUBLIC` se revoca y solo se concede a `authenticated`; `anon` permanece excluido.
- No se añade `service_role`, secreto, credencial privilegiada ni persistencia de tokens nueva.
- Los errores SQL se normalizan en el adaptador del navegador; constraints, nombres internos y datos de otras solicitudes no se presentan al usuario.

La creación del rol dedicado es idempotente para soportar reconstrucciones locales repetidas. Si el rol ya existe, la migración verifica que siga siendo `NOLOGIN`, no privilegiado, sin `BYPASSRLS` y con herencia habilitada. Para transferir el ownership de la RPC en PostgreSQL 17, el usuario de migración recibe membresía temporal en ese rol y el rol recibe `CREATE` temporal sobre `public`; ambas concesiones se revocan antes del commit.

## Estados y auditoría

El enum histórico `request_status` conserva `pending`, `accepted`, `rejected`, `converted` y `archived`. MAP-027 no amplía el enum.

La bandeja solo procesa solicitudes `pending`:

- `pending -> rejected`: una única actualización registra la nota opcional; el trigger existente fija `moderator_user_id = auth.uid()` y `moderated_at` en PostgreSQL.
- `pending -> accepted -> converted`: ambas transiciones ocurren dentro de la misma llamada y de la misma transacción. `accepted` preserva la máquina de estados existente pero no queda observable como estado intermedio confirmado.

Una solicitud ya procesada no vuelve a `pending` y la RPC de MAP-027 no vuelve a procesar estados terminales. Las solicitudes moderadas no se borran como parte del flujo.

## Conversión a borrador

La conversión bloquea la fila de `public_requests` con `FOR UPDATE`, verifica que siga `pending` y compara `updated_at` con la revisión enviada por el cliente. Después crea una sola entidad y enlaza `converted_entity_id` antes de confirmar la transacción.

El ID y el slug del borrador se derivan exclusivamente del UUID de la solicitud; no se construyen a partir de texto libre. Del contenido público solo se trasladan campos con semántica directa:

| Solicitud | Borrador |
| --- | --- |
| `entity_type` | `entity_type` |
| `proposed_name` | `name` |
| `description` | `description` |
| `x`, `y` | `x`, `y` |

El borrador fuerza:

- `publication_status = draft`;
- `visibility = pin`;
- `summary = ''`;
- `category_id = null`;
- ninguna fila de `entity_tags` creada por la conversión;
- `published_at = null` mediante el ciclo editorial existente.

`sender_name` y `reason` permanecen en la solicitud para moderación y auditoría. No se convierten en taxonomía, etiquetas, relaciones ni otros campos editoriales.

## Categoría nula en borradores

Antes de MAP-027, `map_entities.category_id` era `NOT NULL`. Eso obligaría a inventar o asignar una categoría durante la conversión, contrario al requisito de no copiar ni inferir taxonomía.

MAP-027 permite `category_id = null` para contenido incompleto, pero añade una restricción explícita que exige categoría para `publication_status = published`. El trigger editorial existente continúa comprobando además que la categoría seleccionada exista y esté publicada.

El adaptador administrativo representa `null` como la opción vacía `Selecciona una categoría`. La validación de MAP-019 permanece estricta: un borrador convertido no puede guardarse ni publicarse desde el editor hasta que el administrador elija una categoría disponible. Por tanto la conversión crea un punto de partida editable, no contenido publicable por accidente.

## Concurrencia y reintentos

La autoridad de concurrencia vive en PostgreSQL, no en el estado de los botones.

1. La RPC bloquea la solicitud con `SELECT ... FOR UPDATE`.
2. Exige estado `pending`.
3. Exige que `p_expected_updated_at` coincida con la revisión leída por la bandeja.
4. La creación del borrador y la transición de la solicitud comparten transacción.
5. Una segunda pestaña, otro administrador o un reintento tardío espera el lock y, al reanudar, recibe SQLSTATE `40001` porque la solicitud ya cambió.
6. Cualquier fallo después de insertar el borrador provoca rollback completo; no queda un borrador huérfano ni una solicitud parcialmente procesada.
7. Un navegador con JWT administrativo tampoco puede reproducir las transiciones mediante `UPDATE` directo porque carece del grant de las columnas de moderación.

El frontend deshabilita temporalmente las acciones durante una petición para evitar clics redundantes, pero esa medida es solo UX.

## Interfaz y accesibilidad

La bandeja reutiliza el shell administrativo. Incluye estados de carga, vacío, error, backend desconectado y sesión invalidada; filtro por estado; orden por fecha; nota administrativa; confirmación antes de rechazo o conversión; restauración de foco con `Escape`; `aria-live`; targets de 44 px; layout de 320 px; `forced-colors` y `prefers-reduced-motion`.

Los borradores de nota administrativa se conservan fuera del DOM por ID de solicitud. Reordenar, cambiar el filtro o recibir un evento repetido de estado del backend no borra texto no enviado. El controlador tampoco publica un nuevo estado cuando `authorized` y `backendConnected` no han cambiado. El borrador de nota se elimina cuando la solicitud se procesa correctamente o deja de estar pendiente.

Tras convertir, el runtime recarga el catálogo administrativo de entidades y abre el borrador en el editor de MAP-019. Si la apertura automática falla después de una conversión confirmada, la UI informa de que el borrador ya existe y pide recargar la lista de entidades, sin reintentar la conversión.

## Volumen de la bandeja

Beta 0.2 mantiene el contrato de cargar todas las solicitudes disponibles y aplicar filtro/orden en cliente. Para evitar que una inserción concurrente invalide o desplace páginas ya leídas, el adaptador recorre el histórico con keyset pagination estable sobre `(created_at desc, id asc)`, sin `offset` ni `count=exact`.

La carga completa sigue siendo un límite de rendimiento para historiales grandes, no una frontera de autorización ni de integridad. Antes de exponer un volumen sostenido de solicitudes anónimas conviene evolucionar la UI a páginas acotadas y mover el filtro por estado al servidor, reutilizando el cursor ya introducido en el adaptador.

## Pruebas

La cobertura de MAP-027 se reparte en cuatro niveles:

- unitarios de filtrado/orden, del controlador de moderación y del cursor de lectura, incluido que señales de acceso repetidas sean no-op;
- E2E de visibilidad administrativa, detalles, filtros, persistencia de notas durante rerenders, confirmaciones, rechazo, conversión, editor, red, concurrencia de cliente, sesión, móvil y accesibilidad;
- pgTAP para grants/RLS, propietario endurecido de la RPC, prohibición de `UPDATE` directo de moderación, auditoría, rechazo, conversión, ausencia de categorías/tags y barrera de publicación;
- una prueba de dos sesiones PostgreSQL que compiten por la misma solicitud y verifica que solo una crea el borrador.

La migración se valida desde cero y mediante el flujo de upgrade habitual del repositorio. `seed.sql` no forma parte del despliegue de producción.
