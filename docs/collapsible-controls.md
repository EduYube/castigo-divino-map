# Búsqueda y filtros colapsables

- Issue: MAP-025 (#44).
- Rama funcional: `agent/map-025-collapsible-search-filters`.
- Base funcional observada al iniciar la Issue: `d8963eb60b08fa786a6722dec241488bac74f7e6`.
- Estado de este documento: contrato e implementación funcional. La evidencia definitiva de merge, CI post-merge y Pages solo se registra después de observarla.

## Propósito

MAP-025 reduce el espacio vertical ocupado por búsqueda y filtros sin cambiar qué significa buscar, filtrar, seleccionar un lugar ni navegar por URL/historial. Las dos secciones se pueden abrir y cerrar por separado y la versión contraída conserva un resumen suficiente para entender el estado funcional vigente.

## Separación de estados

La implementación mantiene tres conceptos distintos:

1. **Estado funcional**: consulta, categorías, etiquetas, resultados derivados y selección activa. Sigue perteneciendo a `mountPlaceSearch`, `mountPlaceFilters`, `deriveMatchingPublicPlaceIds` y al contrato de URL de MAP-021.
2. **Estado de presentación**: cada sección está expandida o contraída. Vive únicamente en `mountCollapsibleMapControls` y no modifica los controladores funcionales.
3. **Preferencia inicial responsive**: `window.matchMedia('(max-width: 48rem)')` se consulta una sola vez al montar los controles para elegir el valor inicial.

No existe una segunda copia de la query ni de los filtros para construir los resúmenes. Tampoco se serializa el estado expandido/contraído en URL, historial, Supabase o almacenamiento persistente.

## Regla inicial responsive

La regla explícita es:

- viewport de hasta `48rem`: búsqueda contraída y filtros contraídos;
- viewport superior a `48rem`: búsqueda expandida y filtros expandidos.

La consulta de media solo decide el estado inicial de esa carga de página. No se instala ningún listener de `resize` ni de cambios de `MediaQueryList`. Por tanto, una rotación o redimensionado posterior no puede reimponer la preferencia responsive ni deshacer una decisión manual del usuario durante la sesión de página.

La elección no se persiste entre recargas: una carga nueva vuelve a aplicar la regla inicial al viewport de ese momento. Esa persistencia no es necesaria para MAP-025 y evitarla mantiene el estado de presentación fuera del contrato funcional.

## Búsqueda contraída

La sección mantiene fuera de la región controlada:

- el título `Búsqueda`;
- el botón `Mostrar búsqueda` / `Ocultar búsqueda`;
- un resumen derivado por el propio controlador de búsqueda.

El resumen usa la query real y la misma colección de resultados que `mountPlaceSearch` acaba de calcular:

- sin query: `Sin consulta activa.`;
- con query: `Consulta: “…” · N resultados.`.

La región controlada contiene el label, input, ayuda, estado y lista de resultados. Contraerla aplica `hidden` a la región completa; no se reserva altura y sus controles dejan de participar en interacción y navegación por teclado. Reabrirla vuelve a mostrar exactamente el mismo input y resultados, sin reconstruir una copia del estado.

## Filtros contraídos

La sección mantiene fuera de la región controlada:

- el título `Filtrar lugares`;
- el botón `Mostrar filtros` / `Ocultar filtros`;
- un resumen derivado de los `Set` de categorías/etiquetas seleccionadas y del `matchCount` que ya publica el controlador de filtros.

El resumen informa:

- cero, uno o varios filtros activos;
- cero, uno o varios lugares coincidentes cuando el cálculo de resultados ya está disponible.

La región controlada contiene ayuda, limpieza, fieldsets, opciones y estado detallado. Contraerla no cambia ningún checkbox ni provoca `onChange`.

## URL e historial

MAP-021 sigue siendo la única autoridad para el estado público navegable:

- `q` conserva la consulta;
- `category` conserva categorías;
- `tag` conserva etiquetas;
- `place` conserva la selección compatible existente.

Abrir o cerrar búsqueda/filtros no llama a `pushState` ni `replaceState`, no añade parámetros nuevos y no cambia la URL actual. `popstate` continúa restaurando únicamente estado funcional. Si búsqueda o filtros están contraídos durante back/forward, los controladores actualizan sus valores y resúmenes sin abrir las secciones.

Una URL restaurada reconstruye query y filtros aunque las regiones empiecen contraídas en móvil. El estado visual sigue siendo independiente del estado navegable.

## Accesibilidad

Cada sección usa un `<button type="button">` real con:

- `aria-expanded` sincronizado con el estado real;
- `aria-controls` apuntando a un `id` único existente;
- una región con `role="region"` y relación semántica con su botón;
- un nombre de acción que cambia entre `Mostrar …` y `Ocultar …`.

El botón permanece fuera de la región que oculta. Al contraer mediante teclado o puntero el foco permanece en ese botón; al expandir tampoco se mueve a otro control. Una región contraída usa `hidden`, por lo que input, resultados y checkboxes quedan fuera del flujo de foco y del árbol de accesibilidad interactuable.

No se anima la altura ni se depende de animaciones para transmitir estado. La regla global existente de `prefers-reduced-motion` se mantiene y la nueva interacción funciona sin transición. `forced-colors` aporta borde y colores de sistema explícitos para el nuevo botón; el patrón no depende exclusivamente de color o hover.

Los resúmenes usan `aria-live="polite"` y `aria-atomic="true"`. Mientras una sección está abierta su resumen se oculta visualmente; al estar contraída puede comunicar cambios funcionales producidos por restauración de historial u otras fuentes existentes.

## Responsive y superficie útil

El contenido contraído utiliza `hidden`, no `visibility`, altura fija ni una caja reservada. A 320 px los headers se apilan para evitar anchuras mínimas problemáticas y los botones ocupan el ancho disponible con target táctil de al menos 44 px.

La suite E2E compara la posición documental del mapa con ambas secciones contraídas frente a expandidas y exige una reducción vertical material, además de comprobar `scrollWidth <= clientWidth` a 320 px. También conserva las pruebas históricas de wrapping de nombres largos y responsive.

## Pruebas

La cobertura específica incluye:

- valor inicial escritorio y móvil;
- independencia de búsqueda y filtros;
- `aria-expanded`, `aria-controls`, IDs y regiones;
- consulta, filtros, URL e historial intactos al contraer/expandir;
- resumen de query y resultados, incluido cero resultados;
- contador de filtros activos;
- restauración desde URL con secciones inicialmente contraídas;
- combinación de búsqueda + filtros;
- back/forward sin reabrir controles;
- resize posterior a decisiones manuales sin sobrescribirlas;
- foco y navegación por teclado con contenido oculto no alcanzable;
- viewport de 320 px y ausencia de overflow horizontal;
- `prefers-reduced-motion` y `forced-colors`;
- regresión de las suites de búsqueda, filtros, URL, responsive y accesibilidad existentes.

La evidencia numérica final de CI se añadirá al estado del proyecto después del merge, cuando pueda observarse honestamente el head definitivo y el despliegue posterior.

## Supabase y seguridad

MAP-025 no necesita persistencia ni autorización nueva.

Cambios persistentes de Supabase previstos por la implementación funcional:

- migraciones: ninguna;
- RLS: ninguno;
- grants: ninguno;
- Auth, usuarios y allowlist: ninguno;
- secretos o credenciales: ninguno;
- `seed.sql` en producción: no ejecutado.

PostgreSQL/RLS continúa siendo la frontera de autorización. Que una sección esté abierta o cerrada solo modifica presentación del cliente y nunca concede visibilidad adicional.

## Límites

- MAP-025 no persiste preferencias visuales entre recargas.
- MAP-025 no cambia la taxonomía, semántica de búsqueda ni combinación AND/OR existente.
- MAP-025 no añade parámetros de URL.
- MAP-025 no adelanta solicitudes públicas de MAP-026 ni la transición de catálogo de MAP-028.
