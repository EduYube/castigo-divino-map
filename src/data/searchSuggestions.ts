import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import { searchPublicAtlas, type AtlasSearchResult } from './search';

export const DEFAULT_PUBLIC_SEARCH_SUGGESTION_LIMIT = 6;

export function getPublicAtlasSuggestions(
  catalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
  query: string,
  limit = DEFAULT_PUBLIC_SEARCH_SUGGESTION_LIMIT,
): readonly AtlasSearchResult[] {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : DEFAULT_PUBLIC_SEARCH_SUGGESTION_LIMIT;

  return searchPublicAtlas(catalog, beta02Catalog, query).slice(0, normalizedLimit);
}
