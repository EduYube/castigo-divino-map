# ADR 0003 — Publicar un snapshot versionado y degradar sin pantalla en blanco

- Estado: Aceptada
- Fecha: 2026-08-04
- Issue: MAP-013 / #32

## Contexto

La Beta 0.1 funciona sin backend. Introducir Supabase no debe convertir una pausa, timeout, error de red o respuesta inválida en una pantalla en blanco. El mapa, la búsqueda, los filtros, las fichas y las URLs públicas deben seguir disponibles con el último contenido publicado conocido.

Consultar Supabase antes de renderizar retrasaría el inicio y crearía una dependencia dura. Conservar una copia sin validar podría filtrar borradores o romper referencias.

## Decisión

El build incluirá un archivo JSON público, versionado y revisado en Git, generado exclusivamente desde contenido `published`.

Al arrancar:

1. se carga y valida el snapshot;
2. se renderiza el atlas sin esperar a Supabase;
3. se consulta el catálogo remoto en paralelo;
4. la petición se aborta a los 5 segundos;
5. solo un catálogo remoto completo y válido reemplaza atómicamente el snapshot en memoria.

Los estados visibles son:

- `connected`: catálogo remoto válido;
- `degraded`: Supabase falla o es lento y se usa snapshot;
- `offline`: el navegador informa ausencia de conexión y se usa snapshot.

Si el snapshot también falla, el shell, mapa neutro, aviso legal y error recuperable continúan visibles.

El snapshot contiene versión de esquema, fecha, revisión, checksum y proyección pública normalizada. CI valida que no incluya estados no publicados, solicitudes, datos administrativos, secretos ni referencias rotas.

Las mutaciones administrativas se bloquean en `degraded` y `offline`. No se implementa edición offline sincronizable.

## Consecuencias positivas

- El atlas carga aun cuando Supabase está pausado o inaccesible.
- El primer render no depende de latencia remota.
- El snapshot se revisa mediante diff y se valida en CI.
- La respuesta remota inválida no contamina el estado existente.
- La recuperación conserva búsqueda, filtros y URL cuando los identificadores siguen presentes.

## Consecuencias negativas

- El snapshot puede quedar desactualizado respecto a producción.
- Cada cambio publicado necesita regenerar y revisar la copia de respaldo.
- Dos fuentes requieren un contrato y validador compartidos.
- El repositorio contendrá una copia de todo dato público, por lo que no puede usarse para información privada.

## Alternativas consideradas

### Esperar siempre a Supabase

Rechazada por disponibilidad, latencia y riesgo de pantalla en blanco.

### Cachear solo en `localStorage`

Rechazada porque un visitante nuevo no tendría copia y el cache puede quedar corrupto o manipulado.

### Generar el snapshot durante cada build desde producción

Rechazada como única estrategia: haría que CI y Pages dependieran de la disponibilidad de Supabase y exigiría una decisión sobre credenciales durante el build.

### Mezclar filas remotas parciales con el snapshot

Rechazada. Puede producir referencias inconsistentes y estados difíciles de explicar.

## Condiciones de revisión

- el catálogo supera un tamaño que haga inviable incluirlo en Pages;
- se introduce contenido privado;
- existe un CDN o backend con una estrategia de cache verificable;
- se necesita edición offline o sincronización de conflictos;
- los requisitos de frescura impiden aceptar el último snapshot revisado.
