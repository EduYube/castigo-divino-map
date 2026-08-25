# MAP-052 — Consolidación estable v1.0

## Objetivo

MAP-052 promueve formalmente el estado funcional existente de **El Atlas de los Nuevos Dioses** a **v1.0** (`1.0.0`). Es un release de consolidación: cambia versionado, presentación de versión y documentación, pero no añade una feature ni reinterpreta el catálogo.

Issue de release: #148.

## Baseline

La rama de release parte de `master` después de MAP-051. Todo comportamiento válido de ese baseline debe permanecer intacto.

La fuente canónica de versión de la aplicación es `package.json`, que declara `1.0.0`. La UI muestra `v1.0` y el smoke de Pages lo verifica explícitamente.

## Superficies actualizadas

MAP-052 actualiza únicamente superficies que describen la versión vigente:

- `package.json`;
- badge y encabezado de versión de la UI;
- `README.md`;
- `docs/project-status.md`;
- `docs/deployment-and-rollback.md`;
- `tests/deployment/pages-smoke.spec.ts` para exigir `v1.0` en el build y en producción;
- este documento de release.

## Historia Beta preservada

No se hace un reemplazo global de la palabra Beta.

Se conservan deliberadamente las referencias que documentan releases o contratos históricos, entre ellas:

- `docs/map-030-release.md` y la evidencia de Beta 0.2;
- `docs/product-scope.md`, que describe el alcance original de Beta 0.1;
- `docs/architecture.md`, decisión arquitectónica tomada para Beta 0.2;
- nombres de migraciones y rollback `beta01`;
- fixtures y adaptadores de compatibilidad `beta01`/`beta02`;
- nombres de tests cuyo propósito es demostrar compatibilidad heredada;
- identificadores de runtime como `data-detail-source="beta02"` cuando expresan el origen del contrato y no la versión comercial visible.

Cambiar esos nombres no forma parte de v1.0 y podría reescribir historia o alterar contratos de compatibilidad.

## Datos, seguridad y migraciones

MAP-052 no modifica:

- IDs, slugs, entidades, personajes o emplazamientos;
- coordenadas, retratos o rutas de Storage;
- categorías, etiquetas, aliases, relaciones o notas;
- disposiciones por jugador o audiencia;
- estados editoriales, solicitudes públicas o `converted_entity_id`;
- URLs existentes;
- contenido funcional de `public/data/public-catalog.snapshot.json`.

No hay migración de base de datos para este release. No se modifica Supabase de producción para cambiar la versión y no se ejecuta seed destructivo.

Tampoco se cambian Auth, RLS, grants, policies, owners o Storage. El perfil de seguridad es el mismo del baseline previo a MAP-052.

## Runtime y compatibilidad

La revisión de runtime confirma que el nombre comercial Beta no se usa para derivar rutas, IDs, slugs, permisos, consultas o migraciones. El base path de Pages se deriva del repositorio/nombre del paquete y no de la versión.

Los contratos históricos `beta01`/`beta02` se mantienen porque describen compatibilidad de datos, no porque la aplicación siga siendo una Beta.

## Validación

El candidato debe superar sin relajar tests:

- formato;
- auditoría de credenciales;
- invariantes de accesibilidad;
- lint;
- unit tests;
- validación del snapshot;
- build Pages;
- auditoría del artefacto;
- E2E completos;
- smoke local de Pages;
- reconstrucción/lint/pgTAP/RLS/concurrencia de Supabase local.

Después del merge, Pages debe verificar otra vez el snapshot remoto, reconstruir el SHA validado de `master`, desplegarlo y ejecutar smoke contra la URL publicada.

El smoke de v1.0 conserva comprobaciones de mapa, búsqueda, filtros, fichas, URL, solicitudes públicas, responsive, atribución, backend conectado y fallback desde snapshot. La suite completa cubre además administración, Modo Máster, retratos y los escenarios de resiliencia ya existentes.

## Evidencia final y SHA

El SHA final no se escribe dentro del propio commit de release: hacerlo generaría un SHA nuevo y produciría un ciclo autorreferencial de commits y despliegues.

La evidencia final inmutable se registra en #148 después del merge e incluye:

- PR utilizada;
- SHA final de `master`;
- resultado de la CI de `master`;
- run de Pages;
- resultado de build/deploy/smoke;
- estado `github-pages/deployment`;
- confirmación de que la UI publicada muestra `v1.0`;
- confirmación de que snapshot y datos permanecen intactos.

#148 solo se cierra después de completar esas validaciones.

## Rollback

Como MAP-052 no introduce migraciones ni datos nuevos, el rollback es un `git revert` de la PR de release en una nueva rama, seguido del flujo normal de CI y Pages. No se hace force-push sobre `master` ni se modifica el historial de datos.
