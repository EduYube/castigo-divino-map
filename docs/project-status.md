# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: Beta 0.1.
- Próxima versión: Beta 0.2.
- MAP-001 a MAP-022: implementadas e integradas funcionalmente.
- Siguiente trabajo de backlog: MAP-023 — Rediseñar ficha compacta.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-07.

MAP-022 se integró mediante PR #71 sobre el `master` que contenía el cierre documental de MAP-021. La solución mantiene el catálogo visible Beta 0.1 como compatibilidad, consume la proyección Beta 0.2 solo para enriquecer o añadir pines `visibility = pin`, introduce un contrato visual compartido para tipo y disposición por jugador y resuelve coordenadas coincidentes mediante un marcador compuesto con lista accesible. No requirió DDL ni migración de Supabase.

El head funcional final `45dfa13ca616ef5f3e4e31fa95fbe76040d4dfaf` quedó completamente verde en CI #393 / run `31224128324`; la PR #71 se fusionó con merge commit `ccd8d5c372307b1d5ec02539fae8a4d5df8b4f51` y la Issue #41 quedó cerrada automáticamente. La evidencia post-merge de los workflows `push` de `master` y Pages debe registrarse únicamente cuando sea verificable: el conector disponible no enumera esos runs mediante `fetch_commit_workflow_runs`, que filtra ejecuciones de pull request.

## Beta 0.1 y frontera de Beta 0.2

MAP-001 a MAP-011 entregaron la Beta 0.1 publicada con Vite, TypeScript, Leaflet, mapa oficial remoto, catálogo público validado, marcadores, fichas, búsqueda, filtros, URL/historial, responsive, accesibilidad, CI y GitHub Pages.

Beta 0.2 mantiene como contratos de compatibilidad el pathname de Pages, query string, IDs, slugs, coordenadas, búsqueda, filtros, historial, accesibilidad y tratamiento del mapa remoto hasta que MAP-028 demuestre equivalencia y haga la transición completa del catálogo visible.

MAP-013 a MAP-022 ya han cerrado arquitectura, seguridad, Supabase/RLS, modelo de entidades, acceso público resiliente, autenticación administrativa, CRUD de catálogo, CRUD de entidades, relaciones personaje–emplazamiento, búsqueda geográfica pública y el sistema visual accesible de pines. MAP-023 mantiene el siguiente cambio visual de ficha; MAP-028 conserva la transición completa del catálogo.

## Arquitectura y seguridad vigentes

- GitHub Pages aloja el frontend Vite estático y el snapshot público versionado.
- Supabase ofrece Data API y Auth sobre PostgreSQL.
- PostgreSQL, constraints, grants y RLS son la frontera definitiva de seguridad.
- El navegador solo puede usar la URL pública del proyecto y la clave publicable.
- `service_role`, `sb_secret_*`, tokens de gestión, contraseñas de base de datos y otras credenciales privilegiadas quedan fuera del frontend, repositorio, logs y artefactos.
- Catálogo público y sesión administrativa usan caminos separados.
- Estados editoriales: `draft`, `published`, `archived`.
- Estados de backend: `connected`, `degraded`, `offline`.
- Migraciones SQL hacia delante, versionadas y auditables.
- GitHub Actions es el bucle principal de validación de cada head de PR; un SHA nuevo exige una ejecución nueva y limpia.

Las decisiones completas viven en `docs/architecture.md`, `docs/data-model.md`, `docs/security.md`, ADR 0002 a 0005, `docs/admin-auth.md`, `docs/admin-catalog.md`, `docs/admin-map-entities.md`, `docs/geographic-search.md` y `docs/pin-visual-system.md`.

## Supabase alojado y migraciones

Proyecto: `atlas-nuevos-dioses-prod`.

El historial alojado verificado durante MAP-021 contiene catorce migraciones, en este orden:

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
13. `20260807154307_add_admin_map_entity_editor_rpc`
14. `20260807180851_add_character_location_relations`

Las versiones alojadas 13 y 14 corresponden respectivamente al SQL versionado de MAP-019 y MAP-020. No se ejecuta `seed.sql` en producción.

MAP-021 verificó que `geographic_names`, `geographic_name_aliases`, `map_entities` y `entity_aliases` tienen RLS activa. `geographic_names` ya contiene `x`, `y`, `recommended_zoom` y `entity_id` opcional; las policies públicas filtran contenido publicado y las lecturas anónimas no incluyen permisos de escritura. MAP-021 no añadió DDL ni migración.

MAP-022 reutiliza `entity_type`, `visibility`, `players` y `entity_player_dispositions`; no añade columnas, enums, tablas, RPC, grants, policies ni migraciones. `unknown` no se añade al modelo: el signo `?` se usa solo como fallback de presentación cuando una proyección no contiene una disposición disponible. No se modificaron Auth, usuarios, allowlist, credenciales ni datos de producción.

## Modelo funcional relevante

Beta 0.2 mantiene:

- entidades `character` y `location`;
- visibilidad `pin` o `search_only` independiente del tipo;
- disposición por jugador `ally`, `enemy`, `neutral`;
- categorías y etiquetas editoriales;
- nombre principal de entidad en `map_entities.name` y aliases en `entity_aliases`;
- nombres geográficos ligeros e independientes en `geographic_names` y aliases en `geographic_name_aliases`;
- idioma nominal `en` durante Beta 0.2;
- relación opcional desde un nombre geográfico a una entidad `location` sin colapsar ambas identidades;
- rastro cronológico público de avistamientos y salidas;
- relaciones personaje–emplazamiento con estados `present`, `associated`, `last-seen`;
- snapshot público versionado y fallback de MAP-016.

Un nombre impreso en el mapa no necesita ser un pin. Un `map_entity` con `visibility = search_only` sí es una entidad completa; un `geographic_name` sigue siendo una identidad geográfica ligera para centrar, aplicar zoom recomendado y resaltar una posición.

La disposición no es una propiedad global de la entidad: cada pin puede representar varias perspectivas de jugador. MAP-022 expresa esa matriz con tokens compactos y texto accesible sin introducir una taxonomía paralela.

## MAP-019 — completada

- Issue: #38.
- PR: #67.
- Head validado: `89a876185c74b92c608bca2d66a538acdf92c565`.
- Merge commit: `5fdb6d23d3a991d2a95cdb20bf9d261a25ada4a2`.
- CI final: #302, verde.
- Evidencia declarada en la PR: 166 unitarios y 65 E2E, además de build, auditoría Pages y suite Supabase.
- Migración Git: `20260807154000_add_admin_map_entity_editor_rpc.sql`.
- Versión alojada real: `20260807154307_add_admin_map_entity_editor_rpc`.
- Auth, usuarios, allowlist y claves no se modificaron.

MAP-019 entregó CRUD administrativo de personajes/emplazamientos, editor visual en el espacio cartográfico canónico, preview, publicación/archivado, tags, disposiciones, concurrencia optimista y persistencia atómica protegida por RLS/PostgreSQL.

## MAP-020 — completada

- Issue: #39, cerrada como completada.
- PR: #68.
- Head validado: `23aa6af40d23f74d5d243a8b3bcecec9e6e8b12d`.
- Merge commit: `d9a1f53d9da59b731fddb1dad41242f903278436`.
- CI pre-merge: #353, verde, con 180 unitarios y suite completa.
- CI post-merge de `master`: run `31205952898`, intento final verde sobre el merge commit.
- Pages post-merge: run `31212733439`, build, deploy, smoke publicado y estado de deployment verdes.
- Migración alojada real: `20260807180851_add_character_location_relations`.

MAP-020 añadió `character_location_relations`, lectura pública mínima bajo RLS, administración sin nueva RPC, concurrencia por `updated_at` y helpers de dominio para las fichas futuras. MAP-023/MAP-024 conservan la responsabilidad visual de esas relaciones.

## MAP-021 — completada e integrada

- Issue: #40, cerrada como completada.
- PR: #69.
- Head final validado: `7cd6643fb35c65caf77c29caf72e92cdf9ded73f`.
- Merge commit: `fb3e50b07cdfe40f83d4edf0336e1eae825aff72`.
- CI pre-merge: #373, run `31216650715`, completamente verde.
- Unitarios: 188/188 en 29 archivos.
- E2E: 74/74.
- Smoke local del build Pages: 2/2.
- pgTAP: 222/222 en 12 archivos, además de migraciones, lint, RLS y prueba de concurrencia Supabase.
- Migración de MAP-021: ninguna.
- Producción: no se sembró ni se modificaron Auth, usuarios, allowlist administrativa o credenciales.
- CI/Pages post-merge: checkpoint humano del 2026-08-07 confirmó en verde CI de `master` y GitHub Pages sobre la integración; los run IDs `push` no eran enumerables por el conector disponible.

MAP-021 mantuvo el catálogo visible Beta 0.1, añadió identidades separadas para lugar geográfico, personaje y emplazamiento, centrado/zoom/resaltado temporal para nombres geográficos y conservó el contrato de URL `q`, `place`, `category` y `tag` sin crear pines para `geographic_names`.

## MAP-022 — integrada; cierre post-merge pendiente de evidencia automática o humana

- Issue: #41, cerrada como completada.
- PR funcional: #71, fusionada.
- Rama funcional: `agent/map-022-pin-visual-system`.
- Base: `f33e7d0cac87a30076995a7cee335c12d8b08597`.
- Head funcional final: `45dfa13ca616ef5f3e4e31fa95fbe76040d4dfaf`.
- CI pre-merge: #393, run `31224128324`, completamente verde.
- Merge funcional: `ccd8d5c372307b1d5ec02539fae8a4d5df8b4f51`.
- Migración: ninguna.
- Supabase/RLS: sin cambios; la suite existente quedó verde.
- Post-merge de `master` y Pages: pendiente de registrar únicamente con evidencia verificable; no se inventan IDs de runs.

Contrato integrado:

- personajes: círculo con `●`;
- emplazamientos: rombo con `◆`;
- disposiciones por jugador: `+` aliado, `−` enemigo, `•` neutral y `?` únicamente como fallback visual de ausencia;
- estilos de borde sólidos/dobles/punteados/discontinuos para no depender del color;
- selección mediante anillo exterior independiente, foco visible y atenuación compatible con filtros;
- compatibilidad de los `aria-label` históricos Beta 0.1, con tipo/disposición añadidos en descripción accesible complementaria;
- grupos de coordenadas idénticas mediante marcador compuesto `≡` + contador y popup de botones accesibles, sin alterar coordenadas persistidas;
- leyenda pública compacta y responsive;
- `forced-colors` y `prefers-reduced-motion` explícitos;
- vista administrativa sincronizada con el mismo contrato sin cambiar CRUD, RPC ni persistencia;
- `search_only` y `geographic_names` no crean pines;
- la transición completa del catálogo permanece en MAP-028.

Evidencia del head funcional:

- 198 unitarios verdes;
- 81 E2E verdes;
- 2 smoke del build Pages verdes;
- 222 pgTAP verdes;
- 13 comprobaciones de concurrencia Supabase verdes;
- formatting, auditoría de credenciales, lint, build, migraciones y RLS verdes.

El contrato completo está documentado en `docs/pin-visual-system.md`.

## Backlog Beta 0.2

1. MAP-013 — Definir arquitectura y seguridad. **Completada.**
2. MAP-014 — Preparar Supabase, migraciones y RLS. **Completada.**
3. MAP-015 — Evolucionar entidades y relaciones. **Completada.**
4. MAP-016 — Acceso público resiliente y estado backend. **Completada.**
5. MAP-017 — Login y autorización administrativa. **Completada.**
6. MAP-018 — CRUD administrativo de categorías, etiquetas y nombres. **Completada.**
7. MAP-019 — CRUD de pines con editor visual y previsualización. **Completada.**
8. MAP-020 — Relacionar personajes importantes con emplazamientos. **Completada.**
9. MAP-021 — Búsqueda geográfica por nombres del mapa. **Completada.**
10. MAP-022 — Diferenciar visualmente tipos y disposiciones. **Integrada; verificación post-merge pendiente de evidencia.**
11. MAP-023 — Rediseñar ficha compacta. **Siguiente.**
12. MAP-024 — Ficha completa en pestaña nueva.
13. MAP-025 — Búsqueda y filtros colapsables.
14. MAP-026 — Solicitudes públicas de nuevos pines.
15. MAP-027 — Moderar y convertir solicitudes en borradores.
16. MAP-028 — Migrar catálogo estático y transición a Supabase.
17. MAP-029 — Validar seguridad, accesibilidad y rendimiento.
18. MAP-030 — Publicar y validar Beta 0.2.

## Flujo operativo actual

1. partir del `master` real;
2. crear una rama de Issue;
3. implementar en commits trazables;
4. abrir una PR draft;
5. usar GitHub Actions como bucle principal de validación;
6. corregir fallos en la rama;
7. validar cada head nuevo con una ejecución nueva;
8. pasar a Ready for review solo con el SHA final completamente verde;
9. revisar diff, comentarios, hilos y alcance;
10. fusionar con el método habitual del repositorio;
11. verificar Issue, `master`, GitHub Pages y smoke publicado.

No existe un preflight local obligatorio ni un checkpoint humano antes de CI. Las herramientas locales son auxiliares cuando están disponibles; GitHub Actions valida cada head real de la PR.

Los cambios de producción de Supabase conservan sus controles adicionales: comparación de historial, revisión exacta de SQL, validación local cuando hay DDL, aplicación hacia delante, verificación posterior de esquema/grants/RLS/advisors, no semillas y parada ante deriva inesperada.

## Riesgos y fronteras pendientes

- MAP-023/MAP-024 mantienen los rediseños de ficha compacta/completa.
- MAP-025 mantiene la evolución de búsqueda/filtros; MAP-022 no amplió esa superficie.
- MAP-028 mantiene la transición completa del catálogo Beta 0.1 a Supabase.
- GitHub Pages, Supabase y la imagen cartográfica remota no tienen SLA propio del proyecto.
- El snapshot de compatibilidad puede quedar temporalmente por detrás de la proyección publicada hasta el siguiente build validado.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-04 | MAP-002 a MAP-011 completadas y Beta 0.1 publicada. |
| 2026-08-04 | MAP-013 cerró arquitectura, seguridad, entornos, publicación, degradación, migraciones y rollback de Beta 0.2. |
| 2026-08-05 | MAP-014 preparó Supabase local/alojado, RLS, allowlist y hardening; PR #56 e Issue #33 cerradas. |
| 2026-08-06 | MAP-015 cerró el modelo Beta 0.2 y el historial remoto llegó a diez migraciones; PR #59 e Issue #34 cerradas. |
| 2026-08-07 | MAP-016 integró acceso público resiliente y fallback; PR #60 e Issue #35 cerradas. |
| 2026-08-07 | MAP-017 integró login/autorización y dos migraciones; PR #65 e Issue #36 cerradas. |
| 2026-08-07 | MAP-018 cerró el CRUD administrativo de categorías, etiquetas y nombres; PR #66. |
| 2026-08-07 | MAP-019 cerró el CRUD de entidades; PR #67, merge `5fdb6d2…`, migración alojada `20260807154307_add_admin_map_entity_editor_rpc`. |
| 2026-08-07 | MAP-020 cerró relaciones personaje–emplazamiento; PR #68, merge `d9a1f53…`, Pages `31212733439`, migración alojada `20260807180851_add_character_location_relations`. |
| 2026-08-07 | MAP-021 cerró búsqueda geográfica pública; PR #69, head verde `7cd6643…`, merge `fb3e50b…`, checkpoint post-merge CI/Pages verde y sin DDL. |
| 2026-08-07 | MAP-022 integró el sistema visual accesible de pines; PR #71, head `45dfa13…`, CI #393/run `31224128324`, merge `ccd8d5c…`, sin DDL. |