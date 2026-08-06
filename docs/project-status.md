# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: Beta 0.1.
- Próxima versión: Beta 0.2.
- Estado general: MAP-014 está completada e integrada mediante la PR #56. MAP-015 ha cerrado e implementado el contrato de entidades y relaciones, ha superado la validación local y la CI #146, y sus cuatro migraciones se han aplicado al proyecto Supabase alojado sin semillas. El historial local y remoto coincide en nueve versiones, el lint remoto está limpio y el smoke test transaccional de esquema, RLS, autorización e inmutabilidad terminó con rollback limpio. Quedan la CI del commit documental final, la revisión humana y la fusión de la PR #59.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-06.

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

El historial integrado en `master` contiene:

- Supabase CLI fijada exactamente en `2.111.0`;
- `supabase/config.toml` endurecido para desarrollo local;
- red Docker local vinculada a `127.0.0.1`, con validación del driver `bridge` y del binding exacto antes de reutilizarla;
- cinco migraciones SQL ordenadas e inmutables tras su primera aplicación;
- tablas, restricciones, índices, triggers, funciones y ciclo editorial;
- lista blanca `private.admin_users` y autorización mediante `private.is_admin()`;
- grants por columna y RLS en todas las tablas públicas;
- lectura pública de contenido publicado y escritura administrativa limitada a campos editables;
- timestamps editoriales y autoría de moderación forzados por PostgreSQL;
- bloqueos relacionales que serializan las invariantes estrictas de categoría y etiqueta;
- RPC cerrada para solicitudes públicas;
- semilla determinista con datos y usuarios completamente ficticios;
- 172 aserciones pgTAP de estructura, RLS, privilegios e invariantes;
- 91 intentos de escritura sobre columnas protegidas que exigen SQLSTATE `42501`;
- SQLSTATE y mensajes exactos para reservas, colisiones de nombres públicos, retiradas editoriales, borrado y transiciones terminales;
- seis comprobaciones concurrentes con dos sesiones PostgreSQL en dos escenarios;
- reconstrucción local, lint SQL, pruebas pgTAP y pruebas concurrentes correctos;
- auditoría de credenciales en todos los archivos versionados no binarios y en el artefacto de Pages;
- todas las GitHub Actions de CI y Pages fijadas a SHA completo, con mantenimiento configurado mediante Dependabot;
- documentación operativa en `docs/supabase-operations.md`;
- trabajo CI separado para reconstruir, analizar y probar la base local sin secretos remotos.

CI #138 validó correctamente los trabajos de frontend y base de datos sobre el head definitivo previo a la integración. El proyecto alojado usa PostgreSQL 17.6 y tiene verificados el registro cerrado, la confirmación de correo, los requisitos fuertes de contraseña, las URLs permitidas, la URL de proyecto y una clave publicable.

El checkout se enlazó de forma controlada sin registrar credenciales. Las cuatro migraciones iniciales se aplicaron en orden sin incluir `seed.sql`. Después de la revisión de seguridad, una quinta migración hacia delante se revisó mediante dry run y se aplicó de forma aislada. El historial local y remoto coincidió en las cinco versiones y `supabase db lint --linked --fail-on warning` no encontró errores.

Existe exactamente un usuario administrativo real, creado con contraseña y correo confirmado. Su UUID está incluido en `private.admin_users`; `private.is_admin()` reconoce al usuario autorizado y rechaza un UUID autenticado no incluido en la lista blanca. Una prueba remota transaccional confirmó que los visitantes solo leen contenido publicado, que visitantes y usuarios autenticados no autorizados no pueden escribir ni leer borradores, que el administrador puede escribir y leer contenido editorial, y que el rollback no dejó datos de prueba.

Una segunda prueba remota transaccional confirmó que no quedan privilegios completos de escritura sobre las tablas expuestas, que las columnas gestionadas por el sistema están protegidas, que PostgreSQL fuerza los timestamps editoriales y la identidad y fecha de moderación, que las escrituras administrativas permitidas siguen funcionando, que los bloqueos relacionales están instalados y que el rollback no dejó datos temporales.

## Modelo de entidades preparado en MAP-015

La PR #59 contiene:

- ADR 0006 y contrato TypeScript paralelo para el snapshot público de Beta 0.2;
- cuatro migraciones nuevas de expansión, validación del backfill, contracción y refinamiento, sin modificar las cinco migraciones aplicadas por MAP-014;
- entidades `character` y `location` con visibilidad cartográfica `pin` o `search_only`;
- jugadores normalizados y una matriz completa `entity_player_dispositions` con una relación independiente por entidad y jugador;
- disposiciones cerradas `ally`, `enemy` y `neutral`, sin `unknown` ni disposición global en `map_entities`;
- soporte de disposición para personajes y localizaciones;
- nombres y aliases de entidades en inglés y aliases geográficos normalizados en filas independientes;
- enlace opcional de un nombre geográfico únicamente a una entidad de tipo `location`;
- etiquetas normalizadas para notas públicas;
- rastro cronológico `character_location_events` con avistamientos y salidas, ubicación mediante entidad, nombre geográfico o coordenadas libres y fechas observadas opcionales;
- salidas que pueden referenciar un avistamiento anterior del mismo personaje, pero también existir sin destino o antecedente conocido;
- identidad histórica inmutable después de publicar relaciones y acontecimientos;
- endurecimiento de conversión de solicitudes para exigir una entidad borrador, de tipo coincidente y visible como pin;
- conservación de solicitudes moderadas y unicidad del destino convertido;
- RLS y grants por columna para todas las tablas nuevas;
- semillas deterministas y ficticias, sin nombres ni datos reales de campaña;
- pruebas centradas en invariantes de matriz, visibilidad, aliases, tags, pistas, permisos, moderación e integridad histórica.

La validación local y CI superaron:

- formato, auditoría de credenciales, lint y build;
- 84 pruebas unitarias en 11 archivos;
- 45 pruebas end-to-end y dos smoke tests del build de Pages;
- 137 aserciones pgTAP en seis archivos;
- seis comprobaciones concurrentes en dos escenarios;
- auditoría del artefacto de producción sin copia del mapa ni patrones de credenciales;
- CI #146 correcta en `Build, quality and tests` y `Supabase migrations, lint and RLS tests` sobre el head de implementación.

El despliegue alojado siguió el protocolo acordado:

- checkout limpio y sincronizado con el head validado;
- `migration list --linked` con las cinco migraciones históricas alineadas y únicamente las cuatro de MAP-015 pendientes;
- dry run con exactamente las cuatro migraciones nuevas y sin `seed.sql`;
- dump lógico previo de esquema y datos en una ubicación privada fuera del repositorio;
- autorización humana explícita antes del push real;
- aplicación en orden de las cuatro migraciones sin semillas;
- coincidencia local y remota de las nueve versiones;
- lint remoto sin errores ni advertencias;
- smoke test transaccional correcto para contrato de esquema, lectura anónima, bloqueo de escritura no administrativa, escritura administrativa, inmutabilidad de acontecimientos publicados y rollback sin filas residuales.

Las nueve migraciones aplicadas se consideran inmutables. Cualquier corrección futura deberá añadirse mediante una nueva migración hacia delante.

## Objetivo de Beta 0.2

Añadir persistencia y administración segura sin perder ninguna funcionalidad pública de Beta 0.1.

Decisiones de producto vigentes:

- Supabase con PostgreSQL, Auth y Row Level Security.
- Un único perfil administrativo con permisos de escritura.
- Visitantes sin cuenta y con todas las funciones públicas actuales.
- Entidades de tipo personaje y emplazamiento.
- Visibilidad cartográfica `pin` o `search_only` independiente del tipo de entidad.
- Disposición independiente por jugador: aliado, enemigo o neutral.
- Personajes y localizaciones pueden tener disposiciones distintas para cada jugador.
- Estados de contenido: borrador, publicado y archivado.
- Archivado como eliminación habitual.
- Nombres geográficos únicamente en inglés durante Beta 0.2.
- Nombres geográficos ligeros y entidades completas son conceptos distintos, con enlace opcional cuando representan la misma localización.
- Rastro cronológico público de avistamientos y salidas de personajes.
- Traducciones, propietarios tipados y notas privadas del director de juego pospuestos.
- Solicitudes públicas con lista cerrada de tipos, sin categorías, etiquetas ni código de campaña.
- Indicador visible de estado de Supabase y snapshot público de respaldo.

El alcance completo vive en `docs/beta-0.2-scope.md`. Las capacidades pospuestas viven en `docs/future-improvements.md`.

## Backlog Beta 0.2

MAP-013 a MAP-030 están creadas, añadidas al GitHub Project y clasificadas con `Target: Beta 0.2`.

Orden recomendado de ejecución:

1. MAP-013 — Definir la arquitectura y seguridad de la Beta 0.2. **Completada.**
2. MAP-014 — Preparar Supabase, migraciones y políticas RLS. **Completada.**
3. MAP-015 — Evolucionar el modelo de entidades y relaciones. **En revisión.**
4. MAP-016 — Implementar acceso público resiliente y estado del backend. **Siguiente tras integrar MAP-015.**
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

- Completar la CI del commit documental final de MAP-015.
- Revisar el diff definitivo de la PR #59 y confirmar que no existen conversaciones pendientes.
- Mantener inmutables las nueve migraciones aplicadas.
- No ejecutar `seed.sql` contra producción.
- Mantener la interfaz pública de Beta 0.1 sin cambios hasta la transición planificada en MAP-028.
- No fusionar la PR sin un punto de control humano explícito.

## Acciones manuales para MAP-014

Completadas:

- Docker Desktop disponible para desarrollo local.
- Supabase CLI `2.111.0` instalada como dependencia fijada del proyecto.
- Stack local inicializado, reconstruido y probado desde cero.
- CI #138 de frontend y base de datos correcta tras el hardening y la revisión final.
- Proyecto Supabase alojado creado con PostgreSQL 17.6.
- Registro público, acceso anónimo y enlace manual deshabilitados.
- Proveedor de correo, confirmación de correo y cambio seguro de correo habilitados.
- Longitud mínima de contraseña 12 y requisito fuerte de caracteres configurados.
- Site URL y cinco Redirect URLs verificadas.
- URL de proyecto y clave `sb_publishable_...` disponibles sin exponer sus valores.
- Checkout enlazado al proyecto alojado sin registrar credenciales.
- Historial remoto y dry run revisados antes de cada aplicación de cambios.
- Cuatro migraciones iniciales aplicadas en orden sin incluir `seed.sql`.
- Quinta migración de hardening revisada mediante dry run y aplicada de forma aislada sin semillas.
- Historial local y remoto coincidentes en las cinco migraciones y lint remoto sin errores.
- Único usuario administrativo creado con contraseña y correo confirmado.
- Usuario administrativo añadido a `private.admin_users` sin usar metadatos de autorización.
- Autorización positiva y negativa de `private.is_admin()` verificada en remoto.
- Lectura pública, bloqueo de escritura, acceso administrativo y rollback limpio verificados en remoto.
- Privilegios por columna, timestamps de sistema, autoría de moderación, escrituras administrativas permitidas, bloqueos relacionales y rollback limpio verificados en remoto.
- PR #56 fusionada mediante merge commit tras revisión y autorización humanas.
- Issue #33 cerrada como completada.

## Acciones manuales para MAP-015

Completadas:

- CI #146 correcta sobre el head de implementación.
- Checkout limpio y sincronizado antes del preflight alojado.
- Historial local y remoto comparado antes del despliegue.
- Dry run revisado con exactamente cuatro migraciones pendientes y sin semillas.
- Dump lógico privado de esquema y datos creado antes de la fase de contracción.
- Aplicación de las cuatro migraciones autorizada explícitamente por una persona.
- Cuatro migraciones aplicadas en orden sin ejecutar `seed.sql`.
- Nueve versiones locales y remotas alineadas.
- Lint remoto correcto sin advertencias.
- Smoke test alojado correcto para esquema, lectura pública, RLS, autorización, inmutabilidad histórica y rollback limpio.

Diferidas hasta que exista una operación que las requiera:

- Crear un GitHub Environment protegido `supabase-production` y guardar allí `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` cuando exista un workflow de migración remota.

Ninguna clave privilegiada debe copiarse al frontend, variables `VITE_*`, repositorio, Issues, PRs, logs o artefactos. Los dumps privados no deben adjuntarse ni copiarse a GitHub.

## Bloqueos

MAP-015 no tiene bloqueos técnicos conocidos. Permanecen pendientes únicamente:

- CI de GitHub sobre el commit documental final;
- revisión humana del diff definitivo;
- autorización explícita para fusionar la PR #59.

## Riesgos aceptados

- GitHub Pages, Supabase y la imagen cartográfica remota no ofrecen un SLA propio del proyecto.
- Un único proyecto Supabase alojado reduce coste y complejidad, pero exige disciplina para no probar contra producción.
- El snapshot puede quedar temporalmente por detrás del catálogo publicado hasta el siguiente build validado.
- La sesión administrativa limitada a la pestaña reduce persistencia y exige volver a autenticarse al cerrar el navegador.
- La protección básica de solicitudes puede requerir Edge Function, CAPTCHA y limitación distribuida antes del lanzamiento.
- En planes sin recuperación avanzada, el rollback de migraciones destructivas depende de dumps operativos y correcciones hacia delante.
- La protección contra contraseñas filtradas no está disponible en el plan actual; se mantienen longitud 12 y requisitos fuertes de caracteres.
- Docker Engine anterior a 28 puede permitir acceso desde el mismo segmento de red a puertos publicados en localhost; se recomienda Docker Engine 28 o posterior en redes no confiables.

## Riesgos pendientes de MAP-016 a MAP-030

- Migrar el catálogo de Beta 0.1 sin romper IDs, slugs, coordenadas o URLs existentes.
- Resolver en MAP-022 la representación visual cuando una entidad tenga disposiciones distintas para dos jugadores, sin colapsarlas en un único color ambiguo.
- Automatizar y auditar la generación del snapshot público.
- Validar abuso de solicitudes, accesibilidad administrativa, rendimiento y recuperación real.
- Evitar filtraciones editoriales de secretos en contenido destinado a publicación.

## Próximo paso

Esperar la CI del commit documental final, revisar el diff definitivo y las conversaciones de la PR #59, marcarla como lista para revisión y solicitar un punto de control humano explícito antes de fusionar. MAP-016 comenzará únicamente después de integrar MAP-015.

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
| 2026-08-05 | Las cuatro migraciones iniciales se desplegaron sin semillas; el historial remoto, el lint, la lista blanca administrativa, RLS y el rollback remoto quedaron validados |
| 2026-08-05 | La revisión de seguridad añadió una quinta migración, grants por columna, timestamps y moderación forzados, bloqueos relacionales, auditoría ampliada, validación de red y Actions inmutables |
| 2026-08-05 | La quinta migración se desplegó sin semillas y el hardening remoto quedó validado con rollback limpio |
| 2026-08-05 | CI #138 validó 172 aserciones pgTAP, seis comprobaciones concurrentes, errores críticos exactos y Actions de CI y Pages fijadas a SHA completo |
| 2026-08-05 | PR #56 fusionada mediante merge commit, Issue #33 cerrada y MAP-015 establecida como siguiente trabajo |
| 2026-08-06 | MAP-015 cerró el contrato de entidades, disposiciones por jugador, visibilidad, aliases, tags y rastro cronológico de personajes |
| 2026-08-06 | Cuatro migraciones hacia delante, contratos TypeScript, semillas ficticias y pruebas de integridad quedaron validados localmente; CI #146 validó frontend y base de datos |
| 2026-08-06 | Se creó un dump lógico privado, se aplicaron las cuatro migraciones sin semillas y las nueve versiones quedaron alineadas con lint remoto correcto |
| 2026-08-06 | El smoke test alojado validó esquema, lectura anónima, RLS, autorización, inmutabilidad de acontecimientos publicados y rollback sin residuos |