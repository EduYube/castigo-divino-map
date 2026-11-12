import type { EntityId } from '../data/beta02-model';

/** Ephemeral runtime metadata; never serialized to the DOM, URL or cache. */
export interface MapAnnouncementOrigin {
  readonly entityId: EntityId | null;
  readonly audience: 'public' | 'master';
  readonly source: 'pin-selection' | 'region' | 'search-focus' | 'local-navigation' | 'navigation';
  readonly sourceId?: string;
}

export function createMapAnnouncementController(status: Pick<HTMLElement, 'textContent'> | null) {
  let current: MapAnnouncementOrigin | null = null;

  const clear = (): void => {
    current = null;
    if (status) status.textContent = '';
  };

  return {
    write(message: string, origin: MapAnnouncementOrigin): void {
      current = message ? { ...origin } : null;
      if (status) status.textContent = message;
    },
    clear,
    clearRevoked(revokedIds: ReadonlySet<EntityId>): void {
      if (current?.audience === 'master' && current.entityId && revokedIds.has(current.entityId)) {
        clear();
      }
    },
    clearPrivate(): void {
      if (current?.audience === 'master') clear();
    },
    clearSource(sourceId: string): void {
      if (current?.sourceId === sourceId) clear();
    },
    getOrigin(): MapAnnouncementOrigin | null {
      return current;
    },
  };
}
