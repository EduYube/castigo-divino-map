import type { PlaceId } from '../data/model';

export type PlaceSelectionListener = (activePlaceId: PlaceId | null) => void;

export interface PlaceSelectionController {
  getActivePlaceId(): PlaceId | null;
  select(placeId: PlaceId): void;
  clear(): void;
  subscribe(listener: PlaceSelectionListener): () => void;
}

export function createPlaceSelectionController(): PlaceSelectionController {
  let activePlaceId: PlaceId | null = null;
  const listeners = new Set<PlaceSelectionListener>();

  const publish = (): void => {
    listeners.forEach((listener) => listener(activePlaceId));
  };

  return {
    getActivePlaceId(): PlaceId | null {
      return activePlaceId;
    },
    select(placeId: PlaceId): void {
      if (activePlaceId === placeId) {
        return;
      }

      activePlaceId = placeId;
      publish();
    },
    clear(): void {
      if (activePlaceId === null) {
        return;
      }

      activePlaceId = null;
      publish();
    },
    subscribe(listener: PlaceSelectionListener): () => void {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
