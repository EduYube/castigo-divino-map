# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Fuente y estrategia del mapa base validadas; MAP-003 lista para comenzar
- Última actualización: 2026-08-04

## Objetivo actual

Inicializar la aplicación web, las herramientas de calidad y la integración continua sin incorporar todavía el mapa navegable.

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

La fundación y la investigación del mapa base están completadas. MAP-002 ha validado una fuente oficial de Wizards, sus restricciones y una estrategia compatible con móvil para la Beta 0.1.

## Trabajo en curso

- Ninguno tras el cierre de MAP-002.
- Siguiente Issue: MAP-003 — Inicializar la aplicación web y calidad automática.

## Backlog inicial

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

- Ningún bloqueo para comenzar MAP-003.
- La redistribución o transformación del mapa oficial sigue requiriendo autorización escrita; no bloquea la estrategia remota de Beta 0.1.

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
- La Beta 0.1 usará `Sword-Coast-Map_LowRes.jpg` como imagen única remota desde `media.wizards.com`.
- El mapa oficial no se almacenará en el repositorio, despliegue, CDN propio, releases ni artefactos de CI.
- No se crearán mosaicos ni otros derivados sin autorización escrita.
- La integración futura usará Leaflet con `CRS.Simple` e `L.imageOverlay`.
- La decisión técnica y legal está registrada en `docs/map-source-and-licensing.md` y ADR 0001.

## Riesgos

- La URL oficial remota no ofrece garantía de permanencia o disponibilidad.
- Wizards puede cambiar su política o solicitar la retirada del contenido.
- El uso de una imagen única consume aproximadamente 32 MiB una vez decodificada.
- Exposición accidental de notas privadas.
- Crecimiento del catálogo de lugares y etiquetas.

## Próximos pasos

1. Abrir un chat nuevo para MAP-003.
2. Inicializar Vite y TypeScript conforme al acuerdo de trabajo.
3. Configurar lint, formato, pruebas y CI.
4. Mantener fuera de alcance la integración de Leaflet hasta MAP-004.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto |
| 2026-08-03 | Backlog Beta 0.1 creado y fundación integrada |
| 2026-08-04 | Campos y vistas del Project confirmados; automatización de clasificación añadida |
| 2026-08-04 | GitHub Project clasificado y fundación cerrada; MAP-002 preparada |
| 2026-08-04 | Fuente oficial, restricciones y estrategia del mapa base documentadas; ADR 0001 aceptado |
