# Moderación administrativa de solicitudes públicas

MAP-027 añadió la bandeja administrativa que revisa las solicitudes creadas por MAP-026 y las convierte, cuando procede, en borradores editoriales. MAP-056 adapta ese flujo al dominio multicampaña de MAP-053/MAP-055: desde la creación pública hasta la publicación final, la campaña forma parte de la identidad de la operación y nunca se infiere de texto libre ni se cambia silenciosamente durante la moderación.

La solicitud pública y el catálogo siguen siendo dominios separados: recibir una propuesta nunca publica contenido ni crea una entidad visible.

## Alcance

La bandeja vive dentro de la administración existente y reutiliza la autenticación y la allowlist de MAP-017. Permite:

- listar únicamente las solicitudes de la campaña administrativa activa;
- mostrar de forma explícita esa campaña en cada tarjeta y en las confirmaciones;
- filtrar por estado y ordenar por fecha dentro de ese scope;
- revisar remitente, tipo propuesto, coordenadas, descripción y motivo;
- rechazar una solicitud con una nota administrativa opcional;
- convertir una solicitud pendiente en un borrador editable del editor de entidades;
- conservar administrador, fecha de revisión, nota y referencia al borrador para auditoría.

`needs_changes` no se añade. El formulario público no solicita correo, teléfono ni otro canal de respuesta; solo conserva un nombre o apodo. Sin un canal utilizable, ese estado no permitiría pedir cambios al remitente y sería un estado operativo engañoso.

## Campaña de la solicitud pública

`public_requests.campaign_id` es obligatorio y MAP-053 migró las solicitudes históricas de v1.0 a la campaña inicial conservando sus IDs, contenido, estados, timestamps, datos de moderación y `converted_entity_id`.

El formulario de `Proponer un pin` muestra siempre una línea de campaña destinataria. Al abrirse captura la selección pública vigente de MAP-055. El jugador no introduce un segundo ID o slug de campaña y el formulario no expone audiencia Máster.

El envío usa `public.submit_public_request_v2(...)`, que recibe el UUID de campaña y valida en PostgreSQL que corresponda a una campaña activa. El RPC solo acepta los campos propios de la propuesta; no acepta audiencia, categoría, jugador, tags, relaciones ni `converted_entity_id`.

Si la campaña global cambia con el formulario abierto:

- con formulario vacío, el destino sigue automáticamente la nueva selección;
- con cualquier dato o posición introducidos, el destino no cambia de forma silenciosa;
- la UI exige elegir entre conservar el destino original o mover el borrador local a la nueva campaña;
- mientras esa decisión esté pendiente, el submit queda bloqueado;
- mover el borrador conserva campos y posición; conservarlo mantiene la campaña original aunque el mapa global ya muestre otra.

La selección capturada por el formulario es la que se envía al backend. El submit no vuelve a leer de forma oportunista el selector global en el último instante.

## Seguridad administrativa

PostgreSQL sigue siendo la frontera definitiva de autorización.

- `anon` no tiene `SELECT` sobre `public_requests` ni `EXECUTE` sobre la RPC administrativa.
- `authenticated` conserva lectura administrativa únicamente cuando RLS confirma `private.is_admin()`.
- `authenticated` no tiene `UPDATE` directo sobre `request_status`, `moderation_note` ni `converted_entity_id`; el navegador no puede saltarse la operación atómica con PostgREST directo.
- La única superficie ejecutable de moderación es `public.admin_moderate_public_request_v2(uuid, uuid, timestamptz, text, text)`.
- La antigua `public.admin_moderate_public_request(...)` sin campaña se elimina porque permitía omitir el contexto administrativo y eludir el wrapper multicampaña.
- La RPC v2 es `SECURITY DEFINER`, pero no pertenece a `postgres`: su propietario es `atlas_public_request_moderator`, un rol `NOLOGIN`, sin `SUPERUSER` y sin `BYPASSRLS`.
- Ese rol dedicado hereda los grants y la pertenencia RLS de `authenticated` y recibe únicamente el `UPDATE` de las columnas de moderación revocadas al navegador. La elevación sirve para atravesar el grant de columnas, no para desactivar RLS.
- La función comprueba explícitamente `public.current_user_is_admin()` antes de bloquear o modificar una solicitud.
- El `search_path` de la RPC queda vacío y las relaciones/funciones sensibles se referencian con esquema explícito.
- El `EXECUTE` implícito de `PUBLIC` se revoca y solo se concede a `authenticated`; `anon` permanece excluido.
- No se añade `service_role`, secreto, credencial privilegiada ni persistencia de tokens nueva.

La creación del rol dedicado sigue siendo idempotente para reconstrucciones locales. Si el rol ya existe, las migraciones previas verifican que siga siendo `NOLOGIN`, no privilegiado, sin `BYPASSRLS` y con herencia habilitada. Para transferir el ownership de la RPC en PostgreSQL 17, el usuario de migración recibe membresía temporal en ese rol y el rol recibe `CREATE` temporal sobre `public`; ambas concesiones se revocan antes del commit.

## Integridad del scope de campaña

La moderación recibe `p_campaign_id`, pero nunca lo utiliza como fuente para crear contenido. Su función es acotar qué solicitud puede bloquearse:

1. la RPC selecciona y bloquea con `FOR UPDATE` únicamente la fila cuyo `(campaign_id, id)` coincide con `(p_campaign_id, p_request_id)`;
2. si la solicitud pertenece a otra campaña, la operación falla antes de cualquier escritura;
3. una vez bloqueada, la campaña autoritativa es `request_record.campaign_id`;
4. el borrador usa exclusivamente esa campaña;
5. la FK compuesta de MAP-053 exige que `converted_entity_id` apunte a una entidad de la misma campaña.

La conversión fuerza además `audience = public`. No existe parámetro para escalar una propuesta anónima a contenido Máster ni para introducir referencias a categorías, jugadores, tags o relaciones de otra campaña.

El interceptor administrativo sobreescribe cualquier `p_campaign_id` manipulado con la campaña administrativa activa antes de enviar los RPC conocidos. Esa defensa de cliente mejora coherencia y UX, pero no sustituye la validación del RPC: un cliente modificado que invoque v2 directamente sigue fallando si combina una solicitud con una campaña distinta.

## Estados y auditoría

El enum histórico `request_status` conserva `pending`, `accepted`, `rejected`, `converted` y `archived`.

La bandeja solo procesa solicitudes `pending`:

- `pending -> rejected`: una única actualización registra la nota opcional; el trigger existente fija `moderator_user_id = auth.uid()` y `moderated_at` en PostgreSQL.
- `pending -> accepted -> converted`: ambas transiciones ocurren dentro de la misma llamada y de la misma transacción. `accepted` preserva la máquina de estados existente pero no queda observable como estado intermedio confirmado.

Una solicitud ya procesada no vuelve a `pending` y la RPC no vuelve a procesar estados terminales. Las solicitudes moderadas no se borran como parte del flujo.

## Conversión a borrador

La conversión bloquea la fila de `public_requests` por campaña e ID, verifica que siga `pending` y compara `updated_at` con la revisión enviada por el cliente. Después crea una sola entidad y enlaza `converted_entity_id` antes de confirmar la transacción.

El ID y el slug del borrador se derivan exclusivamente del UUID de la solicitud; no se construyen a partir de texto libre. Del contenido público solo se trasladan campos con semántica directa:

| Solicitud | Borrador |
| --- | --- |
| `campaign_id` bloqueado | `campaign_id` |
| `entity_type` | `entity_type` |
| `proposed_name` | `name` |
| `description` | `description` |
| `x`, `y` | `x`, `y` |

El borrador fuerza:

- `audience = public`;
- `publication_status = draft`;
- `visibility = pin`;
- `summary = ''`;
- `category_id = null`;
- ninguna fila de `entity_tags` creada por la conversión;
- `published_at = null` mediante el ciclo editorial existente.

`sender_name` y `reason` permanecen en la solicitud para moderación y auditoría. No se convierten en taxonomía, etiquetas, relaciones ni otros campos editoriales.

## Categoría nula en borradores

MAP-027 permite `category_id = null` para contenido incompleto y mantiene una restricción explícita que exige categoría para `publication_status = published`. El trigger editorial existente continúa comprobando además que la categoría seleccionada exista, esté publicada y pertenezca a la misma campaña.

El adaptador administrativo representa `null` como la opción vacía `Selecciona una categoría`. Un borrador convertido no puede publicarse hasta que el administrador elija una categoría válida del scope activo. La conversión crea un punto de partida editable, no contenido publicable por accidente.

## Cambio de campaña administrativa

La campaña administrativa de MAP-054 delimita la bandeja y los RPC dependientes. Al cambiarla:

- el controlador cancela la carga anterior;
- vacía inmediatamente las tarjetas de la campaña previa;
- la nueva lectura de `public_requests` incluye el filtro de campaña impuesto por el interceptor;
- una respuesta tardía de la campaña anterior no puede repoblar la bandeja por el control de generación/abort;
- cualquier confirmación de moderación abierta se cierra para que no pueda ejecutarse bajo otro contexto;
- la UI anuncia y muestra el nombre de la campaña activa.

Por tanto, una indisponibilidad o una respuesta lenta del backend no deja solicitudes de A visibles bajo el encabezado de B.

## Concurrencia y reintentos

La autoridad de concurrencia vive en PostgreSQL, no en el estado de los botones.

1. La RPC bloquea la solicitud con `SELECT ... FOR UPDATE` dentro del scope de campaña.
2. Exige estado `pending`.
3. Exige que `p_expected_updated_at` coincida con la revisión leída por la bandeja.
4. La creación del borrador y la transición de la solicitud comparten transacción.
5. Una segunda pestaña, otro administrador o un reintento tardío espera el lock y, al reanudar, recibe SQLSTATE `40001` porque la solicitud ya cambió.
6. Cualquier fallo después de insertar el borrador provoca rollback completo; no queda un borrador huérfano ni una solicitud parcialmente procesada.
7. Un navegador con JWT administrativo tampoco puede reproducir las transiciones mediante `UPDATE` directo porque carece del grant de las columnas de moderación.

El frontend deshabilita temporalmente las acciones durante una petición para evitar clics redundantes, pero esa medida es solo UX.

## Modo degradado

La política de MAP-026 se mantiene: si Supabase no está disponible, el formulario conserva sus datos locales en el DOM para poder corregir o reintentar, pero no persiste el contenido privado de la solicitud en `sessionStorage`, snapshot público ni catálogo estático. El snapshot multicampaña contiene únicamente datos de lectura pública.

## Interfaz y accesibilidad

La bandeja reutiliza el shell administrativo. Incluye estados de carga, vacío, error, backend desconectado y sesión invalidada; filtro por estado; orden por fecha; nota administrativa; confirmación antes de rechazo o conversión; restauración de foco con `Escape`; `aria-live`; targets de 44 px; layout móvil; `forced-colors` y `prefers-reduced-motion`.

El formulario público expone la campaña destinataria como texto, no como un segundo selector. La decisión keep/move ante un cambio de campaña es inline y accesible, preserva el foco útil y no destruye el contenido introducido.

Los borradores de nota administrativa se conservan fuera del DOM por ID de solicitud. Reordenar, cambiar el filtro o recibir un evento repetido de estado del backend no borra texto no enviado. El borrador de nota se elimina cuando la solicitud se procesa correctamente o deja de estar pendiente.

Tras convertir, el runtime recarga el catálogo administrativo de entidades y abre el borrador en el editor. Si la apertura automática falla después de una conversión confirmada, la UI informa de que el borrador ya existe y pide recargar la lista de entidades, sin reintentar la conversión.

## Volumen de la bandeja

La bandeja mantiene el contrato de cargar todas las solicitudes disponibles en la campaña activa y aplicar filtro/orden en cliente. Para evitar que una inserción concurrente invalide o desplace páginas ya leídas, el adaptador recorre el histórico con keyset pagination estable sobre `(created_at desc, id asc)`, sin `offset` ni `count=exact`.

La carga completa sigue siendo un límite de rendimiento para historiales grandes, no una frontera de autorización ni de integridad. Antes de exponer un volumen sostenido de solicitudes anónimas conviene evolucionar la UI a páginas acotadas y mover el filtro por estado al servidor, reutilizando el cursor ya introducido.

## Pruebas

La cobertura de MAP-056 conserva las regresiones de MAP-026/MAP-027/MAP-046 y añade aislamiento multicampaña:

- unitarios del interceptor para demostrar que filtros y `p_campaign_id` manipulados se sustituyen por la campaña administrativa activa;
- E2E del formulario vacío/parcial/completo, A→B y B→A, keep/move, preservación de campos/posición y bloqueo del submit hasta resolver la decisión;
- E2E completo para A y B: solicitud pública → bandeja scopeada → conversión → borrador en la misma campaña → publicación → pin visible únicamente en esa campaña;
- E2E de payload público con campaña archivada o parámetros de campaña adicionales manipulados que falla de forma cerrada;
- pgTAP para campaña inexistente/archivada, mismatch A/B, grants, autorización no-admin, audiencia pública forzada, `converted_entity_id` same-campaign y ausencia de la antigua RPC sin scope;
- prueba PostgreSQL de dos sesiones concurrentes que usa v2 y verifica que exactamente una conversión gana y que request/entidad mantienen la misma campaña;
- rehearsal de upgrades desde las baselines históricas del repositorio, además de reconstrucción limpia.

La migración es forward-only. `seed.sql` no forma parte del despliegue de producción.
