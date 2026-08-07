# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: Beta 0.1.
- Próxima versión: Beta 0.2.
- MAP-001 a MAP-018: completadas.
- Trabajo actual: MAP-019 — CRUD de pines con editor visual y previsualización.
- PR de cierre de MAP-018: #66 sobre `agent/map-018-admin-taxonomy`.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-07.

MAP-017 se integró mediante la PR #65 y el merge commit `1eda9885d54cb72cf3436496287a92c5c61c8de3`. Su CI definitiva fue la #222. Las migraciones alojadas añadidas por MAP-017 son `20260807111646_expose_admin_authorization_probe` y `20260807111841_harden_admin_authorization_probe`; el historial remoto final quedó en doce migraciones. El despliegue de Pages posterior al merge fue validado por el run `31174128169`, incluido el smoke contra la URL publicada. La Issue #36 quedó cerrada como completada.

MAP-018 cerró el CRUD administrativo de categorías, etiquetas y nombres sin añadir migraciones ni dependencias de runtime. La implementación mantiene separadas la sesión administrativa y las lecturas públicas, reutiliza RLS y las invariantes PostgreSQL existentes, bloquea mutaciones cuando el backend no está conectado y conserva el borrado físico como excepción para contenido nunca publicado y sin referencias. La validación funcional previa al cierre dejó formato, auditoría de secretos, lint, 151 pruebas unitarias, build TypeScript/Pages, auditoría del artefacto, 59 escenarios Playwright, smoke local de Pages, 173 aserciones pgTAP y 13 comprobaciones de concurrencia en verde. El Supabase alojado conserva exactamente las doce migraciones previas.

## Beta 0.1

MAP-001 a MAP-011 están completadas. La versión publicada conserva:

- Vite + TypeScript + Leaflet;
- mapa oficial remoto con `L.CRS.Simple`;
- catálogo público validado;
- marcadores, fichas, búsqueda y filtros;
- URLs compartibles e historial;
- diseño responsive y accesible;
- CI y despliegue automático en GitHub Pages;
- fallback cuando falla la imagen cartográfica remota.

Beta 0.2 debe conservar pathname de Pages, query string, IDs, slugs, coordenadas, búsqueda, filtros, historial, accesibilidad y tratamiento del mapa remoto hasta que las Issues de transición demuestren equivalencia.

## Arquitectura cerrada para Beta 0.2

MAP-013 mantiene estos contratos:

- GitHub Pages aloja el frontend Vite estático y el snapshot público versionado.
- Supabase ofrece Data API y Auth sobre PostgreSQL.
- PostgreSQL, constraints, grants y RLS son la frontera definitiva de seguridad.
- URL de proyecto y clave publicable son los únicos valores de Supabase permitidos en el navegador.
- `service_role`, `sb_secret_*`, access tokens de gestión, contraseñas de base de datos y otros secretos quedan fuera del frontend, repositorio, logs y artefactos.
- Catálogo público y sesión administrativa usan caminos separados.
- Login administrativo por email/password, registro deshabilitado y allowlist en `private.admin_users`.
- Estados editoriales `draft`, `published`, `archived`; archivado como eliminación habitual y borrado físico excepcional.
- IDs, slugs y URLs publicados son estables y no reutilizables.
- Estados de backend `connected`, `degraded`, `offline`.
- Migraciones SQL versionadas, pruebas positivas/negativas y estrategia expand/contract.

Las decisiones completas viven en `docs/architecture.md`, `docs/data-model.md`, `docs/security.md`, ADR 0002 a 0005, `docs/admin-auth.md` y `docs/admin-catalog.md`.

## Supabase y modelo de datos

El proyecto alojado `atlas-nuevos-dioses-prod` está activo. MAP-018 comprobó mediante las herramientas conectadas que el historial remoto contiene exactamente doce migraciones, en el mismo orden que Git:

1. `20260805120000_create_application_schema`
2. `20260805121000_create_authorization_and_rls`
3. `20260805122000_create_public_request_rpc`
4. `20260805123000_fix_public_name_uniqueness`
5. `20260805150000_harden_admin_writes_and_relational_locks`
6. `20260805213000_expand_entity_domain`
7. `20260805213500_validate_entity_domain_backfill`
8. `20260805214000_harden_entity_relations`
9. `20260805215000_refine_character_location_events`
10. `20260806085000_harden_entity_matrix_and_character_trail`
11. `20260807111646_expose_admin_authorization_probe`
12. `20260807111841_harden_admin_authorization_probe`

Las doce migraciones son inmutables. MAP-018 inspeccionó columnas, grants, RLS, constraints, índices y triggers de `categories`, `tags`, `map_entities`, `entity_aliases`, `geographic_names`, `geographic_name_aliases` y relaciones asociadas. El contrato ya contiene la seguridad e invariantes requeridas por el CRUD, por lo que MAP-018 no necesita SQL redundante ni una migración nueva.

No se ejecuta `seed.sql` en producción.

## Modelo funcional relevante

Beta 0.2 mantiene:

- entidades `character` y `location`;
- visibilidad `pin` o `search_only` independiente del tipo;
- disposición por jugador `ally`, `enemy`, `neutral`;
- categorías y etiquetas editoriales;
- nombre principal de entidad en `map_entities.name` y nombres alternativos en `entity_aliases`;
- nombres geográficos ligeros en `geographic_names` y aliases en `geographic_name_aliases`;
- idioma nominal `en` durante Beta 0.2 sin eliminar el campo de idioma;
- rastro cronológico público de avistamientos y salidas;
- snapshot público versionado y fallback de MAP-016.

MAP-018 gestiona categorías, etiquetas, `entity_aliases`, `geographic_names` y `geographic_name_aliases`. No edita `map_entities.name`: la entidad completa y el editor visual de pines pertenecen a MAP-019.

## Interpretación de publicación de MAP-018

El criterio «Los cambios publicados aparecen en la experiencia pública» se reconcilia con MAP-016 y MAP-028 así:

- `SupabasePublicCatalogRepository` ya consulta con rol público las filas `published` de categorías, etiquetas, aliases y nombres geográficos.
- Los cambios de MAP-018 publicados aparecen inmediatamente en esa proyección pública Beta 0.2 y quedan sometidos a RLS de lectura anónima.
- La UI principal visible de Beta 0.1 conserva el catálogo de compatibilidad hasta MAP-028.
- MAP-018 no adelanta la migración final, no sustituye silenciosamente el catálogo Beta 0.1 y no cambia las URLs del mapa.
- MAP-028 sigue siendo responsable de demostrar equivalencia del catálogo y hacer efectiva la transición completa de la UI.

Esta decisión está detallada en `docs/admin-catalog.md`.

## Flujo de trabajo y CI desde MAP-018

Se elimina el antiguo «Preflight obligatorio antes de lanzar CI» como requisito previo para GitHub Actions.

A partir de MAP-018:

1. trabajar desde `master` en una rama de Issue;
2. implementar en commits trazables;
3. abrir PR draft;
4. usar GitHub Actions directamente como bucle principal de validación;
5. inspeccionar y corregir los fallos sobre la rama;
6. después de mover el head, validar el nuevo SHA mediante una ejecución nueva;
7. seguir únicamente la CI correspondiente al SHA más reciente;
8. no usar `Re-run jobs` de una ejecución antigua como evidencia de un head nuevo;
9. marcar ready y fusionar solo el SHA final validado.

No existe obligación de ejecutar un preflight local completo antes de CI.

Este cambio se limita al preflight local. Los controles de producción de Supabase siguen vigentes: salud del proyecto, comparación de historial, revisión exacta de migraciones pendientes, dry-run cuando corresponda, backups antes de cambios destructivos, validación posterior, rollback, no semillas y parada ante deriva inesperada.

## Backlog Beta 0.2

Orden recomendado:

1. MAP-013 — Definir arquitectura y seguridad. **Completada.**
2. MAP-014 — Preparar Supabase, migraciones y RLS. **Completada.**
3. MAP-015 — Evolucionar entidades y relaciones. **Completada.**
4. MAP-016 — Acceso público resiliente y estado backend. **Completada.**
5. MAP-017 — Login y autorización administrativa. **Completada.**
6. MAP-018 — CRUD administrativo de categorías, etiquetas y nombres. **Completada.**
7. MAP-019 — CRUD de pines con editor visual y previsualización. **Trabajo actual.**
8. MAP-020 — Relacionar personajes importantes con emplazamientos.
9. MAP-021 — Búsqueda geográfica por nombres del mapa.
10. MAP-022 — Diferenciar visualmente tipos y disposiciones.
11. MAP-023 — Rediseñar ficha compacta.
12. MAP-024 — Ficha completa en pestaña nueva.
13. MAP-025 — Búsqueda y filtros colapsables.
14. MAP-026 — Solicitudes públicas de nuevos pines.
15. MAP-027 — Moderar y convertir solicitudes en borradores.
16. MAP-028 — Migrar catálogo estático y transición a Supabase.
17. MAP-029 — Validar seguridad, accesibilidad y rendimiento.
18. MAP-030 — Publicar y validar Beta 0.2.

## Acciones completadas para MAP-018

- Reutilización de la sesión segura de MAP-017 sin añadir el JWT a lecturas públicas.
- Separación de dominio, acceso a datos, coordinación y UI del CRUD.
- Listado, búsqueda, ordenación, creación, edición y archivado de categorías, etiquetas y nombres.
- Borrado físico excepcional protegido por historial de publicación, RLS, constraints y foreign keys.
- Idioma nominal `en` conservando el modelo preparado para futuras traducciones.
- Conflictos normalizados para la UI sin exponer SQL interno.
- Mutaciones bloqueadas con backend `degraded` u `offline`.
- Pérdida de sesión 401/403 tratada cerrando el modo administrativo sin romper el mapa público.
- Cobertura con Vitest, integración, Playwright, pgTAP y pruebas de concurrencia.
- UI usable con teclado y a 320 px, con controles y mensajes accesibles.
- Publicación limitada a la proyección pública Beta 0.2 existente, sin adelantar MAP-019 ni MAP-028.
- Supabase alojado revisado de forma no destructiva y mantenido en doce migraciones, sin cambios de Auth, allowlist ni configuración.

## Acciones completadas para MAP-014

- Supabase CLI fijada en `2.111.0` y stack local reproducible.
- Cinco migraciones finales de MAP-014 aplicadas y validadas sin semillas en producción.
- Allowlist administrativa separada y RLS/grants por columna.
- 172 aserciones pgTAP y comprobaciones concurrentes validadas por CI #138.
- PR #56 fusionada; Issue #33 cerrada.

## Acciones completadas para MAP-015

- Modelo de entidades, disposiciones, visibilidad, aliases, tags y rastro cronológico cerrado.
- Cinco migraciones hacia delante aplicadas en total durante MAP-015, incluida la de hardening.
- Diez versiones locales/remotas alineadas, lint remoto y smoke con rollback correcto.
- CI #165 verde; PR #59 fusionada; Issue #34 cerrada.

## Acciones completadas para MAP-016

- Acceso público Supabase separado de Leaflet y de la presentación.
- Snapshot Beta 0.1 validado como fallback y proyección Beta 0.2 cargada sin adelantar MAP-028.
- Estados `connected`, `degraded`, `offline`, paginación, caché validada y cancelación de lotes.
- CI `31128893212` verde sobre `31d7b0277d2136b2b1a5332db32f4c21a265f916`.
- PR #60 fusionada con merge commit `a72a89c1a18f1dff9acabe7a5806dffda58d4703`; Issue #35 cerrada.
- Sin cambios al Supabase alojado durante MAP-016.

## Acciones completadas para MAP-017

- Login administrativo por email/password integrado sin añadir `@supabase/supabase-js` al bundle.
- Sesión confinada a memoria y `sessionStorage`, refresh rotatorio y logout local.
- Separación estricta entre catálogo público anónimo y sesión administrativa.
- Probe `public.current_user_is_admin()` expuesta con wrapper final `SECURITY INVOKER`, `search_path` vacío y `EXECUTE` solo para `authenticated`.
- Elevación necesaria mantenida exclusivamente en `private.is_admin()`.
- Dos migraciones hacia delante aplicadas y verificadas en `atlas-nuevos-dioses-prod` sin semillas.
- Historial remoto final de doce migraciones alineado con Git.
- Único administrador real confirmado y allowlisted sin modificar usuario, contraseña ni `private.admin_users` durante el cierre.
- Autorización negativa y positiva, 401/403, almacenamiento, refresh, logout y ausencia de tokens validados.
- CI definitiva #222 completamente verde.
- PR #65 fusionada con merge commit `1eda9885d54cb72cf3436496287a92c5c61c8de3`.
- Pages posterior al merge validado por run `31174128169`, incluido smoke contra la URL publicada.
- Issue #36 cerrada como completada con sus seis criterios.

## Bloqueos

No hay bloqueos técnicos conocidos para iniciar MAP-019 al cerrar MAP-018.

Las herramientas disponibles permiten inspeccionar GitHub y Supabase alojado. Cualquier operación destructiva/irreversible, cambio de Auth/allowlist/configuración o uso inevitable de credenciales reales mantiene su checkpoint humano obligatorio.

## Riesgos aceptados

- GitHub Pages, Supabase y la imagen cartográfica remota no ofrecen SLA propio del proyecto.
- Un único Supabase alojado reduce coste y complejidad, pero exige disciplina para no usar producción como entorno de pruebas.
- El snapshot público puede quedar temporalmente por detrás del catálogo publicado hasta el siguiente build validado.
- La sesión limitada a la pestaña reduce persistencia y exige volver a autenticarse tras cerrarla.
- En planes sin recuperación avanzada, el rollback de cambios destructivos depende de backups operativos y correcciones hacia delante.
- La protección contra contraseñas filtradas no está disponible en el plan actual.

## Riesgos pendientes de MAP-019 a MAP-030

- Mantener el CRUD administrativo accesible y evitar filtración accidental de JWT o detalles SQL al ampliar el editor de pines.
- Mantener invariantes de IDs, slugs, nombres, archivado y relaciones frente a un frontend manipulado.
- Migrar en MAP-028 el catálogo Beta 0.1 sin romper IDs, slugs, coordenadas ni URLs existentes.
- Resolver en MAP-022 la representación de disposiciones distintas por jugador sin colapsarlas en un color ambiguo.
- Mantener automatizada y auditable la generación del snapshot público.
- Validar abuso de solicitudes, rendimiento y recuperación real antes del lanzamiento.

## Próximo paso

Iniciar MAP-019 — CRUD de pines con editor visual y previsualización — desde `master`, conservando la separación entre sesión administrativa y catálogo público, las garantías RLS/PostgreSQL y el flujo de CI establecido desde MAP-018.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Fundación, alcance, arquitectura y acuerdo de trabajo. |
| 2026-08-04 | MAP-002 a MAP-011 completadas y Beta 0.1 publicada. |
| 2026-08-04 | MAP-013 cerró arquitectura, seguridad, entornos, publicación, degradación, migraciones y rollback de Beta 0.2. |
| 2026-08-05 | MAP-014 preparó Supabase local/alojado, RLS, allowlist y hardening; PR #56 e Issue #33 cerradas. |
| 2026-08-06 | MAP-015 cerró el modelo Beta 0.2 y el historial remoto llegó a diez migraciones; PR #59 e Issue #34 cerradas. |
| 2026-08-07 | MAP-016 integró acceso público resiliente y fallback sin modificar producción; PR #60 e Issue #35 cerradas. |
| 2026-08-07 | MAP-017 integró login/autorización, dos migraciones y probe administrativa; CI #222, PR #65 y Pages `31174128169` validados; Issue #36 cerrada. |
| 2026-08-07 | MAP-018 retiró el preflight local obligatorio previo a CI y consolidó GitHub Actions como bucle principal sin debilitar controles de producción de Supabase. |
| 2026-08-07 | MAP-018 cerró el CRUD administrativo de categorías, etiquetas y nombres, validó seguridad, accesibilidad y publicación Beta 0.2, mantuvo Supabase alojado sin cambios y dejó MAP-019 como siguiente trabajo. |
