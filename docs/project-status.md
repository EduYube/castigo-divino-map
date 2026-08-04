# Estado del proyecto

## Resumen

- Proyecto: El Atlas de los Nuevos Dioses.
- Repositorio: `EduYube/castigo-divino-map`.
- Versión publicada: Beta 0.1.
- Próxima versión: Beta 0.2.
- Estado general: alcance acordado y backlog creado; pendiente de clasificación en GitHub Projects.
- URL pública: `https://eduyube.github.io/castigo-divino-map/`.
- Última actualización: 2026-08-04.

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

## Objetivo de Beta 0.2

Añadir persistencia y administración segura sin perder ninguna funcionalidad pública de Beta 0.1.

Decisiones cerradas:

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

Orden recomendado de ejecución:

1. MAP-013 — Definir la arquitectura y seguridad de la Beta 0.2.
2. MAP-014 — Preparar Supabase, migraciones y políticas RLS.
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

- Incorporar MAP-013 a MAP-030 al GitHub Project.
- Crear la opción `Beta 0.2` en el campo `Target`.
- Crear las áreas `Backend`, `Auth` y `Admin`.
- Ejecutar `scripts/configure-beta-0.2-project.sh`.
- Abrir un chat independiente para MAP-013.

## Bloqueos

- La conexión de ChatGPT no permite modificar campos personalizados ni vistas de GitHub Projects.
- Antes de ejecutar el script de clasificación deben existir las nuevas opciones de campo.
- La implementación requerirá crear y configurar un proyecto Supabase, pero esto pertenece a MAP-014.

## Riesgos principales

- Exposición accidental de claves o contenido no publicado.
- Políticas RLS incompletas o inconsistentes.
- Dependencia de Supabase y posible pausa del plan gratuito.
- Migración de IDs, slugs y URLs existentes.
- Concurrencia entre edición administrativa y lectura pública.
- Spam o abuso del formulario de solicitudes.
- Complejidad responsive de las herramientas administrativas.
- Filtración editorial de secretos en contenido destinado a publicación.

## Próximo paso

Clasificar MAP-013 a MAP-030 en el GitHub Project y comenzar MAP-013 en un chat nuevo.

## Últimos cambios

| Fecha | Cambio |
|---|---|
| 2026-08-03 | Fundación, alcance, arquitectura y acuerdo de trabajo |
| 2026-08-04 | MAP-002 a MAP-011 completadas y Beta 0.1 publicada |
| 2026-08-04 | Alcance de Beta 0.2 acordado |
| 2026-08-04 | Backlog MAP-013 a MAP-030 creado |
| 2026-08-04 | Traducciones y notas privadas registradas como mejoras futuras |
