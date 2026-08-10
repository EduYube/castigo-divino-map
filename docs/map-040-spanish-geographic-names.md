# MAP-040 — auditoría de topónimos oficiales en castellano

MAP-040 revisa las **213 identidades exactas** del manifiesto MAP-039. La revisión está versionada en `src/data-access/geographicSpanishReviewManifest.js` y es un contrato de auditoría, no un segundo índice de runtime.

## Criterio de clasificación

- `translated`: una publicación oficial/localizada de Wizards of the Coast muestra una denominación castellana distinta de la canónica inglesa. Solo estos casos generan un alias `language = 'es'`.
- `unchanged`: una publicación oficial en castellano usa explícitamente la misma forma canónica.
- `unverified`: no se ha localizado evidencia oficial suficiente para afirmar una traducción ni una conservación explícita. No se crea ningún alias especulativo.

Las wikis de fans no se usan como evidencia persistible. Una traducción aparentemente obvia tampoco es evidencia.

## Resultado de la revisión

| Estado | Identidades |
| --- | ---: |
| `translated` | 8 |
| `unchanged` | 2 |
| `unverified` | 203 |
| **Total** | **213** |

### Traducciones verificadas

| Identidad MAP-039 | Forma canónica | Alias oficial castellano |
| --- | --- | --- |
| `geo-waterdeep` | Waterdeep | Aguas Profundas |
| `geo-baldurs-gate` | Baldur's Gate | Puerta de Baldur |
| `geo-candlekeep` | Candlekeep | Candelero |
| `geo-icewind-dale` | Icewind Dale | Valle del Viento Helado |
| `geo-moonshae-isles` | Moonshae Isles | Islas Lunshaes |
| `geo-neverwinter` | Neverwinter | Nuncainvierno |
| `geo-silverymoon` | Silverymoon | Luna Plateada |
| `geo-sword-coast` | Sword Coast | Costa de la Espada |

### Formas verificadas como no traducidas

- `geo-elturel` → **Elturel**.
- `geo-elturgard` → **Elturgard**.

## Fuentes oficiales utilizadas

La evidencia final procede exclusivamente de páginas oficiales de Wizards/D&D localizadas al castellano:

- Secret Lair x Dungeons & Dragons — *Lands of the Forgotten Realms*: usa **Aguas Profundas** e **islas Lunshaes**.  
  https://secretlair.wizards.com/eu/es/product/1249734/secret-lair-x-dungeons-dragonsr-lands-of-the-forgotten-realms
- Galería oficial de *D&D: Adventures in the Forgotten Realms*: incluye, entre otros, **Nuncainvierno**, **Luna Plateada**, **Puerta de Baldur**, **Aguas Profundas** y conserva **Elturgard**.  
  https://magic.wizards.com/es/news/card-image-gallery/d-and-d-adventures-in-the-forgotten-realms-card-image-gallery
- Galería oficial de *Adventures in the Forgotten Realms Commander*: incluye **Valle del Viento Helado**.  
  https://magic.wizards.com/es/news/card-image-gallery/adventures-in-the-forgotten-realms-commander
- Galería oficial de *Commander Legends: Battle for Baldur's Gate*: incluye **Costa de la Espada**, **Candelero**, **Aguas Profundas** y conserva **Elturel**.  
  https://magic.wizards.com/es/news/card-image-gallery/commander-legends-battle-for-baldurs-gate
- Producto oficial *Commander Legends: Battle for Baldur's Gate* en castellano: usa **Puerta de Baldur** como nombre localizado del escenario/producto.  
  https://magic.wizards.com/es/products/commander-legends-battle-baldurs-gate

## Contrato técnico

- El nombre canónico continúa almacenado una única vez en `geographic_names` con `language = 'en'`.
- Los ocho nombres castellanos se almacenan en `geographic_name_aliases` con `language = 'es'` e ID determinista `geo-alias-<identidad>-es`.
- El runtime sigue el flujo existente Supabase → catálogo público → snapshot → `searchPublicAtlas` → autocompletado MAP-038.
- El manifiesto MAP-040 contiene las 213 identidades revisadas y falla si MAP-039 gana o pierde una identidad sin una revisión explícita.
- El contrato de cobertura rechaza aliases `es` no verificados o aliases verificados con identidad/ID incorrectos.
- La migración es reejecutable y falla ante conflictos semánticos en lugar de sobrescribirlos.
- El snapshot público regenerado desde el catálogo MAP-040 usa `sourceRevision`/`checksum` `sha256:449a77629b63392db19d6fd9af70b2aea812e54f17324ca3eb0e057104e9e26a` y queda formateado con el Prettier fijado por el repositorio.
