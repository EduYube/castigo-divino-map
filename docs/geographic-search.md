# Búsqueda geográfica pública

MAP-021 amplía la búsqueda pública para localizar nombres impresos en la cartografía sin convertirlos en pines de campaña y sin adelantar la transición completa del catálogo reservada a MAP-028.

## Fuentes e identidades

La búsqueda combina dos superficies ya existentes:

- el catálogo visible Beta 0.1, que conserva emplazamientos, aliases y títulos de notas públicas;
- la proyección Beta 0.2 validada por MAP-016, que aporta `map_entities`, `entity_aliases`, `geographic_names` y `geographic_name_aliases` publicados.

Las identidades no se fusionan por texto. Un `geographic_name` y un `map_entity` con el mismo nombre siguen siendo resultados distintos. Solo se evita duplicar un emplazamiento Beta 0.1 cuando una entidad Beta 0.2 conserva su `id` o `slug` estable.

Los tipos presentados al usuario son textuales:

- **Lugar geográfico**: `geographic_names`, incluso sin entidad asociada;
- **Personaje**: `map_entities.entity_type = character`;
- **Emplazamiento de campaña**: `map_entities.entity_type = location` o un lugar de compatibilidad Beta 0.1.

Beta 0.2 solo admite nombres y aliases Beta 0.2 con `language = en`; esta restricción ya la valida el codec público.

## Matching y orden

Se conserva la normalización existente de búsqueda: mayúsculas/minúsculas, diacríticos y espacios no alteran el matching.

La prioridad es determinista:

1. coincidencia exacta;
2. prefijo;
3. coincidencia parcial;
4. nombre principal antes que alias y alias antes que título de nota;
5. para empates restantes: lugar geográfico, emplazamiento y personaje, manteniendo el orden estable de las colecciones públicas.

Los cuerpos de notas no se indexan.

## Selección cartográfica

Seleccionar un resultado geográfico, personaje o emplazamiento Beta 0.2 sin ficha de compatibilidad:

1. conserva el foco en el resultado;
2. centra Leaflet en `{ x, y }` mediante la conversión canónica `[y, x]`;
3. usa `recommended_zoom` cuando existe, limitado por `minZoom`/`maxZoom` reales del viewport;
4. si no existe zoom recomendado, usa el mismo acercamiento mínimo que la localización de un pin;
5. muestra durante tres segundos un resaltado temporal con símbolo circular y borde discontinuo;
6. anuncia el centrado mediante una región `role=status` visualmente oculta.

El centrado de cámara usa `animate: false`. El resaltado puede pulsar visualmente en el modo normal, pero queda estático con `prefers-reduced-motion: reduce`. Su forma y símbolo permiten percibirlo sin depender exclusivamente del color.

## Relación opcional con una ficha

`geographic_names.entity_id` conserva semántica de relación, no de identidad. La selección principal de un nombre geográfico siempre ejecuta centrar/zoom/resaltar.

Si la entidad asociada corresponde además a un lugar Beta 0.1 estable, el resultado muestra una acción separada **Abrir ficha**. Esa acción reutiliza la selección, historial, ficha y retorno de foco existentes. No se crea un pin nuevo para el nombre geográfico.

Personajes y emplazamientos que todavía no tengan una ficha compatible se pueden localizar y resaltar, pero MAP-021 no implementa las fichas de MAP-023/MAP-024.

## URL e historial

MAP-021 no añade parámetros nuevos. El contrato sigue siendo:

- `q` para la consulta;
- `place` para la ficha de un lugar Beta 0.1;
- `category` y `tag` para filtros.

Por tanto, una selección geográfica es un estado cartográfico transitorio. Recarga, atrás/adelante y enlaces directos siguen dependiendo de la consulta reproducible `q` y del estado preexistente. No se introduce router ni estado de servidor y el pathname de GitHub Pages permanece `/castigo-divino-map/`.

## Datos públicos y seguridad

MAP-021 no añade DDL ni modifica Auth. El modelo creado antes de esta Issue ya contiene coordenadas, zoom recomendado, aliases, enlace opcional a una entidad y RLS para nombres geográficos.

`SupabasePublicCatalogRepository` continúa haciendo lecturas públicas con la URL del proyecto y la clave publicable. No adjunta JWT administrativo. RLS y grants de PostgreSQL siguen decidiendo qué filas publicadas puede leer `anon`.

La UI principal no sustituye el catálogo visible Beta 0.1 por el snapshot Beta 0.2. `PublicDataRuntime` expone únicamente el último catálogo Beta 0.2 que ya pasó por el repositorio y codec de MAP-016 para que MAP-021 construya su índice. La transición completa sigue perteneciendo a MAP-028.

## Cobertura

MAP-021 añade cobertura de:

- matching de nombres y aliases geográficos en inglés;
- separación entre identidad geográfica y entidad de campaña asociada;
- resultado geográfico sin entidad;
- personajes y emplazamientos con tipo textual;
- orden determinista y deduplicación solo por identidad estable;
- centrado, zoom recomendado y resaltado temporal;
- acción separada para abrir una ficha existente;
- estado sin resultados accesible;
- teclado y conservación de foco;
- `prefers-reduced-motion`;
- viewport de 320 px;
- recarga de `q` sin introducir nuevo estado de URL.
