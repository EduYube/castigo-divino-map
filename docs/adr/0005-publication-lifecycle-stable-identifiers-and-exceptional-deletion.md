# ADR 0005 — Mantener un ciclo editorial explícito e identificadores no reutilizables

- Estado: Aceptada
- Fecha: 2026-08-04
- Issue: MAP-013 / #32

## Contexto

La Beta 0.2 debe diferenciar contenido en preparación, visible y retirado. Las URLs y relaciones de Beta 0.1 ya dependen de IDs y slugs estables. El borrado físico habitual podría romper enlaces, reutilizar identidad o dificultar rollback.

También se necesita una vía excepcional para eliminar datos creados por error o purgar una credencial, dato personal o secreto de campaña.

## Decisión

Los estados persistidos son `draft`, `published` y `archived`.

Transiciones válidas:

- `draft -> published`;
- `draft -> archived`;
- `published -> draft`;
- `published -> archived`;
- `archived -> draft`.

No existe `archived -> published`; restaurar obliga a revisión en borrador.

RLS entrega al público solo `published`. El snapshot usa la misma proyección.

El archivado es la eliminación habitual. La eliminación física queda restringida a borradores o solicitudes nunca publicados y sin referencias, importaciones fallidas antes de exposición, o purgas legales/de seguridad.

Los IDs de Beta 0.1 se preservan como texto. Los nuevos IDs no se reutilizan. El slug puede cambiar antes de la primera publicación y queda inmutable después. Una purga de contenido publicado reserva ID y slug mediante tombstone o registro equivalente.

## Consecuencias positivas

- Borradores y contenido retirado permanecen recuperables.
- URLs y relaciones no cambian al editar nombres.
- La publicación y retirada son auditables mediante timestamps.
- El snapshot tiene un criterio inequívoco.
- Existe un procedimiento seguro para incidentes excepcionales.

## Consecuencias negativas

- La base conserva filas archivadas y reservas históricas.
- Cambiar un slug publicado exige alias o redirección futura, no edición directa.
- Las transiciones necesitan restricciones y pruebas adicionales.
- La purga excepcional requiere coordinar base, snapshot, artefactos y documentación.

## Alternativas consideradas

### Booleano `is_public`

Rechazado. No diferencia borrador de archivado y permite combinaciones ambiguas.

### Borrado físico como operación normal

Rechazado por estabilidad de URLs, relaciones y recuperación.

### UUID nuevo para reemplazar todos los IDs existentes

Rechazado. Añade una migración innecesaria y rompe el contrato histórico.

### Permitir cambiar slugs publicados

Rechazado mientras no exista un sistema formal de alias/redirecciones permanentes.

## Condiciones de revisión

- se añade historial editorial completo;
- se incorporan redirecciones de slugs;
- existen obligaciones legales de retención o borrado más estrictas;
- se introduce contenido privado con ciclos distintos;
- el volumen de archivados exige una estrategia de almacenamiento separada.
