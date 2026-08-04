# Arquitectura inicial

## Stack

- Vite + TypeScript.
- Leaflet con `CRS.Simple` e `L.imageOverlay` para el mapa navegable.
- CSS propio.
- Datos estáticos JSON validados en compilación en Issues posteriores.
- Vitest para lógica.
- Playwright para flujos críticos.
- ESLint y Prettier para calidad estática y formato.
- GitHub Actions para CI.
- GitHub Pages para despliegue posterior.

## Principios

- Mantener la beta sin backend.
- Separar motor del mapa, presentación y datos de campaña.
- No incluir secretos en el bundle público.
- No almacenar ni transformar el mapa oficial sin autorización escrita.
- Usar IDs estables y URLs reproducibles.
- Priorizar rendimiento móvil y accesibilidad.
- Mantener cada capacidad verificable mediante pruebas automáticas.
- Tratar la red y el recurso cartográfico externo como dependencias falibles.

## Estructura ejecutable

```text
src/
├── app/
│   └── renderApp.ts
├── map/
│   ├── config.ts
│   ├── config.test.ts
│   └── leaflet.ts
├── styles/
│   └── main.css
└── main.ts
tests/
└── e2e/
    └── app.spec.ts
docs/decisions/
```

### Presentación

`src/app/renderApp.ts` genera la estructura semántica de la aplicación, el contenedor del mapa, las instrucciones de interacción, los estados accesibles y el aviso legal. No conoce detalles de la API de Leaflet.

### Configuración cartográfica

`src/map/config.ts` concentra la URL oficial, las dimensiones `3600 × 2329`, los niveles de zoom y los cálculos puros. Los límites para `CRS.Simple` son `[[0, 0], [2329, 3600]]`: la primera coordenada representa altura y la segunda anchura.

La función de cálculo de encuadre utiliza la escala mínima entre viewport e imagen y su logaritmo en base dos. Esta lógica se prueba sin DOM, red ni Leaflet.

### Adaptador Leaflet

`src/map/leaflet.ts` es el único módulo que crea y gestiona `L.Map`. Sus responsabilidades son:

- configurar `L.CRS.Simple`;
- cargar el JPEG exclusivamente mediante `L.imageOverlay` desde la URL oficial;
- mostrar el mapa completo al iniciar;
- limitar el desplazamiento con `maxBounds` y viscosidad completa;
- limitar el zoom máximo a `1` y recalcular el mínimo de encuadre;
- habilitar ratón, trackpad, teclado y gestos táctiles;
- localizar los controles de zoom;
- observar cambios de tamaño mediante `ResizeObserver` y ejecutar `invalidateSize`;
- gestionar estados `loading`, `ready` y `error` sin lanzar errores por fallos de red;
- retirar el overlay fallido y conservar una superficie cartográfica neutra.

El controlador devuelto permite destruir observadores, listeners y la instancia de Leaflet cuando sea necesario.

## Ciclo de carga y error

La presentación comienza con `aria-busy="true"` y un estado visible con `role="status"`. El evento `load` del overlay oculta el mensaje y marca el mapa como preparado. El evento `error` retira la capa remota, activa un mensaje con `role="alert"` y deja visible un fondo CSS neutro.

No existe URL de respaldo a una copia del mapa ni precarga automática. La alternativa no contiene propiedad intelectual de terceros.

## Responsive y límites

El mapa tiene una altura fluida para escritorio, tablet y móvil. Al cambiar su tamaño:

1. se invalida el tamaño interno de Leaflet;
2. se recalcula el zoom mínimo capaz de mostrar los límites completos;
3. se conserva el encuadre completo si el usuario estaba en el zoom mínimo;
4. en caso contrario se conserva el nivel de detalle y se corrige el centro dentro de los límites.

El zoom máximo `1` permite una ampliación moderada de la variante LowRes sin presentar niveles de detalle inexistentes.

## Construcción y calidad

- `npm run build` ejecuta la comprobación estricta de TypeScript antes de Vite.
- `npm run lint` ejecuta ESLint con configuración plana.
- `npm run format:check` comprueba Prettier sin modificar archivos.
- `npm run test` ejecuta Vitest.
- `npm run test:e2e` ejecuta Playwright sobre el servidor de desarrollo.
- `.github/workflows/ci.yml` reproduce estas validaciones en pull requests a `master`.

## Estrategia de pruebas del mapa remoto

Las pruebas e2e registran una ruta de Playwright para la URL oficial y entregan un SVG neutro generado dentro de la prueba. De este modo se valida que la aplicación solicita la URL acordada y reacciona a carga o error, pero CI no descarga ni archiva el JPEG oficial.

La prueba de navegación comprueba zoom, arrastre y límite mínimo. Una prueba con viewport móvil comprueba el ajuste responsive y la prueba de error comprueba el aviso accesible y la ausencia del overlay fallido.

## Límite del mapa base

La Beta 0.1 usa la imagen oficial remota de baja resolución conforme a ADR 0001. No se descarga ni incorpora al repositorio, build, despliegue, releases, cachés precargadas o artefactos de CI. Tampoco se transforma, recorta, recomprime, convierte o divide en mosaicos.
