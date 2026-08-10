import type { CampaignCatalog, CampaignCategory, CampaignPlace, PlaceId, TagId } from './model';
import { normalizePlaceSearchQuery, searchPublicPlaces } from './search';

export interface PublicPlaceFilterState {
  readonly selectedCategoryIds: readonly CampaignCategory['id'][];
  readonly selectedTagIds: readonly TagId[];
}

export type PublicPlaceSearchIntent = 'entity-search' | 'geographic-navigation';

export interface PublicPlaceMatchingOptions {
  readonly searchIntent?: PublicPlaceSearchIntent;
}

export const EMPTY_PUBLIC_PLACE_FILTER_STATE: PublicPlaceFilterState = {
  selectedCategoryIds: [],
  selectedTagIds: [],
};

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

export function filterPublicPlaces(
  catalog: CampaignCatalog,
  filters: PublicPlaceFilterState,
): readonly PlaceId[] {
  return catalog.places
    .filter((place) => publicPlaceMatchesFilters(catalog, place, filters))
    .map(({ id }) => id);
}

export function searchPublicPlaceIds(catalog: CampaignCatalog, query: string): readonly PlaceId[] {
  if (!normalizePlaceSearchQuery(query)) {
    return catalog.places.map(({ id }) => id);
  }

  return searchPublicPlaces(catalog, query).map(({ placeId }) => placeId);
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
