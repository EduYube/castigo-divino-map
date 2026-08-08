# MAP-028 — Migración del catálogo Beta 0.1 y transición a Supabase

- Issue: MAP-028 / #47
- Alcance: datos públicos, snapshot, compatibilidad y rollback
- Estado de este documento: implementación preparada; la primera escritura alojada requiere el checkpoint humano de MAP-028

## Fuentes de verdad

Después de MAP-028 cada componente tiene una responsabilidad única:

1. **Supabase** es la fuente persistente del contenido editorial.
2. Solo las filas cuyo ciclo editorial está en `publication_status = published`, junto con relaciones cuyos extremos también son públicos, pueden formar parte de la proyección pública.
3. `public/data/public-catalog.snapshot.json` es una copia pública reproducible de esa proyección para degradación; no es una fuente editorial independiente.
4. **GitHub** conserva el código, las migraciones, los scripts, la fixture histórica de Beta 0.1, las pruebas y la documentación.
5. `src/data/catalog.json` queda exclusivamente como fixture histórica para demostrar equivalencia. El runtime de producción ya no lo usa como segundo fallback y la auditoría del build falla si esa fixture aparece dentro del JavaScript publicado.

No se añaden tablas, políticas RLS, grants, roles, Auth, funciones `SECURITY DEFINER`, secretos ni credenciales en MAP-028.

## Inventario reproducible de Beta 0.1

El inventario de origen es `src/data/catalog.json`. MAP-028 no introduce taxonomía nueva.

### Categorías

| ID | Slug | Destino |
| --- | --- | --- |
| `category-settlement` | `asentamientos` | misma identidad en `public.categories` |
| `category-landmark` | `lugares-destacados` | misma identidad en `public.categories` |

### Etiquetas

`coastal`, `demo-data`, `mountain-pass` y `trade-route` conservan exactamente sus IDs, nombres y descripciones en `public.tags`.

### Entidades/lugares

| ID histórico | Slug | Coordenadas | Categoría | Transformación |
| --- | --- | --- | --- | --- |
| `place-demo-harbor` | `puerto-de-demostracion` | `1080.5, 820` | `category-settlement` | `map_entities`, `location`, `pin`, publicado |
| `place-demo-pass` | `paso-de-demostracion` | `2240, 1240.25` | `category-landmark` | `map_entities`, `location`, `pin`, publicado |

Los IDs históricos `place-*` están admitidos por el contrato Beta 0.2 y se conservan. No se genera ningún ID aleatorio.

Los aliases pasan a filas normalizadas con IDs deterministas:

- `alias-demo-harbor-puerto-ejemplo`;
- `alias-demo-pass-desfiladero-ejemplo`.

Las seis relaciones entidad-etiqueta reciben IDs deterministas `entity-tag-demo-*`.

### Notas públicas

Se conservan los dos IDs y slugs históricos:

- `note-demo-harbor-overview` / `puerto-de-demostracion-resumen`;
- `note-demo-pass-travel` / `paso-de-demostracion-viaje`.

Cada lugar tenía una sola nota, por lo que ambas usan `sort_order = 0`. Las cinco relaciones nota-etiqueta reciben IDs deterministas `note-tag-demo-*`.

### Contenido que no se inventa

Beta 0.1 no tenía jugadores, disposiciones, nombres geográficos normalizados, relaciones personaje-lugar ni acontecimientos de localización. MAP-028 no crea ninguno de esos registros.

### Idioma legado

El esquema Beta 0.2 fija `name_language`/`language = en`. El catálogo Beta 0.1 contiene textos de demostración en castellano. MAP-028 prioriza la conservación literal exigida por compatibilidad y no traduce ni renombra contenido publicado; por tanto, esos dos campos de metadatos siguen usando el único valor admitido actualmente por el esquema. Esta limitación semántica preexistente queda documentada y no se corrige inventando traducciones dentro de una migración de identidad.

## Migración persistente

La migración versionada es:

```text
supabase/migrations/20260808203000_migrate_beta01_public_catalog.sql
```

Orden de inserción:

1. categorías;
2. tags;
3. entidades;
4. aliases;
5. relaciones entidad-tag;
6. notas;
7. relaciones nota-tag.

La migración es data-only y deja actuar a los triggers existentes para normalización, lifecycle, reserva de IDs/slugs y timestamps.

### Idempotencia y conflictos

Cada inserción usa la identidad estable y solo inserta si ese ID no existe. Esto es importante porque los IDs publicados quedan reservados y un `INSERT ... ON CONFLICT DO UPDATE` volvería a atravesar el trigger de reserva antes de resolver el conflicto.

Al final, la migración compara la proyección pública completa esperada de cada identidad con las filas persistidas. Si un ID ya existe con otra semántica —incluidos idioma, resumen o descripción de las entidades— la transacción falla en lugar de sobrescribirlo. Los constraints existentes siguen detectando conflictos por slug o por parejas relacionales.

`npm run supabase:db:test:map028`:

- captura el estado completo de las filas migradas;
- ejecuta por segunda vez el SQL de migración;
- exige que no cambie ni un byte lógico del estado persistido;
- ejecuta el rollback dentro de una transacción;
- comprueba que la proyección migrada deja de ser pública;
- revierte la prueba y exige que el estado original quede intacto.

## Snapshot público V2

La instantánea comprometida usa `schemaVersion: 2`, el mismo contenido lógico que construye el codec de Supabase y un SHA-256 del contenido público como `sourceRevision` y `checksum`.

### Generación real desde Supabase

```bash
VITE_SUPABASE_URL=... \
VITE_SUPABASE_PUBLISHABLE_KEY=... \
npm run snapshot:generate
```

El generador consulta exclusivamente la Data API pública con la clave publicable, columnas explícitas, filtro de publicación, orden determinista, paginación por `Range` y `Content-Range`. No acepta ni necesita `service_role`, contraseña PostgreSQL ni token de administración.

Si el checksum no cambia, conserva `generatedAt`; por ello la misma entrada produce el mismo archivo.

### Verificación contra Supabase

```bash
VITE_SUPABASE_URL=... \
VITE_SUPABASE_PUBLISHABLE_KEY=... \
npm run snapshot:verify:remote
```

La verificación reconstruye la proyección publicada y compara contenido y checksum con el archivo comprometido. Un cambio editorial publicado exige regenerar y versionar el snapshot antes del siguiente despliegue que pretenda garantizar equivalencia exacta.

### Fixture histórica de MAP-028

Antes del checkpoint de producción la base alojada todavía no contiene los datos MAP-028. CI no debe depender de credenciales ni escribir producción. Por eso existe:

```text
scripts/fixtures/beta01-public-rows.json
```

La fixture representa únicamente el resultado esperado de la migración inicial y no es una segunda fuente editorial. Puede usarse de forma explícita con:

```bash
npm run snapshot:generate:fixture
npm run snapshot:verify:migration
```

`build` y `build:pages` no quedan acoplados para siempre a esa fixture histórica: `npm run snapshot:verify` valida offline el checksum, la estructura y los filtros de publicación del snapshot comprometido. Las pruebas de compatibilidad y pgTAP cubren la migración Beta 0.1. Después de la escritura alojada aprobada, `snapshot:verify:remote` debe demostrar igualdad exacta entre el snapshot y Supabase.

La verificación permanente añade datos sintéticos `draft`/`archived` y administrativos a una entrada de prueba y exige que no alteren la proyección pública. La generación nunca serializa `publication_status`, solicitudes públicas, remitentes, motivos, notas de moderación ni otros campos administrativos.

## Compatibilidad Beta 0.1

`toBeta01CompatibilityCatalog(...)` reconstruye la interfaz histórica a partir del snapshot V2:

- reconoce únicamente los IDs históricos `place-demo-harbor` y `place-demo-pass`;
- mantiene sus IDs y slugs;
- conserva aliases y coordenadas;
- incluye solo las categorías y tags usados por esas identidades y sus notas;
- conserva las notas y sus tags;
- mantiene el orden funcional histórico de categorías a partir del primer uso por los lugares legacy.

Las pruebas comparan el resultado completo con `src/data/catalog.json` y añaden taxonomía Beta 0.2 ajena para demostrar que el crecimiento futuro no contamina los filtros legacy. El runtime usa el snapshot V2 como fallback local y, tras un refresh válido, promueve la proyección Beta 0.2 remota de Supabase como fuente visible. `src/data/catalog.json` queda fuera del fallback de producción.

## Rollback

### Datos persistentes

No se hace `reset`, no se borra a ciegas y no se reescribe `master`.

El SQL probado vive en:

```text
supabase/rollback/map-028_archive_beta01_catalog.sql
```

Ese archivo es una plantilla, no una migración desplegable automática. Si hay que revertir MAP-028 en producción:

1. se comprueban de nuevo las precondiciones;
2. se copia exactamente el cuerpo probado a **una nueva migración forward**;
3. se archivan primero relaciones y notas;
4. se archivan aliases;
5. se archivan entidades;
6. solo entonces se archivan categorías y tags.

Las filas publicadas no se eliminan físicamente y los IDs/slugs permanecen reservados.

### Snapshot

Tras una migración forward de rollback se regenera el snapshot desde la nueva proyección publicada. No se edita manualmente para simular otro estado.

### Aplicación

Si el problema está en el adaptador/runtime, se crea un revert o corrección forward en GitHub y se despliega ese nuevo commit. No se hace force-push, `reset --hard` de `master` ni reescritura de historia.

El parser V1 se conserva únicamente para permitir que un despliegue forward de recuperación pueda leer una instantánea Beta 0.1 previamente conocida si fuera necesario.

### GitHub Pages

Pages siempre despliega un commit validado por CI. Antes de construir el artefacto, el workflow compara además el snapshot V2 con la proyección publicada de Supabase usando únicamente las variables públicas del proyecto. El rollback de aplicación es por un nuevo commit/revert normal, seguido por CI, deployment y smoke del SHA exacto.

## Seguridad

MAP-028 no incorpora:

- secretos;
- claves privilegiadas;
- mapa oficial ni derivados;
- cambios RLS;
- cambios de grants;
- Auth;
- roles PostgreSQL;
- nuevas funciones `SECURITY DEFINER`.

La auditoría del artefacto sigue rechazando credenciales conocidas y cualquier raster/mapa empaquetado. Además verifica el snapshot V2 y rechaza la fixture Beta 0.1 si aparece dentro del JavaScript de producción.

## Checkpoint alojado

Antes de la primera escritura de MAP-028 en `atlas-nuevos-dioses-prod` deben estar verdes CI y self-review. En ese momento se repiten, en read-only:

- head exacto de la PR y `master`;
- historial de migraciones;
- ausencia de drift inesperado;
- cantidades existentes de las identidades afectadas;
- RLS/grants;
- Advisors baseline.

Solo tras aprobación humana se aplica la migración forward. Después se comparan cantidades, identidades, checksum remoto/snapshot, historial, Advisors y deployment.
