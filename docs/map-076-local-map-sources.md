# MAP-076 — Fuentes para mapas locales v1.3: Neverwinter / City of Shadows

- Issue: [#197](https://github.com/EduYube/castigo-divino-map/issues/197).
- Investigación realizada: **2026-10-16**.
- Baseline: `master` `a9e410e214f244c33d4330341ea703889aee5af4` (MAP-075 desplegado; frontend 1.2.0).
- Alcance: **solo investigación, procedencia y evaluación del uso**. No aprobar ni publicar binarios por inferencia.
- Interpretación legal: prudencia editorial del proyecto, **no asesoramiento jurídico**.
- Términos: `FACT` = constatado en la referencia enlazada; `PROJECT ASSESSMENT` = política de decisión del proyecto; `UNKNOWN` = no acreditado.

## 1. Política de derechos — revalidación

**FACT:** [Fan Content Policy de Wizards](https://company.wizards.com/en/legal/fancontentpolicy)
(actualización indicada: 2017-11-15; página consultada 2026-10-16)
prevé que los fans incorporen arte de Wizards a sitios gratuitos si son
identificables como no oficiales, respetan derechos ajenos, mantienen
las marcas/avisos ya incorporados y atienden solicitudes de retirada.
Distingue el contenido creativo de fans de la republicación íntegra de
obras ajenas. [Términos de Wizards](https://company.wizards.com/en/legal/terms)
(consultados 2026-10-16), sección 2.2 y 6, limitan copia, derivados
y el enlace/encuadre de imágenes en ausencia de permiso expreso, y dan
prevalencia a los términos sobre interpretaciones más permisivas.

**PROJECT ASSESSMENT:** ninguna URL pública, vista previa de tienda,
imagen aparecida en artículo oficial ni pin de Pinterest es licencia
general. Separar cuidadosamente:

| Operación | Umbral de evidencia requerido |
| --- | --- |
| Ver/consultar una página oficial | Página pública accesible; no otorga derechos adicionales |
| Mostrar un mapa dentro del Atlas gratuito | Política aplicable y derechos de terceros más permiso compatible con la forma efectiva de integración |
| `REMOTE_SINGLE_IMAGE` (una carga desde el host original) | Autorización suficiente de visualización **y** hotlink/embedding de ese recurso; URL estable, pruebas HTTP y navegador |
| Copiar al repositorio, `SELF_HOSTED_SINGLE_IMAGE`, GitHub Pages/CDN | Permiso explícito de reproducción, hosting y redistribución pública |
| Reescalar, recortar, recomprimir, borrar marcas | Permiso para transformar, respetando además los avisos legales |
| `TILED` | Permiso expreso para transformación **y** distribución de derivados |

Para todas las fuentes de este dossier, hasta que cambie la evidencia:
hotlink autorizado **UNKNOWN**; copia/Pages **NO autorizado por evidencia
actual**; transformación/rescaling/tiles **UNKNOWN (no hacer)**.
La política de fans no sustituye licencias particulares más restrictivas.
No se usa proxy para sortear controles anti-hotlink.

## 2. Neverwinter

### 2.1 Identidad y selección

**FACT:** Neverwinter es una ciudad de Forgotten Realms identificada
como `geo-neverwinter`, nombre `Neverwinter`, alias es
`Nuncainvierno` y coordenada global (1433,1853) en
`src/data-access/geographicCoverageManifest.js` y el snapshot
`tests/e2e/fixtures/public-catalog.demo.snapshot.json`. Es un punto
del mapa mundial, **no** cartografía urbana. [MAP-040](map-040-spanish-geographic-names.md)
mantiene el alias avalado por Wizards. No hay que modificar esta identidad.

**Selección primaria de investigación:** Mike Schley, *Neverwinter
(Digital)* — plano **urbano** de la ciudad con vías, puentes, río y
barrios, realizado para *Neverwinter Campaign Setting* (Wizards, 2011,
cuarta edición). Fuente del cartógrafo/distribuidor:
https://prints.mikeschley.com/p52230723/h12947418 .
El propio autor documentó que el reverso del póster de 2011 era
**Evernight**, la ciudad espejo en el Shadowfell:
https://www.reddit.com/r/Forgotten_Realms/comments/17xjoab/neverwinter_oc/ .
Portafolio de autor que atribuye el trabajo a Wizards:
https://www.coroflot.com/mikeschley/Fantasy-Cartography .

**PROJECT ASSESSMENT:** Schley es la referencia más trazable para una
investigación/solicitud de permiso, no una aprobación de consumo remoto.
El mapa de 2011 refleja la ciudad post-cataclismo de esa edición. **No
reinterpretar como mapa actualizado de quinta edición** sin comprobar
compatibilidad narrativa y cartográfica. Para el Atlas solo considerar
imagen única tras confirmar licencia y URL final de incorporación.

### 2.2 Fichas de candidatos

Campos `UNKNOWN` no se infieren del formato de un thumbnail ni de la
antigüedad de una página.

| Campo | N1 — Schley, Neverwinter (Digital) | N2 — Blando, Neverwinter: City Map (5e) | N3 — D&D Beyond, artículo Neverwinter (2023) |
| --- | --- | --- | --- |
| Clasificación | `HOLD_RIGHTS_UNCLEAR` | `REJECTED` para publicación del Atlas | `HOLD_RIGHTS_UNCLEAR` |
| Lugar/alcance | Neverwinter, ciudad/distritos | Neverwinter, plano urbano etiquetado/no etiquetado | Neverwinter, ilustración titulada mapa (detalle urbano sin acreditar) |
| Autor | Mike Schley | Jared Blando | `UNKNOWN` de la imagen concreta |
| Editor / titular acreditado | © Wizards of the Coast (la propia ficha) | Copyright Wizards of the Coast (la propia ficha) | D&D Beyond/Wizards publica el artículo; titular de imagen `UNKNOWN` |
| Obra original | *Neverwinter Campaign Setting* | *Sword Coast Adventurer's Guide* (5e) | Artículo *Take a Tour of These Popular Locations in the Forgotten Realms* |
| Fecha de la obra | 2011 | Guía 5e (2015) | 2023-04-08 |
| Página de origen | [Tienda del autor](https://prints.mikeschley.com/p52230723/h12947418) | [Tienda del cartógrafo](https://jaredblando.com/sword-coast-adventurers-guide/p/neverwinter-city-map) | [Artículo oficial](https://www.dndbeyond.com/posts/1485-take-a-tour-of-these-popular-locations-in-the) |
| URL de original listo para uso público | `UNKNOWN` (se vende descarga) | `UNKNOWN` (se vende descarga) | `UNKNOWN` |
| Dimensiones indicadas por fuente | 13725 × 9675 px (digital) | 3300 × 4750 px (HQ) | `UNKNOWN` |
| Formato/peso declarado | JPEG, sRGB, 33.5 MB (ficha; no descarga verificada) | Formato/peso `UNKNOWN` | `UNKNOWN` |
| Host / estabilidad aparente | Zenfolio `prints.mikeschley.com` tienda actual; permanencia `UNKNOWN` | `jaredblando.com` tienda actual; permanencia `UNKNOWN` | `dndbeyond.com` editorial; permanencia de asset `UNKNOWN` |
| Hotlink autorizado | `UNKNOWN` | No acreditado | `UNKNOWN` |
| Derechos/condiciones | © Wizards; venta orientada a uso de partidas/impresión, sin licencia web/hotlink acreditada | **FACT:** licencia anunciada «royalty free non-distributed personal use»; no permite redistribución | Política de fans/términos; no licencia específica del raster |
| Atribución proyectada | «Cartografía: Mike Schley. © Wizards of the Coast» + aviso fan | «Cartografía: Jared Blando. © Wizards of the Coast» si cambiase licencia | `UNKNOWN` hasta autor identificado |
| Mostrar remoto / copiar / Pages | `UNKNOWN` / NO acreditado / NO acreditado | NO acreditado / **NO** según condiciones personales / **NO** según condiciones personales | `UNKNOWN` / NO acreditado / NO acreditado |
| Modificar / reescalar / tiles | `UNKNOWN` / `UNKNOWN` / `UNKNOWN` | **NO** sin licencia adicional / **NO** / **NO** | `UNKNOWN` / `UNKNOWN` / `UNKNOWN` |
| Riesgo principal | Licencia de host e integración no aclarada, obra 4e, raster pesado | Prohibición contractual de distribuir; compra no implica licencia web | Autoría/imagen exacta y estrategia de hotlink no verificadas |

N1 evidencia técnica **publicada por el comercio**, no inspección de
archivo: dimensiones 13725 × 9675, JPEG/sRGB, 33.5 MB; modificación de
ficha «13-May-21» **no es fecha de publicación de obra**. El mismo autor
ofrece [un *Artist's Print*](https://prints.mikeschley.com/p530730153/h2751532B)
con **10800 × 7200** y 36 MB: *otra edición/variante comercial*,
no confundir esas dimensiones con la descarga digital.
N2 fuente primaria:
https://jaredblando.com/sword-coast-adventurers-guide/p/neverwinter-city-map .
N3 fuente oficial:
https://www.dndbeyond.com/posts/1485-take-a-tour-of-these-popular-locations-in-the .

**UNKNOWN / test de red:** no se hizo petición `HEAD`/descarga al raster
original ni ensayo desde navegador del Atlas. `HTTP status` binario,
`Content-Type`, redirects, `Cache-Control`, cabeceras anti-hotlink,
CORS, checksum SHA-256 y bytes medidos quedan **UNKNOWN**. El acceso a
las fichas HTML vía navegador/crawler no acredita esos campos. El peso
«33.5 MB» es información publicada por la tienda, no bytes descargados
independientemente. Una imagen publicitaria de la tienda no es una
`image_uri` autorizada.

### 2.3 Matriz comparativa editorial y alternativas

- **N1 (primaria de investigación, `HOLD_RIGHTS_UNCLEAR`):**
  máxima trazabilidad de cartógrafo + © Wizards, buena escala de detalle
  CRS.Simple si se dispone de imagen legítima, pero NO usar preview,
  URL de descarga comprada ni hotlink sin permiso aplicable.
- **N2 (alternativa histórica 5e, `REJECTED` para servir):**
  representa otra versión oficial, posiblemente mejor ajustada a una
  cronología 5e, pero el propio vendedor limita el uso a personal y
  no distribuido. NO comprar para resolver licencia sin comprobar una
  licencia web distinta.
- **N3 (`HOLD_RIGHTS_UNCLEAR`):** se localiza una imagen de Neverwinter
  en sitio oficial contemporáneo, pero no se certifica autor, raster
  completo de calles ni reglas para servir la imagen desde otro origen.
- **Mapa de Sword Coast 2015**:
  [descarga oficial](https://www.dndbeyond.com/resources/1782-map-of-faerun),
  `REJECTED` como **mapa local**: Neverwinter es un punto del mundo.
  Mantener intacto su uso mundial aprobado.
- **Copias Pinterest, Fandom, mirrors, AideDD e interactivos ajenos:**
  `REJECTED` como fuente de derechos y `image_uri`. No transforman
  una reproducción de Wizards en asset autorizado.

### 2.4 Decisión Neverwinter

```text
IDENTIFICATION: Ciudad canónica Forgotten Realms; nombre mundial geo-neverwinter.
DECISION: HOLD_RIGHTS_UNCLEAR
PRIMARY SOURCE: Mike Schley, Neverwinter (Digital), edición Neverwinter Campaign Setting (2011).
AUTHOR / RIGHTS HOLDER: Mike Schley / © Wizards of the Coast.
SOURCE URL: https://prints.mikeschley.com/p52230723/h12947418
IMAGE URL: NULL / PENDING (no URL autorizada para producción).
LOADING STRATEGY: PENDING; preferencia futura REMOTE_SINGLE_IMAGE si se autoriza hotlink.
ATTRIBUTION: Cartografía: Mike Schley. © Wizards of the Coast; aviso de fans de Wizards.
SELF-HOST ALLOWED: UNKNOWN (NO ejecutar).
TRANSFORM ALLOWED: UNKNOWN (NO ejecutar).
TILES ALLOWED: UNKNOWN (NO ejecutar).
FALLBACK: mapa urbano neutro original del proyecto / obra nueva licenciada.
RISKS: permiso de hotlink, disponibilidad, coherencia temporal 4e/5e y rendimiento móvil.
```

**Desbloqueo medible:** obtener consentimiento compatible para integrar
una URL del titular/host (y probar status, formato, carga cruzada y
estabilidad) **o** una licencia escrita para alojar el raster, y
confirmar la versión narrativa/cronológica apropiada. Con la fuente
aprobada, declarar dimensiones nativas verificadas para CRS.Simple.
No generar tiles ni copias por adelantado.

## 3. City of Shadows

### 3.1 Evidencia de identidad examinada

**FACT del repositorio:** `docs/map-075-local-map-contexts.md`
menciona «NPC solo en City of Shadows» como **caso representable** y
`docs/adr/0008-map-contexts-and-campaign-scoped-placements.md`
dice que no se insertaron mapas de Neverwinter/City of Shadows.
La investigación de los documentos públicos de alcance
(`docs/product-scope.md`, `docs/project-status.md`,
`docs/data-model.md`, `docs/future-improvements.md`,
`docs/map-068-campaign-separation.md`), fixture público,
snapshot de E2E y manifiesto geográfico no produjo un ID,
alias, región, coordenada, referencia narrativa o vínculo público
que identifique inequívocamente **City of Shadows**.
No se consultaron notas Master ni recursos privados.

**FACT externo, solo pista, NO equivalencia del Atlas:**
[Skuld, capital de Mulhorand](https://forgottenrealms.fandom.com/wiki/Skuld)
figura con el alias literal **City of Shadows**; la wiki cita
*Old Empires* de Scott Bennie (TSR, 1990, pp. 16–17) y un mapa histórico.
La [ficha cartográfica secundaria](https://forgottenrealms.fandom.com/wiki/Map%3ASkuld)
lo denomina «Skuld, the City of Shadows».
La fuente secundaria **no licencia** el uso de su imagen, ni indica
que MAP-075 quisiese decir Skuld.

**FACT externo separado:** [Mike Schley describe Evernight](https://bsky.app/profile/mikeschley.bsky.social/post/3kepppxyxxl2j)
como imagen oscura de Neverwinter, cara posterior del póster de
*Neverwinter Campaign Setting* (2011). Evernight **no** consta
como alias literal *City of Shadows* en el corpus revisado.
La cercanía temática entre Neverwinter y una ciudad sombría no
constituye correspondencia narrativa.

**PROJECT ASSESSMENT:** identidad solicitada = `AMBIGUOUS`
(opción D del contrato). No hay prueba suficiente para elegir
`CANONICAL`/Skuld, `ALIAS`/Evernight o `HOMEBREW`.
Bloqueo **narrativo**, no operativo ni técnico. No apropiarse de un
mapa de otra ciudad. Es admisible que finalmente sea homebrew; en
ese caso no habría mapa oficial automáticamente aplicable.

### 3.2 Candidatos examinados

| Campo | C1 — Skuld, City of Shadows | C2 — Evernight, reflejo oscuro de Neverwinter | C3 — fondo original/neutro futuro |
| --- | --- | --- | --- |
| Clasificación | `REJECTED` **para esta ubicación**, pendiente identidad | `REJECTED` **para esta ubicación**, pendiente identidad | `APPROVED_WITH_CONDITIONS` **como estrategia**, NO asset existente |
| Sitio/lugar representado | Skuld (Mulhorand) | Evernight (Shadowfell) | El que se defina editorialmente |
| Autor/cartógrafo | `UNKNOWN` | Mike Schley | Autor futuro `UNKNOWN` |
| Editor/titular | TSR Inc. original; derechos vigentes de raster `UNKNOWN` | © Wizards of the Coast, obra original | El proyecto si se crea íntegramente o titular según licencia |
| Obra original | *Old Empires* (1990); *Forgotten Realms Interactive Atlas* (1999) citado como fuente secundaria | *Neverwinter Campaign Setting* (2011), reverso del póster | Por crear |
| Página primaria | `UNKNOWN`; [ficha secundaria de Skuld](https://forgottenrealms.fandom.com/wiki/Skuld) | [declaración del autor](https://bsky.app/profile/mikeschley.bsky.social/post/3kepppxyxxl2j) y [post de autor](https://www.reddit.com/r/dndmaps/comments/180mcxp) | No existe |
| URL de imagen autorizada | `UNKNOWN` | `UNKNOWN` (venta de alta resolución, no licencia pública) | `NULL` |
| Fecha/dimensiones/formato/bytes | 1990 como fecha de libro; imagen `UNKNOWN` | 2011 como fecha original; dimensiones, formato y peso de este asset `UNKNOWN` | `UNKNOWN` |
| Host/hotlink/HTTP/redirects/cache | Fandom como índice secundario, estabilidad/hotlink/headers `UNKNOWN` | Páginas de autor, host final de raster y headers `UNKNOWN` | Se decidirá en diseño |
| Mostrar remoto / copia / Pages | `UNKNOWN` / NO acreditado / NO acreditado | `UNKNOWN` / NO acreditado / NO acreditado | Condicionado a creación original o licencia explícita |
| Modificar / reescalar / tiles | `UNKNOWN` / `UNKNOWN` / `UNKNOWN` | `UNKNOWN` / `UNKNOWN` / `UNKNOWN` | Solo si el contrato de autor/licencia lo permite |
| Atribución | No fijar sin licencia e identidad | Mike Schley / Wizards, solo si realmente corresponde | Según autor/licencia |
| Riesgo | Mapear narración ajena (Skuld) y republicar sin derecho | Confundir Evernight con City of Shadows y replicar arte protegido | Trabajo futuro; no existe hoy un raster |

Pinterest no fue usado como origen jurídico ni como alojamiento. Ejemplo
de pin de una imagen de Evernight (descubrimiento únicamente):
https://ru.pinterest.com/pin/neverwinter-evernight-detail--539939442806094738/ .
Aunque identifique un mapa parecido, **no** permite trasladar su URL
`i.pinimg.com` al Atlas, ni inferir titular o permiso. Si no se acredita
origen primario/derechos se clasifica `REJECTED / provenance unavailable`.

### 3.3 Decisión City of Shadows

```text
IDENTIFICATION: No confirmada internamente. Coincidencia externa con alias Skuld;
                Evernight es otra ciudad sin equivalencia demostrada.
CANONICAL / ALIAS / HOMEBREW / AMBIGUOUS: AMBIGUOUS
DECISION: NO_SUITABLE_SOURCE_FOUND
PRIMARY SOURCE: NONE
AUTHOR / RIGHTS HOLDER: UNKNOWN
ORIGINAL WORK: UNKNOWN
SOURCE URL: NULL (no hay fuente confirmada que corresponda al lugar del proyecto)
IMAGE URL: NULL / PENDING
LOADING STRATEGY: PENDING; si es homebrew, futura SELF_HOSTED_SINGLE_IMAGE original/licenciada
ATTRIBUTION: PENDING / UNKNOWN
SELF-HOST ALLOWED: UNKNOWN (NO ejecutar).
TRANSFORM ALLOWED: UNKNOWN (NO ejecutar).
TILES ALLOWED: UNKNOWN (NO ejecutar).
TECHNICAL METADATA: UNKNOWN hasta existencia/verificación del original.
FALLBACK: superficie neutra creada por el proyecto, sin reutilizar otro mapa.
RISKS: identidad narrativa, anacronismo y derechos de terceros.
```

**Desbloqueo mínimo de identidad:** un registro público o instrucción
editorial con `campaign/location entity ID`, nombre/alias, mundo/región
y si es canónica, alias o homebrew. No exponer contenidos privados
para resolverlo. Después se abre investigación concreta del plano
correspondiente y de su licencia.

## 4. Metadatos de MAP-075 listos para persistencia futura (NO SQL)

Migración real revisada:
`supabase/migrations/20261016110000_add_optional_local_map_contexts.sql`.
Columnas literales `image_uri text`, `loading_strategy text`
(`remote` o `bundled`), `source_url text`,
`rights_holder text`, `attribution text`, `license_notes text`.
Restricción real: **si no hay `image_uri`, también
`loading_strategy=NULL`**; si existe `image_uri`, se requieren
`source_url`, `rights_holder`, `license_notes` no vacíos
y `loading_strategy` válido. `attribution` puede ser NULL.
`TILED` y `REMOTE_SINGLE_IMAGE` **no son valores DB**. No introducir
`image_uri` de un thumbnail en ninguna fase.

**Neverwinter, borrador seguro de metadatos (no map_context ni INSERT):**

```yaml
source_url: https://prints.mikeschley.com/p52230723/h12947418
rights_holder: "Wizards of the Coast LLC (© Wizards of the Coast en la ficha del autor)"
license_notes: >-
  HOLD_RIGHTS_UNCLEAR (revisión 2026-10-16). Fan Content Policy sujeta
  a condiciones; no consta permiso de hotlink, autohospedaje, transformación,
  recompresión ni tiles. No cargar hasta acreditar licencia y host.
loading_strategy: null
attribution: "Cartografía: Mike Schley. © Wizards of the Coast. Atlas no oficial."
image_uri: null
```

**City of Shadows, borrador seguro (identidad sin confirmar):**

```yaml
source_url: null
rights_holder: null
license_notes: >-
  NO_SUITABLE_SOURCE_FOUND (2026-10-16). Identidad AMBIGUOUS:
  Skuld es un homónimo/alias canónico externo, Evernight es otro lugar.
  No seleccionar mapa antes de vínculo editorial verificable.
loading_strategy: null
attribution: null
image_uri: null
```

Estos bloques sirven para transcribir condiciones/documentar futuro;
no justifican crear filas sin `width`/`height` reales ni elegir
un `map_context.id`. Solo después de un permiso suficiente se admitirá
`loading_strategy: remote` para una URL original autorizada, o
`bundled` para asset propio/licenciado. El campo `license_notes` no
convierte por sí mismo una fuente `HOLD` en material publicable.

## 5. Checklist de evidencia, sin mutaciones

| Control | Resultado a 2026-10-16 |
| --- | --- |
| Proveedor oficial/cartógrafo original y web primaria | N1/N2 sí, páginas citadas; C1 solo secundaria, C2 declaración original |
| Derechos de mostrar remoto/hotlink específico | **UNKNOWN**; no aprobado |
| Derechos de copia, GitHub Pages, reescalado, tiles | **No acreditados**; N2 restringe a uso personal |
| Contenido Pinterest como fuente final | **No** |
| Host status de raster original, type, redirects, caché, CORS | **UNKNOWN**; no efectuar afirmaciones de HTTP no comprobadas |
| Hash/dimensiones verificadas sobre bytes propios | **No**; N1/N2 dimensiones publicadas por cartógrafos |
| Contextos/placements/entidades nuevas | **No** |
| Assets binarios/descarga/tiles en repo | **No** |
| Migración / Supabase remoto / producción | **No / no writes** |
| Snapshot frontend v1.2.0 | **Sin modificaciones** |
| Deuda #208 E2E post-save | **No tocar; P2 preexistente** |

### Handoff MAP-077/078

1. Resolver **primero** la identidad narrativa de City of Shadows,
   especialmente si se pretendía Skuld, Evernight o un lugar homebrew.
2. Para Neverwinter conseguir evidencia **escrita/aplicable** del permiso
   de hosting/embedding desde el recurso exacto. No basta el checkout.
3. Solo tras fuente autorizada verificar el archivo acordado:
   GET/HEAD, status, Content-Type, redirects, hotlink real desde GitHub
   Pages, dimensiones, peso, hash, caché y compatibilidad `CRS.Simple`.
4. Registrar atribución y texto legal visible, conservar marcas, y
   definir retirada/fallback; no crear tiles sin permiso derivativo.
5. Mantener el modelo opcional MAP-075; no crear mapas en todas las
   `locations`, ni publicar entidades local-only antes del lector/RLS
   de MAP-079.

**Veredicto documental:** `BLOCKED` para **aprobar/publicar imágenes**
por incertidumbre de licencia y por la identidad de City of Shadows.
El dossier puede someterse a revisión independiente sin adelantar
ingesta de datos ni alterar producción.
