# MAP-068 — Separación de Veyra en «Un aliento menos»

Estado: **candidato en PR; no aplicado a producción**.

MAP-068 crea `Un aliento menos` como campaña normal del dominio con UUID estable
`00000000-0000-4000-8000-000000000068` y slug `un-aliento-menos`. La geografía física
permanece global; catálogo, roster y relaciones siguen siendo campaign-scoped.

## Resultado esperado

| Campaña | Roster | Veyra |
| --- | --- | --- |
| Castigo Divino | Ura, Skade | ausente |
| Un aliento menos | Veyra | entidad y player preservados |

Se conservan `entity-request-07d26371bbff42d9b91e076d099891b0`, `player-veyra`, el slug
histórico de la entidad, geometría, retrato, audiencia, publicación y timestamps. La request
convertida `07d26371-bbff-42d9-b91e-076d099891b0` acompaña a la entidad porque el FK compuesto
de campaña exige el mismo scope.

`category-pj` se queda en Castigo Divino porque producción la comparte entre Ura, Skade y Veyra.
La migración crea `category-pj-un-aliento-menos`. El tag `category-veyra` sí acompaña a Veyra:
la auditoría read-only confirma que solo lo usa esa entidad y ninguna nota.

## Eliminaciones deliberadas

Antes de migrar hay 17 disposiciones con `player-veyra` y 3 con la entidad Veyra, con una fila
self común. Se eliminan exactamente 19 filas: **18 que quedarían cross-campaign y 1 Veyra→Veyra**.
No existen aliases, notas, asociaciones jugador-entidad, relaciones personaje-localización,
eventos ni vínculos geográficos de Veyra en el inventario auditado.

## Self y seguridad

`players.character_entity_id` modela explícitamente player↔character mediante FK compuesta de
campaña y permanece fuera del catálogo público. La matriz omite esa pareja; enlazar identidad
elimina una self-disposition preexistente y otro trigger impide recrearla. El renderer no necesita
ningún hardcode ni filtro especial: simplemente no recibe una disposición self persistida.

Las FKs compuestas existentes siguen protegiendo dispositions, associations, tags, notas,
relaciones/eventos y requests. Solo tres FKs cíclicas se retiran dentro de la transacción de
migración para mover las filas auditadas y se restauran antes del commit. La migración admite
instalaciones frescas y estados históricos compatibles, pero falla cerrada si aparecen dependencias
de Veyra no clasificadas por la auditoría de producción.

## Snapshot y checkpoint

El snapshot v3 candidato debe contener ambas campañas y Veyra solo en `Un aliento menos`. No
debe ejecutarse `snapshot:verify:remote` hasta aplicar la migración a producción. Después de
aprobación humana: aplicar la migración, regenerar snapshot desde producción, verificar remoto y
solo entonces valorar deploy/release.

**No se ha aplicado la migración a producción.**
