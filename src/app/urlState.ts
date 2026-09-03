import type {
  CategoryId,
  GeographicNameId,
  PublicCatalogSnapshotV2,
  TagId,
} from '../data/beta02-model';
import { derivePublicFilterFacets } from '../data/filters';
import type { CampaignCatalog, PlaceId } from '../data/model';
import {
  MAP_LAYER_IDS,
  normalizeMapLayerIds,
  type MapLayerId,
} from '../domain/mapLayers';

export interface PublicAppUrlState {
  readonly activePlaceId: PlaceId | null;
  readonly query: string;
  readonly geographicNameId: GeographicNameId | null;
  readonly selectedCategoryIds: readonly CategoryId[];
  readonly selectedTagIds: readonly TagId[];
  readonly activeLayerIds: readonly MapLayerId[];
}

export interface ParsedPublicAppUrlState {
  readonly state: PublicAppUrlState;
  readonly canonicalUrl: URL;
  readonly isCanonical: boolean;
}

interface UrlFacetCatalog {
  readonly categories: readonly { readonly id: CategoryId; readonly slug: string }[];
  readonly tags: readonly { readonly id: TagId }[];
}

export const EMPTY_PUBLIC_APP_URL_STATE: PublicAppUrlState = {
  activePlaceId: null,
  query: '',
  geographicNameId: null,
  selectedCategoryIds: [],
  selectedTagIds: [],
  activeLayerIds: MAP_LAYER_IDS,
};

const URL_PARAMETERS = {
  campaign: 'campaign',
  activePlace: 'place',
  query: 'q',
  geographicName: 'geo',
  category: 'category',
  tag: 'tag',
  layers: 'layers',
} as const;

function normalizeQuery(query: string): string {
  return query.trim();
}

function normalizeGeographicNameId(value: GeographicNameId | null): GeographicNameId | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.startsWith('geo-') && normalized.length > 4
    ? (normalized as GeographicNameId)
    : null;
}

function resolveUrlFacetCatalog(
  catalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
): UrlFacetCatalog {
  if (beta02Catalog) {
    const facets = derivePublicFilterFacets(beta02Catalog);
    return { categories: facets.categories, tags: facets.tags };
  }
  return { categories: catalog.categories, tags: catalog.tags };
}

function findPlaceId(catalog: CampaignCatalog, value: string): PlaceId | null {
  return catalog.places.find((place) => place.slug === value || place.id === value)?.id ?? null;
}

function findCategoryId(facets: UrlFacetCatalog, value: string): CategoryId | null {
  return (
    facets.categories.find((category) => category.slug === value || category.id === value)?.id ??
    null
  );
}

function getFirstValidPlaceId(catalog: CampaignCatalog, values: readonly string[]): PlaceId | null {
  for (const value of values) {
    const placeId = findPlaceId(catalog, value.trim());
    if (placeId) return placeId;
  }
  return null;
}

function getFirstNonEmptyValue(values: readonly string[]): string {
  return values.map(normalizeQuery).find(Boolean) ?? '';
}

function getFirstGeographicNameId(values: readonly string[]): GeographicNameId | null {
  for (const value of values) {
    const normalized = normalizeGeographicNameId(value.trim() as GeographicNameId);
    if (normalized) return normalized;
  }
  return null;
}

function parseLayerIds(source: URL): readonly MapLayerId[] {
  if (!source.searchParams.has(URL_PARAMETERS.layers)) return MAP_LAYER_IDS;
  const tokens = source.searchParams
    .getAll(URL_PARAMETERS.layers)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  if (tokens.includes('none')) return [];
  const normalized = normalizeMapLayerIds(tokens);
  return normalized.length > 0 ? normalized : MAP_LAYER_IDS;
}

export function normalizePublicAppUrlState(
  catalog: CampaignCatalog,
  state: PublicAppUrlState,
  beta02Catalog: PublicCatalogSnapshotV2 | null = null,
): PublicAppUrlState {
  const facets = resolveUrlFacetCatalog(catalog, beta02Catalog);
  const selectedCategoryIds = new Set(state.selectedCategoryIds);
  const selectedTagIds = new Set(state.selectedTagIds);
  const validPlaceIds = new Set(catalog.places.map(({ id }) => id));
  return {
    activePlaceId:
      state.activePlaceId && validPlaceIds.has(state.activePlaceId) ? state.activePlaceId : null,
    query: normalizeQuery(state.query),
    geographicNameId: normalizeGeographicNameId(state.geographicNameId),
    selectedCategoryIds: facets.categories
      .filter(({ id }) => selectedCategoryIds.has(id))
      .map(({ id }) => id),
    selectedTagIds: facets.tags.filter(({ id }) => selectedTagIds.has(id)).map(({ id }) => id),
    activeLayerIds: normalizeMapLayerIds(state.activeLayerIds),
  };
}

export function serializePublicAppUrlState(
  catalog: CampaignCatalog,
  state: PublicAppUrlState,
  beta02Catalog: PublicCatalogSnapshotV2 | null = null,
): URLSearchParams {
  const facets = resolveUrlFacetCatalog(catalog, beta02Catalog);
  const normalizedState = normalizePublicAppUrlState(catalog, state, beta02Catalog);
  const parameters = new URLSearchParams();
  const activePlace = catalog.places.find(({ id }) => id === normalizedState.activePlaceId);
  if (activePlace) parameters.append(URL_PARAMETERS.activePlace, activePlace.slug);
  if (normalizedState.query) parameters.append(URL_PARAMETERS.query, normalizedState.query);
  if (normalizedState.geographicNameId) {
    parameters.append(URL_PARAMETERS.geographicName, normalizedState.geographicNameId);
  }
  normalizedState.selectedCategoryIds.forEach((categoryId) => {
    const category = facets.categories.find(({ id }) => id === categoryId);
    if (category) parameters.append(URL_PARAMETERS.category, category.slug);
  });
  normalizedState.selectedTagIds.forEach((tagId) => parameters.append(URL_PARAMETERS.tag, tagId));
  if (normalizedState.activeLayerIds.length === 0) {
    parameters.set(URL_PARAMETERS.layers, 'none');
  } else if (normalizedState.activeLayerIds.length !== MAP_LAYER_IDS.length) {
    parameters.set(URL_PARAMETERS.layers, normalizedState.activeLayerIds.join(','));
  }
  return parameters;
}

function preserveCampaignParameter(source: URL, parameters: URLSearchParams): void {
  const campaign = source.searchParams.get(URL_PARAMETERS.campaign)?.trim();
  if (campaign) parameters.set(URL_PARAMETERS.campaign, campaign);
}

export function createCanonicalPublicAppUrl(
  catalog: CampaignCatalog,
  baseUrl: URL,
  state: PublicAppUrlState,
  beta02Catalog: PublicCatalogSnapshotV2 | null = null,
): URL {
  const canonicalUrl = new URL(baseUrl.href);
  const parameters = serializePublicAppUrlState(catalog, state, beta02Catalog);
  preserveCampaignParameter(baseUrl, parameters);
  canonicalUrl.search = parameters.toString();
  canonicalUrl.hash = '';
  return canonicalUrl;
}

export function parsePublicAppUrlState(
  catalog: CampaignCatalog,
  sourceUrl: URL,
  beta02Catalog: PublicCatalogSnapshotV2 | null = null,
): ParsedPublicAppUrlState {
  const source = new URL(sourceUrl.href);
  const facets = resolveUrlFacetCatalog(catalog, beta02Catalog);
  const categoryValues = new Set(
    source.searchParams
      .getAll(URL_PARAMETERS.category)
      .map((value) => findCategoryId(facets, value.trim()))
      .filter((value): value is CategoryId => value !== null),
  );
  const tagValues = new Set(
    source.searchParams
      .getAll(URL_PARAMETERS.tag)
      .map((value) => value.trim())
      .filter((value) => facets.tags.some((tag) => tag.id === value)),
  );
  const state = normalizePublicAppUrlState(
    catalog,
    {
      activePlaceId: getFirstValidPlaceId(
        catalog,
        source.searchParams.getAll(URL_PARAMETERS.activePlace),
      ),
      query: getFirstNonEmptyValue(source.searchParams.getAll(URL_PARAMETERS.query)),
      geographicNameId: getFirstGeographicNameId(
        source.searchParams.getAll(URL_PARAMETERS.geographicName),
      ),
      selectedCategoryIds: facets.categories
        .filter(({ id }) => categoryValues.has(id))
        .map(({ id }) => id),
      selectedTagIds: facets.tags.filter(({ id }) => tagValues.has(id)).map(({ id }) => id),
      activeLayerIds: parseLayerIds(source),
    },
    beta02Catalog,
  );
  const canonicalUrl = createCanonicalPublicAppUrl(catalog, source, state, beta02Catalog);
  return { state, canonicalUrl, isCanonical: canonicalUrl.href === source.href };
}

export function arePublicAppUrlStatesEqual(
  catalog: CampaignCatalog,
  left: PublicAppUrlState,
  right: PublicAppUrlState,
  beta02Catalog: PublicCatalogSnapshotV2 | null = null,
): boolean {
  const normalizedLeft = normalizePublicAppUrlState(catalog, left, beta02Catalog);
  const normalizedRight = normalizePublicAppUrlState(catalog, right, beta02Catalog);
  return (
    normalizedLeft.activePlaceId === normalizedRight.activePlaceId &&
    normalizedLeft.query === normalizedRight.query &&
    normalizedLeft.geographicNameId === normalizedRight.geographicNameId &&
    normalizedLeft.selectedCategoryIds.length === normalizedRight.selectedCategoryIds.length &&
    normalizedLeft.selectedCategoryIds.every(
      (categoryId, index) => categoryId === normalizedRight.selectedCategoryIds[index],
    ) &&
    normalizedLeft.selectedTagIds.length === normalizedRight.selectedTagIds.length &&
    normalizedLeft.selectedTagIds.every(
      (tagId, index) => tagId === normalizedRight.selectedTagIds[index],
    ) &&
    normalizedLeft.activeLayerIds.length === normalizedRight.activeLayerIds.length &&
    normalizedLeft.activeLayerIds.every(
      (layerId, index) => layerId === normalizedRight.activeLayerIds[index],
    )
  );
}
