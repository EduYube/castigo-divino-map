import type { EntityId, GeographicNameId, PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog, PlaceId } from './model';

export function applyEntityRevocationsToBeta02(
  catalog: PublicCatalogSnapshotV2,
  revokedEntityIds: ReadonlySet<EntityId>,
): PublicCatalogSnapshotV2 {
  if (revokedEntityIds.size === 0) return catalog;

  const entities = catalog.entities.filter(({ id }) => !revokedEntityIds.has(id));
  const geographicNames = catalog.geographicNames.filter(
    ({ entityId }) => entityId === null || !revokedEntityIds.has(entityId),
  );
  const geographicNameIds = new Set<GeographicNameId>(geographicNames.map(({ id }) => id));
  const candidateEvents = catalog.characterLocationEvents.filter((event) => {
    if (revokedEntityIds.has(event.characterId)) return false;
    if (
      event.location.locationEntityId !== null &&
      revokedEntityIds.has(event.location.locationEntityId)
    ) {
      return false;
    }
    return (
      event.location.geographicNameId === null ||
      geographicNameIds.has(event.location.geographicNameId)
    );
  });
  const candidateEventIds = new Set(candidateEvents.map(({ id }) => id));
  const characterLocationEvents = candidateEvents.filter(
    (event) =>
      event.eventType === 'sighting' ||
      event.relatedSightingId === null ||
      candidateEventIds.has(event.relatedSightingId),
  );

  return {
    ...catalog,
    entities,
    dispositions: catalog.dispositions.filter(({ entityId }) => !revokedEntityIds.has(entityId)),
    characterLocationRelations: catalog.characterLocationRelations.filter(
      ({ characterId, locationId }) =>
        !revokedEntityIds.has(characterId) && !revokedEntityIds.has(locationId),
    ),
    notes: catalog.notes.filter(({ entityId }) => !revokedEntityIds.has(entityId)),
    geographicNames,
    characterLocationEvents,
  };
}

export function applyEntityRevocationsToBeta01(
  catalog: CampaignCatalog,
  revokedEntityIds: ReadonlySet<EntityId>,
): CampaignCatalog {
  if (revokedEntityIds.size === 0) return catalog;

  const revokedPlaceIds = new Set<PlaceId>(
    [...revokedEntityIds].filter((id): id is PlaceId => id.startsWith('place-')),
  );
  if (revokedPlaceIds.size === 0) return catalog;

  const places = catalog.places.filter(({ id }) => !revokedPlaceIds.has(id));
  const placeIds = new Set(places.map(({ id }) => id));
  const notes = catalog.notes.filter(({ placeId }) => placeIds.has(placeId));
  const categoryIds = new Set(places.map(({ categoryId }) => categoryId));
  const tagIds = new Set([
    ...places.flatMap(({ tagIds: ids }) => ids),
    ...notes.flatMap(({ tagIds: ids }) => ids),
  ]);

  return {
    categories: catalog.categories.filter(({ id }) => categoryIds.has(id)),
    tags: catalog.tags.filter(({ id }) => tagIds.has(id)),
    places,
    notes,
  };
}
