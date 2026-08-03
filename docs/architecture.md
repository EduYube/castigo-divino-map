# Arquitectura inicial

## Stack

- Vite + TypeScript
- Leaflet con `CRS.Simple` o mosaicos, según resultado de MAP-002
- CSS propio
- Datos estáticos JSON validados en compilación
- Vitest para lógica
- Playwright para flujos críticos
- GitHub Actions para CI
- GitHub Pages para despliegue

## Principios

- Mantener la beta sin backend.
- Separar motor del mapa, interfaz y datos de campaña.
- No incluir secretos en el bundle público.
- Usar IDs estables y URLs reproducibles.
- Priorizar rendimiento móvil y accesibilidad.

## Estructura prevista

```text
src/
├── app/
├── map/
├── markers/
├── search/
├── filters/
├── routing/
├── styles/
└── types/
public/
├── data/
└── maps/
tests/
docs/decisions/
```

La estructura definitiva se decidirá al inicializar la aplicación y después de validar el formato del mapa base.
