import type { EntityId } from '../data/beta02-model';
import type { MapEntityAudience } from '../domain/adminMapEntities';

export const ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT = 'atlas:admin-entity-audience-changed';

const revokedPublicEntityIds = new Set<EntityId>();

export interface AdminEntityAudienceChangedDetail {
  readonly entityId: EntityId;
  readonly audience: MapEntityAudience;
}

export function getBufferedAdminEntityRevocations(): ReadonlySet<EntityId> {
  return new Set(revokedPublicEntityIds);
}

export function dispatchAdminEntityAudienceChanged(
  entityId: EntityId,
  audience: MapEntityAudience,
): void {
  if (audience === 'master') revokedPublicEntityIds.add(entityId);
  else revokedPublicEntityIds.delete(entityId);

  window.dispatchEvent(
    new CustomEvent<AdminEntityAudienceChangedDetail>(ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT, {
      detail: { entityId, audience },
    }),
  );
}
