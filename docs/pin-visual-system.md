# Sistema visual de pines

- Issue: MAP-022.
- Estado: contrato de Beta 0.2 implementado en la rama funcional; la evidencia definitiva corresponde al head final validado por GitHub Actions.
- Alcance: mapa público y previsualización/editor administrativo.

## Propósito y frontera

MAP-022 permite reconocer el tipo de entidad y sus disposiciones sin abrir una ficha, sin cambiar IDs, slugs, coordenadas, URL, historial, búsqueda, filtros ni el modelo persistente. No sustituye todavía el catálogo visible Beta 0.1: esa transición completa continúa reservada a MAP-028.

La implementación usa únicamente el dominio vigente:

- `entity_type`: `character` o `location`;
- `visibility`: `pin` o `search_only`;
- `entity_player_dispositions`: una disposición por pareja entidad–jugador;
- `player_disposition`: `ally`, `enemy` o `neutral`.

`unknown` no se añade al dominio ni a PostgreSQL. El signo `?` es exclusivamente un fallback visual cuando una proyección recibida no contiene una perspectiva esperada o todavía se está usando el catálogo de compatibilidad Beta 0.1 sin disposiciones Beta 0.2.

MAP-022 no añade migraciones ni modifica RLS, Auth, usuarios, allowlist, claves o seeds.

## Contrato visual

### Tipo de entidad

El tipo se expresa principalmente mediante forma y símbolo, no mediante color:

| Tipo | Forma | Símbolo | Texto accesible |
|---|---|---|---|
| `character` | círculo | `●` | Personaje |
| `location` | rombo/cuadrado girado | `◆` | Emplazamiento |

La forma se mantiene en modo `forced-colors`. El nombre del tipo forma parte del `aria-label` del control y de la leyenda.

### Disposición por jugador

No existe una disposición global. Cada pin puede mostrar varios tokens compactos, en el orden de `players`, para reflejar perspectivas diferentes.

| Estado visual | Símbolo | Borde | Significado |
|---|---|---|---|
| `ally` | `+` | sólido | Aliado |
| `enemy` | `−` | doble | Enemigo |
| `neutral` | `•` | punteado | Neutral |
| fallback ausente | `?` | discontinuo | Sin disposición disponible |

El color es complementario. Símbolo, estilo de borde y texto transmiten el mismo significado cuando el color desaparece. Los nombres accesibles enumeran la perspectiva explícitamente, por ejemplo `Alicia: aliado; Borin: enemigo`.

## Selección, foco, hover y filtros

Las dimensiones semánticas no se reutilizan para estados de interacción:

- tipo: forma y símbolo interior;
- disposición: tokens periféricos;
- selección: anillo exterior independiente y elevación de `z-index`;
- foco: `outline` visible independiente del color de disposición;
- hover: desplazamiento/escala leve, nunca necesario para comprender o operar el pin;
- filtrado: atenuación visual, conservando forma, texto, foco y operabilidad;
- grupo con estados de filtro mixtos: no se oculta y anuncia que contiene pines con estados distintos.

Los pines que no coinciden con filtros siguen siendo botones operables, como en Beta 0.1. Los pines Beta 0.2 que todavía no participan en los filtros de compatibilidad permanecen visibles; MAP-025/MAP-028 conservan la responsabilidad de evolucionar la superficie de filtros y la transición completa del catálogo.

Con `prefers-reduced-motion: reduce`, las transiciones del nuevo sistema se desactivan. No hay animación necesaria para comprender tipo, disposición, selección o coincidencias.

## Coordenadas coincidentes

Las coordenadas persistidas nunca se desplazan para fabricar separación visual.

`groupPinsByCoordinate` agrupa únicamente en la interfaz los pines cuya coordenada Leaflet canónica `[y, x]` coincide exactamente. Un grupo de más de una entidad se representa mediante:

- un único control de al menos 44 × 44 px;
- símbolo compuesto `≡`;
- contador visible;
- `aria-haspopup=true` y estado `aria-expanded`;
- nombre accesible que indica cuántos pines coinciden y enumera las entidades.

Activar el grupo mediante click, toque, Enter o Espacio abre un popup con una lista de botones. Cada botón incluye nombre, tipo y disposiciones por jugador. El primer elemento recibe foco al abrir la lista. Seleccionar una opción usa la activación normal de esa entidad.

Esta estrategia evita que un marcador DOM tape permanentemente a otro, funciona sin hover y conserva la coordenada canónica para centrado, búsqueda y datos persistidos.

## Integración incremental Beta 0.1 / Beta 0.2

`createAtlasPinMarkerModels` construye la superficie cartográfica sin adelantar MAP-028:

1. conserva todos los lugares visibles del catálogo Beta 0.1;
2. si una entidad Beta 0.2 `location` con `visibility = pin` coincide por ID o slug estable, enriquece ese mismo pin con tipo, nombre/categoría Beta 0.2 y disposiciones;
3. añade como pines suplementarios las restantes entidades Beta 0.2 publicadas por la proyección con `visibility = pin`, incluidos personajes;
4. nunca crea un pin para `visibility = search_only`;
5. nunca crea un pin a partir de `geographic_names`.

Cuando el backend Beta 0.2 no está disponible, los pines Beta 0.1 continúan funcionando y muestran el fallback visual de disposición ausente. La ficha, query string e historial siguen vinculados únicamente a los lugares Beta 0.1 compatibles hasta que Issues posteriores incorporen las nuevas fichas.

## Vista pública

`src/map/leaflet.ts` consume `AtlasPinMarkerModel` y conserva:

- imagen oficial remota sin copia local;
- `L.CRS.Simple` y las coordenadas existentes;
- zoom y centrado sin animación obligatoria;
- selección de fichas Beta 0.1;
- resaltado geográfico temporal separado de MAP-021;
- foco de retorno al cerrar una ficha;
- atenuación por filtros;
- teclado y toque.

Los pines Beta 0.2 suplementarios pueden seleccionarse y localizarse aunque todavía no tengan ficha de compatibilidad; la región de estado anuncia esa situación sin inventar una ficha de MAP-023/MAP-024.

## Leyenda

La vista pública incluye una leyenda compacta y semántica antes del mapa. Explica:

- círculo `●` = personaje;
- rombo `◆` = emplazamiento;
- `+`, `−`, `•` y `?` para disposición/fallback;
- que la disposición es por jugador;
- que el color es solo una señal complementaria.

La leyenda no es interactiva, por lo que no introduce controles ni tab stops. En móvil pasa a una sola columna y el mapa la referencia mediante `aria-describedby`.

## Previsualización administrativa

El editor administrativo conserva su CRUD, validación, RPC y persistencia de MAP-019. MAP-022 añade solo una sincronización de presentación:

- el marcador de coordenadas reutiliza las clases y símbolos públicos;
- el tipo se toma del draft actual;
- las disposiciones se toman de los selects por jugador ya existentes;
- cambios en el formulario actualizan el marcador sin guardar;
- `Previsualizar` muestra el mismo lenguaje visual para `visibility = pin`;
- `search_only` continúa sin presentar un pin publicado.

La alternativa accesible de editar X/Y directamente permanece intacta.

## Accesibilidad y móvil

El contrato exige y las pruebas cubren:

- nombre accesible con nombre, tipo, disposiciones por jugador y categoría;
- Enter/Espacio en pines y grupos coincidentes;
- foco visible independiente del color;
- opciones coincidentes como botones nativos;
- targets de al menos 44 px para pines y opciones principales;
- viewport de 320 px sin overflow horizontal inesperado;
- `forced-colors` con forma, bordes, selección y foco distinguibles;
- `prefers-reduced-motion` sin transiciones necesarias;
- ninguna dependencia de hover para descubrir entidades.

## Pruebas

Cobertura específica añadida:

- `src/domain/pinVisualSystem.test.ts`: traducción de tipo, disposición, fallback, descripción por jugador y agrupación de coordenadas;
- `src/data/pinMarkers.test.ts`: integración incremental Beta 0.1/Beta 0.2, `pin` frente a `search_only`, perspectivas y fallback;
- `tests/e2e/pin-visual-system.spec.ts`: vista pública, formas, disposiciones no cromáticas, selección, foco, filtros, coincidencias, teclado, 320 px, targets táctiles, forced colors y reduced motion;
- `tests/e2e/admin-pin-visual-system.spec.ts`: marcador y preview administrativos con el mismo contrato visual.

Las suites previas siguen siendo obligatorias. La evidencia definitiva debe proceder de GitHub Actions sobre el SHA final de la PR.

## Archivos principales

- `src/domain/pinVisualSystem.ts`
- `src/data/pinMarkers.ts`
- `src/map/leaflet.ts`
- `src/app/adminPinVisualSync.ts`
- `src/map/adminEntityEditorMap.ts`
- `src/styles/pin-visual-system.css`
- `src/styles/admin-pin-visual-system.css`
- `src/app/renderApp.ts`
- `src/main.ts`

## Fuera de alcance conservado

MAP-022 no implementa:

- rediseño de ficha compacta de MAP-023;
- ficha completa de MAP-024;
- búsqueda/filtros colapsables de MAP-025;
- solicitudes o moderación de MAP-026/MAP-027;
- transición completa del catálogo de MAP-028;
- campaña global de MAP-029;
- publicación final de Beta 0.2 de MAP-030.
