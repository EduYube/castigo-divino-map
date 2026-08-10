# Ficha compacta móvil sobre el mapa

- Issue: MAP-037 (#97).
- Rama: `agent/map-037-mobile-map-context`.
- Base: `830da8e72f0713c95ef667876767ef6cfbf76099` (MAP-036).

## Decisión UX

En pantallas de hasta `48rem` la ficha compacta se presenta como un **bottom sheet no modal** dentro del `map-workspace`.

No se usa `dialog` ni `aria-modal` porque el mapa debe seguir siendo operable mientras la ficha está abierta. La ficha conserva `role="region"` y su heading enfocable, por lo que mantiene la semántica histórica de MAP-023 sin introducir un focus trap.

En orientación vertical la superficie del sheet se limita al 40 % de la altura del mapa, de modo que el centro cartográfico permanece fuera del área cubierta incluso en motores que restringen el reajuste programático de Leaflet. En paisaje corto el límite se mantiene en el 48 % para conservar una altura útil de lectura sin llegar a cubrir la mayoría de la cartografía. El panel usa scroll interno y `overscroll-behavior: contain`, de modo que consultar contenido largo no hace crecer el documento ni obliga a recorrer una sección colocada debajo del mapa.

Entre `48rem` y `70rem` se conserva el comportamiento apilado previo; desktop mantiene el panel lateral. MAP-037 solo especializa el flujo móvil crítico.

## Relación pin → ficha → mapa

Al abrir una ficha en móvil:

1. el título recibe foco con `preventScroll`, evitando que el documento salte hacia otra posición;
2. el mapa conserva su tamaño y sigue siendo interactivo;
3. el layout reserva por diseño una zona cartográfica visible y Leaflet complementa esa reserva reajustando el pin activo cuando su posición real invade el área del sheet;
4. cambiar de pin sustituye el contenido de la misma ficha y reinicia únicamente su scroll interno;
5. cerrar devuelve el foco al marcador activo mediante los contratos existentes de MAP-023;
6. `Volver al pin` permite devolver el foco al marcador sin cerrar la ficha;
7. `Escape` cierra la ficha cuando el foco está dentro del workspace móvil.

Los grupos de pines siguen usando su popup accesible; al elegir una entidad coincidente se aplica el mismo ajuste de visibilidad que a cualquier otro pin.

## Accesibilidad

- La ficha sigue siendo una región no modal etiquetada por `#place-details-title`.
- No se añade `aria-modal`, `inert` ni focus trap.
- El heading continúa siendo enfocable programáticamente.
- En móvil el foco inicial usa `preventScroll: true`; desktop conserva su comportamiento previo.
- `Volver al pin` y cerrar mantienen objetivos táctiles de 44 CSS px.
- El botón de cierre anuncia `Escape` mediante `aria-keyshortcuts` mientras la ficha está abierta.
- El cierre devuelve el foco al pin o al marcador compuesto correspondiente.
- La acción `Abrir ficha completa` permanece en la ficha y conserva apertura en pestaña nueva.
- `forced-colors` conserva borde y contraste del sheet y del control de retorno.
- No se introducen animaciones, por lo que `prefers-reduced-motion` no necesita una ruta alternativa adicional.

## Viewports, teclado virtual y safe areas

El layout móvil usa `dvh` para que el límite vertical responda al viewport dinámico y no dependa de `100vh` cuando aparece el teclado virtual. Los paddings laterales e inferior incorporan `safe-area-inset-*`.

La cobertura E2E incluye:

- 320 × 740;
- 430 × 932;
- 667 × 375 en paisaje corto;
- cambio de pin con la ficha ya abierta;
- apertura, `Volver al pin`, cierre por `Escape` y cierre explícito;
- estabilidad de `window.scrollY`;
- pin activo en la parte visible del mapa;
- panel inferior al 49 % de la superficie cartográfica;
- ausencia de overflow horizontal;
- enlace a ficha completa dentro del scroll interno;
- ejecución en los proyectos `mobile-chromium` y `mobile-webkit`.

Las capturas generadas por la suite se publican como artefacto `map-037-mobile-sheet-references-*` en CI.

## Seguridad y datos

MAP-037 no modifica esquema, migraciones, Auth, RLS, roles, grants, secretos, credenciales ni contratos persistentes. La implementación se limita a presentación, interacción y pruebas del cliente.
