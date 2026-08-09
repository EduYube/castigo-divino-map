# MAP-029 — Validación transversal de Beta 0.2

- Issue: MAP-029 / #48.
- Base auditada: `master` `94880ac4ee97ae1605323d6b06a9223d1b5d5fba`.
- Rama de validación: `agent/map-029-cross-cutting-validation`.
- Producción: `atlas-nuevos-dioses-prod` (`ehpouvbzmvwbkkoypgfa`).
- Alcance de producción en MAP-029: exclusivamente lectura y comprobaciones no destructivas.

## Resultado ejecutivo

La validación no ha requerido cambiar RLS, Auth, grants, propietarios, funciones, esquema ni datos de producción. La rama añade pruebas y evidencias, no una nueva frontera de seguridad.

Los controles de autorización se han comprobado en tres capas:

1. reconstrucción local completa del esquema mediante migraciones y pgTAP;
2. inspección read-only de policies, grants y funciones alojadas;
3. comprobaciones read-only ejecutadas bajo `anon`, un usuario `authenticated` no allowlisted y un usuario administrativo allowlisted.

La publicación de referencia anterior a MAP-029 ya estaba verde en GitHub Pages sobre `94880ac4ee97ae1605323d6b06a9223d1b5d5fba`, incluido `snapshot:verify:remote`, build, auditoría del artefacto, smoke local, deploy y smoke contra la URL publicada.

## Matriz de validación

| Área | Riesgo / contrato | Evidencia | Estado |
|---|---|---|---|
| RLS | un visitante ve solo filas publicadas y nunca borradores/archivados | policies alojadas + pgTAP positivo/negativo | Verde |
| RLS | `anon` no escribe tablas directamente | grants alojados + matriz pgTAP MAP-029 | Verde |
| RLS | usuario autenticado no allowlisted no obtiene permisos administrativos | role switch read-only + pgTAP | Verde |
| RLS | administrador allowlisted obtiene las operaciones previstas | role switch read-only + pgTAP | Verde |
| Solicitudes | no existe lectura pública de `public_requests` | `anon SELECT` real devuelve `42501`; grants/policies pgTAP | Verde |
| Solicitudes | los campos administrativos no los controla el remitente | RPC cerrada, trigger defensivo y pruebas existentes | Verde |
| RPC pública | solo `submit_public_request` está expuesta a `anon` | ACL alojada + pgTAP MAP-029 | Verde |
| RPC admin | RPCs administrativas no ejecutables por `anon` | ACL alojada + pgTAP MAP-029 | Verde |
| `SECURITY DEFINER` | `search_path` fijado y frontera explícita | introspección alojada + pgTAP MAP-029 | Verde |
| Moderación | propietario dedicado sin login/superuser/bypass RLS | introspección + pgTAP MAP-029 | Verde |
| XSS | HTML almacenado se trata como texto inerte | unitarias de dominio + E2E MAP-029 | Verde |
| Inputs | tipos, longitudes, coordenadas y controles | unitarias + RPC PostgreSQL + E2E | Verde |
| Abuso | honeypot, cooldown y no-retry de escrituras | unitarias/E2E/documentación | Parcial; ver R-01 |
| Credenciales | ninguna credencial privilegiada en tracked/build | `verify:security` + `verify:build` | Verde |
| Accesibilidad | teclado, foco, labels, errores, landmarks, 320 px | E2E existente + Pages smoke | Verde |
| Accesibilidad | contraste base y foco | `verify:accessibility` | Verde |
| Accesibilidad | reducción de movimiento y forced-colors | CSS + `verify:accessibility` | Verde |
| Rendimiento | tamaño reproducible del artefacto | `report:build` | Verde |
| Rendimiento | fan-out inicial y ausencia de polling | E2E MAP-029 | Verde |
| Resiliencia | 503 / 429 / timeout / conexión rechazada | E2E MAP-029 | Verde |
| Resiliencia | JSON inválido / `Content-Range` inválido | E2E MAP-029 + contrato paginado existente | Verde |
| Resiliencia | snapshot ausente/corrupto/inválido y fallback | suites de snapshot/servicio existentes | Verde |
| Resiliencia | recuperación posterior | E2E MAP-029 | Verde |
| Pages | artefacto no incorpora el mapa remoto ni secretos | `verify:build` + Pages smoke | Verde |

## Seguridad y autorización

### Visitante anónimo

La consulta real bajo `SET LOCAL ROLE anon` confirma acceso únicamente a la proyección pública actual. El intento de incluir `public.public_requests` en la misma consulta falla con `permission denied`, lo que demuestra que la tabla de solicitudes no posee siquiera el grant de lectura anónimo.

Las tablas públicas expuestas tienen RLS activa. La matriz añadida por MAP-029 prueba además que no existe ninguna policy anónima de escritura y que ninguna policy anónima de lectura es un `allow true` incondicional.

### Usuario autenticado no autorizado

Una sesión PostgreSQL read-only simulando un JWT `authenticated` no incluido en la allowlist devuelve `current_user_is_admin() = false`. La visibilidad del catálogo coincide con la pública y no aparece acceso administrativo adicional.

### Administrador autorizado

Una sesión equivalente con un `user_id` ya incluido en `private.admin_users` devuelve `current_user_is_admin() = true`. La comprobación no modifica filas, usuarios ni configuración.

La matriz pgTAP comprueba además que las policies de escritura `authenticated` continúan condicionadas por `private.is_admin()` y que las columnas de moderación no tienen una vía directa de actualización desde un navegador autenticado.

### RPCs y funciones elevadas

`public.submit_public_request(...)` sigue siendo la única operación pública de alta. Es una función cerrada, con parámetros estáticos, `search_path = ''`, validación de límites y coordenadas, honeypot y valores administrativos fijados por servidor. No existe lectura pública de la cola.

`public.admin_moderate_public_request(...)` conserva el propietario dedicado `atlas_public_request_moderator`. La matriz MAP-029 verifica que ese rol es `NOLOGIN`, no superusuario y no posee `BYPASSRLS`.

## Inputs, XSS y abuso

La UI no usa `innerHTML` ni `insertAdjacentHTML` para contenido de catálogo. El dominio permite texto con apariencia HTML porque la defensa no consiste en borrar caracteres válidos, sino en no interpretarlos como markup.

MAP-029 añade una regresión E2E que entrega desde el backend un nombre con un payload `img/onerror`, abre su ficha y comprueba simultáneamente que:

- el texto literal es visible;
- no aparece un elemento `img` procedente del payload;
- no se ejecuta el handler malicioso.

Las pruebas preexistentes cubren límites máximos, Unicode/texto normalizado, caracteres de control, tipos cerrados, coordenadas no finitas o fuera de mapa, honeypot, errores, conservación de formulario y cooldown.

No se reintenta automáticamente una escritura de solicitud para evitar duplicados ambiguos. El catálogo de lectura sí reintenta únicamente fallos recuperables.

## Credenciales

El modelo distingue expresamente credenciales públicas de secretos:

- la URL `https://ehpouvbzmvwbkkoypgfa.supabase.co` es configuración pública del navegador;
- `sb_publishable_*` es una clave publicable y puede formar parte del artefacto web;
- `service_role`, `sb_secret_*`, management tokens, JWTs privilegiados, contraseñas y connection strings con password no pueden aparecer en frontend, artefactos ni logs.

`verify:security` audita archivos tracked. `verify:build` vuelve a auditar el artefacto generado y además impide empaquetar el mapa oficial como raster local. Los logs de Actions inspeccionados no muestran credenciales privilegiadas; los tokens de GitHub aparecen enmascarados y la clave publicable de Pages se considera deliberadamente pública.

## Accesibilidad

La suite ya cubría teclado, activación de marcadores/resultados, orden y recuperación de foco en paneles, formularios con labels y errores enlazados, mensajes de estado, objetivos táctiles de 44 px, ausencia de overflow a 320 px y alternativas de teclado a la interacción cartográfica.

MAP-029 añade una comprobación estática reproducible de los pares de color centrales. Se usa 4.5:1 como mínimo conservador para texto normal y 3:1 para el indicador de foco. También se exige que continúen presentes `prefers-reduced-motion: reduce` y la rama de `forced-colors`.

La comprobación automatizada de semántica usa roles/nombres accesibles de Playwright como proxy de árbol accesible. No se ha realizado una sesión humana con NVDA, VoiceOver o TalkBack dentro de MAP-029; no se ha encontrado una regresión semántica respecto a la superficie ya cubierta en Beta 0.1/Beta 0.2.

## Rendimiento

### Baseline publicado

El deployment de referencia de Pages sobre `94880ac4ee97ae1605323d6b06a9223d1b5d5fba` produjo aproximadamente:

- HTML: 0,71 kB;
- CSS: 75,94 kB, 17,43 kB gzip;
- JavaScript: 419,52 kB, 113,25 kB gzip;
- artefacto Pages comprimido subido por Actions: 132 728 bytes.

MAP-029 incorpora `report:build`, que informa bytes y gzip de HTML, CSS, JavaScript, snapshot, total, sourcemaps e imágenes raster en cada CI sin imponer umbrales arbitrarios.

El E2E MAP-029 prueba que una carga conectada realiza una petición REST inicial por cada tabla del contrato público y que, una vez estable, no existe polling en segundo plano. La paginación continúa usando el contrato estricto existente; al crecer el catálogo pueden aparecer peticiones adicionales por página, pero no peticiones duplicadas silenciosas ni una consulta sin límite.

## Resiliencia y modo degradado

MAP-029 prueba desde una carga previamente conectada los siguientes fallos de Supabase:

- `503`;
- `429`;
- timeout;
- conexión rechazada;
- JSON inválido;
- ausencia de `Content-Range` verificable.

En todos esos casos el atlas debe conservar un catálogo usable mediante el snapshot determinista y exponer el estado degradado, no quedar vacío ni hacer fail-open sobre una respuesta parcial.

El mismo E2E comprueba recuperación explícita: tras un `429`, al volver el backend a estado sano y pulsar `Reintentar`, el atlas vuelve a `connected` sin perder el catálogo.

Las suites preexistentes siguen siendo la autoridad para snapshot ausente, corrupto, checksum inválido, contrato paginado incompleto y selección atómica entre remoto y fallback.

## Producción y advisors

El proyecto alojado está sano y contiene la migración `20260809003008_migrate_beta01_public_catalog`. El catálogo público visible coincide con las filas esperadas del snapshot V2.

Los advisors de seguridad observados en MAP-029 no son todos nuevos. El baseline de MAP-017 ya documentaba `submit_public_request` y leaked-password protection desactivada como findings preexistentes. MAP-027 añadió intencionadamente la RPC de moderación `SECURITY DEFINER`, pero la confinó a un propietario dedicado sin login ni bypass de RLS.

Los advisors de rendimiento actuales señalan principalmente:

- un FK sin índice en `public_requests.moderator_user_id`;
- índices aún no usados por el catálogo mínimo;
- policies SELECT permisivas superpuestas para `authenticated` (publicación + administración).

Con el catálogo actual estas observaciones no son un bloqueo de rendimiento. Deben revisarse cuando el volumen real justifique índices o simplificación de policies, evitando optimizaciones especulativas en MAP-029.

## Riesgos residuales

### R-01 — Sin rate limiting autoritativo por IP/dispositivo

**Clasificación propuesta:** aceptable para Beta 0.2 con seguimiento, pendiente de aceptación explícita del mantenedor.

El formulario dispone de honeypot y cooldown de 60 segundos por pestaña, pero ambos pueden eludirse desde un cliente modificado. La RPC cerrada limita qué se puede insertar y no expone la cola, pero un actor puede generar volumen de solicitudes válidas usando la clave publicable.

Mitigación posterior si aparece abuso o si se exige antes de publicar: introducir un punto de entrada servidor/Edge Function con rate limiting y, si procede, challenge anti-bot, manteniendo la RPC/tabla como frontera final.

### R-02 — Leaked-password protection de Supabase Auth desactivada

**Clasificación propuesta:** aceptable para Beta 0.2 con seguimiento o endurecimiento previo, pendiente de decisión explícita del mantenedor.

El advisor es preexistente a MAP-029. Activarlo sería una modificación persistente y sensible de configuración Auth de producción, por lo que MAP-029 no la realiza sin checkpoint humano.

### R-03 — `submit_public_request` mantiene propietario elevado

**Clasificación:** deuda posterior de defensa en profundidad.

La función está cerrada, usa `search_path = ''`, no ejecuta SQL dinámico y fuerza los campos administrativos; no se ha encontrado un bypass. Aun así, trasladar su propiedad a un rol `NOLOGIN` dedicado —patrón ya usado por moderación— reduciría el blast radius de una futura regresión en la función. Hacerlo implicaría una migración de seguridad y review humana, por lo que no se mezcla con la validación si no existe un defecto explotable actual.

### R-04 — Validación humana con lector de pantalla real no ejecutada

**Clasificación:** deuda posterior de assurance, no bloqueante.

Las pruebas de roles, nombres accesibles, foco, teclado, live regions y reflow no sustituyen una sesión humana con tecnología asistiva, pero proporcionan regresión automatizada reproducible. Una sesión manual puede añadirse a una auditoría de accesibilidad posterior sin cambiar la arquitectura.

### R-05 — Advisors de rendimiento con catálogo mínimo

**Clasificación:** deuda posterior.

El índice FK y la superposición de policies deben reevaluarse con datos y trazas reales. No se cambia RLS ni se añaden índices especulativos únicamente para silenciar advisors.

## Rollback

Los cambios de MAP-029 son pruebas, scripts de verificación, CI y documentación. No hay migración ni cambio persistente de producción que revertir.

Si una regresión de CI obligase a retirar la validación, basta revertir la PR de MAP-029; Supabase y el catálogo publicado anterior permanecen intactos.
