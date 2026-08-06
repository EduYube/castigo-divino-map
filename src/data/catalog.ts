import catalogData from './catalog.json';
import type { CampaignCatalog } from './model';
import { assertValidCampaignData } from './validate';

assertValidCampaignData(catalogData);

export const campaignCatalog = catalogData as CampaignCatalog;
