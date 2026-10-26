# MAP-076 — Selección del mapa local de Neverwinter (v1.3)

- Issue: [#197](https://github.com/EduYube/castigo-divino-map/issues/197).
- PR: [#209](https://github.com/EduYube/castigo-divino-map/pull/209).
- Decisión actualizada: **2026-10-26**, autoritativa del responsable del proyecto.
- Alcance: selección de producto y documentación; **sin incorporar imagen, datos ni código**.
- Contrato de persistencia: [MAP-075](map-075-local-map-contexts.md) y
  [ADR-0008](adr/0008-map-contexts-and-campaign-scoped-placements.md).

## Neverwinter — decisión definitiva de producto

**DECISION: `SELECTED_ASSET`. PRODUCT DECISION: `CLOSED`.**

El responsable del proyecto seleccionó un raster concreto de la ciudad
de **Neverwinter** y lo aportó directamente en el contexto del proyecto.
No corresponde reinvestigar ni sustituir esta selección por un mapa
de Mike Schley, Jared Blando u otra fuente consultada anteriormente.

| Campo | Decisión/dato |
| --- | --- |
| Identificación | Ciudad de Neverwinter; futuro contexto local opcional |
| Asset seleccionado | Raster proporcionado y elegido por el responsable del proyecto |
| Archivo de referencia aportado | `neverwinter-city.jpg` (archivo de la conversación; **NO incluido en Git**) |
| Formato comprobado | JPEG, RGB |
| Dimensiones comprobadas | **2048 × 1582 píxeles** |
| Tamaño comprobado | **1.595.273 bytes** |
| SHA-256 del archivo aportado | `ea2b2b439c1a3a9ead5902df563421aa142228fb527b5aa6b525d7f868ea6f5e` |
| Uso previsto | `map_context` local de Neverwinter, coordenadas `CRS.Simple` |
| Selección de producto | **Cerrada** — `SELECTED_ASSET` |
| Procedencia y derechos de publicación | `RIGHTS_METADATA_PENDING` |
| Estrategia de incorporación | `bundled` o `remote`, pendiente de implementación |
| Imagen dentro del repositorio / bundle | **NO** en MAP-076 |

**Separación obligatoria:** elección por el responsable **no equivale**
a acreditar permiso de hotlink, visualización pública, copias, GitHub
Pages/CDN, modificaciones ni tiles. La procedencia original y las
condiciones de la **imagen aportada** no están documentalmente
acreditadas todavía. No atribuirla automáticamente a un cartógrafo
ni extrapolar licencias de mapas similares. `RIGHTS_METADATA_PENDING`
es riesgo para **incorporación/publicación futura**, **no un bloqueo
de cierre documental de MAP-076**.

El hash anterior identifica los **bytes recibidos en la conversación**;
no acredita autoría ni permisos. Si al incorporar el archivo cambia
su resolución, compresión o contenido, habrá que verificar dimensiones,
hash, procedencia y autorización de la **versión realmente publicada**.

## Metadatos preparados para MAP-077/078 (solo documentación)

La migración
`supabase/migrations/20261016110000_add_optional_local_map_contexts.sql`
define `loading_strategy` como `remote|bundled`, no `pending`.
La restricción exige `loading_strategy=NULL` cuando `image_uri=NULL`.
No se deben almacenar cadenas ficticias como `pending` en un
campo de URL productivo.

```yaml
# Ejemplo documental; NO INSERT / NO registro de producción.
name: Neverwinter
slug: neverwinter
width: 2048
height: 1582
image_uri: null
loading_strategy: null
source_url: null
rights_holder: null
attribution: null
license_notes: >-
  SELECTED_ASSET (2026-10-26): raster aportado/seleccionado por
  el responsable, 2048x1582, SHA-256
  ea2b2b439c1a3a9ead5902df563421aa142228fb527b5aa6b525d7f868ea6f5e.
  RIGHTS_METADATA_PENDING: acreditar procedencia y condiciones de
  publicación, hosting, hotlink y transformación antes de incorporar
  públicamente la imagen.
```

`license_notes` es una plantilla editorial: no otorga derechos ni
permite publicar. Cuando se disponga de evidencia adecuada, registrar
una URL de origen real en `source_url`, el titular comprobado en
`rights_holder`, la atribución exigida, las condiciones y la URL
del asset efectivamente autorizado en `image_uri`. Elegir entonces
`loading_strategy=remote` o `bundled` según la licencia y la forma
real de entrega. Si el uso es autohospedado, verificar expresamente
reproducción y redistribución desde GitHub Pages; si es remoto,
verificar permiso/condiciones de hotlink además de su funcionamiento
técnico. No transformar ni generar tiles sin permiso específico.

## Investigación previa (trazabilidad histórica, no selección vigente)

Antes de la elección del responsable se estudiaron estas opciones
como **investigación histórica**, no como candidatos activos:

- [Mike Schley, Neverwinter (Digital)](https://prints.mikeschley.com/p52230723/h12947418),
  plano urbano relacionado con *Neverwinter Campaign Setting* (2011).
  Su procedencia conocida no acredita automáticamente los derechos de
  incorporación del **archivo actualmente aportado**.
- [Jared Blando, Neverwinter City Map](https://jaredblando.com/sword-coast-adventurers-guide/p/neverwinter-city-map),
  cartografía de *Sword Coast Adventurer's Guide*; el vendedor
  restringe la descarga publicada al uso personal no distribuido.
- [D&D Beyond, recorrido de localizaciones](https://www.dndbeyond.com/posts/1485-take-a-tour-of-these-popular-locations-in-the)
  y el mapa del mundo de Sword Coast: no sustituyen el raster elegido
  ni constituyen licencia de publicación.
- Pinterest, reproducciones y mirrors: fuentes de descubrimiento,
  **nunca prueba de titularidad, licencia o autorización**.

El precedente del **mapa mundial** está documentado por separado en
[map-source-and-licensing.md](map-source-and-licensing.md) y permanece
inalterado; no trasladar la licencia/decisión del mapa mundial al raster
urbano que se acaba de seleccionar.

## City of Shadows / Shade

**`DEFERRED / OUT OF SCOPE`.** Por decisión del responsable del
proyecto, se creará **manualmente más adelante desde la web-app**.
No se continúa investigación, preparación de entidades, contextos,
placements ni derechos dentro de MAP-076. **No bloquea MAP-076.**

## Handoff a implementación

1. Usar **exactamente el raster elegido por el responsable**, no
   reiniciar comparativa. Verificar coincidencia con el SHA-256
   documentado y límites **2048 × 1582**.
2. Acreditar antes de servir públicamente el raster su procedencia,
   titular, atribución y permisos efectivos para el método de carga
   elegido; si son insuficientes, no publicar ese archivo hasta
   resolverlos, sin reabrir la selección de producto en MAP-076.
3. Crear el contexto local **opcional** de Neverwinter con
   `width=2048`, `height=1582`; mantener las coordenadas mundiales
   legacy sin reinterpretar.
4. Decidir en implementación `bundled` frente a `remote` conforme
   a permisos y al host real, rellenar metadatos y comprobar carga
   desde navegador, tipo, dimensiones y fallback.
5. Resolver la vinculación a una `location`/campaña mediante MAP-077
   y navegación posterior; no añadir aquí mapas a todas las locations
   ni placements de otros lugares.
6. Respetar el contrato de INFRA #210 en cualquier **futura** migración:
   **GRANT explícito + RLS + policies + tests**. No tocar la migración
   `20261021095215_harden_explicit_data_api_grants.sql`, ni ejecutar
   la versión remota `20261022213637`. No forzar reconciliación de
   IDs de migración.

**Alcance de MAP-076:** solo documentación; **NO IMAGE ASSETS ADDED;
NO MIGRATION; PRODUCTION WRITES: 0; SNAPSHOT UNCHANGED**. No frontend,
RLS, esquema, versionado, despliegue ni release. Se entrega a revisión
independiente después de sincronización con master y CI verde.
