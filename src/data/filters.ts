import type {
  CategoryId,
  EntityId,
  PublicCatalogSnapshotV2,
  PublicCategory,
  PublicMapEntity,
  PublicTag,
  TagId,
} from './beta02-model';
import type { CampaignCatalog, CampaignPlace, PlaceId } from './model';
import { normalizePlaceSearchQuery, searchPublicAtlas, searchPublicPlaces } from './search';

export interface PublicPlaceFilterState {
  readonly selectedCategoryIds: readonly CategoryId[];
  readonly selectedTagIds: readonly TagId[];
}

export type PublicPlaceSearchIntent = 'entity-search' | 'geographic-navigation';

export interface PublicPlaceMatchingOptions {
  readonly searchIntent?: PublicPlaceSearchIntent;
}

export interface PublicCategoryFilterFacet extends PublicCategory {
  readonly count: number;
}

export interface PublicTagFilterFacet extends PublicTag {
  readonly count: number;
}

export interface PublicFilterFacets {
  readonly categories: readonly PublicCategoryFilterFacet[];
  readonly tags: readonly PublicTagFilterFacet[];
}

export const EMPTY_PUBLIC_PLACE_FILTER_STATE: PublicPlaceFilterState = {
  selectedCategoryIds: [],
  selectedTagIds: [],
};

/**
 * Beta 0.1 compatibility helper retained for degraded/offline mode.
 * Public note tags continue to contribute to a legacy place's filter tags.
 */
export function getPublicPlaceFilterTagIds(
  catalog: CampaignCatalog,
  place: CampaignPlace,
): readonly TagId[] {
  const associatedTagIds = new Set<TagId>(place.tagIds);

  catalog.notes.forEach((note) => {
    if (note.placeId === place.id) {
      note.tagIds.forEach((tagId) => associatedTagIds.add(tagId));
    }
  });

  return catalog.tags.filter(({ id }) => associatedTagIds.has(id)).map(({ id }) => id);
}

/**
 * Returns the public tags associated with a Beta 0.2 entity. Public note tags are
 * intentionally included to preserve the Beta 0.1 filtering contract.
 */
export function getPublicEntityFilterTagIds(
  catalog: PublicCatalogSnapshotV2,
  entity: PublicMapEntity,
): readonly TagId[] {
  const associatedTagIds = new Set<TagId>(entity.tagIds);

  catalog.notes.forEach((note) => {
    if (note.entityId === entity.id) {
      note.tagIds.forEach((tagId) => associatedTagIds.add(tagId));
    }
  });

  return catalog.tags.filter(({ id }) => associatedTagIds.has(id)).map(({ id }) => id);
}

/**
 * Derives only usable facets from the already-authorized public snapshot.
 * A facet is exposed only when at least one public entity is associated with it.
 * Both `pin` and `search_only` entities count because both are public/filterable.
 */
export function derivePublicFilterFacets(catalog: PublicCatalogSnapshotV2): PublicFilterFacets {
  const categoryCounts = new Map<CategoryId, number>();
  const tagCounts = new Map<TagId, number>();

  catalog.categories.forEach(({ id }) => categoryCounts.set(id, 0));
  catalog.tags.forEach(({ id }) => tagCounts.set(id, 0));

  catalog.entities.forEach((entity) => {
    if (categoryCounts.has(entity.categoryId)) {
      categoryCounts.set(entity.categoryId, (categoryCounts.get(entity.categoryId) ?? 0) + 1);
    }

    getPublicEntityFilterTagIds(catalog, entity).forEach((tagId) => {
      if (tagCounts.has(tagId)) {
        tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);
      }
    });
  });

  return {
    categories: catalog.categories
      .map((category) => ({ ...category, count: categoryCounts.get(category.id) ?? 0 }))
      .filter(({ count }) => count > 0),
    tags: catalog.tags
      .map((tag) => ({ ...tag, count: tagCounts.get(tag.id) ?? 0 }))
      .filter(({ count }) => count > 0),
  };
}

export function publicPlaceMatchesFilters(
  catalog: CampaignCatalog,
  place: CampaignPlace,
  filters: PublicPlaceFilterState,
): boolean {
  const categoryMatches =
    filters.selectedCategoryIds.length === 0 ||
    filters.selectedCategoryIds.includes(place.categoryId);
  const placeTagIds = getPublicPlaceFilterTagIds(catalog, place);
  const tagMatches =
    filters.selectedTagIds.length === 0 ||
    filters.selectedTagIds.some((tagId) => placeTagIds.includes(tagId));

  return categoryMatches && tagMatches;
}

export function publicEntityMatchesFilters(
  catalog: PublicCatalogSnapshotV2,
  entity: PublicMapEntity,
  filters: PublicPlaceFilterState,
): boolean {
  const categoryMatches =
    filters.selectedCategoryIds.length === 0 ||
    filters.selectedCategoryIds.includes(entity.categoryId);
  const entityTagIds = getPublicEntityFilterTagIds(catalog, entity);
  const tagMatches =
    filters.selectedTagIds.length === 0 ||
    filters.selectedTagIds.some((tagId) => entityTagIds.includes(tagId));

  return categoryMatches && tagMatches;
}

export function filterPublicPlaces(
  catalog: CampaignCatalog,
  filters: PublicPlaceFilterState,
): readonly PlaceId[] {
  return catalog.places
    .filter((place) => publicPlaceMatchesFilters(catalog, place, filters))
    .map(({ id }) => id);
}

export function filterPublicEntities(
  catalog: PublicCatalogSnapshotV2,
  filters: PublicPlaceFilterState,
): readonly EntityId[] {
  return catalog.entities
    .filter((entity) => publicEntityMatchesFilters(catalog, entity, filters))
    .map(({ id }) => id);
}

export function searchPublicPlaceIds(catalog: CampaignCatalog, query: string): readonly PlaceId[] {
  if (!normalizePlaceSearchQuery(query)) {
    return catalog.places.map(({ id }) => id);
  }

  return searchPublicPlaces(catalog, query).map(({ placeId }) => placeId);
}

export function searchPublicEntityIds(
  legacyCatalog: CampaignCatalog,
  catalog: PublicCatalogSnapshotV2,
  query: string,
): readonly EntityId[] {
  if (!normalizePlaceSearchQuery(query)) {
    return catalog.entities.map(({ id }) => id);
  }

  return searchPublicAtlas(legacyCatalog, catalog, query)
    .filter((result) => result.type !== 'geographic' && result.linkedEntityId !== null)
    .map((result) => result.linkedEntityId!);
}

export function deriveMatchingPublicPlaceIds(
  catalog: CampaignCatalog,
  query: string,
  filters: PublicPlaceFilterState,
  options: PublicPlaceMatchingOptions = {},
): readonly PlaceId[] {
  const searchMatches = new Set(
    options.searchIntent === 'geographic-navigation'
      ? catalog.places.map(({ id }) => id)
      : searchPublicPlaceIds(catalog, query),
  );
  const filterMatches = new Set(filterPublicPlaces(catalog, filters));

  return catalog.places
    .filter(({ id }) => searchMatches.has(id) && filterMatches.has(id))
    .map(({ id }) => id);
}

export function deriveMatchingPublicEntityIds(
  legacyCatalog: CampaignCatalog,
  catalog: PublicCatalogSnapshotV2,
  query: string,
  filters: PublicPlaceFilterState,
  options: PublicPlaceMatchingOptions = {},
): readonly EntityId[] {
  const searchMatches = new Set(
    options.searchIntent === 'geographic-navigation'
      ? catalog.entities.map(({ id }) => id)
      : searchPublicEntityIds(legacyCatalog, catalog, query),
  );
  const filterMatches = new Set(filterPublicEntities(catalog, filters));

  return catalog.entities
    .filter(({ id }) => searchMatches.has(id) && filterMatches.has(id))
    .map(({ id }) => id);
}
