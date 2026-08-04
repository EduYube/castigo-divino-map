# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Fundación completada; Project preparado para clasificación automática
- Última actualización: 2026-08-04

## Objetivo actual

Completar la clasificación inicial de las Issues en GitHub Projects y comenzar la validación del mapa base.

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

Fundación del repositorio completada. Los campos y vistas del GitHub Project han sido creados y existe una automatización reproducible para completar los valores de MAP-001 a MAP-011.

## Trabajo en curso

- MAP-001 — Completar la clasificación de las Issues en GitHub Projects.
- Ejecutar `scripts/configure-github-project.sh` con GitHub CLI autorizado para Projects.
- Preparar el inicio de MAP-002.

## Backlog inicial

- MAP-002 — Validar y preparar el mapa base oficial.
- MAP-003 — Inicializar la aplicación web y calidad automática.
- MAP-004 — Integrar el mapa navegable de Faerûn.
- MAP-005 — Definir el modelo de datos de campaña.
- MAP-006 — Mostrar marcadores y fichas de información.
- MAP-007 — Implementar búsqueda por nombre y alias.
- MAP-008 — Implementar categorías y filtrado por etiquetas.
- MAP-009 — Implementar enlaces directos y restauración de estado.
- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Validar la fuente, licencia y condiciones de redistribución del mapa oficial.
- La conexión de ChatGPT no expone operaciones de GitHub Projects; la clasificación inicial requiere ejecutar una vez el script local con GitHub CLI.

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
- Los colores de los campos del Project son libres y sus descripciones son opcionales.
- Las vistas Beta 0.1 y Trabajo actual pueden coincidir durante la fase inicial.

## Riesgos

- Licencia y redistribución del mapa base.
- Peso y resolución de recursos cartográficos.
- Exposición accidental de notas privadas.
- Crecimiento del catálogo de lugares y etiquetas.
- Rendimiento móvil con mapas de gran resolución.

## Próximos pasos

1. Ejecutar la automatización de clasificación del GitHub Project.
2. Verificar que MAP-001 aparece como Done y MAP-002/MAP-003 como Ready.
3. Cerrar definitivamente MAP-001.
4. Abrir un chat nuevo para MAP-002.
5. Investigar y validar el mapa base oficial.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto |
| 2026-08-03 | Backlog Beta 0.1 creado y fundación integrada |
| 2026-08-04 | Campos y vistas del Project confirmados; automatización de clasificación añadida |
