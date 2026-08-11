import type { EntityId } from '../data/beta02-model';
import type { MapEntityAudience } from '../domain/adminMapEntities';

export const ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT = 'atlas:admin-entity-audience-changed';

export interface AdminEntityAudienceChangedDetail {
  readonly entityId: EntityId;
  readonly audience: MapEntityAudience;
}

export function dispatchAdminEntityAudienceChanged(
  entityId: EntityId,
  audience: MapEntityAudience,
): void {
  window.dispatchEvent(
    new CustomEvent<AdminEntityAudienceChangedDetail>(ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT, {
      detail: { entityId, audience },
    }),
  );
}
