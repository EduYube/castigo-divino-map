# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Inicialización
- Última actualización: 2026-08-03

## Objetivo actual

Preparar la arquitectura, planificación y base técnica de la primera beta.

## Alcance de la Beta 0.1

### Must have

- Mapa navegable de Faerûn.
- Zoom y desplazamiento con ratón y táctil.
- Marcadores de campaña.
- Notas asociadas a marcadores.
- Etiquetas múltiples por nota o marcador.
- Búsqueda y filtrado por etiquetas.
- Resaltado de marcadores coincidentes y atenuado del resto.
- Búsqueda por nombre.
- Filtros por categorías.
- Fichas de información.
- Enlaces directos a lugares y filtros.
- Diseño responsive.
- Despliegue automático.

### Good to have

- Capa de nombres en castellano.
- Mapa base sin rótulos.
- Combinación avanzada de filtros.
- Persistencia local de preferencias.

### Fuera de la beta

- Inicio de sesión.
- Panel de administración.
- Notas privadas incluidas en el frontend público.
- Base de datos remota.
- Editor visual completo.
- Cronología y rutas.

## Fase actual

Fundación del repositorio y preparación del backlog.

## Trabajo en curso

- MAP-001 — Inicializar la estructura y gobernanza del proyecto.
- Crear documentación base y plantillas.
- Crear backlog inicial.
- Preparar configuración manual del GitHub Project.

## Bloqueos

- Validar la fuente, licencia y condiciones de redistribución del mapa oficial.
- La conexión actual no permite configurar campos y vistas de GitHub Projects automáticamente.

## Decisiones cerradas

- Vite, TypeScript y Leaflet.
- Vitest y Playwright.
- GitHub Actions y GitHub Pages.
- Desarrollo individual.
- Datos estáticos para la beta.
- GitHub como fuente de verdad.
- Un chat por Issue.
- El mapa oficial con rótulos ingleses es aceptable para la beta.
- La capa de nombres castellanos no es requisito imprescindible de la beta.

## Riesgos

- Licencia y redistribución del mapa base.
- Peso y resolución de recursos cartográficos.
- Exposición accidental de notas privadas.
- Crecimiento del catálogo de lugares y etiquetas.
- Rendimiento móvil con mapas de gran resolución.

## Próximos pasos

1. Finalizar y fusionar MAP-001.
2. Configurar manualmente las vistas y campos del GitHub Project.
3. Ejecutar MAP-002: investigar y validar el mapa base.
4. Ejecutar MAP-003: inicializar la aplicación web.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto |
