# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses
- Repositorio: `EduYube/castigo-divino-map`
- Versión objetivo: Beta 0.1
- Estado general: Diseño responsive y accesibilidad transversal completados; MAP-011 es la siguiente Issue
- Última actualización: 2026-08-04

## Objetivo actual

Preparar MAP-011 para publicar y validar la Beta 0.1 sobre la experiencia consolidada hasta MAP-010.

## Alcance completado

La fundación, investigación del mapa base, aplicación ejecutable, navegación cartográfica, contrato público de datos, marcadores, fichas, búsqueda, filtros, URL canónica, historial, responsive y accesibilidad transversal están completados.

MAP-010 consolida:

- flujos principales desde 320 píxeles sin overflow horizontal accidental;
- composición móvil vertical y horizontal con mapa de altura útil;
- ficha lateral o inferior según espacio disponible;
- resultados y filtros con scroll interno acotado;
- foco visible sobre paneles, mapa y superficie de error;
- orden de teclado coherente y activación con Enter o barra espaciadora;
- restauración de foco al cerrar fichas y ausencia de robo de foco en URL e historial;
- fieldsets, legends, regiones y nombres accesibles revisados;
- estados coincidente, atenuado, activo y enfocado distinguibles sin depender solo del color;
- objetivos táctiles principales de al menos 44 × 44 píxeles;
- soporte de `prefers-reduced-motion` y colores forzados;
- matriz Playwright con Chromium completo, Firefox crítico y WebKit móvil crítico;
- documentación explícita de las diferencias entre motor automatizado, emulación y dispositivo físico.

## Fuentes únicas preservadas

- `src/app/placeSearch.ts` mantiene la única consulta.
- `src/app/placeFilters.ts` mantiene las únicas categorías y etiquetas seleccionadas.
- `src/app/placeSelection.ts` mantiene el único lugar activo.
- `src/app/urlState.ts` solo representa, valida y restaura estado.
- `src/data/search.ts` y `src/data/filters.ts` conservan la lógica pura.
- Leaflet refleja IDs derivados y no conserva consulta, filtros, selección ni URL.
- `campaignCatalog` y `src/data/model.ts` no contienen estado de interfaz.
- `docs/data-model.md` no cambia semánticamente.

## Responsive y accesibilidad

La estrategia final es fluida. Los breakpoints de composición se limitan a 64 rem, 48 rem, 22 rem y un criterio de poca altura en orientación horizontal. El mapa usa unidades `svh`, conserva al menos 22 rem en móvil vertical y 18 rem en móvil horizontal, y mantiene la misma geometría útil durante error remoto.

Los estados vivos se limitan a carga, error, búsqueda y recuento. La ficha deja de ser una región viva completa: las aperturas directas se comunican mediante foco en el título y las restauraciones no generan anuncios repetitivos ni roban foco.

Los checkboxes conservan HTML nativo. Su nombre procede del texto visible; descripción y recuento se enlazan mediante `aria-describedby`. No se introducen widgets ARIA personalizados ni atributos redundantes sobre controles nativos.

## Matriz de pruebas

| Proyecto | Cobertura |
|---|---|
| `chromium` | Suite e2e completa. |
| `firefox` | Suite crítica `responsive-accessibility.spec.ts`. |
| `mobile-webkit` | Suite crítica con perfil iPhone 13 emulado. |

La emulación WebKit no se presenta como prueba en un iPhone físico. La cobertura evita duplicar toda la suite en todos los motores y mantiene Chromium como navegador principal de CI.

Las pruebas verifican geometría, ausencia de overflow, roles, nombres, foco, atributos, tamaños táctiles, URL, historial y error remoto. El mapa oficial se intercepta solo en su URL canónica mediante un SVG neutro generado en memoria; no se descarga ni se crea una copia alternativa.

## Trabajo en curso

- Ninguno tras la integración de MAP-010.
- Siguiente Issue: MAP-011 — Publicar y validar la Beta 0.1.

## Backlog inmediato

- MAP-011 — Publicar y validar la Beta 0.1.

## Bloqueos

- Ningún bloqueo técnico para comenzar MAP-011.
- La disponibilidad del mapa depende de una URL oficial remota sin SLA.
- La redistribución o transformación del mapa sigue requiriendo autorización escrita.
- La emulación automatizada no sustituye pruebas manuales futuras con Safari, VoiceOver, TalkBack o dispositivos físicos.
- El catálogo actual contiene datos ficticios de demostración; cualquier sustitución debe confirmar que el contenido es público.

## Decisiones cerradas

- Vite, TypeScript, Leaflet y CSS propio.
- Node.js 22.
- Vitest, Playwright, ESLint, Prettier y GitHub Actions.
- GitHub como fuente de verdad y una rama/PR por Issue.
- Mapa LowRes oficial remoto mediante `L.CRS.Simple` y `L.imageOverlay`.
- Ninguna copia o derivado del mapa en Git, despliegue o CI.
- Catálogo estático completamente público y validado.
- Fuentes únicas para consulta, filtros, selección y representación URL.
- Historial nativo: `replaceState` para consulta; `pushState` para acciones discretas.
- HTML nativo, APIs DOM y `textContent` para contenido de campaña.
- Responsive fluido desde 320 px.
- Foco visible con contorno y halo; sin `tabindex` positivos ni trampa de foco.
- Objetivos táctiles principales de al menos 44 × 44 px.
- Estados visuales redundantes en forma, borde, escala, opacidad, anillos y texto accesible.
- Chromium como cobertura completa; Firefox y WebKit móvil como cobertura crítica.

## Riesgos

- La URL oficial remota puede cambiar o dejar de admitir carga externa.
- Wizards puede cambiar su política o solicitar retirada.
- El mapa LowRes consume aproximadamente 32 MiB una vez decodificado.
- Un catálogo mayor puede aumentar colisiones visuales y el coste de listas y filtros.
- La accesibilidad automatizada no sustituye una auditoría certificada ni pruebas con tecnologías de asistencia reales.
- GitHub Pages deberá validar rutas, caché y rollback en MAP-011.

## Próximos pasos

1. Configurar el despliegue automático de GitHub Pages.
2. Ajustar la base de Vite para la ruta del repositorio.
3. Añadir validación previa al despliegue y estrategia de rollback.
4. Ejecutar la checklist final de Beta 0.1 en la URL pública.
5. Confirmar que no se publica contenido privado ni el recurso cartográfico oficial.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Creación inicial del estado del proyecto. |
| 2026-08-04 | Fuente oficial, restricciones y estrategia del mapa base documentadas; ADR 0001 aceptado. |
| 2026-08-04 | Aplicación Vite + TypeScript, calidad automática, pruebas y CI completadas en MAP-003. |
| 2026-08-04 | Mapa Leaflet navegable, acotado y con error remoto completado en MAP-004. |
| 2026-08-04 | Modelo público normalizado y validación completados en MAP-005. |
| 2026-08-04 | Marcadores, selección única, fichas y foco directo completados en MAP-006. |
| 2026-08-04 | Búsqueda pública y navegación de resultados completadas en MAP-007. |
| 2026-08-04 | Filtros, estados de coincidencia y combinación con búsqueda completados en MAP-008. |
| 2026-08-04 | URL canónica, restauración e historial completados en MAP-009. |
| 2026-08-04 | Responsive desde 320 px, accesibilidad transversal y matriz multibrowser completados en MAP-010. |
