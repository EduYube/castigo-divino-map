# Ficha compacta de pines

- Issue: MAP-023 (#42), cerrada como completada.
- PR funcional: #73, fusionada.
- Rama funcional: `agent/map-023-compact-pin-details`.
- Base funcional: `a4993f23f1357c88d990a40c1f2d2f1236e8d00a`.
- Head funcional final: `1eb2c198ef711248272ae98ab34bc4c12cc7359d`.
- CI pre-merge: #418, run `31229733395`, completamente verde.
- Merge funcional: `1e2532574d5c66a237b06bf6e4ea2fa744b59c59`.
- Estado post-merge: pendiente de registrar únicamente cuando CI de `master` y Pages hayan terminado sobre el merge real.

## Propósito

MAP-023 sustituye la ficha extensa heredada de Beta 0.1 por una ficha compacta que permite identificar y clasificar un pin sin abandonar el mapa. La superficie es común para personajes y emplazamientos y reutiliza el mismo lenguaje visual y semántico de MAP-022.

La ficha compacta no es la ficha completa. MAP-024 conserva la responsabilidad de crear la vista completa en una pestaña nueva, definir su URL estable y mostrar el contenido editorial extenso.

## Datos que presenta

La ficha compacta muestra exclusivamente:

- nombre público;
- tipo de entidad (`Personaje` o `Emplazamiento`) con el símbolo compartido de MAP-022;
- categoría principal;
- etiquetas públicas;
- disposición por jugador mediante el mismo símbolo y texto de MAP-022;
- para emplazamientos, `Personajes importantes aquí` cuando existen relaciones públicas personaje–emplazamiento.

No muestra:

- aliases;
- descripción de categoría;
- `summary` o `description` extensos de la entidad;
- títulos o cuerpos de notas públicas;
- historial cronológico de localización;
- relaciones inversas de un personaje con emplazamientos.

Los dos últimos puntos pertenecen a la información extendida que MAP-024 puede presentar en la ficha completa.

## Modelo de presentación

`src/data/compactPinDetails.ts` construye `CompactPinDetailModel` a partir de un `AtlasPinMarkerModel` y de las fuentes ya validadas por la aplicación.

La resolución sigue esta prioridad:

1. si el pin representa una entidad de la proyección pública Beta 0.2, se usan sus datos publicados validados;
2. si no existe una entidad Beta 0.2 disponible pero el pin pertenece al catálogo Beta 0.1, se construye una degradación compacta con nombre, categoría y tags heredados;
3. un pin suplementario Beta 0.2 cuya entidad deje de estar disponible no fabrica una ficha con datos parciales.

La UI no consulta Supabase directamente. Consume únicamente el snapshot/proyección que ya atravesó el repositorio público resiliente de MAP-016.

## Personajes frente a emplazamientos

Ambos tipos comparten nombre, tipo, categoría, etiquetas y disposiciones por jugador.

Un emplazamiento puede añadir la sección `Personajes importantes aquí`. La sección se deriva exclusivamente de `character_location_relations` mediante `getImportantCharactersForLocation`; no existen arrays duplicados dentro de la entidad.

Los estados se presentan como:

- `present` → `Presente`;
- `associated` → `Relacionado`;
- `last-seen` → `Visto por última vez`.

Un personaje no muestra una sección inversa de emplazamientos relacionados en la ficha compacta. Esa información ampliada queda reservada para MAP-024.

## Disposición por jugador

La ficha no introduce una disposición global ni una taxonomía nueva. Reutiliza `createPlayerDispositionVisuals` de MAP-022:

- `+` / `Aliado`;
- `−` / `Enemigo`;
- `•` / `Neutral`;
- `?` / `Sin disposición disponible` únicamente como fallback visual cuando la proyección no contiene una perspectiva utilizable.

Cada fila nombra al jugador y el estado en texto, por lo que el color nunca es la única señal.

En el fallback Beta 0.1, donde el catálogo estático no contiene la matriz de disposiciones, la ficha anuncia explícitamente `Perspectiva no disponible` y `Sin disposición disponible` en vez de inventar un valor de dominio.

## Datos faltantes y degradación

- Sin tags: se muestra `Sin etiquetas públicas`.
- Sin relaciones de emplazamiento: se omite `Personajes importantes aquí`; no se muestra una lista vacía artificial.
- Sin Beta 0.2: los lugares Beta 0.1 siguen abriendo una ficha compacta funcional.
- Si una entidad suplementaria desaparece al actualizar la proyección: se cierra su ficha en vez de conservar datos obsoletos.
- Una respuesta remota parcial o inválida sigue siendo responsabilidad del acceso resiliente de MAP-016 y nunca se mezcla con esta capa de presentación.

## Selección, mapa, URL e historial

Los lugares compatibles con Beta 0.1 conservan el controlador histórico de selección y el parámetro `place`. Abrir, cerrar, restaurar `popstate`, buscar o filtrar mantiene los contratos existentes de URL e historial.

Los pines suplementarios Beta 0.2 ya pueden abrir una ficha compacta desde el mapa. Esa selección es transitoria y no crea un nuevo parámetro de URL: MAP-023 no inventa el contrato de navegación estable que MAP-024 deberá definir para la ficha completa ni adelanta la transición global de MAP-028.

Solo existe una ficha abierta a la vez. Seleccionar un pin sustituye la selección anterior; seleccionar un objetivo de búsqueda que no abre una ficha cierra una ficha suplementaria transitoria.

Al cerrar:

- una ficha de lugar Beta 0.1 devuelve el foco al marcador histórico, como antes;
- una ficha de pin suplementario devuelve el foco al control cartográfico que representa su coordenada;
- si la coordenada contiene varios pines, el foco vuelve al marcador compuesto.

La selección visual sigue siendo responsabilidad del sistema de pines de MAP-022 y permanece independiente del tipo, disposición y filtrado.

## Acción de ficha completa y frontera con MAP-024

La ficha incluye una acción visible `Abrir ficha completa`, pero permanece deshabilitada y acompañada por una explicación explícita de que la ficha completa se incorpora en MAP-024.

Esta degradación es intencional: MAP-023 no crea una pestaña nueva, no decide todavía una URL estable de entidad y no presenta contenido extenso oculto detrás de una ruta provisional. De este modo la interfaz comunica inequívocamente el destino futuro sin establecer un contrato que MAP-024 tendría que romper.

## Accesibilidad

La implementación conserva y prueba:

- activación de pines con click, toque, Enter y Espacio;
- título de ficha enfocable programáticamente al abrir;
- botón de cierre con nombre accesible que incluye la entidad activa;
- retorno de foco al marcador correcto al cerrar;
- tipo expresado por símbolo, forma y texto;
- disposición expresada por símbolo y texto por jugador;
- headings semánticos para disposiciones, etiquetas y personajes importantes;
- texto insertado mediante APIs DOM y `textContent`;
- targets principales de al menos 44 px;
- `forced-colors` con bordes y formas distinguibles;
- `prefers-reduced-motion` sin transiciones necesarias para comprender u operar la ficha;
- ausencia de dependencia de hover.

El `aria-label` histórico de los pines Beta 0.1 no se modifica: la información adicional de tipo/disposición continúa en la descripción accesible del marcador según MAP-022.

## Responsive

En escritorio la ficha sigue utilizando el panel lateral del workspace existente. En anchos menores se apila bajo el mapa conforme al contrato responsive consolidado.

La disposición interna usa grids y wrapping que admiten 320 px sin overflow horizontal; las filas de disposición pasan a dos líneas cuando el ancho lo requiere. La acción de ficha completa conserva un target de 44 px aunque esté deshabilitada.

## Compatibilidad Beta 0.1 / Beta 0.2

MAP-023 continúa la estrategia incremental:

- el catálogo Beta 0.1 sigue proporcionando los lugares visibles y su URL estable;
- una entidad Beta 0.2 coincidente puede enriquecer ese mismo pin y su ficha compacta;
- personajes y emplazamientos Beta 0.2 suplementarios `visibility = pin` usan la misma ficha compacta;
- `search_only` no se convierte en pin por MAP-023;
- `geographic_names` siguen siendo objetivos ligeros de búsqueda y no obtienen una ficha propia;
- MAP-025 conserva la evolución de búsqueda/filtros;
- MAP-028 conserva la sustitución global del catálogo estático.

## Supabase y seguridad

MAP-023 no requiere cambios persistentes.

Se reutilizan exclusivamente los contratos ya disponibles:

- `map_entities`;
- `categories`;
- `tags` / `entity_tags`;
- `players` / `entity_player_dispositions`;
- `character_location_relations`;
- proyección pública validada por MAP-016.

No se añaden tablas, columnas, enums, RPC, grants, policies, usuarios, credenciales, datos de producción ni migraciones. RLS continúa entregando al navegador únicamente contenido publicado. No se ejecuta `seed.sql` en producción.

## Pruebas y evidencia funcional

Cobertura específica de MAP-023:

- `src/data/compactPinDetails.test.ts`: proyección Beta 0.1, enriquecimiento Beta 0.2, disposiciones, relaciones y ausencia deliberada de contenido extenso;
- `tests/e2e/compact-pin-details.spec.ts`: emplazamientos, personajes, personajes importantes, datos excluidos, degradación de backend, cierre/foco, móvil, `forced-colors` y `prefers-reduced-motion`;
- `tests/e2e/pin-visual-system.spec.ts`: convivencia con selección, formas, disposiciones y coordenadas coincidentes de MAP-022;
- `tests/e2e/app.spec.ts`: compatibilidad de búsqueda, filtros, teclado, fallo de imagen, móvil, URL/foco y ficha compacta Beta 0.1.

El head funcional final `1eb2c198ef711248272ae98ab34bc4c12cc7359d` quedó completamente verde en CI #418 / run `31229733395` con:

- 202/202 pruebas unitarias en 32 archivos;
- 85/85 pruebas E2E de Playwright;
- 2/2 smoke tests del build de Pages;
- 222/222 pruebas pgTAP en 12 archivos;
- 13/13 comprobaciones de concurrencia Supabase;
- formatting, auditoría de credenciales, lint, build de Pages, auditoría del artefacto, migraciones y RLS verdes.

Durante el bucle de CI se corrigieron dos clases de regresión detectadas por las propias suites: expectativas heredadas del antiguo nombre accesible genérico del botón de cierre y un recálculo de tamaño de Leaflet necesario para preservar el centro canónico al abrir una ficha suplementaria en un layout que cambia de ancho. El head final volvió a ejecutar la matriz completa antes de pasar a Ready.

La PR #73 se fusionó mediante el merge commit `1e2532574d5c66a237b06bf6e4ea2fa744b59c59`, y la Issue #42 quedó cerrada automáticamente como completada. La evidencia post-merge de `master` y Pages se añadirá a este documento únicamente después de verificarse sobre ese merge commit.

## Archivos principales

- `src/data/compactPinDetails.ts`
- `src/app/compactPinDetails.ts`
- `src/styles/compact-pin-details.css`
- `src/main.ts`
- `src/app/renderApp.ts`
- `tests/e2e/compact-pin-details.spec.ts`
- `tests/e2e/pin-visual-system.spec.ts`
- `tests/e2e/app.spec.ts`

## Fuera de alcance conservado

MAP-023 no implementa:

- ficha completa y URL estable de MAP-024;
- rediseño/colapso global de búsqueda y filtros de MAP-025;
- solicitudes o moderación de MAP-026/MAP-027;
- transición completa del catálogo de MAP-028;
- campaña global de seguridad/rendimiento de MAP-029;
- publicación final de Beta 0.2 de MAP-030.
