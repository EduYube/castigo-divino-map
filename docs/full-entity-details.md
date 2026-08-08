# Ficha pública completa de entidad

- Issue: MAP-024 (#43).
- PR funcional: #75.
- Rama funcional: `agent/map-024-full-entity-details`.
- Base funcional: `bfcbf5c98aebee45e96d9f4068ee758ec162c362`.
- Estado de este documento: contrato e implementación funcional; la evidencia definitiva de merge, CI post-merge y Pages se registra únicamente después de observarla.

## Propósito

MAP-024 añade una vista pública completa e independiente para las entidades Beta 0.2 del Atlas. La ficha compacta sigue sirviendo para identificar un pin sin abandonar el mapa; la ficha completa concentra la información editorial pública extensa y puede existir por sí sola desde una URL copiable, recargable y compartible.

La página no sustituye el catálogo Beta 0.1 ni adelanta MAP-028. Una ficha completa solo existe cuando la identidad está presente en la proyección pública Beta 0.2 validada.

## Contrato de URL

La forma canónica es:

```text
/castigo-divino-map/?entity=<slug-publico>
```

En desarrollo o en otro pathname base se conserva ese pathname y únicamente cambia la query string.

La identidad canónica es `map_entities.slug`, no un nombre visible, coordenada, id privado ni una identidad geográfica ligera. El slug ya forma parte del modelo público Beta 0.2 y es estable dentro del contrato editorial existente.

`src/app/fullEntityUrl.ts` aplica estas reglas:

- `entity` debe aparecer exactamente una vez;
- el valor debe cumplir la sintaxis pública de slug en minúsculas, números y guiones;
- una URL válida se canonicaliza eliminando `place`, `q`, `category`, `tag`, parámetros inesperados y fragmentos;
- una URL inválida no se transforma en otra identidad;
- una URL sin `entity` sigue perteneciendo a la experiencia del mapa.

La estrategia usa el mismo `index.html`, por lo que funciona en GitHub Pages sin rutas limpias, rewrites ni router de servidor. Copiar, pegar o recargar `?entity=<slug>` vuelve a ejecutar la resolución desde la proyección pública.

## Nueva pestaña y relación con la ficha compacta

Una ficha compacta respaldada por una entidad Beta 0.2 incluye un enlace real `Abrir ficha completa`:

- `href` se construye con el helper canónico;
- `target="_blank"` abre una pestaña nueva;
- `rel="noopener noreferrer"` separa el nuevo contexto;
- el nombre accesible anuncia que la ficha se abrirá en una pestaña nueva;
- construir o activar el enlace no modifica la URL, selección, búsqueda ni filtros de la pestaña original.

Si el pin solo procede del catálogo Beta 0.1 y no tiene una identidad Beta 0.2 pública, la acción permanece deshabilitada con una explicación. MAP-024 no fabrica slugs ni transforma automáticamente el catálogo estático.

## Arquitectura y reutilización

La UI no consulta tablas de Supabase directamente.

La cadena de datos es:

1. `bootstrapPublicDataRuntime` de MAP-016 obtiene y valida la proyección pública resiliente;
2. `PublicCatalogSnapshotV2` conserva la única colección pública de entidades, categorías, tags, disposiciones, notas, relaciones, nombres geográficos e historial;
3. `buildPublicEntityPresentation` centraliza categoría, tags, disposiciones, notas y relaciones comunes;
4. la ficha compacta consume esa presentación común para sus campos reducidos;
5. `resolveFullEntityDetail` añade aliases, texto editorial, relación inversa e historial apropiados para la página completa;
6. `mountFullEntityDetails` convierte ese modelo en DOM seguro.

Así, compacta y completa no implementan taxonomías, disposiciones o estados de relación de manera divergente.

`character_location_relations` sigue siendo el único origen de la relación personaje–emplazamiento. `getImportantCharactersForLocation` y `getRelatedLocationsForCharacter` derivan ambas direcciones sin arrays duplicados.

## Campos visibles

Para una entidad disponible públicamente se presentan, cuando existen:

- nombre principal;
- aliases públicos;
- tipo `Personaje` o `Emplazamiento`;
- disposición por jugador;
- categoría y descripción pública de la categoría;
- etiquetas y sus descripciones públicas;
- `summary` y `description` públicos;
- notas públicas, ordenadas por `sort_order`, incluidas sus etiquetas;
- relaciones públicas aplicables;
- fecha de generación de la proyección pública validada.

La sección `Actualización pública` usa `PublicCatalogSnapshotV2.generatedAt`. La base alojada dispone además de `map_entities.updated_at`, pero MAP-016 no lo transporta hoy en su contrato resiliente. MAP-024 no ensancha esa proyección solo para mostrar una segunda noción de frescura: documenta de forma inequívoca la fecha que sí acompaña y valida el catálogo público consumido por la página.

## Emplazamientos

Un emplazamiento muestra `Personajes importantes aquí` derivado de `character_location_relations`.

Los estados usan las etiquetas compartidas:

- `present` → `Presente`;
- `associated` → `Relacionado`;
- `last-seen` → `Visto por última vez`.

Cada personaje relacionado que siga presente en la proyección pública enlaza a su propia URL `?entity=<slug>`; no se crean enlaces hacia identidades ausentes.

## Personajes

Un personaje muestra `Ubicaciones relacionadas` derivado de la misma relación normalizada.

Además, si `character_location_events` contiene historial público vigente, la ficha muestra `Historial público de localización` de forma separada de la relación actual. Los eventos se ordenan con los fechados más recientes primero y distinguen `Avistamiento` de `Salida`.

Cuando un evento referencia un emplazamiento público, se enlaza a su ficha. Un `geographic_name` puede aportar el nombre de contexto del evento, pero no obtiene por ello una ficha propia; solo se enlaza si ya está asociado a una entidad pública real.

## Estados inexistente, no publicado y archivado

`resolveFullEntityDetail` solo recibe `PublicCatalogSnapshotV2`, no las tablas administrativas. Por tanto, una navegación directa no puede buscar borradores o archivados por un canal alternativo.

Todos estos casos convergen públicamente en `Entidad no disponible`:

- slug inexistente;
- identidad sintácticamente inválida;
- duplicación del parámetro `entity`;
- entidad draft;
- entidad archived;
- entidad que deja de estar publicada;
- snapshot/proyección Beta 0.2 sin la entidad;
- backend remoto degradado sin una proyección Beta 0.2 validada.

El mensaje no revela si una identidad privada existe editorialmente.

## Resiliencia Beta 0.1 / Beta 0.2

- Una entidad Beta 0.2 publicada puede tener ficha completa con `visibility = pin` o `visibility = search_only`.
- Un lugar Beta 0.1 enriquecido por una entidad Beta 0.2 utiliza el slug de esa entidad.
- Un lugar exclusivamente Beta 0.1 conserva ficha compacta y degrada la acción completa como no disponible.
- Una entidad suplementaria Beta 0.2 publicada usa el mismo contrato completo.
- `geographic_names` siguen siendo identidades geográficas ligeras, no fichas completas.
- MAP-024 no migra masivamente el catálogo estático ni convierte nombres geográficos en entidades.

Si no existe una proyección Beta 0.2 validada, la ficha completa falla cerrada en vez de reconstruir una entidad extensa con datos Beta 0.1 parciales.

## Texto seguro y XSS

Todos los valores administrables se insertan con `textContent`, `createElement`, propiedades DOM y atributos controlados. Esto cubre:

- nombre y aliases;
- summary y description;
- categoría y tags;
- notas;
- nombres y contexto de relaciones e historial.

No se usa `innerHTML` con contenido de datos ni se introduce un renderizador HTML general. Cadenas como `<script>...</script>` o `<img onerror=...>` se presentan literalmente como texto.

Los únicos bloques HTML estáticos son el shell de aplicación controlado por el repositorio y no interpolan contenido editorial.

## Seguridad, RLS y Supabase

PostgreSQL/RLS continúa siendo la frontera autoritativa. El navegador es una superficie no confiable y una URL nunca concede visibilidad adicional.

La inspección de producción durante MAP-024 confirmó que la policy pública de `map_entities` limita `SELECT` a `publication_status = 'published'` y exige categoría publicada. La implementación no consulta estados administrativos para resolver fichas.

MAP-024 no requiere cambios persistentes de Supabase:

- migraciones: ninguna;
- cambios RLS: ninguno;
- cambios de grants: ninguno;
- cambios Auth, usuarios o allowlist: ninguno;
- cambios de credenciales o secretos: ninguno;
- ejecución de `seed.sql` en producción: ninguna.

La consulta de inspección realizada fue de solo lectura.

## Navegación y estado documental

La página completa tiene shell propio, `main`, `article`, navegación y `h1`. No depende del historial de la pestaña del mapa.

Al resolver una entidad:

- `document.title` pasa a `<Nombre> · El Atlas de los Nuevos Dioses`;
- la meta description utiliza el resumen público o una descripción genérica segura;
- el `h1` contiene el nombre principal;
- el enlace `Volver al mapa` apunta al pathname base sin la query `entity`;
- las relaciones entre entidades usan URLs completas canónicas.

Un estado no disponible usa título y metadatos genéricos y no incluye la identidad solicitada en mensajes de error.

## Accesibilidad

La ficha completa se implementa como página, no como modal, por lo que no existe focus trap.

Se conservan y prueban:

- skip link al contenido principal;
- un único heading principal y jerarquía `h1` → `h2` → `h3`;
- landmarks de banner, main, navegación y footer;
- foco programático razonable sobre el `h1` al resolver la navegación directa;
- enlace de vuelta al mapa operable con teclado;
- nueva pestaña anunciada en el nombre accesible de la acción compacta;
- tipo con forma, símbolo y texto;
- disposición con símbolo, jugador y texto;
- relaciones y notas en estructuras semánticas legibles;
- targets de navegación de al menos 44 px;
- `forced-colors` con bordes explícitos;
- `prefers-reduced-motion` sin transiciones necesarias;
- ninguna operación dependiente de hover.

## Responsive

La página no reutiliza forzosamente el panel lateral compacto. Usa un contenedor independiente con ancho máximo, grids autoajustables y wrapping de contenido largo.

A 320 px:

- las colecciones pasan a una columna;
- links y texto largo usan wrapping;
- el contenedor mantiene padding reducido;
- no deben existir columnas con anchura fija ni overflow horizontal accidental.

La suite E2E cubre 320 px junto con `forced-colors` y `prefers-reduced-motion`.

## Pruebas

Cobertura específica añadida:

- `src/app/fullEntityUrl.test.ts`: URL canónica, parámetros extra, slugs inválidos y duplicados;
- `src/data/fullEntityDetails.test.ts`: campos completos, aliases, notas, tags, disposición, relaciones en ambas direcciones, historial, datos faltantes, texto HTML-like y estado ausente;
- `src/data/compactPinDetails.test.ts`: mantiene la degradación Beta 0.1 y reutilización Beta 0.2;
- `tests/e2e/compact-pin-details.spec.ts`: enlace real en nueva pestaña para Beta 0.2 y degradación deshabilitada para Beta 0.1;
- `tests/e2e/full-entity-details.spec.ts`: apertura desde el mapa, pestaña original preservada, navegación directa, canonicalización, reload, personaje, emplazamiento, `search_only`, relaciones, notas, historial, HTML-like como texto, no publicación simulada, backend degradado, teclado, móvil y alto contraste;
- `tests/deployment/full-entity-pages-smoke.spec.ts`: carga directa de `?entity=...` bajo el subdirectorio real de Pages, recarga, assets y estado público seguro.

La producción alojada no contenía entidades `map_entities` publicadas durante la inspección de MAP-024. Por ello el smoke publicado no fabrica contenido editorial para afirmar una ficha existente: valida una URL directa con identidad ausente y el estado público seguro. El contenido completo con entidad se valida en E2E mediante la misma forma de proyección REST que consume la aplicación.

Los conteos definitivos de unitarios, E2E, smoke y pgTAP se registran después de que Actions ejecute el head final.

## GitHub Pages

La estrategia no necesita cambios de servidor. Vite sigue construyendo un único `index.html` bajo `base=/castigo-divino-map/` y la query `entity` llega intacta al navegador.

El smoke de Pages comprueba que:

- el documento responde correctamente desde el subdirectorio;
- CSS y JavaScript se resuelven bajo `/castigo-divino-map/assets/`;
- una URL directa `?entity=...` no produce error de routing;
- recargar conserva el contrato;
- existe navegación básica de vuelta al mapa.

La apertura multiventana se mantiene en la suite E2E normal y no se duplica innecesariamente en el smoke publicado.

## Límites

MAP-024 no implementa:

- rediseño global de búsqueda/filtros de MAP-025;
- solicitudes públicas de MAP-026;
- moderación de MAP-027;
- transición completa del catálogo estático de MAP-028;
- campaña global final de MAP-029;
- publicación final Beta 0.2 de MAP-030.
