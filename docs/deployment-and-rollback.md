# Despliegue y recuperación de la Beta 0.1

## URL objetivo y estado actual

La Beta 0.1 se publicará en:

`https://eduyube.github.io/castigo-divino-map/`

A 2026-08-04 la URL todavía no está activa. La implementación está integrada, pero el repositorio necesita una activación administrativa inicial:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Después debe reejecutarse **Deploy Beta 0.1 to GitHub Pages** sobre `master`.

La URL usa el subdirectorio estable del repositorio. Los estados compartidos se añaden mediante `place`, `q`, `category` y `tag`, por ejemplo:

`https://eduyube.github.io/castigo-divino-map/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass`

## Arquitectura de despliegue

La publicación separa la puerta de calidad del despliegue:

1. `.github/workflows/ci.yml` valida pull requests hacia `master` y cada commit integrado en `master`.
2. CI instala con `npm ci`, comprueba formato y lint, ejecuta Vitest, genera el build de Pages, audita `dist`, ejecuta la matriz Playwright y prueba el mismo build con `vite preview` bajo `/castigo-divino-map/`.
3. `.github/workflows/pages.yml` recibe el evento `workflow_run` únicamente cuando CI termina sobre `master`.
4. El job `build` solo continúa si la conclusión es `success`. Reconstruye el commit validado, vuelve a auditar `dist`, ejecuta el smoke local y sube exclusivamente `dist` mediante `actions/upload-pages-artifact`.
5. El job `deploy` usa el entorno `github-pages`, `actions/configure-pages` y `actions/deploy-pages`.
6. El job `smoke` prueba la URL devuelta por el despliegue y registra la URL validada en el resumen del workflow.
7. El job `report` publica sobre el SHA el estado `github-pages/deployment`, con enlace al run exacto y éxito solo cuando `build`, `deploy` y `smoke` terminan correctamente.

La ejecución manual está permitida únicamente desde `master`. Como no existe un `workflow_run` previo que pueda reutilizarse, la ruta manual repite formato, lint, Vitest y la matriz e2e antes de desplegar.

## Activación inicial de GitHub Pages

La activación del sitio se realiza una sola vez por una persona con permisos administrativos:

1. Abrir **Settings** del repositorio.
2. Seleccionar **Pages**.
3. En **Build and deployment**, elegir **Source: GitHub Actions**.
4. Guardar la configuración cuando GitHub lo solicite.
5. Ejecutar manualmente el workflow de Pages sobre `master`.

El conector utilizado para MAP-011 no expone la configuración de Pages. El `GITHUB_TOKEN` de Actions tampoco puede crear o habilitar el sitio porque esa operación exige permisos administrativos adicionales. El workflow mantiene `actions/configure-pages` con la activación implícita deshabilitada y falla de forma explícita cuando el sitio no existe.

## Evidencia del primer intento

El run `30940902156`, activado automáticamente después de una CI satisfactoria sobre `master`, obtuvo estos resultados:

- `Build and upload production artifact`: correcto;
- instalación reproducible: correcta;
- build de Pages: correcto;
- auditoría de `dist`: correcta;
- smoke local: correcto;
- subida exclusiva de `dist`: correcta;
- `Deploy GitHub Pages`: falló en `actions/configure-pages@v6`;
- `actions/deploy-pages`: no ejecutado;
- smoke de la URL pública: no ejecutado;
- estado `github-pages/deployment`: fallo, enlazado al run.

El mensaje de GitHub fue `Get Pages site failed`, indicando que el repositorio no tenía Pages habilitado y configurado para construir mediante GitHub Actions.

## Ruta base de Vite

`vite.config.ts` mantiene `/` para desarrollo y builds ordinarios. El modo `pages` deriva el nombre del repositorio desde `GITHUB_REPOSITORY`; para preview local usa como alternativa segura `npm_package_name`.

```bash
npm run build:pages
npm run verify:build
npm run preview:pages
```

El resultado usa `/castigo-divino-map/` para JavaScript y CSS. La aplicación no introduce router ni rutas internas: el pathname se conserva y el estado continúa en la query string.

## Contenido del artefacto

`verify-production-build.mjs` falla cuando:

- falta `dist/index.html`, JavaScript o CSS;
- `index.html` referencia recursos fuera de `/castigo-divino-map/assets/`;
- un recurso referenciado no existe en `dist`;
- aparece una imagen raster o un nombre compatible con una copia o mosaico del mapa;
- desaparece la referencia a la URL oficial remota;
- un archivo textual coincide con patrones conocidos de credenciales privadas.

El workflow de Pages sube exclusivamente `dist`, con retención mínima del artefacto de transporte. No publica dependencias, cachés, trazas, informes Playwright ni artefactos de pruebas.

## Permisos y concurrencia

Los permisos predeterminados son `contents: read`.

- El job `deploy` recibe `pages: write` e `id-token: write`.
- El job `report` recibe `statuses: write`.
- Ningún otro job recibe permisos de escritura.

El entorno `github-pages` expone la URL del paso de despliegue. El grupo de concurrencia es `pages` con `cancel-in-progress: false`: una ejecución posterior espera en lugar de cancelar un despliegue que ya haya comenzado.

## Smoke tests

El smoke de preview y el posterior al despliegue comprueban:

- respuesta correcta y recursos JavaScript/CSS bajo el subdirectorio;
- cabecera, búsqueda, filtros, mapa, marcadores, ficha y aviso legal;
- restauración y recarga de una URL completa;
- política de atrás y adelante;
- solicitud exclusiva de la URL oficial del mapa;
- superficie neutra y funcionalidad cuando el recurso remoto falla;
- ausencia de overflow horizontal a 320 px;
- foco básico, cierre de ficha y retorno al marcador;
- atribución legal visible.

El mapa se intercepta con un SVG neutro generado en memoria para las pruebas controladas. El smoke no descarga ni almacena el JPEG oficial.

El preview ha superado los dos escenarios. La misma suite queda pendiente de ejecutar contra `PAGES_URL` cuando el sitio esté habilitado.

## Despliegue manual

1. Confirmar que **Settings → Pages → Source** está configurado como **GitHub Actions**.
2. Abrir **Actions → Deploy Beta 0.1 to GitHub Pages**.
3. Seleccionar **Run workflow** sobre `master`.
4. Confirmar que `Build and upload production artifact`, `Deploy GitHub Pages`, `Validate published Beta 0.1` y `Record deployment status` terminan en verde.
5. Abrir la URL registrada en el entorno `github-pages` o en el resumen del workflow.
6. Confirmar que el commit muestra `github-pages/deployment` en estado correcto.

La ejecución manual no permite desplegar una rama de trabajo y no omite la calidad completa.

## Rollback

### Identificar la última versión correcta

1. Abrir el historial del entorno `github-pages` o el workflow de Pages.
2. Localizar la última ejecución verde y anotar el SHA validado por el job `build`.
3. Confirmar que su job `smoke` terminó correctamente.
4. Confirmar el estado `github-pages/deployment` sobre ese SHA.

### Revertir una regresión

1. Crear una rama desde `master`.
2. Revertir el merge o los commits que introdujeron la regresión mediante `git revert`; no reescribir `master`.
3. Abrir una pull request y esperar a CI verde.
4. Fusionar la PR. El commit de revert validado se desplegará automáticamente.
5. Confirmar el smoke posterior y que `dist` no contiene el mapa.

### Redesplegar una versión ya integrada

Cuando el código correcto ya está en `master` y el fallo fue transitorio, reejecutar el workflow de Pages manualmente sobre `master`. No se debe construir desde una rama ni descargar un artefacto antiguo no verificable.

## Diagnóstico

- **Build:** revisar TypeScript, Vite y la base calculada. Reproducir con `npm ci && npm run build:pages`.
- **Auditoría:** ejecutar `npm run verify:build` y corregir la ruta, el contenido o la posible credencial indicada.
- **Upload:** confirmar que existe `dist` y que `actions/upload-pages-artifact` recibe solo ese directorio.
- **Configure Pages / 404 de la API:** habilitar **Source: GitHub Actions** desde Settings con permisos administrativos.
- **Deploy:** revisar permisos `pages: write`, `id-token: write`, entorno `github-pages` y configuración de Pages.
- **Smoke:** usar la URL exacta emitida por `deploy-pages`; revisar 404 de assets, pathname y consola del navegador.
- **Status:** consultar `github-pages/deployment` sobre el SHA y seguir su enlace al run exacto.
- **Pages no disponible:** conservar CI verde, no publicar en un host alternativo no aprobado y reejecutar cuando el servicio se recupere.
- **Mapa oficial no disponible:** mantener la publicación y la superficie neutra; no crear una copia local. Revisar la fuente y la licencia antes de cualquier sustitución.

## Retirada temporal

Si aparece contenido privado, una credencial o un recurso sin licencia:

1. detener nuevas integraciones;
2. revertir inmediatamente el commit mediante PR;
3. fusionar y validar el redespliegue;
4. si es necesario, deshabilitar temporalmente Pages desde la configuración del repositorio;
5. revocar cualquier credencial expuesta, aunque el commit haya sido eliminado de la versión visible;
6. verificar que la versión restaurada tampoco contiene una copia local del mapa.

GitHub y esta documentación siguen siendo la fuente de verdad del procedimiento.
