import type { PublicCatalogSnapshotV2, PublicMapEntity } from './beta02-model';
import type { CampaignCatalog, CampaignCategory, CampaignPlace, PlaceId } from './model';

function isLegacyPlaceEntity(
  entity: PublicMapEntity,
): entity is PublicMapEntity & { readonly id: PlaceId } {
  return (
    entity.id.startsWith('place-') &&
    entity.entityType === 'location' &&
    entity.visibility === 'pin'
  );
}

function sortCompatibilityCategories(
  categories: readonly CampaignCategory[],
  places: readonly CampaignPlace[],
): readonly CampaignCategory[] {
  const firstUse = new Map<string, number>();

  places.forEach((place, index) => {
    if (!firstUse.has(place.categoryId)) {
      firstUse.set(place.categoryId, index);
    }
  });

  return [...categories].sort((left, right) => {
    const leftIndex = firstUse.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = firstUse.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  });
}

export function toBeta01CompatibilityCatalog(catalog: PublicCatalogSnapshotV2): CampaignCatalog {
  const places: CampaignPlace[] = catalog.entities.filter(isLegacyPlaceEntity).map((entity) => ({
    id: entity.id,
    slug: entity.slug,
    name: entity.name,
    aliases: entity.aliases.map(({ value }) => value),
    coordinates: entity.coordinates,
    categoryId: entity.categoryId,
    tagIds: entity.tagIds,
  }));
  const placeOrder = new Map(places.map((place, index) => [place.id, index] as const));
  const notes = catalog.notes
    .filter((note) => placeOrder.has(note.entityId as PlaceId))
    .map((note) => ({
      id: note.id,
      slug: note.slug,
      placeId: note.entityId as PlaceId,
      title: note.title,
      body: note.body,
      tagIds: note.tagIds,
      sortOrder: note.sortOrder,
    }))
    .sort(
      (left, right) =>
        (placeOrder.get(left.placeId) ?? Number.MAX_SAFE_INTEGER) -
          (placeOrder.get(right.placeId) ?? Number.MAX_SAFE_INTEGER) ||
        left.sortOrder - right.sortOrder ||
        left.id.localeCompare(right.id),
    )
    .map((note) => ({
      id: note.id,
      slug: note.slug,
      placeId: note.placeId,
      title: note.title,
      body: note.body,
      tagIds: note.tagIds,
    }));

  const categories = sortCompatibilityCategories(
    catalog.categories.map((category) => ({ ...category })),
    places,
  );

  return {
    categories,
    tags: catalog.tags.map((tag) => ({ ...tag })),
    places,
    notes,
  };
}
