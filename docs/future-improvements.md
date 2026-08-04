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

## Posibles ampliaciones posteriores

- Cuentas identificadas para jugadores.
- Historial de versiones y restauración editorial.
- Auditoría de cambios administrativos.
- Notificaciones sobre solicitudes moderadas.
- Sugerencias controladas de categorías o etiquetas en solicitudes.
- Línea temporal, rutas y territorios.
- Importación y exportación de contenido.
