# MAP-017 — Autenticación y autorización administrativa

## Estado

MAP-017 está completada e integrada en `master` mediante la PR #65 y el merge commit `1eda9885d54cb72cf3436496287a92c5c61c8de3`.

El 7 de agosto de 2026 se aplicaron y verificaron en `atlas-nuevos-dioses-prod` las migraciones `20260807111646_expose_admin_authorization_probe` y `20260807111841_harden_admin_authorization_probe`. El historial final de MAP-017 contiene doce migraciones. La CI definitiva fue la #222 y el despliegue de Pages posterior al merge quedó validado por el run `31174128169`. La Issue #36 quedó cerrada como completada.

MAP-018 reutiliza esta frontera de autenticación para sus mutaciones administrativas; no modifica usuarios reales, credenciales ni `private.admin_users`.

## Fronteras

### Catálogo público

`SupabasePublicCatalogRepository` conserva el contrato de MAP-016. Sus peticiones públicas envían únicamente la clave publicable mediante `apikey`; no reciben, importan ni conocen la sesión administrativa.

Esto sigue siendo intencionado con MAP-018: incluso cuando la pestaña tiene una sesión administrativa activa, las lecturas públicas recorren el camino anónimo y resiliente. El JWT administrativo nunca se añade al repositorio público.

### Auth

`src/auth/` contiene tipos de dominio, estado y coordinación. No importa DOM, Leaflet ni tipos externos de Supabase.

`AuthGateway` ofrece inicio de sesión, restauración, refresh, logout, eventos de estado y limpieza de recursos. `AdminAuthorizationGateway` es una comprobación separada: tener una identidad autenticada nunca produce por sí solo el estado `authorized`.

`AdminAuthController.invalidateFromAdministrativeResponse()` permite que los adaptadores de MAP-018 conviertan un 401/403 de una operación administrativa en pérdida segura del modo administrador sin alterar el mapa público.

### Infraestructura Supabase

`SupabaseAdminAuthAdapter` mantiene internamente access token y refresh token y no los devuelve al dominio. La aplicación solo recibe `AuthIdentity` con UUID, correo opcional y caducidad.

El adaptador usa:

- `POST /auth/v1/token?grant_type=password` para login;
- `POST /auth/v1/token?grant_type=refresh_token` para renovación;
- `POST /auth/v1/logout?scope=local` para logout normal;
- `POST /rest/v1/rpc/current_user_is_admin` para autorización.

MAP-018 añade un repositorio administrativo separado para el CRUD. Ese repositorio lee el access token vigente de la misma sesión `sessionStorage` inmediatamente antes de cada request protegido. El token no sale de infraestructura y no se comparte con el adaptador público.

## Persistencia de sesión

`BrowserAuthSessionStorage` encapsula `window.sessionStorage` bajo el namespace:

`castigo-divino-map:auth:v1`

La sesión contiene access token, refresh token, caducidad e identidad mínima. Esos valores:

- permanecen únicamente en memoria y `sessionStorage` de la pestaña;
- desaparecen al cerrar la pestaña o el navegador según el contrato de `sessionStorage`;
- se sustituyen al rotar el refresh token;
- se eliminan localmente antes de intentar logout remoto;
- nunca se copian a URL, DOM, mensajes, logs, snapshots, Issues o PRs.

Si `sessionStorage` no está disponible, Auth falla de forma cerrada y el mapa público continúa funcionando.

## Estados

| Fase | Significado | Modo administrativo |
| --- | --- | --- |
| `anonymous` | no hay sesión | bloqueado |
| `restoring` | se lee la sesión de la pestaña | bloqueado |
| `authenticating` | password login en curso | bloqueado |
| `authorizing` | sesión presente; PostgreSQL decide el rol | bloqueado |
| `unauthorized` | usuario autenticado fuera de la allowlist o 403 | bloqueado |
| `authorized` | sesión válida y probe administrativa positiva | permitido |
| `expired` | sesión caducada, revocada o refresh fallido | bloqueado |
| `error` | error recuperable o inesperado de Auth | bloqueado |

Solo `authorized` permite operaciones administrativas, y MAP-018 exige además que el backend de MAP-016 esté `connected` antes de habilitar mutaciones.

## Autorización en PostgreSQL

Las migraciones anteriores permanecen inmutables. El estado final de `public.current_user_is_admin()`:

- es `SECURITY INVOKER`;
- fija `search_path` vacío;
- no acepta parámetros;
- devuelve exclusivamente el resultado de `private.is_admin()`;
- no expone `private.admin_users`;
- solo permite `EXECUTE` a `authenticated`;
- mantiene la elevación necesaria confinada en `private.is_admin()`.

Las políticas RLS existentes siguen siendo la frontera autoritativa para cualquier escritura. Manipular botones, estado JavaScript o DOM no convierte a un usuario en administrador.

## Validación alojada de MAP-017

Después del despliegue de MAP-017 se verificó:

- historial remoto con las doce migraciones esperadas;
- `SECURITY INVOKER` y `search_path` vacío en el wrapper público;
- ausencia de `EXECUTE` para `anon` y presencia para `authenticated`;
- `42501` al intentar invocar la RPC como `anon`;
- resultado negativo para un usuario autenticado no allowlisted;
- resultado positivo para el único administrador allowlisted;
- ausencia de findings de seguridad nuevos para `current_user_is_admin()`.

No se creó ni modificó ningún usuario real ni la allowlist durante esa validación.

## Concurrencia y resultados obsoletos

`AdminAuthController` usa un `operationId` monotónico. Una respuesta posterior a una operación más reciente se descarta. MAP-018 aplica el mismo principio a las cargas de catálogo y añade control optimista por `updated_at` para evitar sobrescribir silenciosamente una edición concurrente.

## Errores

Los detalles internos de Supabase no se propagan a la UI. En Auth:

- credenciales inválidas no distinguen usuario inexistente, contraseña incorrecta o correo no confirmado;
- un refresh inválido se convierte en `refresh-failed`;
- 401 administrativo se convierte en sesión caducada;
- 403 administrativo se convierte en autorización denegada;
- fallos de red y timeout no cambian el catálogo público;
- respuestas inválidas se rechazan antes de entrar en estado.

MAP-018 normaliza además SQLSTATE y errores PostgREST del CRUD a códigos de dominio sin mostrar mensajes SQL crudos.

## UI

La cabecera incorpora `Administrar`. El login usa un `<dialog>` nativo con labels, autocomplete apropiado, estado accesible, foco inicial, Escape y restauración del foco.

Desde MAP-018, el shell autorizado contiene el CRUD de categorías, etiquetas y nombres. El acceso sigue oculto y bloqueado cuando la sesión no es `authorized`; esa ocultación es solo UX, nunca autorización.

El shell escucha `atlas:public-data-status`. Con backend `degraded` u `offline`, las mutaciones permanecen bloqueadas y el mapa público conserva su fallback.

## Variables públicas

Auth y CRUD reutilizan exclusivamente:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

No se añade ninguna variable privilegiada. `service_role`, claves secretas, tokens de gestión, contraseñas y cadenas PostgreSQL siguen prohibidos en navegador, repositorio, CI y artefactos.

## Pruebas

MAP-017 conserva cobertura de login, restauración, refresh, expiración, logout, autorización positiva/negativa, almacenamiento, errores, RPC, pgTAP, teclado, foco, 320 px y ausencia de tokens.

MAP-018 añade cobertura específica del CRUD y de la pérdida de autorización durante operaciones. La documentación detallada vive en `docs/admin-catalog.md`.

## Flujo de validación desde MAP-018

El antiguo «preflight obligatorio antes de lanzar CI» deja de ser requisito del proyecto.

A partir de MAP-018:

1. GitHub Actions puede ejecutarse directamente sobre la rama de trabajo.
2. Los fallos se corrigen sobre esa rama.
3. Cada cambio de head requiere una ejecución nueva para el nuevo SHA.
4. Una ejecución de un SHA anterior no se reutiliza mediante `Re-run jobs` como evidencia del nuevo head.
5. La CI del SHA final es la evidencia definitiva antes de marcar la PR ready o fusionar.

Este cambio afecta únicamente al preflight local previo a CI. No elimina ni debilita los controles de producción de Supabase: comparación de historial, revisión de migraciones pendientes, dry-run cuando corresponda, backups antes de cambios destructivos, validación posterior, rollback y prohibición de ejecutar `seed.sql` en producción siguen vigentes.

## Puntos de control humanos

Los checkpoints de MAP-017 ya quedaron completados. En MAP-018 solo se detiene el flujo ante los checkpoints definidos por la Issue #37: operación destructiva o irreversible en producción, credenciales reales del administrador, cambios de Auth/allowlist/configuración alojada o una acción manual de infraestructura que las herramientas no puedan realizar de forma segura.
