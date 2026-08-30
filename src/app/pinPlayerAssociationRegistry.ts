import type { PinEntityType, PinPlayerAssociationInput } from '../domain/pinVisualSystem';

export const PIN_PLAYER_ASSOCIATIONS_CHANGED_EVENT = 'castigo-divino-map:pin-player-associations';

export interface PinPlayerAssociationRegistryEntry {
  readonly id: string;
  readonly entityType: PinEntityType;
  readonly associations: readonly PinPlayerAssociationInput[];
}

let entries = new Map<string, PinPlayerAssociationRegistryEntry>();

export function publishPinPlayerAssociations(
  markers: readonly PinPlayerAssociationRegistryEntry[],
): void {
  entries = new Map(markers.map((marker) => [marker.id, marker] as const));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PIN_PLAYER_ASSOCIATIONS_CHANGED_EVENT));
  }
}

export function getPinPlayerAssociation(pinId: string): PinPlayerAssociationRegistryEntry | null {
  return entries.get(pinId) ?? null;
}
