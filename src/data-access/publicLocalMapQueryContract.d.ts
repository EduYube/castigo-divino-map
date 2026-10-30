import type { PublicCatalogTableQuery } from './publicCatalogQueryContract.js';
import type { PublicLocalContext } from '../infrastructure/supabase/publicLocalMapRepository';
import type { PublicGeographicMapContextLinkV4, PublicMapContextV4 } from '../data/beta04-model';
export const PUBLIC_LOCAL_MAP_TABLE_QUERIES: Readonly<{
  readonly links: PublicCatalogTableQuery;
  readonly placements: PublicCatalogTableQuery;
  readonly localEntities: PublicCatalogTableQuery;
}>;
export function projectPublicMapContextLinks(
  rows: readonly Record<string, unknown>[],
  campaignId: string,
  geographicIds: ReadonlySet<string>,
): {
  readonly mapContexts: readonly PublicMapContextV4[];
  readonly contexts: readonly PublicLocalContext[];
  readonly geographicMapContextLinks: readonly PublicGeographicMapContextLinkV4[];
};
