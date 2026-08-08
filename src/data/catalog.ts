import catalogData from './catalog.json';
import type { CampaignCatalog } from './model';
import { assertValidCampaignData } from './validate';

const EMPTY_CAMPAIGN_CATALOG: CampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
};

if (import.meta.env.MODE === 'test') {
  assertValidCampaignData(catalogData);
}

/**
 * Beta 0.1 fixture compatibility export.
 *
 * Vitest keeps the historical catalog available for equivalence tests. Production
 * and development runtime must bootstrap from the bundled Beta 0.2 snapshot (and
 * Supabase), so the historical JSON is not a runtime fallback after MAP-028.
 */
export const campaignCatalog =
  import.meta.env.MODE === 'test' ? (catalogData as CampaignCatalog) : EMPTY_CAMPAIGN_CATALOG;
