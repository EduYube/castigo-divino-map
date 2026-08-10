# MAP-044 — Audiencia exclusiva del Máster

## Estado

Implementación en `agent/map-044-master-audience` para la issue #119.

Este documento es el contrato de seguridad y arquitectura de MAP-044. La funcionalidad amplía el dominio de entidades con una dimensión de audiencia independiente de:

- `entity_type = character | location`;
- `visibility = pin | search_only`;
- `publication_status = draft | published | archived`.

La audiencia será:

- `public`: contenido apto para jugadores y visitantes;
- `master`: contenido privado visible únicamente para una sesión administrativa autorizada y solo cuando Modo Máster esté activo en la experiencia del mapa.

Los registros históricos migran determinísticamente a `public`.

## Threat model

Ocultar un pin en DOM/CSS no protege contenido privado. La frontera autoritativa sigue siendo PostgreSQL/RLS.

Para una identidad no administradora —incluidos `anon` y un usuario autenticado fuera de `private.admin_users`— una entidad `master` debe comportarse como inexistente en todas las superficies públicas. No debe poder inferirse mediante:

- lectura directa de `map_entities`;
- aliases, tags, disposiciones, notas o relaciones;
- nombres geográficos enlazados y sus aliases;
- relaciones personaje–emplazamiento;
- eventos/localizaciones;
- búsqueda, autocompletado, filtros o conteos;
- fichas y URLs públicas;
- snapshot, JSON, HTML, JavaScript, source maps o cualquier artifact de Pages.

La UI nunca concede acceso. `private.is_admin()` y las policies existentes continúan siendo la única fuente de verdad de autorización administrativa.

### Límite de re-privatización

`public → master` es una **revocación de futuras entregas públicas**, no una capacidad criptográfica de borrar información ya publicada. Una entidad que anteriormente fue pública puede existir en:

- una pestaña que ya la cargó;
- un snapshot público antiguo;
- una cache de sesión antigua;
- una copia descargada, capturada o almacenada fuera del control del Atlas.

RLS impide nuevas lecturas desde Supabase después de la transición, pero no puede retirar bytes que ya se entregaron. Por tanto:

- el cliente administrativo que efectúa `public → master` instala inmediatamente una lista de revocación **solo en memoria** y la aplica también sobre cualquier fallback público antiguo, de modo que esa misma sesión no reinyecte la entidad si el refresh remoto falla;
- esa lista no se persiste como catálogo privado ni pretende revocar otros clientes;
- no se debe presentar una entidad previamente pública como un secreto fuerte hasta regenerar y desplegar un snapshot público que ya no la incluya;
- incluso después del despliegue, las copias históricas entregadas previamente siguen siendo irrecuperables;
- para confidencialidad fuerte debe crearse una entidad/identidad nueva cuyo contenido secreto nunca haya sido público, en lugar de reutilizar como secreto el mismo ID y contenido histórico.

## Modelo y migración

Se añadirá un enum de base de datos `public.entity_audience` con valores `public` y `master` y una columna `map_entities.audience NOT NULL DEFAULT 'public'`.

La migración será únicamente hacia delante y conservará las migraciones aplicadas existentes. El default explícito garantiza que todas las filas históricas mantienen la visibilidad actual.

El contrato administrativo TypeScript representará la audiencia. El contrato `PublicCatalogSnapshotV2` seguirá siendo estrictamente público: no transportará contenido Máster ni se convertirá en un catálogo mixto.

## RLS y filtrado transitivo

Las policies públicas deberán exigir `audience = 'public'` al leer una entidad y al atravesar relaciones que puedan revelar su identidad. Como mínimo se revisarán y probarán:

- `map_entities`;
- `entity_aliases`;
- `entity_tags`;
- `entity_player_dispositions`;
- `public_notes`;
- `public_note_tags`;
- `geographic_names` y `geographic_name_aliases` cuando estén enlazados a una entidad;
- `character_location_relations`;
- `character_location_events`.

Las proyecciones públicas se conceden tanto a `anon` como a `authenticated`; un usuario autenticado no-admin mantiene el mismo catálogo público que un visitante, pero ninguna fila Máster. Las policies administrativas continúan exigiendo `private.is_admin()`.

La columna `audience` solo tendrá permisos de escritura para `authenticated` bajo esa RLS; un usuario autenticado no-admin seguirá sin poder modificarla.

Las RPC administrativas de edición deben conservar `SECURITY INVOKER`, `search_path = ''`, comprobación explícita mediante el mecanismo administrativo existente y ACL sin `anon`/`PUBLIC`.

## Catálogo público y snapshot

El lector público seguirá usando exclusivamente la clave publicable y la proyección protegida por RLS. No recibirá un JWT administrativo aunque la pestaña tenga una sesión admin.

El generador/verificador de snapshot utiliza esa misma frontera pública. Se añadirá una prueba canaria que falle si una entidad `master` o cualquiera de sus datos dependientes entra en la instantánea o en el artifact de Pages.

No habrá snapshot privado, fallback privado, `localStorage` ni IndexedDB para contenido Máster. El fallback público puede ser antiguo; por eso una transición `public → master` aplica la revocación efímera descrita arriba antes de renderizar cualquier resultado de Supabase, cache de sesión o snapshot bundled.

## Catálogo administrativo efímero

Modo Máster usará una lectura administrativa separada con el JWT vigente. Su resultado vivirá únicamente en memoria y nunca sustituirá la fuente pública.

Al activarse Modo Máster:

1. se valida que `AdminAuthController` permanezca en estado `authorized`;
2. se carga el contenido `master` autorizado;
3. se combina exclusivamente en memoria con el catálogo público para mapa, búsqueda y fichas;
4. el contenido privado se identifica visual y textualmente como Máster.

Al desactivarse, cerrar sesión, expirar/revocar la sesión o recibir `401/403`:

- Modo Máster pasa a OFF;
- se elimina el catálogo privado en memoria;
- desaparecen marcadores, resultados, conteos y ficha privada activa;
- historial/Back/Forward no puede restaurar la selección privada;
- no queda un identificador privado serializado en una URL pública.

Modo Máster comienza siempre OFF en una nueva carga aunque exista una sesión admin restaurada.

## Visual y accesibilidad

Un pin Máster conservará su tipo funcional, pero añadirá una representación secreta inequívoca que no dependa únicamente del color. Debe diferenciarse de personaje/emplazamiento público, selección, atenuación, agrupación, highlight geográfico y marcador temporal de solicitud.

El nombre accesible expresará tipo y audiencia, por ejemplo: `Xanathar oculto. Personaje. Contenido del Máster.`

La implementación conservará teclado, foco visible, objetivos táctiles, `prefers-reduced-motion`, `forced-colors` y responsive.

## Pines coincidentes

Fuera de Modo Máster, agrupación y conteos se calculan solo con pines públicos. La existencia de un pin privado nunca debe cambiar un contador público.

En Modo Máster, el admin puede ver el conjunto autorizado completo y el selector de coincidentes identificará qué entradas son Máster.

## Búsqueda y fichas

Con Modo Máster OFF, incluso para un admin autenticado, búsqueda/autocompletado se comportan exactamente como la experiencia pública.

Con Modo Máster ON se añade un índice privado efímero y se marca cada resultado privado como `Máster`.

La ficha de un pin Máster solo se puede abrir dentro de un contexto autorizado con Modo Máster activo.

Además, la ampliación de alcance de #119 exige que un admin autorizado pueda cambiar `public ↔ master` directamente desde cualquier ficha. Esa acción reutilizará la misma operación administrativa/RLS que el editor general. No se creará un endpoint con autorización más débil.

Ambas transiciones requieren confirmación explícita:

- `public → master`: advierte que la entidad dejará de salir de nuevas consultas públicas, se revocará de inmediato en la sesión administrativa incluso sobre fallbacks antiguos y saldrá del próximo snapshot, pero que una publicación anterior no puede convertirse retroactivamente en secreto;
- `master → public`: advierte que una entidad publicada podrá volver a ser visible/buscable y entrar en el siguiente snapshot.

No habrá cambio optimista irreversible. Solo después de persistir correctamente se actualizará el runtime desde el cambio publicado por `AdminMapEntityController`. Ese evento es la única fuente de refresco para evitar dobles lecturas/races entre ficha y editor general. Cancelar o fallar mantiene la audiencia original.

## Solicitudes públicas

El formulario público mantiene únicamente `character | location` y no expone audiencia. La RPC pública no aceptará `audience`; una solicitud convertida crea una entidad `public` por default. Solo después un admin puede cambiar la audiencia mediante el editor autorizado.

## Pruebas obligatorias

La cobertura incluirá:

- migración y default histórico `public`;
- pgTAP negativa para `anon` y auth no-admin sobre entidad Máster y todas sus relaciones relevantes;
- pgTAP positiva para admin, incluida transición de audiencia y pérdida de autorización;
- pgTAP que demuestre que auth no-admin conserva las relaciones públicas mientras las relaciones Máster permanecen ocultas;
- public request manipulada sin posibilidad de escalar a Máster;
- codec/modelo/default administrativo;
- visual Máster distinto por forma/símbolo y accesible;
- merge efímero y purga al OFF/logout/401/403;
- revocación `public → master` sobre resultados públicos remotos, cache de sesión y snapshot bundled dentro del runtime que efectúa el cambio;
- búsqueda pública vs administrativa;
- agrupación coincidente sin filtración de conteos;
- snapshot y artifact canario sin contenido privado;
- E2E visitante, admin OFF, admin ON, logout/revocación y responsive/accesibilidad;
- E2E de cambio de audiencia desde ficha, cancelación, fallo recuperable y paridad con editor.

## Checkpoint humano obligatorio

MAP-044 cambia una frontera real de autorización. La migración modifica esquema, grants, policies RLS y RPCs administrativas. Antes del merge final se entregará a EduYube:

- diff completo de schema/RLS/functions/grants;
- riesgo y razonamiento de cada cambio;
- estrategia de migración y rollback;
- evidencia de pgTAP/RLS, unit, E2E y auditoría de artifacts;
- SHA exacto del candidato y CI completamente verde.

La PR permanecerá sin fusionar hasta recibir aprobación humana explícita. Después de esa aprobación se completarán merge, CI de `master`, Pages, `snapshot:verify:remote`, deployment y smoke publicado.
