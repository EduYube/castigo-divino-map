import type { EntityId } from '../data/beta02-model';
import type { MapEntityAudience } from '../domain/adminMapEntities';

export const ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT = 'atlas:admin-entity-audience-changed';

const revokedPublicEntityIds = new Set<EntityId>();
const audienceChangedListeners = new Set<AdminEntityAudienceChangedListener>();

export interface AdminEntityAudienceChangedDetail {
  readonly entityId: EntityId;
  readonly audience: MapEntityAudience;
}

export type AdminEntityAudienceChangedListener = (
  detail: AdminEntityAudienceChangedDetail,
) => void;

export function getBufferedAdminEntityRevocations(): ReadonlySet<EntityId> {
  return new Set(revokedPublicEntityIds);
}

export function subscribeAdminEntityAudienceChanges(
  listener: AdminEntityAudienceChangedListener,
): () => void {
  audienceChangedListeners.add(listener);
  return () => {
    audienceChangedListeners.delete(listener);
  };
}

export function dispatchAdminEntityAudienceChanged(
  entityId: EntityId,
  audience: MapEntityAudience,
): void {
  if (audience === 'master') revokedPublicEntityIds.add(entityId);
  else revokedPublicEntityIds.delete(entityId);

  const detail: AdminEntityAudienceChangedDetail = { entityId, audience };
  audienceChangedListeners.forEach((listener) => listener(detail));

  window.dispatchEvent(
    new CustomEvent<AdminEntityAudienceChangedDetail>(ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT, {
      detail,
    }),
  );
}
