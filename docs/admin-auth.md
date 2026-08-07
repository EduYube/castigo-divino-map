# MAP-017 — Autenticación y autorización administrativa

## Estado

Diseño e implementación de la Beta 0.2 en la rama `agent/map-017-admin-auth`.

Este documento describe la frontera de autenticación administrativa. No habilita CRUD de categorías, etiquetas, nombres, pines ni otras operaciones reservadas a MAP-018 y posteriores.

El 7 de agosto de 2026 se aplicaron y verificaron en `atlas-nuevos-dioses-prod` las dos migraciones de MAP-017 registradas como `20260807111646_expose_admin_authorization_probe` y `20260807111841_harden_admin_authorization_probe`. El historial remoto previo contenía exactamente las diez migraciones de MAP-014/MAP-015 y no presentaba deriva.

## Fuentes y decisión de cliente

El 7 de agosto de 2026 se revisó la documentación oficial vigente de Supabase Auth y la versión publicada de `@supabase/supabase-js` 2.111.0. La SDK documenta `signInWithPassword`, persistencia personalizable, renovación de sesión, `onAuthStateChange` y `signOut({ scope: 'local' })`.

MAP-017 no añade `@supabase/supabase-js` al bundle. La aplicación pública de MAP-016 ya usa un adaptador `fetch` mínimo y anónimo; introducir un cliente Supabase compartido aumentaría el bundle y, sobre todo, facilitaría que un JWT administrativo se añadiese accidentalmente a lecturas públicas. El adaptador administrativo usa directamente los endpoints oficiales de Supabase Auth y PostgREST y reproduce únicamente los contratos necesarios de la Beta 0.2:

- password grant equivalente a `signInWithPassword`;
- refresh token rotatorio;
- eventos de sesión internos mediante el puerto `onAuthStateChange`;
- cierre remoto con alcance `local`;
- RPC administrativa mínima para comprobar autorización.

No se introducen librerías de estado ni de UI.

## Fronteras

### Catálogo público

`SupabasePublicCatalogRepository` conserva su contrato de MAP-016. Sus peticiones públicas siguen enviando únicamente la clave publicable mediante `apikey`; no recibe, importa ni conoce la sesión administrativa.

Esto es intencionado: incluso cuando la pestaña tiene una sesión administrativa activa, las lecturas públicas siguen recorriendo exactamente el mismo camino anónimo y resiliente.

### Auth

`src/auth/` contiene tipos de dominio, estado y coordinación. No importa DOM, Leaflet ni tipos externos de Supabase.

`AuthGateway` ofrece:

- inicio de sesión;
- restauración;
- refresh explícito;
- logout;
- eventos de estado;
- limpieza de recursos.

`AdminAuthorizationGateway` es una comprobación separada. Tener una identidad autenticada nunca produce por sí solo el estado `authorized`.

### Infraestructura Supabase

`SupabaseAdminAuthAdapter` implementa ambos puertos, pero mantiene internamente los tokens y no los devuelve al dominio. La aplicación solo recibe `AuthIdentity` con UUID, correo opcional y caducidad.

El adaptador usa:

- `POST /auth/v1/token?grant_type=password` para login;
- `POST /auth/v1/token?grant_type=refresh_token` para renovación;
- `POST /auth/v1/logout?scope=local` para logout normal;
- `POST /rest/v1/rpc/current_user_is_admin` para autorización.

El RPC se invoca únicamente después de obtener o restaurar una sesión. La clave publicable acompaña las peticiones; el JWT de usuario solo se añade a Auth y a la operación administrativa de autorización, nunca al repositorio público.

## Persistencia de sesión

`BrowserAuthSessionStorage` encapsula `window.sessionStorage` y usa el namespace:

`castigo-divino-map:auth:v1`

La sesión contiene access token, refresh token, caducidad e identidad mínima porque Supabase necesita ambos tokens para renovar y cerrar la sesión. Esos valores:

- permanecen únicamente en memoria y `sessionStorage` de la pestaña;
- desaparecen al cerrar la pestaña o el navegador según el contrato de `sessionStorage`;
- se sustituyen al rotar el refresh token;
- se eliminan localmente antes de intentar el logout remoto;
- nunca se copian a URL, DOM, mensajes, logs, snapshots, Issues o PRs.

Si `sessionStorage` no está disponible o lanza una excepción, Auth falla de forma cerrada y el mapa público continúa funcionando.

## Renovación y eventos

La sesión se renueva antes de la caducidad. Un refresh automático correcto emite un único `token-refreshed`; un refresh automático fallido elimina la sesión local y emite `refresh-failed`.

`AdminAuthController` escucha eventos mediante su puerto `onAuthStateChange`. Los eventos relevantes son:

- `initial-session`;
- `signed-in`;
- `signed-out`;
- `token-refreshed`;
- `refresh-failed`.

El logout normal usa alcance local. El alcance global queda fuera del flujo normal y se reserva para una acción humana explícita ante un incidente.

## Estados de aplicación

El estado de Auth es explícito y testeable:

| Fase | Significado | Modo administrativo |
| --- | --- | --- |
| `anonymous` | no hay sesión | bloqueado |
| `restoring` | se lee la sesión de la pestaña | bloqueado |
| `authenticating` | password login en curso | bloqueado |
| `authorizing` | sesión presente; PostgreSQL decide el rol | bloqueado |
| `unauthorized` | usuario autenticado fuera de la allowlist o 403 | bloqueado |
| `authorized` | sesión válida y RPC administrativa positiva | permitido para futuras operaciones |
| `expired` | sesión caducada, revocada o refresh fallido | bloqueado |
| `error` | error recuperable o inesperado de Auth | bloqueado |

Solo `authorized` habilita el modo administrativo.

## Autorización en PostgreSQL

Las diez migraciones integradas antes de MAP-017 permanecen inmutables.

MAP-017 añade dos migraciones hacia delante que reflejan exactamente el historial registrado en el proyecto alojado:

1. `20260807111646_expose_admin_authorization_probe.sql` crea `public.current_user_is_admin() -> boolean` con `search_path` vacío y una primera ACL explícita.
2. `20260807111841_harden_admin_authorization_probe.sql` convierte el wrapper público a `SECURITY INVOKER` y retira `EXECUTE` a `anon`, manteniéndolo únicamente para `authenticated`.

El estado final de la función:

- es `SECURITY INVOKER`;
- fija `search_path` vacío;
- no acepta parámetros;
- devuelve exclusivamente el resultado de `private.is_admin()` para `auth.uid()`;
- no expone `private.admin_users`;
- no devuelve UUIDs, correos ni metadata;
- solo permite `EXECUTE` a `authenticated`;
- mantiene la elevación necesaria confinada en `private.is_admin()`, que vive fuera del esquema expuesto por Data API.

Las políticas RLS existentes siguen siendo la frontera autoritativa para cualquier escritura. Manipular botones, estado JavaScript o el DOM no convierte a un usuario en administrador.

### Validación alojada

Antes de aplicar MAP-017 se verificó que el historial remoto contenía exactamente las diez migraciones previas y que `current_user_is_admin()` no existía. El proyecto tenía un único usuario confirmado, una única entrada en `private.admin_users` y ambas correspondían entre sí; no se creó ni modificó ningún usuario ni la allowlist.

Después del despliegue se verificó:

- historial remoto con las doce migraciones esperadas;
- `SECURITY INVOKER` y `search_path` vacío en el wrapper público;
- ausencia de `EXECUTE` para `anon` y presencia para `authenticated`;
- `42501` al intentar invocar la RPC como `anon`;
- resultado `false` para un UUID autenticado no allowlisted;
- resultado `true` para el usuario autenticado allowlisted;
- ausencia de findings de seguridad nuevos para `current_user_is_admin()` en Database Advisors.

Los advisors conservan findings preexistentes ajenos a MAP-017, entre ellos la RPC pública `submit_public_request` y la protección de contraseñas filtradas desactivada. Se documentan como trabajo de seguridad separado y no se resuelven alterando el contrato de esta Issue.

## Concurrencia y resultados obsoletos

`AdminAuthController` asigna un `operationId` monotónico a cada operación. Una respuesta que llega después de un login, logout, refresh o evento más reciente se descarta si ya no coincide con la generación activa.

Esto cubre:

- login mientras se restaura una sesión;
- dos intentos de login solapados;
- logout mientras una autorización está pendiente;
- respuesta de autorización después de perder la sesión;
- eventos Auth posteriores a una operación más reciente.

Al destruir el controlador se eliminan listeners y timers del adaptador; las respuestas posteriores no pueden publicar nuevo estado.

## Errores y mensajes

Los detalles internos de Supabase no se propagan a la UI. El dominio normaliza errores a códigos cerrados y mensajes públicos en castellano.

En particular:

- credenciales inválidas no distinguen usuario inexistente, contraseña incorrecta o correo no confirmado;
- un refresh inválido se convierte en `refresh-failed`;
- 401 administrativo se convierte en sesión caducada;
- 403 administrativo se convierte en autorización denegada;
- fallos de red y timeout no cambian el estado del catálogo público;
- respuestas JSON o booleanas inválidas se rechazan antes de entrar en estado.

No se registran objetos completos de error. La UI usa `textContent` para cualquier texto dinámico.

## UI

La cabecera incorpora un acceso discreto `Administrar`. El login usa un elemento `<dialog>` nativo con:

- correo y contraseña etiquetados;
- `autocomplete="username"` y `autocomplete="current-password"`;
- validación nativa de correo requerido;
- estado de envío anunciado mediante `role="status"`;
- foco inicial en correo;
- cierre con botón o Escape;
- restauración del foco al punto de entrada;
- diseño sin overflow horizontal a 320 px.

Tras autorización positiva aparece un shell mínimo que confirma la sesión y ofrece logout. No contiene controles de edición.

El shell escucha el evento seguro de MAP-016 `atlas:public-data-status`. Cuando el backend público está `degraded` u `offline`, indica que las futuras mutaciones permanecen bloqueadas. Un fallo de Auth no modifica el estado público y un fallo del catálogo nunca fabrica una sesión.

## Variables públicas

Auth reutiliza las dos variables públicas ya documentadas:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

No se añade ninguna variable privilegiada. La clave publicable puede estar en el bundle; secretos, service role, tokens de gestión, contraseñas y cadenas PostgreSQL siguen prohibidos.

## Pruebas

MAP-017 añade cobertura para:

- transiciones del controlador y descartes por generación;
- login válido e inválido;
- administrador y no administrador;
- restauración, refresh, expiración y logout;
- almacenamiento no disponible;
- normalización de errores sin secretos;
- adaptador HTTP y RPC administrativa;
- pgTAP para permisos del probe, autenticado no admin y admin;
- login e2e, teclado, foco, recarga de la misma pestaña, logout, 401, red caída y viewport de 320 px;
- ausencia de tokens en URL, texto del DOM y consola de las pruebas e2e.

El flujo ordinario del proyecto exige el preflight definido en `docs/project-status.md`. Para esta iteración de MAP-017, el mantenedor autorizó expresamente omitir el preflight local y usar GitHub Actions como bucle de validación antes de considerar la Issue completada.

## Puntos de control humanos

La aplicación de las migraciones MAP-017 al Supabase alojado fue autorizada explícitamente y quedó completada el 7 de agosto de 2026. No se modificaron usuarios reales, `private.admin_users` ni credenciales.

Siguen requiriendo una acción deliberada separada:

- probar el password login real con las credenciales del administrador, que no se almacenan ni se solicitan a automatizaciones;
- marcar la PR como lista;
- fusionar;
- comprobar el despliegue de Pages posterior al merge;
- cerrar la Issue #36.
