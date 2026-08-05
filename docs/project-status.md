# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: Beta 0.1.
- Próxima versión: Beta 0.2.
- Estado general: MAP-014 dispone de una base Supabase reproducible y probada localmente, en CI y en el proyecto alojado; las cuatro migraciones están desplegadas, RLS está validada y el único administrador está autorizado mediante lista blanca. Quedan la revisión final de la PR y el punto de control humano previo a integrar.
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
- cuatro migraciones SQL ordenadas e inmutables tras su primera aplicación;
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

CI #96 y CI #97 validaron correctamente los trabajos de frontend y base de datos. El proyecto alojado usa PostgreSQL 17.6 y tiene verificados el registro cerrado, la confirmación de correo, los requisitos fuertes de contraseña, las URLs permitidas, la URL de proyecto y una clave publicable.

El checkout se enlazó de forma controlada sin registrar credenciales. El historial remoto estaba inicialmente vacío y el dry run propuso exactamente las cuatro migraciones esperadas. Las cuatro migraciones se aplicaron en orden sin incluir `seed.sql`; después, el historial local y remoto coincidió y `supabase db lint --linked --fail-on warning` no encontró errores.

Existe exactamente un usuario administrativo real, creado con contraseña y correo confirmado. Su UUID está incluido en `private.admin_users`; `private.is_admin()` reconoce al usuario autorizado y rechaza un UUID autenticado no incluido en la lista blanca. Una prueba remota transaccional confirmó que los visitantes solo leen contenido publicado, que visitantes y usuarios autenticados no autorizados no pueden escribir ni leer borradores, que el administrador puede escribir y leer contenido editorial, y que el rollback no dejó datos de prueba.

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
2. MAP-014 — Preparar Supabase, migraciones y políticas RLS. **En validación final.**
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

- Validar CI sobre el commit que registra el despliegue y las pruebas alojadas.
- Actualizar la PR #56 y la Issue #33 con los resultados finales y los criterios de aceptación cumplidos.
- Revisar el diff completo y comprobar que no existen conversaciones de revisión pendientes.
- Marcar la PR como lista para revisión únicamente después de esas comprobaciones.
- Solicitar un punto de control humano explícito antes de fusionar.

## Acciones manuales para MAP-014

Completadas:

- Docker Desktop disponible para desarrollo local.
- Supabase CLI `2.111.0` instalada como dependencia fijada del proyecto.
- Stack local inicializado, reconstruido y probado desde cero.
- CI #96 y CI #97 correctas en frontend y base de datos.
- Proyecto Supabase alojado creado con PostgreSQL 17.6.
- Registro público, acceso anónimo y enlace manual deshabilitados.
- Proveedor de correo, confirmación de correo y cambio seguro de correo habilitados.
- Longitud mínima de contraseña 12 y requisito fuerte de caracteres configurados.
- Site URL y cinco Redirect URLs verificadas.
- URL de proyecto y clave `sb_publishable_...` disponibles sin exponer sus valores.
- Checkout enlazado al proyecto alojado sin registrar credenciales.
- Historial remoto y dry run revisados antes de aplicar cambios.
- Cuatro migraciones aplicadas en orden sin incluir `seed.sql`.
- Historial local y remoto coincidentes y lint remoto sin errores.
- Único usuario administrativo creado con contraseña y correo confirmado.
- Usuario administrativo añadido a `private.admin_users` sin usar metadatos de autorización.
- Autorización positiva y negativa de `private.is_admin()` verificada en remoto.
- Lectura pública, bloqueo de escritura, acceso administrativo y rollback limpio verificados en remoto.

Diferidas hasta que exista una operación que las requiera:

- Crear un GitHub Environment protegido `supabase-production` y guardar allí `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` cuando exista un workflow de migración remota.
- Ejecutar y custodiar fuera del repositorio un dump lógico antes del primer cambio destructivo real.

Ninguna clave privilegiada debe copiarse al frontend, variables `VITE_*`, repositorio, Issues, PRs, logs o artefactos.

## Bloqueos

No hay bloqueos técnicos conocidos para completar MAP-014. La integración permanece detenida hasta terminar la revisión de la PR y recibir aprobación humana explícita para fusionar.

## Riesgos aceptados

- GitHub Pages, Supabase y la imagen cartográfica remota no ofrecen un SLA propio del proyecto.
- Un único proyecto Supabase alojado reduce coste y complejidad, pero exige disciplina para no probar contra producción.
- El snapshot puede quedar temporalmente por detrás del catálogo publicado hasta el siguiente build validado.
- La sesión administrativa limitada a la pestaña reduce persistencia y exige volver a autenticarse al cerrar el navegador.
- La protección básica de solicitudes puede requerir Edge Function, CAPTCHA y limitación distribuida antes del lanzamiento.
- En planes sin recuperación avanzada, el rollback de migraciones destructivas depende de dumps operativos y correcciones hacia delante.
- La protección contra contraseñas filtradas no está disponible en el plan actual; se mantienen longitud 12 y requisitos fuertes de caracteres.

## Riesgos pendientes de MAP-014 a MAP-030

- Migrar el catálogo de Beta 0.1 sin romper IDs, slugs, coordenadas o URLs existentes.
- Automatizar y auditar la generación del snapshot público.
- Validar abuso de solicitudes, accesibilidad administrativa, rendimiento y recuperación real.
- Evitar filtraciones editoriales de secretos en contenido destinado a publicación.

## Próximo paso

Validar CI sobre este registro final, actualizar la PR y la Issue, revisar el diff y preparar el punto de control humano previo a fusionar MAP-014.

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
| 2026-08-05 | Auditorías de credenciales, documentación operativa y validación local de RLS preparadas |
| 2026-08-05 | CI #96 y CI #97 pasaron en frontend y base de datos; PostgreSQL 17.6 y la configuración alojada de Auth y URLs quedaron validados |
| 2026-08-05 | Las cuatro migraciones se desplegaron sin semillas; el historial remoto, el lint, la lista blanca administrativa, RLS y el rollback remoto quedaron validados |
