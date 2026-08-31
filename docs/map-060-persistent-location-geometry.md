# MAP-060 — Geometría persistente de emplazamientos

## Objetivo y alcance

MAP-060 separa la naturaleza de una entidad de su representación cartográfica. `map_entities.entity_type` continúa siendo `character | location`, mientras que `map_entities.geometry` introduce el contrato cartográfico persistente `point | polygon`.

Esta issue prepara el dominio y la persistencia para MAP-061. No incorpora un editor visual de polígonos ni el render público de áreas. Tampoco introduce líneas, rutas, multipolígonos, huecos, PostGIS ni geometría geográfica terrestre.

## Contrato de geometría

La geometría canónica se almacena como `jsonb` no nulo en `map_entities.geometry`.

### Punto

```json
{
  "kind": "point",
  "coordinates": { "x": 1690, "y": 1020 }
}
```

Un punto exige X e Y numéricas y finitas dentro del raster: X entre `0` y `3600`, Y entre `0` y `2329`.

### Polígono

```json
{
  "kind": "polygon",
  "vertices": [
    { "x": 1680, "y": 1010 },
    { "x": 1700, "y": 1010 },
    { "x": 1700, "y": 1030 },
    { "x": 1680, "y": 1030 }
  ]
}
```

Un polígono:

- solo es válido para `location`;
- contiene entre 3 y 64 vértices;
- exige X e Y numéricas y finitas en cada vértice;
- no admite vértices repetidos;
- debe tener área distinta de cero;
- no puede autointersectarse ni solapar/tocar mediante aristas no adyacentes;
- se persiste con orientación y rotación canónicas para que formas equivalentes produzcan la misma serialización.

Los personajes siguen siendo obligatoriamente puntuales. PostgreSQL rechaza geometrías incompatibles o malformadas con SQLSTATE `23514`; la validación TypeScript solo proporciona feedback temprano y no sustituye la validación backend.

## Punto representativo y compatibilidad

`map_entities.x` y `map_entities.y` se conservan como proyección compatible con consumidores anteriores:

- para `point`, coinciden exactamente con `geometry.coordinates`;
- para `polygon`, se derivan de forma determinista como el centro del bounding box de los vértices.

La geometría es la fuente de verdad. Un polígono no tiene una segunda posición editable: cambiar `x/y` sin cambiar la geometría se rechaza. El punto representativo permite conservar centrado, foco, selección, URLs históricas y consumidores que todavía requieren una coordenada única.

La migración inicial convierte cada entidad v1.0 existente en un `point` construido con sus X/Y actuales. No recrea filas ni cambia ID, slug, categoría, tags, notas, relaciones, audiencia, estado o URL. El backfill desactiva temporalmente el trigger editorial de `updated_at` para que esta transformación mecánica no invalide tokens de concurrencia ni reescriba historia editorial.

## Editor administrativo y RPC

El frontend administrativo usa las versiones geometry-aware:

- `admin_get_map_entity_editor_v6(p_campaign_id, p_entity_id)`;
- `admin_save_map_entity_v6(...)`;
- `admin_get_master_catalog_v5(p_campaign_id)` para Modo Máster.

Las versiones anteriores permanecen disponibles como base de compatibilidad para clientes puntuales. El interceptor administrativo reescribe las rutas legacy al contrato vigente y sustituye cualquier `p_campaign_id` manipulable por la campaña seleccionada.

`admin_save_map_entity_v6` recibe una geometría completa, la normaliza en PostgreSQL, deriva X/Y y conserva el guardado atómico ya existente de entidad, tags, disposiciones y asociaciones de jugadores. Cambiar una misma `location` de `point` a `polygon` o de `polygon` a `point` preserva su identidad y sus relaciones.

La concurrencia mantiene el orden único por entidad:

1. advisory transaction lock `admin-map-entity:<id>`;
2. locks de fila necesarios;
3. revalidación de `updated_at` y `relations_revision`;
4. escritura.

MAP-060 endurece también `admin_save_map_entity_v5` para usar ese mismo orden antes de cualquier row lock. Así v4, v5 y v6 no forman el ciclo `row -> advisory` frente a `advisory -> row`. La CI incluye una regresión v5-first que reproduce el interleaving previamente peligroso y exige conflicto de stale-write, nunca deadlock.

## Campañas y seguridad

La geometría pertenece a la propia fila `map_entities`, por lo que queda ligada al mismo `campaign_id` y a las foreign keys/policies multicampaña introducidas por MAP-053. Los RPC de edición exigen la campaña seleccionada y rechazan una entidad que no pertenezca a ella.

Las funciones públicas nuevas son `SECURITY INVOKER` y fijan `search_path = ''`. `anon` y `public` no reciben `EXECUTE`; `authenticated` puede invocarlas, pero la operación administrativa exige además `current_user_is_admin()` y continúa sometida a RLS.

Como el RPC de guardado es `SECURITY INVOKER`, `authenticated` necesita el privilegio de columna `UPDATE(geometry)` para efectuar la escritura autorizada. MAP-060 concede únicamente esa capacidad de columna, no `UPDATE` irrestricto de tabla. RLS sigue siendo la frontera de fila y una escritura directa de geometría por un usuario autenticado no administrador afecta cero filas. `anon` no recibe el privilegio.

Las funciones auxiliares de normalización viven en `private`. El trigger de integridad de geometría no constituye una API de cliente; sus permisos y `search_path` están cerrados explícitamente.

La geometría Máster se considera información sensible conforme a MAP-044: un usuario autenticado no administrador no puede leerla mediante editor v6 ni catálogo Máster v5, y tampoco puede guardarla mediante v6. Estas denegaciones se prueban directamente con SQLSTATE `42501`.

## Proyección pública y snapshot

La consulta pública incorpora `geometry` junto a X/Y. Las políticas existentes siguen decidiendo qué filas son visibles: una geometría de una entidad Máster, draft o archivada no se hace pública por existir la columna.

El codec público aplica estas reglas:

- una `location` pública puntual sigue representándose mediante sus `coordinates`; los snapshots históricos sin campo `geometry` se interpretan como puntos y no se reescriben con campos sintéticos;
- una `location` pública poligonal serializa `geometry` explícitamente;
- el polígono debe estar en formato canónico y su punto representativo debe coincidir con `coordinates`;
- `character + polygon` se rechaza;
- cuando `geometry` está presente forma parte del contenido canónico y, por tanto, del checksum del snapshot.

No se regenera `public/data/public-catalog.snapshot.json` únicamente por introducir el esquema: si la base real no ha cambiado y todas las entidades públicas existentes siguen siendo puntos, el snapshot versionado anterior continúa siendo válido. Cuando una mutación real publique un polígono, debe regenerarse el snapshot desde la fuente persistente aprobada y pasar `snapshot:verify`/`snapshot:verify:remote` conforme al procedimiento de despliegue existente.

Modo Máster usa exclusivamente `admin_get_master_catalog_v5` con el JWT administrativo. La generación del snapshot público nunca llama a esa RPC y no debe contener geometría de audiencia `master`.

## Búsqueda, filtros y marcadores

La geometría no crea nuevas identidades de búsqueda ni filtros:

- una entidad poligonal produce un único resultado;
- categorías y tags cuentan la entidad una sola vez;
- los vértices y sus números no se indexan como texto;
- el centro representativo permite mantener foco y navegación.

MAP-060 no convierte un polígono en varios pines. Hasta MAP-061, una `location` poligonal queda fuera del pipeline de marcadores/clustering de MAP-059 y tampoco se resucita su pin legacy.

## Migraciones

MAP-060 se aplica mediante migraciones forward-only, en este orden:

1. `20260830180000_add_persistent_location_geometry.sql`: columna, backfill, normalización, trigger, constraints y RPC geometry-aware;
2. `20260830180500_harden_map_geometry_null_coordinates.sql`: rechazo explícito de coordenadas ausentes/null;
3. `20260830181000_harden_map060_v5_lock_order.sql`: orden de locks compatible entre v5 y v6;
4. `20260830181500_grant_map060_geometry_update.sql`: privilegio mínimo `UPDATE(geometry)` para el RPC `SECURITY INVOKER`.

Las migraciones aplicadas no se editan ni se revierten destruyendo datos. Ante un defecto de esquema se añade una migración correctiva forward-only. El rollback de frontend mediante PR es aceptable solo si el frontend anterior continúa siendo compatible con el esquema ya expandido; X/Y y los contratos legacy se conservan precisamente para mantener esa posibilidad.

No ejecutar `seed.sql`, `db reset` ni borrados sobre producción como rollback.

## Validación obligatoria

Antes del merge, el SHA final debe superar la CI completa:

- formato, auditoría de credenciales, accesibilidad, lint y Vitest;
- build Pages, auditoría del artefacto y smoke;
- Playwright E2E;
- reconstrucción local de Supabase y migraciones desde cero;
- upgrades históricos incluidos por `supabase:db:validate`;
- `supabase db lint --fail-on warning`;
- pgTAP/RLS, incluyendo geometría válida e inválida, multicampaña, proyección pública/Máster y ACL;
- regresiones de concurrencia v4/v5 y v5/v6, incluida la variante v5-first.

Si se modifica contenido público en un entorno real, el snapshot debe regenerarse y verificarse antes de desplegar. La mera incorporación del nuevo esquema no justifica mutar la base de producción ni regenerar un snapshot cuyo contenido público no haya cambiado.

## Checkpoint humano de seguridad

MAP-060 modifica RPC administrativos/Máster, permisos de columna y la proyección pública. Por ello la PR debe permanecer Draft hasta completar código, tests, documentación, CI y auto-review. Inmediatamente antes de Ready/merge se requiere revisión humana sustantiva de:

- autorización admin y aislamiento multicampaña;
- `SECURITY INVOKER`, `search_path` y grants/revokes;
- privilegio `UPDATE(geometry)` frente a RLS;
- exclusión de geometría Máster del snapshot público;
- orden de locks v4/v5/v6;
- constraints y pruebas negativas de geometría.

La revisión humana valida la frontera sensible; las operaciones de GitHub posteriores (Ready, merge y verificación final) siguen siendo responsabilidad del agente una vez aprobada.
