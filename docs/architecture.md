# Arquitectura inicial

## Stack

- Vite + TypeScript.
- Leaflet, aislado tras un límite de integración y sin mapa navegable hasta MAP-004.
- CSS propio.
- Datos estáticos JSON validados en compilación en Issues posteriores.
- Vitest para lógica.
- Playwright para flujos críticos.
- ESLint y Prettier para calidad estática y formato.
- GitHub Actions para CI.
- GitHub Pages para despliegue posterior.

## Principios

- Mantener la beta sin backend.
- Separar motor del mapa, interfaz y datos de campaña.
- No incluir secretos en el bundle público.
- No almacenar ni transformar el mapa oficial sin autorización escrita.
- Usar IDs estables y URLs reproducibles.
- Priorizar rendimiento móvil y accesibilidad.
- Mantener cada capacidad verificable mediante pruebas automáticas.

## Estructura inicial ejecutable

```text
src/
├── app/
│   ├── readiness.ts
│   ├── readiness.test.ts
│   └── renderApp.ts
├── map/
│   └── leaflet.ts
├── styles/
│   └── main.css
└── main.ts
tests/
└── e2e/
    └── app.spec.ts
docs/decisions/
```

`src/map/leaflet.ts` confirma la disponibilidad de la dependencia y define el límite donde comenzará MAP-004. No crea mapas, overlays, marcadores ni configuración de coordenadas.

## Construcción y calidad

- `npm run build` ejecuta la comprobación estricta de TypeScript antes de Vite.
- `npm run lint` ejecuta ESLint con configuración plana.
- `npm run format:check` comprueba Prettier sin modificar archivos.
- `npm run test` ejecuta Vitest.
- `npm run test:e2e` ejecuta Playwright sobre el servidor de desarrollo.
- `.github/workflows/ci.yml` reproduce estas validaciones en pull requests a `master`.

## Límite del mapa base

La Beta 0.1 usará posteriormente la imagen oficial remota de baja resolución conforme a ADR 0001. MAP-003 no descarga ni referencia esa URL desde el código de la aplicación. `CRS.Simple`, `L.imageOverlay`, la gestión de errores de red y la navegación pertenecen a MAP-004.
