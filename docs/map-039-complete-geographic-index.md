# MAP-039 — Inventario geográfico completo y contrato de cobertura

## Objetivo

MAP-039 sustituye el baseline mínimo de 15 identidades introducido por MAP-032 por un
inventario auditable de todos los destinos geográficos nombrados de forma visible en el
raster oficial utilizado por el Atlas.

La fuente de verdad versionada es
`src/data-access/geographicCoverageManifest.js`. El manifiesto no participa en el índice
de runtime: el runtime sigue leyendo exclusivamente el catálogo público transportado por
Supabase o por el snapshot. El manifiesto se usa como contrato de cobertura para impedir
que una publicación vuelva a considerarse válida por tener simplemente «muchas filas».

## Fuente y restricciones

Se mantuvo la fuente cartográfica ya aprobada por MAP-002/MAP-032:

`https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg`

La inspección se realizó sobre copias temporales privadas de las variantes oficiales y
ninguna imagen, recorte, mosaico, transformación ni derivado se incorpora al repositorio,
fixtures, artifacts, snapshot o build.

El raster de runtime mide 3600 × 2329. Las coordenadas del catálogo mantienen el contrato
`CRS.Simple`:

- `x = pixel x`
- `y = 2329 - pixel y`

## Metodología de inventario

El mapa completo se revisó mediante un barrido sistemático y solapado. Para reducir huecos,
la imagen se dividió conceptualmente en una malla de 3 filas × 4 columnas; cada entrada del
manifiesto conserva el campo `mapCell` (`R1C1` … `R3C4`) que permite auditar en qué sector
fue confirmada. La primera pasada utilizó zonas más pequeñas y solapadas; una segunda
pasada sobre la variante oficial de mayor resolución se usó únicamente para confirmar
rótulos pequeños y grafías dudosas.

Se incluyeron destinos geográficos nombrados que tiene sentido localizar: asentamientos,
fortalezas y enclaves; regiones y territorios; bosques; montañas y cordilleras; mares,
ríos y otras masas de agua; islas y archipiélagos; carreteras/rutas; y otros accidentes
físicos nombrados.

Se excluyeron créditos, escala, rosa de los vientos, fronteras/editorial cartográfico y
referencias fuera del raster que no tienen un destino localizable dentro de la imagen.
Cuando un mismo accidente aparece rotulado más de una vez se conserva una única identidad
semántica. La isla y asentamiento de `Ruathym` se tratan igualmente como un único destino
geográfico para evitar dos resultados indistinguibles.

El inventario auditado contiene **213 identidades**. La lista completa, con identidad
estable, nombre canónico, clase de lugar, política de zoom y sector de revisión, está en
`GEOGRAPHIC_COVERAGE_MANIFEST`. Ese archivo es la referencia normativa del inventario y
evita mantener una segunda tabla documental que pueda divergir.

## Grafías y compatibilidad con MAP-032

La revisión de la fuente real resolvió las grafías que motivaron MAP-039, entre ellas:

- `The Dalelands`
- `Thunder Peaks`
- `The Shining Plains`
- `The High Ice`
- `Omans Isle`
- `Kingdom of Many Arrows`
- `Flint Rock`
- `Ten-Towns`
- `Ss'thar'tiss'ssun`

El raster imprime `Star Mounts`. MAP-032 había publicado `Star Mountains`. Para respetar
simultáneamente la fuente cartográfica y la compatibilidad publicada, MAP-039 conserva
exactamente el `id` y `slug` de MAP-032 (`geo-star-mountains` / `star-mountains`), mantiene
sus coordenadas y zoom, cambia el nombre canónico a `Star Mounts` y publica
`Star Mountains` como alias obligatorio.

Las otras 14 identidades de MAP-032 conservan identidad, nombre, coordenadas y zoom.
Waterdeep permanece fijada en `(1626, 1465)` con zoom `0.75`.

## Coordenadas y política de zoom

Las coordenadas representan el centro razonable del marcador o rótulo visible, no una
geocodificación externa. El manifiesto separa dos clases de zoom:

- `point` → `0.75`: asentamientos, fortalezas, cuevas, puentes, vados y otros destinos
  puntuales;
- `area` → `0.50`: regiones, bosques, cordilleras, masas de agua, islas/archipiélagos y
  rutas lineales o extensas.

El gate exige exactamente la política correspondiente a cada entrada, además de coordenadas
finitas dentro de 3600 × 2329. Los 15 puntos de MAP-032 quedan bloqueados adicionalmente
por coordenada para detectar drift de contratos ya publicados.

## Aliases obligatorios

Se preservan los cinco aliases de MAP-032:

- `Evermoors` → `The Evermoors`
- `Fields of the Dead` → `The Fields of the Dead`
- `High Forest` → `The High Forest`
- `High Moor` → `The High Moor`
- `City of Splendors` → `Waterdeep`

MAP-039 añade únicamente `Star Mountains` → `Star Mounts`, justificado por la
compatibilidad con el nombre canónico publicado por MAP-032.

No se inventan traducciones ni variantes de conveniencia.

## Migración y seguridad

`supabase/migrations/20260810123000_complete_geographic_search_index.sql` es estrictamente
data-only. No modifica Auth, RLS, grants, roles, policies, schema ni funciones privilegiadas.

La migración:

1. verifica que la identidad heredada de `Star Mountains` es exactamente la semántica de
   MAP-032 antes de convertirla a `Star Mounts`;
2. inserta únicamente identidades ausentes por su `id` determinista;
3. exige después que cada identidad coincida exactamente en `id`, `slug`, nombre,
   idioma, coordenadas, zoom, `entity_id = null` y estado `published`;
4. inserta aliases ausentes por `id` y verifica su semántica completa;
5. falla con `23514` ante cualquier conflicto en lugar de sobrescribirlo.

Todos los lugares añadidos por MAP-039 son destinos geográficos puros con
`entity_id = null`; no crean pines ni fichas ficticias.

## Gate de publicación

`src/data-access/geographicCoverageContract.js` valida el catálogo publicado contra el
manifiesto completo, no solo contra un contador. Comprueba:

- las 213 identidades concretas;
- `id`, `slug`, nombre e idioma;
- ausencia de `entityId` para las identidades puramente geográficas;
- coordenadas dentro de los límites;
- zoom exacto según la clase declarada;
- aliases obligatorios por identidad y por `id`;
- invariantes del propio manifiesto (duplicados, sectores y tamaño auditado fijo);
- conservación de las 15 identidades de MAP-032;
- coordenadas bloqueadas de MAP-032 y el contrato exacto de Waterdeep.

`scripts/verify-public-snapshot.mjs` ejecuta el gate tanto sobre el snapshot comprometido
como sobre la proyección pública remota. En modo remoto sigue exigiendo igualdad exacta de
contenido y checksum entre Supabase y snapshot antes de Pages. Así, añadir filas de relleno
no puede compensar la desaparición de una identidad requerida.

## Búsqueda y autocompletado

No existe un índice nuevo de runtime. El flujo continúa siendo:

`Supabase → catálogo público → snapshot → searchPublicAtlas → sugerencias MAP-038 → selección → mapa`

La búsqueda libre y el autocompletado heredan normalización y ranking de MAP-021/MAP-038.
La selección conserva la identidad geográfica y usa las coordenadas/zoom publicados para
centrar, resaltar y anunciar el destino sin abrir una ficha de entidad inexistente.

## Cobertura de pruebas

La cobertura añadida comprueba:

- unitarios: manifiesto completo, identidad ausente aunque el total siga siendo alto,
  coordenada inválida, zoom inválido, alias obligatorio ausente y compatibilidad MAP-032;
- pgTAP: tamaño completo, muestras de asentamiento/región/montaña/bosque/agua/isla/ruta/
  landmark, `entity_id = null`, aliases, unicidad y visibilidad anónima bajo la RLS
  existente;
- E2E: búsqueda exacta y parcial, alias legado de Star Mounts, sugerencia por teclado,
  centrado, zoom, resaltado, ausencia de ficha ficticia, Supabase disponible y snapshot
  degradado.

## Evidencia de entrega

La PR de MAP-039 registra en su descripción y en el cierre de la issue el SHA exacto
validado, la ejecución de CI completa, la aplicación/verificación de la migración alojada
y la ejecución final de Pages/smoke tras el merge. Esta documentación no incorpora ni
deriva la imagen fuente.
