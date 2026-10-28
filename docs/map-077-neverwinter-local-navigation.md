# MAP-077 — Neverwinter y «Entrar en lugar»

## Decisión

No se crea `entity-neverwinter`: el geonombre
`geo-neverwinter` es global y preexistente. La tabla
`campaign_geographic_map_context_links` relaciona la campaña activa,
ese geonombre y un contexto físico compartible. La PK
`(campaign_id,geographic_name_id)` impide más de un mapa primario de
entrada, y las FKs evitan referencias huérfanas. El contexto físico
global `map-neverwinter` nunca incorpora `campaign_id`.

## Seed y derechos

Neverwinter: slug `neverwinter`, `width=2048`,
`height=1582`, published, `parent_id=NULL`,
`image_uri=NULL`, `loading_strategy=NULL`. Campaña
`Un aliento menos` (UUID ...0068) únicamente. La campaña
`Castigo Divino` (...0053) no tiene vínculo. Asset seleccionado:
JPEG RGB de 2048 × 1582, SHA-256
`ea2b2b439c1a3a9ead5902df563421aa142228fb527b5aa6b525d7f868ea6f5e`,
`RIGHTS_METADATA_PENDING`. No copiar, transformar, incorporar,
subir, enlazar ni servir el raster hasta acreditar derechos/procedencia.
En el futuro se actualizarán los campos de imagen/licencia del mismo
contexto, sin cambiar ID, FK ni URLs.

## Recorrido y degradación

La selección del geonombre muestra CTA solo si una consulta a Supabase
con la campaña activa devuelve binding publicado. Entra a un mapa Leaflet
CRS.Simple propio con plano lógico y grid CSS discreto, pan/zoom y bounds,
sin imagen remota. Navegación `?campaign=un-aliento-menos&map=neverwinter`,
Back/Forward y refresh preservan el contexto; breadcrumb permite
regresar al mapa general sin borrar filtros. Cambio de campaña invalida
peticiones pendientes, oculta inmediatamente el contexto anterior y
normaliza `map`. Una URL local no autorizada o REST indisponible
degrada al mundo con anuncio accesible, sin fallback a otra campaña.

La autoridad de disponibilidad se toma del estado de backend del catálogo
al montar el controlador y de sus eventos posteriores. En `degraded/offline`
se invalidan las peticiones locales pendientes y no se aceptan nuevos
bindings aunque su endpoint siga respondiendo: cambiar de campaña o navegar
con Back no vuelve a abrir mapas hasta un estado `connected`.
Una lectura de bindings que falla con 503 se diferencia de una lista vacía
válida: el siguiente evento `connected` del refresco del catálogo reintenta
una sola vez, sin reconsultar bindings en cada refresco cuando la lectura
anterior fue correcta. Se mantienen las protecciones por campaña/generación.

La búsqueda global sigue en v1.2; MAP-079 añadirá placements local-only,
MAP-080 soportará map contexts en snapshot. El snapshot público v3,
checksum `sha256:ce1d861bbfc12153be799d5bb6f54b34a87c5a03e50830bb27aaef9ef4567de3`,
debe quedar intacto.

## Seguridad y despliegue

Migración forward-only `20261026154700_add_campaign_geographic_map_context_links.sql`.
RLS pública comprueba campaña activa, geonombre published y contexto
published; admin escribe mediante grants por columna; no hay grants
globales ni nuevas funciones. Tests pgTAP `043_map077_geographic_map_links`,
INFRA #210 actualizado y E2E `map077-local-navigation`.
La migración debe aplicarse **solo tras** review independiente, checkpoint,
merge y CI master. Durante Draft PR: **PRODUCTION WRITES: 0**.
