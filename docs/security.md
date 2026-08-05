# Seguridad de la Beta 0.2

- Estado: política aceptada para implementación
- Fecha: 2026-08-04
- Issue: MAP-013 / #32

## Objetivo

Definir las fronteras de confianza, amenazas, controles y pruebas mínimas para introducir Supabase sin convertir el frontend estático en una falsa barrera de seguridad.

Esta política se aplica al código, PostgreSQL, Supabase Auth, GitHub Actions, snapshots, documentación y operación editorial.

## Activos protegidos

- integridad del catálogo público;
- confidencialidad de borradores, archivados y solicitudes;
- cuenta y sesión del administrador;
- credenciales de Supabase, PostgreSQL y GitHub;
- estabilidad de IDs, slugs, relaciones y URLs;
- disponibilidad del atlas público;
- ausencia de secretos de campaña en superficies públicas;
- trazabilidad de migraciones y despliegues.

## Fronteras de confianza

### Navegador

No confiable. El visitante puede modificar JavaScript, DOM, almacenamiento, variables, requests, JWT caducados, parámetros, coordenadas y payloads. Ninguna decisión de autorización reside aquí.

### GitHub Pages y artefacto Vite

Públicos. Cualquier valor incluido puede copiarse. Solo se permiten la URL de Supabase, la clave publicable y datos aptos para visitantes.

### Supabase API y Auth

Frontera de autenticación y transporte. Traduce las peticiones a roles PostgreSQL, renueva sesiones y aplica configuración de Auth. No sustituye las políticas de datos.

### PostgreSQL y RLS

Frontera autoritativa. Define quién puede leer o escribir, valida estados, relaciones, longitudes y transiciones, y rechaza toda operación no permitida aunque el cliente haya sido manipulado.

### Operación privilegiada

Dashboard, CLI, cuenta de GitHub, entorno `supabase-production` y credenciales de base de datos. Su compromiso permite cambios de alto impacto y exige protección separada.

### Cadena de suministro

Dependencias npm, Supabase CLI, GitHub Actions y scripts de build. Se fijan versiones, se revisan cambios y se audita el artefacto.

## Clasificación de claves y credenciales

| Valor | Clasificación | Ubicación permitida | Ubicación prohibida |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Público | código, Actions Variables, bundle | — |
| `sb_publishable_...` | Público de bajo privilegio | código, Actions Variables, bundle | no se trata como autorización |
| JWT `anon` heredado | Público de bajo privilegio | compatibilidad temporal del cliente | nuevos nombres/documentación |
| access token de usuario | Secreto de sesión | memoria y almacenamiento Auth de la pestaña | logs, URL propia, snapshot, Issues, PRs |
| refresh token | Secreto de sesión crítico | almacenamiento Auth de la pestaña | logs, URL propia, snapshot, Issues, PRs |
| `SUPABASE_ACCESS_TOKEN` | Privilegiado | GitHub Environment secret, terminal segura | frontend, repo, build, logs |
| `SUPABASE_DB_PASSWORD` | Privilegiado | GitHub Environment secret, gestor seguro | frontend, repo, build, logs |
| `sb_secret_...` | Privilegiado, elude RLS | backend u operación aprobada | navegador, repo, Pages, artefactos |
| JWT `service_role` | Privilegiado, elude RLS | compatibilidad operativa excepcional | navegador, repo, Pages, artefactos |
| secretos SMTP/OAuth/CAPTCHA | Privilegiado | configuración segura del proveedor o Edge Function | variables `VITE_*`, repo, build |

La clave publicable no es un secreto. Su seguridad depende de RLS. Una clave secreta o `service_role` elude RLS y nunca se utiliza para construir la experiencia administrativa en el navegador.

## Autenticación y autorización

- Registro público y anónimo deshabilitados.
- Un único usuario Auth precreado y con correo confirmado.
- Login por correo y contraseña mediante `signInWithPassword`.
- Contraseña única generada por gestor; protección contra contraseñas filtradas si la configuración lo permite.
- Lista blanca separada `private.admin_users`; autenticado no equivale a administrador.
- `private.is_admin()` encapsula la comprobación y se usa en RLS.
- `raw_user_meta_data` nunca contiene decisiones de autorización.
- La UI puede ocultar controles, pero cualquier llamada puede reproducirse manualmente.

### Sesiones

- Persistencia limitada a `sessionStorage` mediante adaptador explícito.
- Renovación automática y escucha de eventos de Auth.
- Cierre normal con alcance `local`; cierre global disponible ante incidente.
- Ante renovación fallida, `401` o `403`, se pierde inmediatamente el modo admin.
- No se reintentan mutaciones automáticamente tras reautenticar.
- Los tokens no aparecen en mensajes, trazas ni analítica.

Riesgo aceptado: una SPA estática no puede guardar tokens en una cookie HTTP-only y seguir utilizándolos desde JavaScript. Por ello XSS es una amenaza crítica y la sesión se limita a la pestaña.

## Amenazas y controles

### Exposición de secretos

**Amenaza:** incluir credenciales privilegiadas en `VITE_*`, commits, logs, snapshots o artefactos.

**Controles:**

- solo valores publicables en el build;
- `.env` ignorado y `.env.example` con placeholders;
- GitHub Environment secrets para despliegues de base de datos;
- auditoría de patrones en `dist`;
- revisión del listado exacto del artefacto;
- rotación inmediata ante exposición;
- no almacenar una clave secreta si el flujo no la necesita.

### Lectura de borradores, archivados o solicitudes

**Amenaza:** consultas directas, joins, vistas, contadores, RPC o errores que revelen contenido.

**Controles:**

- RLS en toda tabla expuesta;
- políticas `SELECT` públicas limitadas a `published`;
- relaciones condicionadas por ambos extremos;
- vistas `security_invoker` o esquema no expuesto;
- sin lectura pública de solicitudes;
- pruebas negativas por cada ruta de acceso;
- mensajes genéricos para recursos no visibles.

### Escritura no autorizada

**Amenaza:** manipular el frontend para crear, editar, publicar, archivar o borrar.

**Controles:**

- políticas administrativas solo para `authenticated` y `private.is_admin()`;
- `using` y `with check` en updates;
- transiciones y valores de sistema validados en SQL;
- grants mínimos;
- sin clave privilegiada en el navegador;
- pruebas con visitante, autenticado no admin y admin.

### Manipulación del cliente

**Amenaza:** falsificar estados, IDs, slugs, coordenadas, campos ocultos o resultados del backend.

**Controles:**

- payloads de mutación mediante allowlist;
- RPC pública con firma cerrada para solicitudes;
- columnas protegidas no aceptadas como argumentos públicos;
- constraints, foreign keys y triggers;
- validación runtime de toda respuesta;
- reemplazo atómico de catálogos, sin mezclar datos parciales.

### XSS y contenido textual

**Amenaza:** texto almacenado o parámetro de URL que ejecute scripts y robe sesiones.

**Controles:**

- texto plano como único formato editorial de Beta 0.2;
- `textContent`, atributos seguros y creación DOM; no `innerHTML` con datos;
- validación de URLs y protocolos cuando exista un enlace;
- prohibición de HTML arbitrario, `javascript:`, handlers inline y SVG no confiable;
- CSP por meta compatible con GitHub Pages, con allowlists explícitas para Supabase y la imagen oficial;
- dependencias mínimas y sin evaluación dinámica;
- pruebas XSS en nombres, alias, notas y solicitudes.

GitHub Pages no permite controlar todos los headers HTTP. La CSP en meta es defensa adicional, no sustituto de inserción segura ni RLS.

### Abuso de solicitudes públicas

**Amenaza:** spam, automatización, payloads enormes, contenido ofensivo o consumo de cuota.

**Controles base:**

- operación/RPC dedicada, sin `INSERT` genérico a la tabla;
- lista cerrada de tipos;
- máximos de longitud y coordenadas en SQL;
- estado `pending` forzado;
- honeypot y throttle de UX;
- respuesta mínima;
- moderación manual y posibilidad de deshabilitar el formulario sin afectar lectura pública;
- métricas del volumen sin sacar texto sensible de Supabase.

**Riesgo residual:** RLS y un throttle de navegador no limitan por IP. MAP-029 probará abuso. Si el riesgo es inaceptable, se incorporará una Edge Function con Turnstile y rate limiting antes de publicar.

### Dependencia y caída de Supabase

**Amenaza:** timeout, proyecto pausado, fallo de red o respuesta inválida.

**Controles:**

- snapshot versionado y validado antes de esperar a la red;
- timeout de 5 segundos;
- estados `connected`, `degraded`, `offline`;
- shell y mapa no dependen de la respuesta remota para existir;
- mutaciones bloqueadas fuera de `connected`;
- recuperación atómica y reintento acotado.

### Migración defectuosa o incompatible

**Amenaza:** pérdida de datos, RLS abierta, frontend incompatible o migración parcial.

**Controles:**

- SQL versionado y revisado;
- `supabase db reset` en CI;
- pruebas positivas y negativas de RLS;
- estrategia expand/contract;
- migraciones aplicadas no se editan;
- despliegue serializado;
- dump lógico antes de operaciones destructivas;
- corrección hacia delante y revert del frontend mediante PR.

### Filtración editorial de secretos de campaña

**Amenaza:** publicar spoilers o notas privadas en un campo técnicamente público.

**Controles:**

- no existe almacenamiento de notas privadas en Beta 0.2;
- checklist editorial antes de `published`;
- preview administrativo inequívocamente etiquetado;
- snapshot y build rechazan campos con nombres prohibidos;
- Issues, PRs y logs se consideran superficies públicas;
- purga excepcional e incidente documentado si se filtra contenido.

## Validación en tres niveles

### Frontend

Proporciona feedback temprano, límites y normalización. Se puede omitir o manipular y no constituye protección.

### Operación remota

RPC o repositorio limita campos, fuerza defaults y normaliza errores. Reduce superficie, pero sigue sujeto a RLS y constraints.

### PostgreSQL

Valida obligatoriamente:

- enums y estados;
- unicidad y no reutilización;
- referencias y tipos de extremos;
- coordenadas y longitudes;
- transiciones válidas;
- identidad administrativa;
- visibilidad por estado;
- permisos por operación.

## Políticas RLS mínimas

1. `anon` y `authenticated`: `SELECT` solo de contenido `published`.
2. `authenticated` con `private.is_admin()`: lectura de todos los estados.
3. `authenticated` con `private.is_admin()`: insert/update administrativo con `with check`.
4. Delete administrativo solo para el procedimiento excepcional.
5. Visitantes: sin lectura de solicitudes.
6. Visitantes: ejecución de operación pública cerrada para crear `pending`.
7. Autenticado no admin: ningún permiso adicional al público.
8. Tablas privadas: no expuestas por Data API.

Una tabla nueva no se considera terminada hasta tener RLS, grants explícitos y pruebas negativas.

## Plan de pruebas de seguridad

### Permisos

- lectura pública positiva de cada entidad publicada;
- lectura negativa de estados no públicos;
- escritura negativa por visitante y no admin;
- escritura positiva por admin;
- transición inválida negativa;
- enumeración de solicitudes negativa;
- relación con extremo no publicado negativa;
- uso de clave publicable sin sesión y con sesión no admin;
- prueba local separada de que una clave privilegiada elude RLS, sin usarla para validar permisos de cliente.

### Sesión

- restauración al recargar;
- eliminación al cerrar sesión local;
- expiración durante formulario;
- refresh fallido sin pantalla en blanco;
- `401`/`403` bloquea mutación y conserva modo público;
- tokens ausentes de URL, logs y mensajes.

### XSS

- etiquetas HTML, atributos, entidades, `javascript:`, cierres de tags y Unicode confusable;
- contenido en nombre, alias, descripción, nota y solicitud;
- verificación de que el DOM contiene texto y no nodos ejecutables;
- CSP compatible con recursos legítimos y sin scripts inline innecesarios.

### Build y snapshot

- rechazo de `sb_secret_`, `service_role`, access tokens, contraseñas y JWT de sesión;
- aceptación explícita de la clave publicable esperada;
- snapshot con esquema y checksum válidos;
- ausencia de estados no publicados y campos prohibidos;
- artefacto sin backups, dumps, `.env`, logs, reportes ni mapa oficial.

### Disponibilidad

- timeout, DNS, 401, 403, 429, 5xx, JSON inválido y catálogo referencialmente inválido;
- navegador offline al arrancar;
- recuperación posterior;
- snapshot ausente o corrupto conserva shell y mensaje recuperable;
- administración bloqueada en degradado/offline.

## Auditoría operativa

Se registran en GitHub:

- migraciones y cambios de política;
- PR y SHA de cada despliegue;
- actualización del snapshot;
- incidentes y acciones de rotación, sin copiar el secreto;
- referencia a dumps de recuperación almacenados fuera del repositorio.

No se implementa todavía historial editorial de cada mutación.

## Respuesta a incidentes

### Credencial privilegiada expuesta

1. revocar o rotar inmediatamente;
2. detener workflows y Pages si reduce exposición;
3. revertir mediante PR;
4. auditar commits, logs y artefactos;
5. regenerar credenciales dependientes;
6. documentar recuperación sin publicar el valor.

### Borrador, solicitud o secreto publicado

1. retirar o deshabilitar acceso;
2. archivar o purgar según sensibilidad;
3. regenerar snapshot;
4. revertir y redesplegar si entró en el artefacto;
5. revisar cachés, logs, Issues y PRs;
6. reservar IDs/slugs si hubo purga;
7. añadir una prueba que impida la repetición.

### RLS demasiado permisiva

1. bloquear con una migración urgente de endurecimiento;
2. verificar tablas relacionadas, vistas y RPC;
3. ejecutar la suite negativa completa;
4. inspeccionar logs disponibles para estimar exposición;
5. reabrir la Issue responsable si faltaba cobertura.

### Migración destructiva

1. bloquear nuevas escrituras administrativas;
2. conservar el frontend público mediante snapshot;
3. restaurar dump o proyecto cuando sea necesario;
4. aplicar migraciones desde una revisión conocida;
5. validar RLS y catálogo antes de volver a `connected`.

## Riesgos aceptados

- La clave publicable será visible; RLS es el control previsto.
- La sesión de una SPA es accesible a JavaScript; se reduce con `sessionStorage`, texto seguro y CSP.
- El plan elegido puede no ofrecer backups gestionados; se requieren dumps lógicos antes de cambios destructivos.
- El snapshot puede estar desactualizado, pero es preferible a indisponibilidad y muestra fecha de generación.
- El anti-spam inicial no garantiza rate limiting por IP; existe escalado a Edge Function y Turnstile.
- GitHub Pages limita headers de seguridad; la defensa principal sigue siendo código seguro y políticas de datos.

## Riesgos no aceptados

- clave secreta o `service_role` en el navegador;
- borradores, archivados o solicitudes accesibles a visitantes;
- notas privadas o secretos de campaña en Beta 0.2;
- producción usada para pruebas destructivas;
- migración sin versión, revisión o prueba local;
- pantalla en blanco por dependencia de Supabase;
- publicación automática de solicitudes;
- autorización basada solo en UI o `raw_user_meta_data`.

## Fuentes oficiales de Supabase

- <https://supabase.com/docs/guides/getting-started/api-keys>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/auth/sessions>
- <https://supabase.com/docs/reference/javascript/initializing>
- <https://supabase.com/docs/reference/javascript/auth-onauthstatechange>
- <https://supabase.com/docs/reference/javascript/auth-signout>
- <https://supabase.com/docs/guides/auth/general-configuration>
- <https://supabase.com/docs/guides/auth/password-security>
- <https://supabase.com/docs/guides/deployment/database-migrations>
- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/guides/functions>
