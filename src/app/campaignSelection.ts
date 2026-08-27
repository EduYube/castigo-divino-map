import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../data-access/publicCatalogQueryContract.js';

export const INITIAL_PUBLIC_CAMPAIGN_SLUG = 'castigo-divino';

export interface PublicCampaignSelection {
  readonly id: string;
  readonly slug: string;
}

let currentSelection: PublicCampaignSelection = {
  id: INITIAL_PUBLIC_CAMPAIGN_ID,
  slug: INITIAL_PUBLIC_CAMPAIGN_SLUG,
};

export function getCurrentPublicCampaignSelection(): PublicCampaignSelection {
  return currentSelection;
}

export function setCurrentPublicCampaignSelection(selection: PublicCampaignSelection): void {
  currentSelection = selection;
}
