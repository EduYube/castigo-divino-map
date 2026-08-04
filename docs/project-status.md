# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Modelo público de datos y validación completados; MAP-006 lista para comenzar
- Última actualización: 2026-08-04

## Objetivo actual

Mostrar los lugares del catálogo como marcadores y presentar sus fichas públicas utilizando el contrato estable definido en MAP-005.

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

La fundación, la investigación del mapa base, el esqueleto ejecutable, la navegación cartográfica y el contrato de datos públicos están completados. La aplicación dispone de un catálogo TypeScript normalizado, coordenadas estables sobre la imagen y validación automática sin dependencias nuevas.

## Trabajo en curso

- Ninguno tras el cierre de MAP-005.
- Siguiente Issue: MAP-006 — Mostrar marcadores y fichas de información.

## Backlog inicial

- MAP-006 — Mostrar marcadores y fichas de información.
- MAP-007 — Implementar búsqueda por nombre y alias.
- MAP-008 — Implementar categorías y filtrado por etiquetas.
- MAP-009 — Implementar enlaces directos y restauración de estado.
- MAP-010 — Consolidar diseño responsive y accesibilidad.
- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo para comenzar MAP-006.
- La redistribución o transformación del mapa oficial sigue requiriendo autorización escrita; la estrategia remota de Beta 0.1 evita esas operaciones.
- El catálogo actual contiene datos ficticios de demostración; los datos reales deberán confirmarse como públicos antes de sustituirlos o ampliarlos.

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
- El catálogo público se define en módulos TypeScript bajo `src/data/`.
- Categorías, etiquetas, lugares y notas son colecciones normalizadas con referencias unidireccionales.
- Los IDs internos y slugs son estables; los nombres visibles pueden evolucionar sin romper referencias.
- Las etiquetas usan IDs estables en kebab-case.
- Las coordenadas se guardan como `{ x, y }` en píxeles desde la esquina superior izquierda de la imagen LowRes.
- La conversión a Leaflet se centraliza como `[y, x]`.
- Los valores de coordenadas pueden ser enteros o decimales finitos dentro de `0..3600` y `0..2329`.
- El validador propio comprueba estructura, formatos, duplicados, referencias, coordenadas, alias y propiedades no admitidas.
- `npm run validate:data`, Vitest y CI bloquean catálogos inválidos sin añadir dependencias.
- Todo dato incluido en el catálogo es público por definición; no existen flags de ocultación para secretos.
- La decisión técnica y legal del mapa está registrada en `docs/map-source-and-licensing.md` y ADR 0001.
- El contrato de datos y la política pública están registrados en `docs/data-model.md`.

## Riesgos

- La URL oficial remota no ofrece garantía de permanencia o disponibilidad.
- Wizards puede cambiar su política o solicitar la retirada del contenido.
- El uso de una imagen única consume aproximadamente 32 MiB una vez decodificada.
- Exposición accidental de notas privadas mediante errores editoriales que no puedan detectarse semánticamente.
- Crecimiento del catálogo de lugares y etiquetas.
- Colisiones futuras de alias o slugs al ampliar el contenido.
- Una sustitución de la imagen base requeriría migrar coordenadas explícitamente.
- Las dependencias frontend deberán mantenerse actualizadas durante la beta.

## Próximos pasos

1. Abrir un chat nuevo para MAP-006.
2. Consumir `campaignCatalog` sin modificar su contrato.
3. Convertir coordenadas mediante `toLeafletSimpleCoordinate`.
4. Renderizar marcadores accesibles por cada lugar.
5. Mostrar fichas con categoría, etiquetas y notas públicas asociadas.
6. Mantener búsqueda, filtros y enlaces directos fuera de MAP-006 salvo contratos mínimos necesarios.

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
| 2026-08-04 | Modelo público normalizado, coordenadas estables, validación runtime, ejemplos y documentación completados en MAP-005 |
