# Mejoras futuras

Este documento registra necesidades deliberadamente pospuestas para evitar que se pierdan al cerrar el alcance de una beta.

## Traducciones y localización

- Añadir nombres en castellano y otros idiomas.
- Buscar una entidad mediante cualquiera de sus traducciones o alias.
- Elegir idioma preferido de la interfaz y de los nombres cartográficos.
- Definir precedencia, revisión editorial y tratamiento de traducciones incompletas.
- Mantener IDs y slugs estables aunque cambie el idioma visible.

Beta 0.2 almacenará el idioma en el modelo, pero cargará e indexará únicamente nombres en inglés.

## Notas privadas del director de juego

- Añadir contenido privado separado del contenido público.
- Definir permisos específicos, auditoría y prevención de filtraciones.
- Impedir que notas privadas lleguen a snapshots públicos, bundles, logs, Issues, PRs o artefactos.
- Diseñar una interfaz que diferencie de forma inequívoca información pública y secreta.
- Probar RLS y flujos de publicación con datos privados.

Esta capacidad no forma parte de Beta 0.2. El login administrativo de Beta 0.2 solo gestionará contenido destinado a publicación pública.

## Autenticación y operación avanzada

- Exigir MFA para administradores cuando el producto o el riesgo lo justifiquen.
- Añadir recuperación administrativa formal, rotación periódica y alertas de acceso.
- Incorporar auditoría inmutable de cambios y trazabilidad editorial por usuario.
- Permitir más de un administrador con roles diferenciados.
- Evaluar controles adicionales de duración, inactividad y revocación de sesiones.

Beta 0.2 comienza con un único administrador, lista blanca explícita, sesión limitada a la pestaña y cierre de sesión local.

## Entornos y despliegues avanzados

- Crear un proyecto Supabase de staging o ramas de preview para colaboración y pruebas remotas.
- Automatizar promoción entre entornos con aprobaciones y comprobaciones de deriva.
- Añadir pruebas de compatibilidad entre versiones simultáneas del frontend y del esquema.
- Adoptar point-in-time recovery o una política de backup superior si el volumen y criticidad lo requieren.

Beta 0.2 usa Supabase local para desarrollo y CI y un único proyecto alojado para producción.

## Protección avanzada contra abuso

- Interponer una Edge Function ante las solicitudes públicas.
- Añadir CAPTCHA o Turnstile, limitación distribuida de tasa y reputación de origen.
- Introducir cuarentena, deduplicación y reglas de moderación automáticas.
- Notificar solicitudes moderadas sin exponer datos del remitente.

Estas medidas se activarán antes del lanzamiento si las pruebas de MAP-029 demuestran que la validación SQL, el honeypot y los límites básicos no son suficientes.

## Posibles ampliaciones posteriores

- Cuentas identificadas para jugadores.
- Historial de versiones y restauración editorial.
- Redirecciones controladas para slugs sustituidos sin romper URLs.
- Notificaciones sobre solicitudes moderadas.
- Sugerencias controladas de categorías o etiquetas en solicitudes.
- Línea temporal, rutas y territorios.
- Importación y exportación de contenido.
