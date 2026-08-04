# Checklist final de la Beta 0.1

Fecha de preparación: 2026-08-04  
Issue: MAP-011 / #11  
Pull requests integradas: #28 y #29  
URL objetivo: `https://eduyube.github.io/castigo-divino-map/`  
Estado: publicación pendiente de habilitar GitHub Pages con origen **GitHub Actions**.

## Bloqueo administrativo

- [x] El workflow de Pages se activa después de CI verde sobre `master`.
- [x] El run `30940902156` completó build, auditoría, smoke local y subida exclusiva de `dist`.
- [ ] En **Settings → Pages → Build and deployment**, seleccionar **Source: GitHub Actions**.
- [ ] Reejecutar **Deploy Beta 0.1 to GitHub Pages** sobre `master`.
- [ ] Confirmar `build`, `deploy`, `smoke` y `report` en verde.

`actions/configure-pages@v6` devolvió `Get Pages site failed` porque el sitio de Pages todavía no existe para el repositorio. La activación inicial requiere permisos administrativos no expuestos por el conector disponible y no puede realizarla el `GITHUB_TOKEN` del workflow.

## Calidad automatizada

- [x] Node.js 22 y `npm ci` en CI.
- [x] Prettier y ESLint obligatorios.
- [x] Vitest ejecuta el contrato de datos, mapa, búsqueda, filtros, selección, URL y despliegue.
- [x] 73 pruebas unitarias superadas en 9 archivos.
- [x] Build de Vite para el subdirectorio de Pages.
- [x] Auditoría de 3 archivos de producción.
- [x] Matriz Playwright: 45 pruebas e2e superadas.
- [x] Chromium completo, Firefox y WebKit móvil para la suite crítica.
- [x] 2 smoke tests del preview bajo la misma ruta base.
- [x] CI de las PR #28 y #29 en verde.
- [x] CI del commit integrado activó el workflow de Pages.
- [ ] Workflow de Pages completo en verde.

## Responsive

- [x] Experiencia automatizada desde 320 px.
- [x] Sin overflow horizontal accidental.
- [x] Escritorio, móvil vertical y móvil horizontal cubiertos.
- [x] Ficha lateral o inferior según espacio disponible.
- [x] Error remoto conserva la geometría usable.
- [ ] Comportamiento confirmado sobre la URL pública.

## Accesibilidad

- [x] Landmarks, encabezados, fieldsets, legends y nombres accesibles.
- [x] Navegación por teclado y foco visible.
- [x] Objetivos principales de al menos 44 × 44 px.
- [x] Estados no dependientes únicamente del color.
- [x] Carga inicial y `popstate` no roban el foco.
- [x] Cerrar una ficha directa devuelve el foco al marcador.
- [ ] Controles críticos confirmados sobre la URL pública.

## URL e historial

- [x] Parámetros `place`, `q`, `category` y `tag` conservados.
- [x] Canonicalización mantiene el pathname del despliegue.
- [x] Recursos Vite usan `/castigo-divino-map/assets/`.
- [x] URL completa cubierta en preview.
- [x] Recarga conserva el estado en preview.
- [x] Atrás y adelante conservan la política de historial en preview.
- [ ] URL completa validada sobre GitHub Pages.

## Disponibilidad y error remoto

- [x] El mapa se solicita exclusivamente desde la URL oficial configurada.
- [x] La CI usa un SVG neutro en memoria.
- [x] El fallo remoto mantiene búsqueda, filtros, marcadores y fichas.
- [x] No existe fallback que copie o transforme el JPEG.
- [ ] Comportamiento confirmado sobre la URL publicada.

## Licencias y atribución

- [x] Aviso de contenido de fans visible.
- [x] Atribución a Wizards of the Coast y Mike Schley visible.
- [x] Enlace a política y fuente oficial.
- [x] El artefacto no contiene JPEG, derivados ni mosaicos.
- [ ] Aviso y atribución confirmados sobre la URL pública.

## Privacidad y contenido público

- [x] El catálogo mantiene el contrato público de `docs/data-model.md`.
- [x] No se introducen datos reales de campaña en MAP-011.
- [x] Auditoría del bundle contra patrones conocidos de credenciales.
- [x] Sin backend, autenticación, persistencia, analítica ni rastreo.
- [x] El artefacto validado no contiene patrones conocidos de secretos.

## Artefacto de producción

- [x] `dist/index.html` presente.
- [x] JavaScript y CSS presentes y referenciados bajo la base esperada.
- [x] Solo `dist` se sube a Pages.
- [x] No se publican dependencias, cachés, trazas ni informes.
- [x] La URL remota oficial permanece en el bundle.
- [x] El mapa oficial no forma parte de `dist`.
- [x] `actions/upload-pages-artifact@v5` completó la subida en el run `30940902156`.

## Despliegue

- [x] Despliegue automático solo tras CI verde sobre `master`.
- [x] Ejecución manual limitada a `master` y con validación completa.
- [x] Acciones oficiales de GitHub Pages.
- [x] Entorno `github-pages` y URL de salida configurados en el workflow.
- [x] Permisos mínimos por job.
- [x] Concurrencia sin cancelar despliegues iniciados.
- [x] Estado `github-pages/deployment` asociado al SHA y al run exacto.
- [ ] GitHub Pages habilitado con origen GitHub Actions.
- [ ] Publicación automática completada.

## Smoke de la URL pública

- [ ] Página y assets responden sin 404.
- [ ] Cabecera, búsqueda, filtros, mapa y ficha renderizan.
- [ ] Escritorio y 320 px siguen usables.
- [ ] Teclado y foco críticos conservados.
- [ ] URL completa se restaura y recarga.
- [ ] Historial funciona.
- [ ] Error remoto mantiene la aplicación usable.
- [ ] Aviso legal y atribuciones visibles.
- [ ] Solo se solicita el mapa oficial remoto.

## Rollback

- [x] Procedimiento de identificación del último despliegue correcto.
- [x] Revert mediante PR sin reescribir `master`.
- [x] Reejecución manual documentada.
- [x] Diagnóstico de build, upload, deploy y smoke.
- [x] Retirada temporal por privacidad o licencia documentada.
- [x] Verificación explícita de que un rollback no incorpora el mapa.

## Limitaciones conocidas

- La activación inicial de Pages requiere una persona con permisos administrativos.
- La disponibilidad del mapa depende de una URL histórica de Wizards sin SLA.
- GitHub Pages y GitHub Actions son dependencias externas de publicación.
- `mobile-webkit` emula un iPhone 13; no es una prueba en dispositivo físico.
- La automatización no sustituye pruebas manuales con Safari, VoiceOver, TalkBack o hardware real.
- El catálogo actual contiene datos ficticios de demostración.
- La auditoría de secretos reconoce patrones técnicos, pero no puede detectar semánticamente todos los posibles spoilers o datos privados.

MAP-011 permanece abierta hasta completar los elementos pendientes de activación y smoke público.
