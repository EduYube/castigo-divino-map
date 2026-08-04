# Alcance de la Beta 0.2

## Objetivo

Convertir el atlas público de Beta 0.1 en una aplicación persistente y administrable, manteniendo intacta la experiencia pública existente y añadiendo edición segura, búsqueda geográfica y solicitudes moderadas.

La arquitectura vinculante de esta versión vive en `docs/architecture.md`; el modelo conceptual en `docs/data-model.md`; y las fronteras de confianza, amenazas y controles en `docs/security.md`.

## Decisiones cerradas

- Backend: Supabase con PostgreSQL, Auth y Row Level Security.
- Frontend y publicación: Vite + TypeScript + Leaflet sobre GitHub Pages.
- PostgreSQL será la fuente de verdad del contenido persistente y de sus invariantes.
- Solo un administrador autenticado y autorizado por una lista blanca separada tendrá permisos de escritura.
- Los visitantes no necesitarán cuenta y conservarán búsqueda, filtros, selección, fichas, URLs y navegación pública.
- Tipo y disposición son dimensiones independientes.
- Tipos principales: personaje y emplazamiento.
- Disposiciones: aliado, enemigo, neutral y desconocido.
- El contenido podrá estar en `draft`, `published` o `archived`.
- El borrado habitual será archivado; la eliminación física será excepcional, restringida y nunca reutilizará IDs o slugs publicados.
- Beta 0.2 trabajará únicamente con nombres geográficos en inglés.
- Las traducciones se mantienen en el roadmap futuro.
- Las notas privadas del director de juego quedan fuera de Beta 0.2.

## Arquitectura y entornos

- El navegador será siempre un cliente no confiable; ocultar controles no concede permisos.
- RLS, restricciones SQL y funciones controladas serán la barrera definitiva.
- Desarrollo y CI usarán Supabase local mediante CLI y Docker.
- Producción usará un único proyecto Supabase alojado. No se necesita un segundo proyecto alojado mientras el desarrollo sea individual y local; se creará uno de no producción si aparecen previews remotos, colaboración simultánea o pruebas de integración externas.
- Las migraciones SQL vivirán versionadas bajo `supabase/` y se validarán desde cero en CI.
- Los cambios de esquema seguirán una estrategia expand/contract y el rollback del frontend se realizará mediante nuevos commits o `git revert`, nunca reescribiendo `master`.

## Variables, claves y secretos

Pueden aparecer en el frontend y en el bundle:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` con una clave `sb_publishable_...`;
- constantes no sensibles como timeout, versión del snapshot o flags públicos.

Quedan prohibidos en el frontend, repositorio, build, Pages, logs y artefactos:

- `sb_secret_...`;
- `service_role`;
- `SUPABASE_ACCESS_TOKEN`;
- contraseña de PostgreSQL;
- secretos SMTP, OAuth, CAPTCHA u otros proveedores;
- cualquier dato privado o secreto de campaña.

Los secretos operativos existirán únicamente en terminales seguras, configuración de Supabase o un GitHub Environment protegido para producción.

## Administración

El administrador podrá:

- iniciar, restaurar, renovar y cerrar una sesión;
- crear, modificar, archivar y, cuando sea seguro, eliminar categorías, etiquetas y nombres;
- crear, modificar, archivar y publicar personajes y emplazamientos;
- elegir coordenadas pulsando y arrastrando sobre el mapa;
- guardar borradores y previsualizarlos antes de publicar;
- gestionar relaciones entre personajes y emplazamientos;
- revisar solicitudes públicas y convertirlas en borradores.

La cuenta administrativa se creará manualmente, con registro público, usuarios anónimos y proveedores sociales deshabilitados. Estar autenticado no bastará: las políticas comprobarán además la lista blanca administrativa.

Cuando la sesión expire o deje de ser válida, la aplicación volverá al estado público, descartará operaciones administrativas pendientes y exigirá autenticarse de nuevo. Ninguna mutación se reintentará automáticamente tras recuperar la sesión.

## Experiencia pública

La Beta 0.2 añadirá:

- búsqueda de nombres geográficos en inglés, aunque no exista un pin visible;
- centrado, zoom recomendado y resaltado temporal del resultado;
- controles de búsqueda y filtros colapsables;
- dos tipos visuales principales de pin;
- disposición visible mediante color, borde y texto, nunca solo mediante color;
- resolución accesible de pines con coordenadas coincidentes;
- ficha compacta con nombre, tipo, disposición, categoría, etiquetas y personajes importantes;
- ficha completa en una pestaña nueva con toda la información pública;
- solicitudes públicas de nuevos pines.

La compatibilidad de Beta 0.1 incluye el pathname de GitHub Pages, la query string, los IDs, slugs y coordenadas existentes, la semántica de búsqueda y filtros, la navegación histórica, la accesibilidad y la degradación del mapa oficial remoto.

## Solicitudes públicas

El formulario solicitará:

- nombre o apodo del remitente;
- nombre propuesto;
- tipo de pin elegido desde una lista cerrada;
- coordenadas seleccionadas visualmente;
- descripción y motivo.

No permitirá crear ni sugerir categorías o etiquetas y no exigirá código de campaña en Beta 0.2. Una solicitud siempre comenzará como pendiente y nunca se publicará automáticamente.

La inserción pública se realizará mediante una operación controlada que fuerce el estado inicial y no exponga lectura, actualización ni eliminación públicas de solicitudes. La validación del navegador solo mejora la experiencia; la base de datos volverá a validar tipos, longitudes, coordenadas y valores permitidos.

El alcance base incluye honeypot, límites estrictos y limitación local de reenvíos. Antes de publicar se evaluará el abuso real; si no basta, se añadirá una Edge Function con CAPTCHA y limitación de tasa sin ampliar el acceso directo a las tablas.

## Resiliencia

La aplicación mostrará un indicador accesible del estado del backend:

- `connected`: el catálogo remoto completo se ha recibido y validado;
- `degraded`: Supabase responde con error, excede el timeout o devuelve datos inválidos y se usa el snapshot;
- `offline`: el navegador declara ausencia de red y se usa el snapshot.

Una instantánea pública, versionada y validada permitirá conservar el mapa, la búsqueda, los filtros, las fichas y las URLs con el último contenido publicado disponible cuando Supabase no responda.

El snapshot se cargará inmediatamente y la consulta remota se ejecutará en paralelo. Solo un catálogo remoto completamente válido sustituirá de forma atómica el snapshot en memoria. Una caída del backend nunca debe producir una pantalla en blanco y bloqueará todas las operaciones administrativas.

## Seguridad

- Todo contenido entregado al visitante, incluido el snapshot, se considera público.
- Borradores, archivados, solicitudes y datos administrativos estarán protegidos por RLS.
- La clave publicable de Supabase puede estar en el navegador, pero no concede permisos por sí sola.
- Las claves secretas y `service_role` nunca estarán en el navegador, repositorio, build, Pages o artefactos de CI.
- El frontend no será la frontera de seguridad: todas las operaciones se validarán también en PostgreSQL.
- Los textos se representarán como texto, no como HTML confiable; cualquier capacidad futura de marcado requerirá sanitización explícita.
- No se almacenarán notas secretas del director de juego ni secretos de campaña en este alcance.
- El build de Pages se auditará para detectar patrones de credenciales, archivos inesperados, datos no publicados y un snapshot inválido.

## Migración del catálogo de Beta 0.1

- Los IDs, slugs y coordenadas existentes se conservarán exactamente.
- El importador será determinista, repetible en local y rechazará colisiones o referencias inválidas.
- El catálogo estático continuará siendo la referencia de migración hasta que la transición se valide.
- La publicación cambiará a Supabase solo cuando el catálogo remoto y el snapshot generado sean equivalentes al contrato público esperado.
- Los IDs o slugs que hayan sido publicados no se reutilizarán aunque una entidad sea archivada o eliminada excepcionalmente.

## Fuera de alcance de MAP-013

MAP-013 documenta decisiones. No crea todavía proyectos de Supabase, tablas, usuarios, secretos, migraciones ejecutables, login, CRUD, solicitudes, cambios visuales ni despliegues de base de datos. La preparación técnica de Supabase corresponde a MAP-014.

## Backlog

La Beta 0.2 se ejecutará mediante MAP-013 a MAP-030. El orden y las dependencias están registrados en las Issues y en `docs/project-status.md`.
