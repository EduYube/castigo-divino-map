# ADR 0004 — Desarrollar localmente y desplegar migraciones versionadas a producción aislada

- Estado: Aceptada
- Fecha: 2026-08-04
- Issue: MAP-013 / #32

## Contexto

La Beta 0.2 necesita reproducir esquema, Auth, RLS y semillas sin usar producción para pruebas. Supabase ofrece stack local mediante CLI, migraciones SQL y despliegue a proyectos enlazados. También permite proyectos de staging o branching, pero añadir entornos alojados puede aumentar coste y operación.

El proyecto tiene un único desarrollador y administrador. GitHub Pages ya valida builds en CI y no existe actualmente un sistema de previews remotos.

## Decisión

- Desarrollo local y CI usarán Supabase CLI con stack local y semillas ficticias.
- Producción usará un proyecto Supabase alojado dedicado.
- No se requiere un segundo proyecto alojado para Beta 0.2.
- Producción nunca recibirá semillas, pruebas destructivas ni escrituras de preview.
- Si aparece una necesidad de preview remoto o trabajo multiusuario, se creará un proyecto no productivo separado antes de usar ese flujo.

`supabase/config.toml`, `supabase/migrations/` y `supabase/seed.sql` se versionarán. Cada cambio se añade como una migración nueva. Una migración aplicada no se reescribe.

CI recreará la base con `supabase db reset` y ejecutará pruebas de RLS. El despliegue remoto se hará desde un workflow protegido y serializado en `master`, con CLI fijada y secretos de entorno.

El rollback preferido es expand/contract y corrección hacia delante. El frontend se revierte mediante `git revert` y PR. Antes de cambios destructivos se realizará un dump lógico fuera del repositorio. No se presupone acceso a backups gestionados del plan gratuito.

## Consecuencias positivas

- Desarrollo y CI son reproducibles sin tocar producción.
- No introduce un segundo servicio alojado ni coste obligatorio.
- Git conserva el historial del esquema.
- Las políticas se prueban desde cero en cada ejecución.
- El rollback evita reescrituras de `master` y down migrations destructivos automáticos.

## Consecuencias negativas

- El entorno local no reproduce todas las características operativas del hosting.
- No existe preview remoto compartible de base de datos.
- El operador debe realizar dumps lógicos antes de cambios destructivos.
- Una migración compatible con local todavía requiere validación cuidadosa en producción.

## Alternativas consideradas

### Usar producción para desarrollo y preview

Rechazada por riesgo de corrupción, exposición y pruebas destructivas.

### Crear staging alojado obligatorio

Pospuesta. Supabase lo recomienda para flujos de varios entornos, pero el stack local cubre el alcance actual sin añadir operación ni coste.

### Supabase Branching por PR

Pospuesta. No es necesaria para la Beta 0.2 y puede depender del plan.

### Editar esquema desde Dashboard sin migración

Rechazada. Rompe reproducibilidad e historial. Solo se acepta para recuperación documentada y seguida de `db pull`/migración.

### Down migrations automáticos

Rechazada para producción. Pueden destruir datos y agravar una recuperación.

## Condiciones de revisión

- se incorpora otro desarrollador;
- se necesitan previews remotos o pruebas desde dispositivos externos;
- el plan contratado incluye branching y aporta valor claro;
- aumenta la criticidad de datos y se requiere staging obligatorio;
- el volumen exige backups gestionados o PITR.

## Fuentes oficiales

- <https://supabase.com/docs/guides/local-development/overview>
- <https://supabase.com/docs/guides/local-development/cli-workflows>
- <https://supabase.com/docs/guides/deployment/database-migrations>
- <https://supabase.com/docs/guides/deployment/managing-environments>
- <https://supabase.com/docs/guides/deployment/branching>
- <https://supabase.com/docs/guides/platform/backups>
