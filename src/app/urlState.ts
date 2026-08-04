import type { CampaignCatalog, CampaignCategory, PlaceId, TagId } from '../data/model';

export interface PublicAppUrlState {
  readonly activePlaceId: PlaceId | null;
  readonly query: string;
  readonly selectedCategoryIds: readonly CampaignCategory['id'][];
  readonly selectedTagIds: readonly TagId[];
}

export interface ParsedPublicAppUrlState {
  readonly state: PublicAppUrlState;
  readonly canonicalUrl: URL;
  readonly isCanonical: boolean;
}

export const EMPTY_PUBLIC_APP_URL_STATE: PublicAppUrlState = {
  activePlaceId: null,
  query: '',
  selectedCategoryIds: [],
  selectedTagIds: [],
};

const URL_PARAMETERS = {
  activePlace: 'place',
  query: 'q',
  category: 'category',
  tag: 'tag',
} as const;

function normalizeQuery(query: string): string {
  return query.trim();
}

function findPlaceId(catalog: CampaignCatalog, value: string): PlaceId | null {
  return catalog.places.find((place) => place.slug === value || place.id === value)?.id ?? null;
}

function findCategoryId(catalog: CampaignCatalog, value: string): CampaignCategory['id'] | null {
  return (
    catalog.categories.find((category) => category.slug === value || category.id === value)?.id ??
    null
  );
}

function getFirstValidPlaceId(catalog: CampaignCatalog, values: readonly string[]): PlaceId | null {
  for (const value of values) {
    const placeId = findPlaceId(catalog, value.trim());

    if (placeId) {
      return placeId;
    }
  }

  return null;
}

function getFirstNonEmptyValue(values: readonly string[]): string {
  return values.map(normalizeQuery).find(Boolean) ?? '';
}

export function normalizePublicAppUrlState(
  catalog: CampaignCatalog,
  state: PublicAppUrlState,
): PublicAppUrlState {
  const selectedCategoryIds = new Set(state.selectedCategoryIds);
  const selectedTagIds = new Set(state.selectedTagIds);
  const validPlaceIds = new Set(catalog.places.map(({ id }) => id));

  return {
    activePlaceId:
      state.activePlaceId && validPlaceIds.has(state.activePlaceId) ? state.activePlaceId : null,
    query: normalizeQuery(state.query),
    selectedCategoryIds: catalog.categories
      .filter(({ id }) => selectedCategoryIds.has(id))
      .map(({ id }) => id),
    selectedTagIds: catalog.tags.filter(({ id }) => selectedTagIds.has(id)).map(({ id }) => id),
  };
}

export function serializePublicAppUrlState(
  catalog: CampaignCatalog,
  state: PublicAppUrlState,
): URLSearchParams {
  const normalizedState = normalizePublicAppUrlState(catalog, state);
  const parameters = new URLSearchParams();
  const activePlace = catalog.places.find(({ id }) => id === normalizedState.activePlaceId);

  if (activePlace) {
    parameters.append(URL_PARAMETERS.activePlace, activePlace.slug);
  }

  if (normalizedState.query) {
    parameters.append(URL_PARAMETERS.query, normalizedState.query);
  }

  normalizedState.selectedCategoryIds.forEach((categoryId) => {
    const category = catalog.categories.find(({ id }) => id === categoryId);

    if (category) {
      parameters.append(URL_PARAMETERS.category, category.slug);
    }
  });

  normalizedState.selectedTagIds.forEach((tagId) => {
    parameters.append(URL_PARAMETERS.tag, tagId);
  });

  return parameters;
}

export function createCanonicalPublicAppUrl(
  catalog: CampaignCatalog,
  baseUrl: URL,
  state: PublicAppUrlState,
): URL {
  const canonicalUrl = new URL(baseUrl.href);
  const parameters = serializePublicAppUrlState(catalog, state);

  canonicalUrl.search = parameters.toString();
  canonicalUrl.hash = '';

  return canonicalUrl;
}

export function parsePublicAppUrlState(
  catalog: CampaignCatalog,
  sourceUrl: URL,
): ParsedPublicAppUrlState {
  const source = new URL(sourceUrl.href);
  const categoryValues = new Set(
    source.searchParams
      .getAll(URL_PARAMETERS.category)
      .map((value) => findCategoryId(catalog, value.trim()))
      .filter((value): value is CampaignCategory['id'] => value !== null),
  );
  const tagValues = new Set(
    source.searchParams
      .getAll(URL_PARAMETERS.tag)
      .map((value) => value.trim())
      .filter((value) => catalog.tags.some((tag) => tag.id === value)),
  );
  const state = normalizePublicAppUrlState(catalog, {
    activePlaceId: getFirstValidPlaceId(
      catalog,
      source.searchParams.getAll(URL_PARAMETERS.activePlace),
    ),
    query: getFirstNonEmptyValue(source.searchParams.getAll(URL_PARAMETERS.query)),
    selectedCategoryIds: catalog.categories
      .filter(({ id }) => categoryValues.has(id))
      .map(({ id }) => id),
    selectedTagIds: catalog.tags.filter(({ id }) => tagValues.has(id)).map(({ id }) => id),
  });
  const canonicalUrl = createCanonicalPublicAppUrl(catalog, source, state);

  return {
    state,
    canonicalUrl,
    isCanonical: canonicalUrl.href === source.href,
  };
}

export function arePublicAppUrlStatesEqual(
  catalog: CampaignCatalog,
  left: PublicAppUrlState,
  right: PublicAppUrlState,
): boolean {
  const normalizedLeft = normalizePublicAppUrlState(catalog, left);
  const normalizedRight = normalizePublicAppUrlState(catalog, right);

  return (
    normalizedLeft.activePlaceId === normalizedRight.activePlaceId &&
    normalizedLeft.query === normalizedRight.query &&
    normalizedLeft.selectedCategoryIds.length === normalizedRight.selectedCategoryIds.length &&
    normalizedLeft.selectedCategoryIds.every(
      (categoryId, index) => categoryId === normalizedRight.selectedCategoryIds[index],
    ) &&
    normalizedLeft.selectedTagIds.length === normalizedRight.selectedTagIds.length &&
    normalizedLeft.selectedTagIds.every(
      (tagId, index) => tagId === normalizedRight.selectedTagIds[index],
    )
  );
}
