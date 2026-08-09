# Acceso público resiliente y estado del backend

- Issue de origen: MAP-016 / #35
- Transición persistente: MAP-028 / #47
- Estado: infraestructura implementada; MAP-028 sustituye la compatibilidad transitoria de Beta 0.1 por snapshot V2 + Supabase persistente
- Contratos relacionados: arquitectura Beta 0.2, modelo de datos Beta 0.2 y compatibilidad Beta 0.1

## Objetivo

La aplicación carga y valida la proyección pública de Supabase sin depender de ella para arrancar. El atlas conserva contenido público utilizable cuando Supabase está lento, pausado, mal configurado, sin conexión o devuelve una respuesta inválida.

PostgreSQL y RLS siguen siendo la frontera definitiva para decidir qué filas puede leer un visitante. El navegador aplica además selección explícita de columnas, filtros editoriales cuando existen, lectura paginada verificable y validación estructural, semántica y relacional antes de aceptar una respuesta.

## Capas

```text
src/data-access/publicCatalog.ts
  contrato común, errores normalizados, metadatos y checksum

src/data-access/publicCatalogQueryContract.js
  consultas REST públicas, Range/Content-Range y paginación compartida por navegador y tooling

src/infrastructure/snapshot/
  snapshot público V2 empaquetado y caché de sesión

src/infrastructure/supabase/
  validación de configuración, mapeo y validación del contrato Beta 0.2

src/application/publicCatalogService.ts
  precedencia, timeout, reintentos, cancelación y máquina de estados

src/app/publicDataRuntime.ts
  composición del navegador y publicación atómica de cada revisión visible

src/app/backendStatus.ts
  indicador visible y accesible
```

La capa de acceso no importa Leaflet ni componentes de presentación.

## Transición MAP-016 → MAP-028

### Comportamiento histórico de MAP-016

Antes de MAP-028, la aplicación debía preservar exactamente la experiencia Beta 0.1 mientras se construía la infraestructura Beta 0.2. Por eso:

- el snapshot empaquetado usaba el contrato Beta 0.1;
- existía un catálogo estático de último recurso dentro del JavaScript;
- Supabase se validaba en segundo plano;
- una respuesta remota válida cambiaba el estado del backend, pero no sustituía el contenido visible.

Ese comportamiento era deliberadamente temporal.

### Comportamiento actual tras MAP-028

MAP-028 completa la transición:

- `public/data/public-catalog.snapshot.json` usa `schemaVersion: 2`;
- Supabase es la fuente persistente editorial;
- una respuesta remota Beta 0.2 válida se convierte en el envelope visible del servicio;
- el snapshot V2 es el respaldo local reproducible;
- `src/data/catalog.json` queda solo como fixture histórica de pruebas y deja de ser fallback de runtime;
- la compatibilidad de búsqueda, filtros, URLs y fichas Beta 0.1 se deriva **del mismo envelope visible** mediante `toBeta01CompatibilityCatalog(...)`;
- la proyección legacy reconoce únicamente las identidades históricas y no incorpora taxonomía Beta 0.2 futura no relacionada.

`PublicDataRuntime` publica cada revisión como una única unidad `{ beta02, compatibility, checksum, availability }`. Markers, búsqueda, filtros, URL y fichas se actualizan desde esa misma unidad dentro de una sola transición síncrona. Por tanto, una sesión no conserva la representación legacy del snapshot mientras muestra entidades de una revisión distinta de Supabase. Si una identidad legacy deja de estar publicada en el envelope remoto, desaparece también de markers, búsqueda, filtros, selección y estado canónico de URL.

La caché de sesión conserva best-effort la última proyección remota validada, pero no desplaza al snapshot empaquetado durante el arranque. Cuando Supabase responde correctamente, el resultado remoto validado pasa a ser la fuente visible completa.

## Snapshot público V2

La generación y el rollback operativo de la instantánea se documentan en `docs/map-028-catalog-migration.md`.

Propiedades actuales:

- contrato `schemaVersion: 2`;
- SHA-256 canónico del contenido público como `checksum` y `sourceRevision`;
- `generatedAt` estable mientras el contenido no cambie;
- únicamente columnas públicas;
- exclusión de drafts, archived, solicitudes públicas y datos administrativos;
- ausencia de secretos y del mapa oficial;
- validación offline antes de cualquier build;
- comparación exacta contra la proyección publicada de Supabase antes de desplegar GitHub Pages.

La caducidad sigue siendo blanda y se fija en 30 días. Un snapshot antiguo continúa siendo utilizable y se marca como `stale`; no se rechaza únicamente por edad. Se rechaza si su JSON, contrato, estructura, semántica, referencias o checksum no son válidos.

### Precedencia actual

```text
arranque:
  snapshot V2 empaquetado válido
  -> revisión visible inicial

  snapshot ausente o inválido
  -> shell recuperable con availability=unavailable y acción Reintentar

tras comprobación remota:
  Supabase Beta 0.2 válido
  -> sustituye atómicamente la revisión visible completa

si una comprobación posterior falla:
  último envelope visible validado
  -> estado degraded/offline sin sustituirlo por datos parciales
```

No se mezcla contenido parcial de Supabase con el snapshot ni se mezclan dos revisiones válidas entre distintos consumidores de UI.

## Consulta pública de Supabase

La implementación usa la Data REST API en `/rest/v1/` y envía la clave pública únicamente en la cabecera `apikey`. No envía una clave `sb_publishable_...` como bearer token.

El contrato de consultas y paginación vive en `src/data-access/publicCatalogQueryContract.js` y se comparte literalmente entre el repositorio del navegador y los scripts de generación/verificación del snapshot. No existen dos paginadores con garantías distintas.

Cada consulta:

- selecciona columnas públicas de forma explícita;
- usa `publication_status=eq.published` en tablas editoriales que exponen ese lifecycle;
- confía además en RLS para relaciones derivadas sin `publication_status` propio;
- aplica un orden determinista;
- no solicita timestamps internos, estados editoriales, usuarios, solicitudes ni campos administrativos;
- se carga por páginas de hasta 1.000 filas mediante `Range` y `Range-Unit: items`;
- solicita `Prefer: count=exact` y comprueba `Content-Range` en cada página;
- fija el total declarado por la primera página y rechaza que cambie durante la lectura;
- exige que `start` coincida con el offset solicitado y que `end` corresponda exactamente con el número de filas recibido;
- rechaza una página vacía prematura, rangos desplazados, páginas cortas, exceso de filas y una colección final incompleta;
- comparte un `AbortSignal` interno para cancelar el conjunto completo.

Se consultan:

- categorías;
- etiquetas;
- jugadores;
- entidades;
- aliases de entidades;
- relaciones de etiquetas;
- disposiciones por jugador;
- relaciones personaje-lugar;
- notas y etiquetas de notas;
- nombres geográficos y aliases;
- acontecimientos de localización.

La respuesta solo se acepta cuando se ha confirmado el total de cada tabla, se han recibido todas sus páginas y todas las colecciones forman un catálogo válido. Si una consulta falla, el repositorio aborta las demás solicitudes pendientes del mismo intento antes de propagar el error.

El generador y el verificador remoto reutilizan el mismo contrato, incluido el algoritmo de completitud. El tooling remoto añade además un timeout explícito y abortable de 15 segundos para que un gate de despliegue no dependa únicamente del timeout global de GitHub Actions.

## Estados

### `connected`

Supabase ha respondido dentro del límite, se ha confirmado la completitud de todas las tablas y la proyección supera validación estructural, de tipos, coordenadas, unicidad, referencias semánticas y checksum.

Tras MAP-028 el origen visible es `supabase` y `usingFallback = false`.

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

El atlas conserva el último envelope visible validado. En un arranque normal sin respuesta remota ese envelope es el snapshot V2 empaquetado. Si tampoco existe un snapshot válido, el runtime permanece vivo con `availability=unavailable`, muestra el shell sin catálogo y deja disponible el reintento remoto.

### `offline`

`navigator.onLine` indica ausencia de conexión o se recibe el evento `offline`. No se inicia una nueva consulta remota y se conserva el contenido validado disponible.

## Timeout, reintentos y cancelación

- timeout por intento remoto del navegador: 5 segundos;
- timeout por origen local: 2 segundos;
- timeout del lector remoto de snapshot en tooling/Pages: 15 segundos;
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
