# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Mapa navegable de Faerûn integrado; MAP-005 lista para comenzar
- Última actualización: 2026-08-04

## Objetivo actual

Definir el modelo de datos público de campaña que alimentará marcadores, fichas, categorías y etiquetas sin incorporar secretos al artefacto publicado.

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

La fundación, la investigación del mapa base, el esqueleto ejecutable y la navegación cartográfica están completados. La aplicación carga exclusivamente la imagen oficial LowRes desde Wizards mediante Leaflet, funciona de forma responsive y dispone de estados accesibles de carga y error.

## Trabajo en curso

- Ninguno tras el cierre de MAP-004.
- Siguiente Issue: MAP-005 — Definir el modelo de datos de campaña.

## Backlog inicial

- MAP-005 — Definir el modelo de datos de campaña.
- MAP-006 — Mostrar marcadores y fichas de información.
- MAP-007 — Implementar búsqueda por nombre y alias.
- MAP-008 — Implementar categorías y filtrado por etiquetas.
- MAP-009 — Implementar enlaces directos y restauración de estado.
- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo para comenzar MAP-005.
- La redistribución o transformación del mapa oficial sigue requiriendo autorización escrita; la estrategia remota de Beta 0.1 evita esas operaciones.

## Decisiones cerradas

- Vite, TypeScript y Leaflet.
- Vitest y Playwright.
- ESLint y Prettier con configuración reproducible.
- GitHub Actions valida instalación, formato, lint, pruebas unitarias, build y e2e en pull requests.
- Node.js 22 es la versión de desarrollo y CI acordada.
- GitHub Actions y GitHub Pages.
- Desarrollo individual.
- Datos estáticos para la beta.
- GitHub como fuente de verdad.
- Un chat por Issue.
- La aplicación usa TypeScript y CSS propios, sin framework de interfaz adicional.
- El mapa oficial con rótulos ingleses es aceptable para la beta.
- La capa de nombres castellanos no es requisito imprescindible de la beta.
- La Beta 0.1 usa `Sword-Coast-Map_LowRes.jpg` como imagen única remota desde `media.wizards.com`.
- El mapa oficial no se almacena en el repositorio, despliegue, CDN propio, releases ni artefactos de CI.
- No se crean mosaicos ni otros derivados sin autorización escrita.
- Leaflet usa `CRS.Simple`, límites `[[0, 0], [2329, 3600]]` y `L.imageOverlay`.
- El encuadre inicial muestra el mapa completo y el zoom mínimo se recalcula con el viewport.
- El zoom máximo de MAP-004 es `1`, adecuado para una ampliación moderada de LowRes.
- `maxBounds` y `maxBoundsViscosity: 1` impiden navegación indefinida fuera del mapa.
- `ResizeObserver` e `invalidateSize` mantienen el comportamiento responsive.
- Los fallos del recurso muestran un aviso accesible y una superficie CSS neutra, sin copias alternativas.
- Las pruebas e2e interceptan la URL oficial y usan un SVG neutro generado en memoria.
- La decisión técnica y legal está registrada en `docs/map-source-and-licensing.md` y ADR 0001.

## Riesgos

- La URL oficial remota no ofrece garantía de permanencia o disponibilidad.
- Wizards puede cambiar su política o solicitar la retirada del contenido.
- El uso de una imagen única consume aproximadamente 32 MiB una vez decodificada.
- Exposición accidental de notas privadas.
- Crecimiento del catálogo de lugares y etiquetas.
- Las dependencias frontend deberán mantenerse actualizadas durante la beta.

## Próximos pasos

1. Abrir un chat nuevo para MAP-005.
2. Definir esquemas TypeScript para lugares, categorías, etiquetas y contenido público.
3. Establecer identificadores estables, alias, coordenadas y reglas de validación.
4. Añadir un conjunto mínimo de datos de ejemplo sin secretos de campaña.
5. Preparar el contrato que utilizará MAP-006 para marcadores y fichas.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto |
| 2026-08-03 | Backlog Beta 0.1 creado y fundación integrada |
| 2026-08-04 | Campos y vistas del Project confirmados; automatización de clasificación añadida |
| 2026-08-04 | GitHub Project clasificado y fundación cerrada; MAP-002 preparada |
| 2026-08-04 | Fuente oficial, restricciones y estrategia del mapa base documentadas; ADR 0001 aceptado |
| 2026-08-04 | Aplicación Vite + TypeScript, calidad automática, pruebas y CI completadas en MAP-003 |
| 2026-08-04 | Mapa Leaflet navegable, responsive, acotado y con estados accesibles completado en MAP-004 |
