# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: Beta 0.1.
- Próxima versión: Beta 0.2.
- Estado general: MAP-014 dispone de una base Supabase local reproducible y probada; quedan la validación CI, la revisión por PR y la configuración manual del proyecto alojado.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-05.

## Beta 0.1

MAP-001 a MAP-011 están completadas. La versión publicada dispone de:

- Vite + TypeScript + Leaflet;
- mapa oficial remoto con `L.CRS.Simple`;
- catálogo público validado;
- marcadores, fichas, búsqueda y filtros;
- URLs compartibles e historial;
- diseño responsive y accesible;
- CI y despliegue automático en GitHub Pages;
- funcionamiento degradado cuando falla la imagen cartográfica remota.

Beta 0.2 conservará estos contratos públicos, incluidos el pathname de Pages, la query string, los IDs, slugs, coordenadas, búsqueda, filtros, historial, accesibilidad y tratamiento del mapa remoto.

## Arquitectura cerrada para Beta 0.2

MAP-013 define:

- GitHub Pages como alojamiento estático del frontend Vite y del snapshot público;
- Supabase como Data API y Auth sobre PostgreSQL;
- PostgreSQL, restricciones y RLS como frontera definitiva de seguridad;
- una capa de acceso a datos desacoplada de Leaflet y la presentación;
- Supabase local para desarrollo y CI y un único proyecto alojado para producción;
- URL y clave publicable como únicos valores de Supabase permitidos en el navegador;
- claves secretas, `service_role`, access token de gestión y contraseña de base de datos fuera del frontend y de los artefactos;
- login administrativo por correo y contraseña, registro deshabilitado y lista blanca separada;
- estados `draft`, `published` y `archived`, con archivado habitual y eliminación física excepcional;
- IDs, slugs y URLs publicados estables y no reutilizables;
- lectura pública exclusiva de contenido publicado y escritura exclusiva para administradores mediante RLS;
- solicitudes públicas a través de una operación controlada, nunca publicadas automáticamente;
- estados de backend `connected`, `degraded` y `offline`;
- snapshot público versionado, validado y generado desde contenido publicado;
- migraciones SQL versionadas, pruebas positivas y negativas de permisos y rollback expand/contract.

Las decisiones completas viven en `docs/architecture.md`, `docs/data-model.md`, `docs/security.md` y ADR 0002 a 0005 bajo `docs/adr/`.

## Base Supabase preparada en MAP-014

La rama `agent/map-014-supabase-foundation` contiene:

- Supabase CLI fijada exactamente en `2.111.0`;
- `supabase/config.toml` endurecido para desarrollo local;
- red Docker local vinculada a `127.0.0.1`;
- cuatro migraciones SQL ordenadas e inmutables tras su primera validación;
- tablas, restricciones, índices, triggers, funciones y ciclo editorial;
- lista blanca `private.admin_users` y autorización mediante `private.is_admin()`;
- grants explícitos y RLS en todas las tablas públicas;
- lectura pública de contenido publicado y escritura administrativa autorizada;
- RPC cerrada para solicitudes públicas;
- semilla determinista con datos y usuarios completamente ficticios;
- 69 pruebas pgTAP de estructura, RLS e invariantes;
- reconstrucción local, lint SQL y pruebas pgTAP correctos;
- auditoría de credenciales en archivos versionados y en el artefacto de Pages;
- documentación operativa en `docs/supabase-operations.md`;
- trabajo CI separado para reconstruir, analizar y probar la base local sin secretos remotos.

No se ha enlazado ni modificado todavía ningún proyecto Supabase alojado.

## Objetivo de Beta 0.2

Añadir persistencia y administración segura sin perder ninguna funcionalidad pública de Beta 0.1.

Decisiones de producto vigentes:

- Supabase con PostgreSQL, Auth y Row Level Security.
- Un único perfil administrativo con permisos de escritura.
- Visitantes sin cuenta y con todas las funciones públicas actuales.
- Entidades de tipo personaje y emplazamiento.
- Disposición independiente: aliado, enemigo, neutral o desconocido.
- Estados de contenido: borrador, publicado y archivado.
- Archivado como eliminación habitual.
- Nombres geográficos únicamente en inglés durante Beta 0.2.
- Traducciones y notas privadas del director de juego pospuestas.
- Solicitudes públicas con lista cerrada de tipos, sin categorías, etiquetas ni código de campaña.
- Indicador visible de estado de Supabase y snapshot público de respaldo.

El alcance completo vive en `docs/beta-0.2-scope.md`. Las capacidades pospuestas viven en `docs/future-improvements.md`.

## Backlog Beta 0.2

MAP-013 a MAP-030 están creadas, añadidas al GitHub Project y clasificadas con `Target: Beta 0.2`.

Orden recomendado de ejecución:

1. MAP-013 — Definir la arquitectura y seguridad de la Beta 0.2. **Completada.**
2. MAP-014 — Preparar Supabase, migraciones y políticas RLS. **En curso.**
3. MAP-015 — Evolucionar el modelo de entidades y relaciones.
4. MAP-016 — Implementar acceso público resiliente y estado del backend.
5. MAP-017 — Implementar login y autorización administrativa.
6. MAP-018 — Crear el CRUD administrativo de categorías, etiquetas y nombres.
7. MAP-019 — Crear el CRUD de pines con editor visual y previsualización.
8. MAP-020 — Relacionar personajes importantes con emplazamientos.
9. MAP-021 — Implementar búsqueda geográfica por nombres del mapa.
10. MAP-022 — Diferenciar visualmente tipos y disposiciones de pines.
11. MAP-023 — Rediseñar la ficha compacta de los pines.
12. MAP-024 — Crear la ficha completa en una pestaña nueva.
13. MAP-025 — Hacer colapsables la búsqueda y los filtros.
14. MAP-026 — Permitir solicitudes públicas de nuevos pines.
15. MAP-027 — Moderar y convertir solicitudes en borradores.
16. MAP-028 — Migrar el catálogo estático y preparar la transición a Supabase.
17. MAP-029 — Validar seguridad, accesibilidad y rendimiento de Beta 0.2.
18. MAP-030 — Publicar y validar la Beta 0.2.

## Trabajo actual

- Validar en GitHub Actions el nuevo trabajo local de Supabase.
- Revisar el diff completo de MAP-014 mediante pull request.
- Completar las acciones manuales imprescindibles del proyecto Supabase alojado sin copiar secretos al repositorio o al chat.
- Confirmar los criterios de aceptación de la Issue #33 antes de fusionar.

## Acciones manuales para MAP-014

Completadas:

- Docker Desktop disponible para desarrollo local.
- Supabase CLI `2.111.0` instalada como dependencia fijada del proyecto.
- Stack local inicializado, reconstruido y probado desde cero.

Pendientes:

- Crear el proyecto Supabase de producción en la organización y región elegidas.
- Comprobar que la versión principal de PostgreSQL alojada coincide con `db.major_version = 17` antes del primer despliegue.
- Obtener la URL y una clave publicable `sb_publishable_...`.
- Crear un GitHub Environment protegido `supabase-production` y guardar allí `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` cuando exista el workflow de migración.
- Crear manualmente el único usuario administrativo, confirmar su correo y deshabilitar registro público, usuarios anónimos y proveedores no usados.
- Configurar las URLs permitidas de Auth para desarrollo local y GitHub Pages.
- Ejecutar y custodiar fuera del repositorio un dump lógico previo al primer cambio destructivo real.

Ninguna clave privilegiada debe copiarse al frontend, variables `VITE_*`, repositorio, Issues, PRs, logs o artefactos.

## Bloqueos

- La configuración del proyecto alojado requiere intervención manual en el Dashboard de Supabase.
- La CI de base de datos debe ejecutarse correctamente en la pull request antes de considerar cumplido el criterio de validación automática.

## Riesgos aceptados

- GitHub Pages, Supabase y la imagen cartográfica remota no ofrecen un SLA propio del proyecto.
- Un único proyecto Supabase alojado reduce coste y complejidad, pero exige disciplina para no probar contra producción.
- El snapshot puede quedar temporalmente por detrás del catálogo publicado hasta el siguiente build validado.
- La sesión administrativa limitada a la pestaña reduce persistencia y exige volver a autenticarse al cerrar el navegador.
- La protección básica de solicitudes puede requerir Edge Function, CAPTCHA y limitación distribuida antes del lanzamiento.
- En planes sin recuperación avanzada, el rollback de migraciones destructivas depende de dumps operativos y correcciones hacia delante.

## Riesgos pendientes de MAP-014 a MAP-030

- Confirmar en el proyecto alojado Auth, URLs, correo, versión PostgreSQL y protección de contraseña.
- Migrar el catálogo de Beta 0.1 sin romper IDs, slugs, coordenadas o URLs existentes.
- Automatizar y auditar la generación del snapshot público.
- Validar abuso de solicitudes, accesibilidad administrativa, rendimiento y recuperación real.
- Evitar filtraciones editoriales de secretos en contenido destinado a publicación.

## Próximo paso

Abrir la pull request de MAP-014, validar CI y completar los puntos manuales mínimos del proyecto Supabase alojado antes de fusionar y cerrar la Issue #33.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Fundación, alcance, arquitectura y acuerdo de trabajo |
| 2026-08-04 | MAP-002 a MAP-011 completadas y Beta 0.1 publicada |
| 2026-08-04 | Alcance de Beta 0.2 acordado |
| 2026-08-04 | Backlog MAP-013 a MAP-030 creado |
| 2026-08-04 | Traducciones y notas privadas registradas como mejoras futuras |
| 2026-08-04 | Backlog de Beta 0.2 añadido y clasificado en GitHub Projects |
| 2026-08-04 | MAP-013 cerró arquitectura, seguridad, entornos, publicación, degradación, migraciones y rollback de Beta 0.2 |
| 2026-08-04 | PR #52 fusionada, Issue #32 cerrada y MAP-014 establecida como trabajo actual |
| 2026-08-05 | MAP-014 añadió Supabase local reproducible, cuatro migraciones, semillas ficticias y 69 pruebas pgTAP correctas |
| 2026-08-05 | Auditorías de credenciales, documentación operativa y validación local de RLS preparadas; CI y proyecto alojado pendientes |
