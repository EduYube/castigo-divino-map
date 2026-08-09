# Ayuda contextual del mapa

MAP-036 cambia únicamente la presentación de las instrucciones y la leyenda pública. El significado visual de los pines continúa definido por MAP-022 y `docs/pin-visual-system.md`.

## Patrón elegido

La experiencia pública utiliza un disclosure nativo `<details>/<summary>` con la acción visible **Ayuda y leyenda del mapa**.

Se eligió este patrón porque:

- mantiene la ayuda completa a una sola acción de distancia;
- no crea una capa modal ni tapa la cartografía;
- conserva activación nativa por ratón, toque y teclado;
- no requiere un focus trap, restauración manual de foco ni ARIA que duplique semántica HTML;
- el mismo control abre y cierra la ayuda de forma reversible;
- el panel limita su altura y usa scroll interno cuando la pantalla es baja.

Un diálogo o popover modal habría competido con el mapa y requerido gestión adicional de foco y cierre. Un acordeón personalizado no aportaba ventajas suficientes para justificar más JavaScript y relaciones ARIA.

## Contenido visible y contextual

Sin interacción permanecen visibles:

- la identidad del Atlas;
- los controles de búsqueda y filtros según el contrato responsive existente;
- el control `Ayuda y leyenda del mapa`;
- la cartografía.

Al abrir la ayuda se explican:

1. búsqueda y selección de resultados;
2. filtros por categorías y etiquetas;
3. activación de pines con ratón, toque, Enter o Espacio;
4. agrupaciones por coordenadas y pines atenuados;
5. tipos de entidad y disposiciones por jugador;
6. funcionamiento por teclado y equivalencia no cromática de la información.

## Contrato de leyenda preservado

MAP-036 no cambia ningún significado de MAP-022:

- círculo `●`: personaje;
- rombo `◆`: emplazamiento;
- `+`: aliado;
- `−`: enemigo;
- `•`: neutral;
- `?`: sin dato visible/fallback;
- la disposición es por jugador;
- el color es complementario, no la única señal.

## Accesibilidad

El `<summary>` aporta de forma nativa nombre, estado expandido/contraído y activación por teclado. No se añaden `aria-expanded`, `aria-controls` o `aria-haspopup` redundantes.

El mapa conserva además `aria-describedby="map-instructions ..."`. `#map-instructions` es texto visualmente oculto pero disponible como descripción contextual permanente de la región cartográfica. Resume cómo buscar, filtrar, abrir pines y leer forma/disposición, de modo que cerrar la ayuda visual no elimina información necesaria para tecnologías asistivas.

El panel no contiene acciones propias que requieran focus trap. El foco permanece en el `<summary>` al abrir o cerrar. Escape no se intercepta porque el patrón no es modal y el comportamiento nativo del disclosure no lo requiere.

No hay información disponible exclusivamente por hover. Los targets principales conservan al menos 44 CSS px y existe soporte para `forced-colors`.

## Responsive

El disclosure forma parte del encabezado de la experiencia y no se superpone al mapa. Al abrirse aumenta el flujo normal solo durante la consulta. El panel tiene altura máxima relativa al viewport y scroll interno para móvil y landscape corto.

Se conserva el contrato MAP-033/MAP-035:

- escritorio y tablet ancho: rail de búsqueda/filtros junto al mapa;
- `<=768 px`: búsqueda y filtros compactos antes del mapa;
- sin overflow horizontal;
- el mapa sigue siendo la superficie dominante cuando la ayuda está cerrada.

## Fuera de alcance

MAP-036 no modifica:

- forma, tamaño o estado visual de los pines;
- flujo pin → ficha compacta/completa;
- bottom sheets o patrones reservados a MAP-037;
- Auth, roles, RLS, grants, secretos, esquema, migraciones o contratos de datos;
- restricciones de origen y redistribución del mapa base.
