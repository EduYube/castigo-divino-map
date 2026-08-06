# Acceso público resiliente y estado del backend

- Issue: MAP-016 / #35
- Estado: implementado en rama; pendiente de CI definitiva, configuración pública y validación humana
- Contratos relacionados: arquitectura Beta 0.2, modelo de datos Beta 0.2 y compatibilidad Beta 0.1

## Objetivo

La aplicación carga y valida la proyección pública de Supabase sin depender de ella para arrancar. El atlas conserva un catálogo público compatible con Beta 0.1 cuando Supabase está lento, pausado, mal configurado, sin conexión o devuelve una respuesta inválida.

PostgreSQL y RLS siguen siendo la frontera definitiva para decidir qué filas puede leer un visitante. El navegador aplica además una selección explícita de columnas, filtros `publication_status=eq.published`, lectura paginada verificable y validación estructural, semántica y relacional antes de aceptar una respuesta.

## Capas

```text
src/data-access/publicCatalog.ts
  contrato común, errores normalizados, metadatos y checksum

src/infrastructure/snapshot/
  snapshot empaquetado, catálogo estático de último recurso y caché de sesión

src/infrastructure/supabase/
  consultas REST públicas, paginación, mapeo y validación del contrato Beta 0.2

src/application/publicCatalogService.ts
  precedencia, timeout, reintentos, cancelación y máquina de estados

src/app/publicDataRuntime.ts
  composición del navegador, refresco y eventos de conectividad

src/app/backendStatus.ts
  indicador visible y accesible
```

La capa de acceso no importa Leaflet ni componentes de presentación. Leaflet recibe únicamente el catálogo Beta 0.1 ya validado durante la transición de MAP-016 a MAP-028.

## Compatibilidad temporal con Beta 0.1

MAP-016 no convierte con pérdida el dominio Beta 0.2 en lugares de Beta 0.1.

El catálogo histórico se conserva mediante el mismo export público `campaignCatalog`, pero su fuente serializable pasa a ser `src/data/catalog.json`. El script `npm run snapshot:generate` genera desde esa fuente:

```text
public/data/public-catalog.snapshot.json
```

El snapshot usa el contrato:

```ts
interface PublicCatalogSnapshotV1 {
  schemaVersion: 1;
  contract: 'beta01';
  generatedAt: string;
  sourceRevision: string;
  checksum: string;
  catalog: CampaignCatalog;
}
```

Mientras MAP-028 no complete la transición:

- el atlas visible se monta desde el snapshot Beta 0.1;
- si el snapshot no puede leerse o validarse, se usa el catálogo estático incluido en el bundle;
- Supabase se consulta y valida en segundo plano mediante el contrato Beta 0.2;
- una respuesta remota válida cambia el estado del backend a `connected`, pero no sustituye el catálogo visible;
- búsqueda, filtros, selección, fichas, URLs e historial no se remontan ni se modifican durante una recuperación.

Esta política permite implementar la infraestructura real de acceso público sin adelantar la migración funcional asignada a MAP-028.

## Snapshot

### Fuente y generación

`src/data/catalog.json` es la fuente inicial del snapshot. La generación:

```bash
npm run snapshot:generate
```

- ordena canónicamente objetos para calcular hashes;
- calcula `sourceRevision` como SHA-256 del catálogo fuente;
- conserva `generatedAt` si el contenido no ha cambiado;
- calcula un segundo SHA-256 sobre el sobre completo sin el propio checksum;
- escribe JSON UTF-8 con formato estable.

La verificación:

```bash
npm run snapshot:verify
```

falla si el catálogo, la revisión, el checksum o el contrato no coinciden. `build` y `build:pages` ejecutan esta comprobación antes de TypeScript y Vite.

### Caducidad

La caducidad es blanda y se fija en 30 días. Un snapshot antiguo continúa siendo utilizable y se marca como `stale`; no se rechaza únicamente por edad. Se rechaza si:

- no es JSON válido;
- no usa `schemaVersion: 1` y `contract: beta01`;
- la fecha es inválida;
- el catálogo no supera la validación de Beta 0.1;
- el checksum no coincide.

El catálogo estático incluido en el JavaScript no tiene una fecha de generación demostrable. Cuando se utiliza como último respaldo se marca siempre como `stale` y el indicador no atribuye al contenido la fecha de carga del navegador.

### Precedencia durante MAP-016

```text
snapshot empaquetado válido
  -> catálogo estático validado incluido en el bundle
  -> shell recuperable sin datos, únicamente si ambos fallan
```

La carga del snapshot empaquetado está limitada a dos segundos para que un recurso local bloqueado no retrase indefinidamente el arranque. La última proyección Beta 0.2 válida también se guarda de forma best-effort en `sessionStorage`, con la clave prefijada `castigo-divino-map:public-catalog:v2`.

La caché Beta 0.2 no se acepta mediante una conversión de tipos. Al leerla se reconstruyen las mismas filas públicas y se ejecuta el mismo decodificador usado para Supabase: propiedades permitidas, tipos, formatos, enums, coordenadas, ubicaciones anidadas, unicidad, referencias, tipos de entidad y checksum. Una caché corrupta se elimina y no entra en el estado de la aplicación.

## Consulta pública de Supabase

La implementación usa la Data REST API en `/rest/v1/` y envía la clave pública únicamente en la cabecera `apikey`. No envía una clave `sb_publishable_...` como bearer token.

Cada consulta:

- selecciona columnas públicas de forma explícita;
- usa `publication_status=eq.published` en las tablas editoriales;
- aplica un orden determinista;
- no solicita timestamps internos, estados editoriales, usuarios, solicitudes ni campos administrativos;
- se carga por páginas de hasta 1.000 filas mediante `Range` y `Range-Unit: items`;
- solicita `Prefer: count=exact` y comprueba `Content-Range` en cada página;
- rechaza totales ausentes, cambiantes, desalineados o incompatibles con las filas recibidas;
- comparte un `AbortSignal` interno para cancelar el conjunto completo.

Se consultan:

- categorías;
- etiquetas;
- jugadores;
- entidades;
- aliases de entidades;
- relaciones de etiquetas;
- disposiciones por jugador;
- notas y etiquetas de notas;
- nombres geográficos y aliases;
- acontecimientos de localización.

La respuesta solo se acepta cuando se ha confirmado el total de cada tabla, se han recibido todas sus páginas y todas las colecciones forman un catálogo válido. No se mezclan páginas, filas o tablas parciales con el snapshot.

Si una de las doce consultas falla, el repositorio aborta inmediatamente las demás consultas pendientes del mismo intento antes de propagar el error. Un reintento no comienza con solicitudes huérfanas del intento anterior.

## Estados

### `connected`

Supabase ha respondido dentro del límite, se ha confirmado la completitud de todas las tablas y la proyección supera validación estructural, de tipos, coordenadas, unicidad, referencias semánticas y checksum.

Durante la compatibilidad Beta 0.1, el origen visible sigue siendo el snapshot aunque el origen remoto figure como `supabase`.

### `degraded`

El navegador parece conectado, pero ocurre alguno de estos casos:

- configuración pública ausente o inválida;
- error de red;
- timeout;
- HTTP no satisfactorio;
- rate limiting;
- JSON inválido;
- paginación o recuento no verificable;
- colección o relación inválida;
- contrato no soportado.

El atlas continúa con el snapshot o el catálogo estático.

### `offline`

`navigator.onLine` indica ausencia de conexión o se recibe el evento `offline`. No se inicia una nueva consulta remota y se conserva el contenido local validado.

## Timeout, reintentos y cancelación

- timeout por intento remoto: 5 segundos;
- timeout por origen local: 2 segundos;
- intentos remotos máximos: 3;
- retrasos base: 0, 2 y 5 segundos;
- jitter acotado: entre el 80 % y el 120 %;
- una nueva actualización cancela la anterior;
- un fallo de tabla cancela las demás peticiones del lote actual;
- una respuesta obsoleta no puede publicar estado;
- no se reintentan automáticamente errores permanentes de configuración o validación;
- se reintentan fallos de red, timeout, 408, 429 y 5xx.

El runtime también solicita actualización:

- al recibir `online`;
- al pulsar **Reintentar**;
- al volver a una pestaña visible si han pasado cinco minutos;
- cada cinco minutos mientras la pestaña está visible y conectada.

No existen reintentos infinitos.

## Indicador accesible

El indicador se inserta en la región existente de estado de la cabecera.

- usa texto visible en todos los estados;
- expone `data-backend-state` y el origen de datos para pruebas;
- usa `role=status`, `aria-live=polite` y `aria-atomic=true`;
- usa `aria-busy=true` mientras comprueba;
- cambia a `role=alert` únicamente si no existe ningún catálogo utilizable;
- combina texto, símbolo y estilo, por lo que no depende solo del color;
- el botón **Reintentar** cumple el objetivo táctil mínimo de 44 px;
- la animación de comprobación se desactiva con `prefers-reduced-motion`.

Textos públicos:

- `Comprobando el servicio de datos…`
- `Servicio de datos conectado.`
- `Modo de respaldo. El servicio de datos no está disponible. Se muestra contenido guardado del …`
- `Sin conexión. Se muestra contenido guardado del …`
- `No se pudo cargar el contenido público. Reintenta la conexión.`

Cuando el origen es el catálogo estático de último recurso se omite la fecha porque su antigüedad no puede deducirse del momento en que el navegador lo cargó.

## Observabilidad segura

MAP-016 no incorpora telemetría externa.

Cada cambio emite el evento local `atlas:public-data-status` con únicamente:

- estado del backend;
- disponibilidad;
- origen visible;
- origen remoto;
- código normalizado;
- fecha de comprobación.

No se incluyen claves, cabeceras, cuerpos de respuesta, cadenas de conexión, tokens, URL completa del usuario ni contenido editorial.

## Variables públicas

El navegador admite exclusivamente:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

El workflow de Pages debe recibirlas desde GitHub Actions Variables, no desde secrets privilegiados ni valores versionados. Una build sin variables sigue siendo válida y arranca en `degraded` con snapshot.

Un proyecto alojado requiere una clave con prefijo `sb_publishable_`. El navegador no admite una clave `anon` JWT legacy para una URL `https://…supabase.co`, lo que mantiene coherencia con la auditoría del artefacto de producción.

La CLI local de Supabase todavía entrega una clave `anon` legacy. Solo en desarrollo, con una URL `http://localhost` o `http://127.0.0.1`, se acepta ese formato después de decodificar el payload y comprobar que el rol sea exactamente `anon`. Una clave local con rol `service_role` se rechaza.

Quedan prohibidos:

- `sb_secret_...`;
- `service_role`;
- `SUPABASE_ACCESS_TOKEN`;
- contraseña o conexión PostgreSQL;
- JWT de usuario;
- cualquier secreto de campaña.

## Pruebas

La cobertura añadida incluye:

- checksum, caducidad blanda, manipulación del snapshot y frescura desconocida del respaldo estático;
- carga remota completa con cabecera `apikey` y sin `Authorization`;
- paginación de una tabla con más de 1.000 filas y comprobación de `Content-Range`;
- rechazo de respuestas `200` cuya completitud no puede verificarse;
- cancelación de las otras once consultas cuando una tabla falla;
- filtros explícitos de publicación;
- errores HTTP y filas inválidas;
- decodificación común de respuestas remotas y caché Beta 0.2;
- rechazo de ID duplicados, coordenadas fuera de rango, enums y campos anidados inválidos;
- rechazo de acontecimientos cuyos personajes o ubicaciones apuntan al tipo de entidad incorrecto;
- política diferenciada entre claves publishable alojadas y clave anon local;
- estados conectado, degradado y offline;
- timeout local y remoto y ausencia de reintentos para errores permanentes;
- recuperación e indisponibilidad en Playwright;
- conservación de marcadores, selección, búsqueda, filtros, ficha y URL;
- auditoría del snapshot dentro de `dist`.

## Operación y recuperación

### Configuración ausente

Resultado esperado: `degraded`, snapshot visible y botón **Reintentar**. No es un fallo de build.

### Supabase pausado o inaccesible

Resultado esperado: tres intentos acotados, cancelación de cada lote fallido, `degraded` y snapshot visible.

### Respuesta truncada o sin recuento verificable

Resultado esperado: rechazo como `partial-response`, estado `degraded` y snapshot visible. Nunca se publica `connected` a partir de una colección cuya completitud no se haya confirmado.

### Navegador offline

Resultado esperado: `offline`, sin consulta remota nueva y snapshot visible.

### Snapshot inválido

Resultado esperado: rechazo del snapshot, uso del catálogo estático validado y error recuperable registrado en el resultado. El respaldo estático se marca como antiguo y no muestra una fecha de contenido inventada.

### Supabase recuperado

Resultado esperado: `connected` sin remontar Leaflet, búsqueda, filtros, selección, fichas o historial. La transición de contenido visible permanece pospuesta hasta MAP-028.

### Ambos respaldos inválidos

La aplicación conserva el shell y el indicador de error. Este caso requiere corregir el artefacto y redeplegar; CI y `verify-production-build.mjs` están diseñados para impedir que llegue a Pages.

## Checkpoints humanos pendientes

Antes de fusionar:

1. Crear o verificar las dos GitHub Actions Variables públicas sin publicar sus valores.
2. Revisar el diff y confirmar que no existe ninguna clave privilegiada.
3. Validar visualmente `connected`, `degraded` y `offline`.
4. Validar teclado, lector de pantalla, contraste y mensajes.
5. Comprobar recuperación conservando selección, búsqueda, filtros, ficha, URL e historial.
6. Confirmar CI verde sobre el head definitivo.
7. Dar autorización humana explícita para fusionar.

MAP-016 no requiere migraciones ni operaciones contra el proyecto Supabase alojado.
