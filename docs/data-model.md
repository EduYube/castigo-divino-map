# Modelo de datos de campaña

## Propósito

Este documento define el contrato público y validable que alimentará los marcadores, fichas, búsquedas y filtros de la Beta 0.1. El catálogo es estático, forma parte del frontend publicado y solo puede contener información apta para jugadores.

La implementación vive en `src/data/` y no añade dependencias externas:

```text
src/data/
├── model.ts          # Tipos TypeScript públicos
├── coordinates.ts    # Conversión explícita al orden de Leaflet
├── catalog.ts        # Catálogo público y datos de demostración
├── validate.ts       # Validación estructural y referencial
└── validate.test.ts  # Catálogo válido y casos inválidos
```

## Catálogo y relaciones

`CampaignCatalog` contiene cuatro colecciones normalizadas:

- `categories`: clasificación principal de los lugares.
- `tags`: clasificación transversal reutilizable.
- `places`: lugares posicionados en el mapa.
- `notes`: información pública asociada a un lugar.

Las relaciones son unidireccionales para evitar duplicar estado:

- cada lugar referencia exactamente una categoría mediante `categoryId`;
- cada lugar referencia cero o más etiquetas mediante `tagIds`;
- cada nota referencia exactamente un lugar mediante `placeId`;
- cada nota referencia cero o más etiquetas mediante `tagIds`;
- categorías y etiquetas no enumeran sus consumidores;
- los lugares no mantienen una lista redundante de notas: las notas se obtienen filtrando por `placeId`.

## Entidades

Todas las propiedades indicadas son obligatorias. Las listas `aliases` y `tagIds` pueden estar vacías, pero deben existir. Los textos obligatorios deben contener al menos un carácter distinto de espacio.

### `CampaignCatalog`

| Propiedad | Tipo | Descripción |
|---|---|---|
| `categories` | `readonly CampaignCategory[]` | Categorías disponibles. |
| `tags` | `readonly CampaignTag[]` | Etiquetas disponibles. |
| `places` | `readonly CampaignPlace[]` | Lugares públicos con coordenadas. |
| `notes` | `readonly PublicNote[]` | Notas públicas asociadas a lugares. |

### `CampaignCategory`

| Propiedad | Tipo | Descripción |
|---|---|---|
| `id` | `CategoryId` | Identificador interno estable con prefijo `category-`. |
| `slug` | `Slug` | Segmento estable y legible para URLs futuras. |
| `name` | `string` | Nombre visible al usuario. Puede evolucionar sin cambiar el ID ni el slug. |
| `description` | `string` | Explicación pública del criterio de clasificación. |

### `CampaignTag`

| Propiedad | Tipo | Descripción |
|---|---|---|
| `id` | `TagId` | Identificador estable en minúsculas y kebab-case; también será el token de filtros y URLs. |
| `name` | `string` | Etiqueta visible al usuario. |
| `description` | `string` | Significado público y reusable de la etiqueta. |

Las etiquetas no tienen un slug separado: su propio `id` es estable, legible y apto para URL.

### `CampaignPlace`

| Propiedad | Tipo | Descripción |
|---|---|---|
| `id` | `PlaceId` | Identificador interno estable con prefijo `place-`. |
| `slug` | `Slug` | Segmento estable para enlaces directos futuros. |
| `name` | `string` | Nombre principal mostrado y utilizado en búsqueda. |
| `aliases` | `readonly string[]` | Nombres alternativos públicos utilizados exclusivamente para búsqueda. |
| `coordinates` | `CampaignCoordinate` | Posición estable en el espacio de píxeles de la imagen de referencia. |
| `categoryId` | `CategoryId` | Referencia a una categoría existente. |
| `tagIds` | `readonly TagId[]` | Referencias únicas a etiquetas existentes. |

### `PublicNote`

| Propiedad | Tipo | Descripción |
|---|---|---|
| `id` | `NoteId` | Identificador interno estable con prefijo `note-`. |
| `slug` | `Slug` | Segmento estable para enlaces futuros a la nota o sección. |
| `placeId` | `PlaceId` | Referencia al lugar al que pertenece la nota. |
| `title` | `string` | Título público mostrado en la ficha. |
| `body` | `string` | Texto público conocido por los jugadores. Se trata como texto, no como HTML confiable. |
| `tagIds` | `readonly TagId[]` | Referencias únicas a etiquetas existentes. |

### `CampaignCoordinate`

| Propiedad | Tipo | Descripción |
|---|---|---|
| `x` | `number` | Distancia horizontal desde el borde izquierdo, creciente hacia la derecha. |
| `y` | `number` | Distancia vertical desde el borde superior, creciente hacia abajo. |

## Identificadores, slugs, nombres, alias y etiquetas

Estos conceptos no son intercambiables:

- **ID interno estable:** clave técnica usada por referencias. Nunca se reutiliza ni cambia después de publicarse.
- **Slug:** segmento estable, legible y único para URLs futuras. No se deriva de nuevo cuando cambia el texto visible.
- **Nombre principal:** texto mostrado al usuario; puede corregirse o traducirse sin romper referencias.
- **Alias:** texto alternativo público usado para búsqueda; no es una etiqueta ni un identificador.
- **Etiqueta:** clasificación transversal con un ID estable en kebab-case y un nombre visible independiente.

Formatos válidos:

- categorías: `category-` seguido de minúsculas, números y guiones, por ejemplo `category-settlement`;
- lugares: `place-` seguido de minúsculas, números y guiones, por ejemplo `place-demo-harbor`;
- notas: `note-` seguido de minúsculas, números y guiones, por ejemplo `note-demo-harbor-overview`;
- etiquetas: minúsculas, números y guiones, por ejemplo `trade-route`;
- slugs: minúsculas, números y guiones, por ejemplo `puerto-de-demostracion`.

Los IDs son únicos en todo el catálogo. Los slugs de categorías, lugares y notas también son únicos globalmente. Los IDs y slugs publicados no deben reciclarse para otra entidad, aunque la entidad original se retire en el futuro.

## Convención de coordenadas

### Sistema de referencia

Las coordenadas se expresan en el espacio de píxeles de `Sword-Coast-Map_LowRes.jpg`, cuya referencia estable para la Beta 0.1 mide `3600 × 2329` píxeles.

- origen: esquina superior izquierda de la imagen;
- eje `x`: horizontal, positivo hacia la derecha;
- eje `y`: vertical, positivo hacia abajo;
- límites válidos inclusivos: `0 <= x <= 3600` y `0 <= y <= 2329`;
- los valores pueden ser enteros o decimales finitos;
- `NaN`, infinitos y valores fuera de límites son inválidos.

### Conversión a Leaflet

Leaflet con `L.CRS.Simple` recibe coordenadas en orden `[latitud, longitud]`. En este proyecto esos términos representan `[y, x]`, no coordenadas geográficas reales.

```ts
const leafletCoordinate = toLeafletSimpleCoordinate({ x: 1080.5, y: 820 });
// [820, 1080.5]
```

`src/data/coordinates.ts` centraliza esta inversión para evitar confundir los ejes. Los límites de imagen siguen siendo `[[0, 0], [2329, 3600]]`.

### Estabilidad

Las coordenadas pertenecen al modelo de contenido, no al zoom, viewport, tamaño CSS, paneo ni estado visual de Leaflet. Nunca deben guardarse como porcentajes de pantalla, latitudes geográficas simuladas o posiciones transformadas por la interfaz.

Si el proyecto cambia de imagen base, dimensiones o recorte, deberá abrir una migración explícita que transforme todas las coordenadas desde esta referencia. No se reinterpretarán silenciosamente los mismos números sobre otra imagen.

## Alias y ambigüedad de búsqueda

Para detectar colisiones, el validador normaliza nombres y alias así:

1. normalización Unicode NFKD;
2. eliminación de diacríticos;
3. conversión a minúsculas con locale español;
4. sustitución de separadores y puntuación por espacios;
5. colapso de espacios consecutivos.

Un alias no puede duplicar el nombre principal ni otro alias del mismo lugar tras normalización. Tampoco puede coincidir con el nombre o alias de otro lugar, porque produciría una búsqueda ambigua sin una regla de desambiguación definida.

## Validación ejecutable

La estrategia combina dos capas sin dependencias nuevas:

1. `catalog.ts` usa `satisfies CampaignCatalog` para comprobar el contrato TypeScript durante `npm run build`.
2. `validateCampaignData` realiza validación runtime estricta, y `assertValidCampaignData` lanza `CampaignDataValidationError` con rutas y mensajes legibles.
3. `validate.test.ts` valida el catálogo real y cubre entradas inválidas.
4. `npm run validate:data` ejecuta específicamente esa suite; `npm run test` y GitHub Actions también la ejecutan.

El validador detecta:

- IDs duplicados o con formato inválido;
- slugs duplicados o fuera de kebab-case;
- etiquetas y referencias de etiquetas fuera de kebab-case;
- referencias a categorías, etiquetas o lugares inexistentes;
- coordenadas no finitas o fuera de `3600 × 2329`;
- propiedades obligatorias ausentes y textos obligatorios vacíos;
- referencias repetidas dentro de una misma entidad;
- nombres o alias ambiguos tras normalización;
- propiedades no admitidas;
- propiedades cuyo nombre indique contenido privado, secreto, oculto, futuro, spoiler o reservado al director de juego.

La validación estructural no puede determinar si un texto aparentemente público revela un secreto. Esa responsabilidad editorial permanece en la revisión humana y en la política siguiente.

## Política de contenido público

Solo puede publicarse información que los jugadores ya conozcan y que sea adecuada para cualquier persona con acceso a la web.

Está prohibido incluir:

- notas privadas del director de juego;
- antagonistas, identidades, afiliaciones o motivaciones ocultas;
- revelaciones futuras, consecuencias previstas o giros narrativos;
- estadísticas, trampas, encuentros o recompensas no descubiertas;
- ubicaciones secretas o coordenadas aún desconocidas;
- información personal de participantes;
- tokens, credenciales, claves, URLs privadas o cualquier secreto técnico;
- campos como `privateNotes`, `gmNotes`, `secret`, `hidden`, `spoiler` o equivalentes;
- contenido oculto solo mediante CSS, JavaScript, flags o filtros del frontend.

No existe un estado `isPublic` o `hidden`: todo dato presente en `src/data/catalog.ts` es público por definición y llegará al bundle. El contenido privado debe permanecer fuera del repositorio y del frontend.

## Datos mínimos de demostración

`src/data/catalog.ts` incluye dos lugares ficticios claramente marcados como demostración, dos categorías, cuatro etiquetas, alias, coordenadas decimales válidas y dos notas públicas. No afirman hechos de la campaña ni contienen revelaciones narrativas.

Los ejemplos demuestran:

- categoría principal por lugar;
- etiquetas compartidas y específicas;
- alias de búsqueda;
- notas independientes referenciadas por `placeId`;
- coordenadas válidas y conversión posterior a Leaflet.

## Ampliación del catálogo

Las Issues posteriores deben ampliar `catalog.ts` mediante cambios revisables y mantener el modelo estable:

1. confirmar que cada dato es público para jugadores;
2. elegir IDs y slugs nuevos antes de redactar relaciones;
3. añadir primero categorías y etiquetas nuevas;
4. añadir lugares y después sus notas públicas;
5. ejecutar `npm run validate:data`;
6. ejecutar la cadena completa de calidad;
7. revisar en la PR las coordenadas, referencias y ausencia de secretos.

MAP-006 consumirá este contrato para marcadores y fichas sin cambiar su semántica. MAP-007 usará `name` y `aliases`; MAP-008 utilizará `categoryId` y `tagIds`; MAP-009 podrá construir URLs a partir de los slugs estables.
