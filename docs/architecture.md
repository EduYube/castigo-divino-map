# Arquitectura de la Beta 0.2

- Estado: Aceptada para implementación
- Fecha: 2026-08-04
- Issue: MAP-013 / #32
- Decisiones relacionadas: ADR 0001 a ADR 0005

## Objetivo

La Beta 0.2 añade persistencia y administración segura al atlas publicado sin perder ninguna capacidad pública de la Beta 0.1. PostgreSQL será la fuente de verdad del contenido; Supabase aportará Data API, Auth y Row Level Security; GitHub Pages seguirá sirviendo un frontend Vite completamente estático.

Esta arquitectura permite que MAP-014 prepare Supabase, migraciones y pruebas de permisos sin reabrir decisiones sobre fronteras de confianza, entornos, claves, publicación, degradación o rollback.

## Fuera de alcance de MAP-013

MAP-013 no crea proyectos de Supabase, tablas, usuarios, secretos, workflows de migración ni código de producción. Tampoco implementa login, CRUD, solicitudes, cambios visuales, notas privadas, traducciones ni un backend propio.

## Principios

1. GitHub y las migraciones versionadas son la fuente de verdad del software y del esquema.
2. PostgreSQL es la fuente de verdad del contenido persistente y de sus invariantes.
3. GitHub Pages y todo el bundle Vite son públicos por definición.
4. El navegador es un cliente no confiable; ocultar controles no autoriza ninguna operación.
5. RLS, restricciones SQL y funciones controladas son la barrera definitiva.
6. Ninguna clave privilegiada entra en navegador, repositorio, `dist`, Pages, logs o artefactos.
7. Los datos remotos se validan antes de entrar en el estado de aplicación.
8. Una caída de Supabase no impide cargar el mapa público con el último snapshot válido.
9. IDs, slugs, coordenadas y URLs publicados son contratos estables.
10. Las migraciones de producción son acumulativas y recuperables; nunca se reescribe `master`.

## Responsabilidades

| Componente | Responsabilidades | Límites |
|---|---|---|
| GitHub Pages | Servir HTML, CSS, JavaScript y snapshot público; conservar `/castigo-divino-map/`; publicar solo artefactos validados. | No ejecuta servidor, no guarda secretos y no decide permisos. |
| Vite + TypeScript | Componer UI pública y administrativa; validar respuestas; mantener búsqueda, filtros, URLs, sesión y degradación; invocar puertos de datos. | No concede permisos, no usa claves privilegiadas y no acopla persistencia a Leaflet. |
| Supabase | Exponer Data API, Auth y operaciones controladas; emitir sesiones; alojar PostgreSQL. | No sustituye las restricciones del modelo ni justifica una tabla sin RLS. |
| PostgreSQL | Persistir datos; aplicar tipos, referencias, transiciones y RLS; identificar al administrador. | No confía en validación del navegador ni en metadata modificable por el usuario. |
| GitHub Actions | Ejecutar calidad, Supabase local, pruebas RLS, build, auditoría y despliegues coordinados. | No imprime secretos ni ejecuta migraciones privilegiadas desde PR no confiables. |

## Fronteras de confianza

1. **Visitante y navegador:** parámetros, DOM, almacenamiento, requests y JWT pueden manipularse.
2. **Frontend publicado:** código, snapshot y variables `VITE_*` pueden inspeccionarse y copiarse.
3. **Supabase API/Auth:** autentica sesiones y traduce peticiones a roles `anon` o `authenticated`.
4. **PostgreSQL:** aplica restricciones y políticas; es la frontera autoritativa de confidencialidad e integridad.
5. **Operación privilegiada:** Dashboard, CLI y workflows protegidos pueden cambiar esquema o configuración.
6. **Cadena de suministro:** dependencias, Actions, build y artefactos pueden filtrar datos si no se auditan.
7. **Recursos externos:** la imagen oficial remota continúa sometida a ADR 0001 y se considera falible.

El análisis de amenazas y controles vive en `docs/security.md`.

## Flujo público de datos

1. El HTML y el bundle cargan desde GitHub Pages.
2. El adaptador de snapshot carga y valida `public-catalog.snapshot.json` y permite renderizar inmediatamente.
3. En paralelo, el repositorio remoto consulta Supabase con URL y clave publicable.
4. PostgreSQL devuelve exclusivamente filas `published` permitidas por RLS.
5. El frontend valida estructura, referencias, IDs, slugs, coordenadas, estados y campos prohibidos.
6. Solo un catálogo remoto completo y válido sustituye de forma atómica el snapshot en memoria.
7. La capa de aplicación deriva búsqueda, filtros, selección y URLs; Leaflet recibe únicamente un modelo de presentación.

No se mezclan filas remotas parciales con el snapshot. Una respuesta inválida se trata como fallo y no contamina el estado visible.

## Capas del frontend

```text
src/
├── domain/                     # Tipos e invariantes sin Supabase, DOM ni Leaflet
├── application/                # Casos de uso, estado y degradación
├── data-access/                # Interfaces de repositorios y errores normalizados
├── infrastructure/
│   ├── supabase/               # Cliente, mapeadores y repositorios remotos
│   └── snapshot/               # Carga y validación de respaldo público
├── auth/                       # Sesión y autorización visible de UI
├── app/                        # Composición y controladores de presentación
├── map/                        # Adaptación final a Leaflet
└── data/                       # Compatibilidad temporal con Beta 0.1
```

### Puertos mínimos

- `PublicCatalogRepository`: obtiene un catálogo público completo y validable.
- `AdminCatalogRepository`: lee todos los estados y ejecuta mutaciones administrativas.
- `PublicRequestRepository`: envía solicitudes mediante una operación restringida.
- `AuthGateway`: inicia, restaura, renueva y cierra sesión; observa cambios de Auth.
- `BackendHealthProbe`: normaliza éxito, timeout, indisponibilidad y recuperación.

Los puertos devuelven tipos de dominio y errores normalizados. No exponen tipos de `@supabase/supabase-js`, DOM ni Leaflet fuera de los adaptadores.

## Compatibilidad con Beta 0.1

Deben permanecer compatibles:

- `L.CRS.Simple`, dimensiones `3600 × 2329`, conversión central `[y, x]` y URL oficial del mapa;
- búsqueda, filtros, selección, fichas, navegación, historial y enlaces compartibles;
- parámetros `place`, `q`, `category` y `tag` y el pathname de GitHub Pages;
- IDs, slugs y coordenadas existentes;
- inserción de texto mediante APIs DOM y `textContent`;
- superficie neutral cuando falla la imagen cartográfica;
- responsive, foco, teclado y pruebas de accesibilidad.

MAP-014 no modificará estos contratos públicos.

## Entornos

| Entorno | Supabase | Datos | Credenciales | Propósito |
|---|---|---|---|---|
| Desarrollo local | Stack local mediante Supabase CLI y Docker | Semillas ficticias | Claves locales y `.env` ignorado | Esquema, Auth, RLS y desarrollo. |
| CI | Stack local efímero recreado desde migraciones | Semillas deterministas | Credenciales locales del job | `db reset`, pruebas SQL/RLS, frontend y build. |
| Preview | Build de Pages servido localmente; Supabase local cuando sea necesario | Snapshot de la rama | Ningún secreto de producción | Revisar artefacto sin escribir en producción. |
| Producción | Un proyecto Supabase alojado dedicado | Datos reales de Beta 0.2 | Públicas en cliente; privilegiadas en entorno protegido | Servicio publicado. |

### Separación de proyectos

Beta 0.2 no necesita inicialmente un segundo proyecto Supabase alojado. Desarrollo y CI usan el stack local; el único proyecto remoto es producción.

Nunca se ejecutan semillas, pruebas destructivas ni escrituras de preview contra producción. Si aparecen previews remotos, colaboración simultánea o pruebas desde dispositivos externos, se crea antes un proyecto no productivo separado. Supabase Branching queda pospuesto.

## Variables, claves y secretos

Pueden aparecer en el bundle:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` con formato `sb_publishable_...`;
- constantes públicas como timeout o versión de snapshot.

Una clave heredada `anon` solo se aceptará como compatibilidad temporal si MAP-014 demuestra que todavía no existe una clave publicable. La nomenclatura nueva será `publishable`.

Quedan prohibidos en variables `VITE_*`, código, snapshot o artefacto:

- `sb_secret_...` y `service_role`;
- `SUPABASE_ACCESS_TOKEN`;
- contraseña o cadena de conexión de PostgreSQL;
- access tokens y refresh tokens de usuarios;
- secretos SMTP, OAuth, CAPTCHA o Edge Functions;
- cualquier dato privado o secreto de campaña.

La URL y clave publicable pueden almacenarse como GitHub Actions Variables. Las credenciales operativas solo pueden existir como secrets de un GitHub Environment protegido o en una terminal segura.

## GitHub Actions y migraciones remotas

MAP-014 preparará un workflow de migración separado con:

- ejecución desde `master`, nunca desde código no confiable de una PR;
- entorno protegido `supabase-production`;
- `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` como encrypted secrets;
- `SUPABASE_PROJECT_ID` como variable operativa;
- permisos GitHub mínimos y concurrencia serializada;
- versión fijada de Supabase CLI;
- migraciones y pruebas locales antes de cualquier `db push`;
- logs que no impriman variables, conexiones ni payloads sensibles.

El workflow público de Pages no recibe claves privilegiadas.

## Autenticación administrativa

### Mecanismo

- Supabase Auth con correo y contraseña mediante `signInWithPassword`.
- Registro público, usuarios anónimos y proveedores sociales deshabilitados.
- Un único usuario creado manualmente y con correo confirmado.
- Contraseña única generada por gestor; protección frente a contraseñas filtradas cuando la configuración lo permita.
- Sin enlaces de recuperación públicos en Beta 0.2; la recuperación administrativa se realiza desde operación segura.

### Identificación del administrador

Autenticado no equivale a administrador. PostgreSQL mantendrá una lista blanca en esquema no expuesto, por ejemplo `private.admin_users`, referenciada por `auth.users.id`.

Una función `private.is_admin()`:

- se ejecuta como `security definer`;
- fija `search_path` seguro;
- no se ubica en un esquema expuesto;
- comprueba `auth.uid()` contra la lista blanca;
- se usa desde RLS como `(select private.is_admin())`.

No se usa `raw_user_meta_data` para conceder permisos.

### Sesión

El cliente se configurará con refresco automático, detección de sesión en URL y persistencia explícita mediante un adaptador prefijado sobre `sessionStorage`. La sesión se restaura al recargar la pestaña, pero no se conserva indefinidamente tras cerrar el navegador.

`onAuthStateChange` mantiene el estado de aplicación. El cierre de sesión usa alcance local. Ante expiración, revocación o refresh fallido:

- la UI vuelve al estado público;
- se cierran controles administrativos;
- se descartan mutaciones no confirmadas;
- se informa de que debe autenticarse de nuevo;
- ninguna escritura se reintenta automáticamente.

## Operaciones permitidas

| Actor | Lectura | Escritura |
|---|---|---|
| Visitante `anon` | Contenido `published` y proyección pública necesaria | Crear una solicitud válida mediante operación controlada. |
| Usuario `authenticated` no admin | Igual que visitante | Ninguna operación administrativa. |
| Administrador autorizado | Contenido publicado, borradores, archivados y solicitudes | Crear, editar, publicar, retirar, archivar, moderar y eliminar solo en casos permitidos. |
| Operación privilegiada | Gestión de esquema y recuperación | Solo por Dashboard/CLI/workflow protegido, nunca desde el navegador. |

Ocultar botones solo mejora la experiencia. RLS y PostgreSQL autorizan o rechazan la operación real.

## Datos y publicación

Los estados son `draft`, `published` y `archived`.

Transiciones válidas:

- `draft -> published`;
- `draft -> archived`;
- `published -> draft`;
- `published -> archived`;
- `archived -> draft`.

No existe `archived -> published`; restaurar obliga a revisar primero como borrador.

El público solo recibe `published`. Los borradores, archivados y solicitudes no pueden filtrarse por consulta, relación, vista, RPC, contador ni error.

### Archivado y eliminación física

Archivar es la operación normal. La eliminación física queda limitada a:

- borradores o solicitudes nunca publicados y sin referencias;
- importaciones fallidas antes de exposición;
- purgas legales o de seguridad de datos personales, credenciales o secretos.

Una purga de contenido publicado coordina base, snapshot, historial Git, artefactos y despliegue. El ID y slug se reservan mediante tombstone o mecanismo equivalente y nunca se reutilizan.

### IDs, slugs y URLs

- Se preservan los IDs de texto de Beta 0.1; no se convierten a UUID de forma obligatoria.
- Los nuevos IDs siguen prefijos estables y no se reutilizan.
- El slug puede cambiar antes de la primera publicación y queda inmutable después.
- El nombre visible puede cambiar sin modificar ID ni slug.
- Las URLs existentes conservan query string y pathname.
- Una futura sustitución de slug requerirá alias o redirección explícita.

## Row Level Security

Todas las tablas y vistas expuestas por Data API tendrán RLS habilitado y grants mínimos. Una tabla sin política será inaccesible.

### Políticas públicas

- `SELECT` para `anon` y `authenticated` solo con `publication_status = 'published'`.
- Las relaciones públicas solo devuelven filas cuyos extremos necesarios estén publicados.
- Las vistas públicas usarán `security_invoker = true` o un esquema no expuesto.
- No existe lectura pública de solicitudes ni de la lista administrativa.

### Políticas administrativas

- `SELECT`, `INSERT`, `UPDATE` y el `DELETE` excepcional se limitan a `authenticated` con `(select private.is_admin())`.
- `UPDATE` define `using` y `with check`.
- Las transiciones se validan también mediante restricción o trigger.
- Un usuario autenticado no incluido en la lista blanca conserva únicamente permisos públicos.

### Solicitudes públicas

La tabla no concede `SELECT`, `UPDATE` ni `DELETE` a visitantes. El alta se realiza mediante una función/RPC específica o endpoint equivalente que:

- acepta solo los campos del formulario;
- fuerza estado inicial `pending` y campos administrativos nulos;
- valida tipo cerrado, coordenadas, longitudes y caracteres;
- no acepta categorías, etiquetas ni estado de publicación;
- devuelve un resultado mínimo sin exponer la fila completa.

La protección base incluye restricciones SQL, honeypot y limitación local de reenvíos. MAP-029 evaluará abuso. Si es insuficiente, se añadirá antes del lanzamiento una Edge Function con CAPTCHA y rate limiting.

### Pruebas obligatorias

MAP-014 establecerá pruebas positivas y negativas para demostrar, al menos:

- visitante lee `published` y no lee `draft` ni `archived`;
- visitante no enumera solicitudes ni escribe contenido;
- visitante solo crea solicitudes válidas por la operación permitida;
- estados, tipos, campos o longitudes inválidos fallan;
- autenticado no admin no obtiene permisos administrativos;
- administrador lee todos los estados y ejecuta transiciones válidas;
- transiciones inválidas y eliminación no autorizada fallan;
- relaciones no filtran contenido no publicado;
- la clave publicable no elude RLS;
- las pruebas de usuario nunca usan una clave secreta para aparentar permisos.

## Disponibilidad y degradación

Los estados visibles son:

- `connected`: catálogo remoto completo y válido;
- `degraded`: existe red, pero Supabase falla, supera 5 segundos, está pausado o devuelve datos inválidos; se usa snapshot;
- `offline`: el navegador informa ausencia de conexión; se usa snapshot.

El indicador será textual, accesible y no dependerá solo de color.

### Activación y recuperación

El snapshot se carga siempre al arrancar. La consulta remota corre en paralelo con `AbortController` y timeout de 5 segundos.

Se usa respaldo ante ausencia de red, error, timeout, payload parcial o fallo de validación. Si también falla el snapshot, se conservan shell, mapa neutro, aviso legal y un error recuperable: nunca una pantalla en blanco.

Al volver la conexión:

- se escucha `online` y se ofrece reintento manual;
- el reintento automático usa backoff acotado;
- solo un catálogo completo reemplaza el actual;
- se conservan consulta, filtros, selección y URL cuando siguen siendo válidos.

En `degraded` u `offline` se bloquean login nuevo, guardado, publicación, archivado, eliminación y moderación. No existe edición offline sincronizable.

## Snapshot público

Se versionará en el repositorio y viajará en `dist`, por ejemplo `public/data/public-catalog.snapshot.json`.

Debe incluir:

- `schemaVersion`;
- `generatedAt` UTC;
- revisión u origen;
- colecciones públicas normalizadas;
- checksum reproducible.

No puede incluir filas no publicadas, solicitudes, usuarios, sesiones, correos, auditoría, campos administrativos, claves ni secretos de campaña.

La generación será explícita y reproducible. Consultará con el rol público o aplicará exactamente la misma proyección de publicación, validará el contrato runtime y se revisará por diff en una PR. CI construirá con el snapshot versionado de la rama y no dependerá de disponibilidad de producción.

## Migración desde Beta 0.1

MAP-028 realizará un importador determinista, pero MAP-014 debe preparar contratos compatibles:

- preservar IDs, slugs y coordenadas exactamente;
- mapear categorías, etiquetas, lugares y notas a las nuevas tablas sin perder referencias;
- introducir entidades de personaje y emplazamiento y disposición independiente;
- rechazar colisiones, estados inválidos y propiedades privadas;
- permitir repetir el import en local sin duplicar datos;
- comparar catálogo remoto y snapshot con el contrato público esperado antes de cambiar la lectura principal.

El catálogo estático continúa siendo la referencia de migración hasta que esa equivalencia sea validada.

## Migraciones y rollback

### Versionado

- `supabase/config.toml`, `supabase/migrations/` y semillas ficticias se versionan.
- Cada cambio se añade como migración SQL nueva con timestamp y nombre descriptivo.
- Una migración aplicada no se edita; se corrige con otra.
- Los cambios manuales remotos solo se admiten para recuperación documentada y deben capturarse después con `db pull` o migración.
- CI ejecuta `supabase db reset`, semillas, pruebas SQL/RLS y generación de tipos.
- Producción recibe migraciones desde un workflow protegido y serializado.

### Expand/contract

1. Añadir tablas, columnas, funciones y políticas compatibles.
2. Desplegar frontend capaz de convivir con contratos anterior y nuevo cuando corresponda.
3. Migrar y verificar datos.
4. Actualizar snapshot y cambiar lectura.
5. Retirar contratos antiguos en una Issue posterior, cuando ningún frontend publicado dependa de ellos.

Las operaciones destructivas se separan de la introducción de sus sustitutos.

### Recuperación

- **Frontend incompatible:** `git revert` en nueva rama y PR; nunca reescribir `master`.
- **Migración fallida:** detener despliegue, inspeccionar historial y aplicar migración de reparación; usar `migration repair` solo con el estado real conocido.
- **Lógica incorrecta ya aplicada:** preferir corrección hacia delante compatible, no down migration destructiva automática.
- **Riesgo de pérdida:** ejecutar `supabase db dump` antes de cambios destructivos y guardar fuera del repositorio; no asumir backups no incluidos en el plan.
- **Secreto publicado:** revertir, retirar artefactos, revocar o rotar credencial y documentar el incidente.
- **Producción irrecuperable:** crear proyecto nuevo, aplicar migraciones desde cero, restaurar el último dump validado, regenerar snapshot y cambiar variables públicas mediante PR.

## Auditoría del build

MAP-014 y MAP-029 ampliarán `verify-production-build.mjs` para:

- permitir solo URL y clave publicable esperadas;
- rechazar `sb_secret_`, `service_role`, tokens de gestión, contraseñas y JWT de sesión;
- validar que el snapshot contiene únicamente datos públicos;
- impedir logs o sourcemaps con payloads sensibles;
- conservar las prohibiciones del mapa oficial de ADR 0001;
- enumerar exactamente los archivos publicados en Pages.

## Decisiones pospuestas

Permanecen fuera de Beta 0.2:

- notas privadas del director de juego;
- traducciones y localización pública;
- MFA obligatorio y controles avanzados de sesión;
- auditoría editorial completa e historial de versiones;
- edición offline y resolución de conflictos;
- staging alojado o Supabase Branching;
- rate limiting externo permanente si las pruebas no lo exigen.

Se mantienen en `docs/future-improvements.md`.

## Fuentes oficiales de Supabase consultadas

- API keys: <https://supabase.com/docs/guides/getting-started/api-keys>
- Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Auth y sesiones: <https://supabase.com/docs/guides/auth/sessions>
- Inicialización y eventos de `supabase-js`: <https://supabase.com/docs/reference/javascript/initializing>
- Login y cierre de sesión: <https://supabase.com/docs/reference/javascript/auth-signinwithpassword>
- Configuración general de Auth: <https://supabase.com/docs/guides/auth/general-configuration>
- Desarrollo local y CLI: <https://supabase.com/docs/guides/local-development/overview>
- Migraciones y entornos: <https://supabase.com/docs/guides/deployment/database-migrations>
- Configuración y secretos: <https://supabase.com/docs/guides/local-development/managing-config>
- Backups: <https://supabase.com/docs/guides/platform/backups>
- Edge Functions y rate limiting: <https://supabase.com/docs/guides/functions>

## Extensión v1.1

Sobre la arquitectura heredada de v1.0, v1.1 añade campaña como dimensión persistente, catálogo público particionado por campaña con geografía global compartida, catálogo Máster efímero scopeado en backend, geometría canónica `point | polygon`, tipos misión/peligro con lifecycle propio y capas de presentación no persistentes. El cambio de campaña purga primero estado privado y solo después carga el catálogo autorizado del nuevo scope.
