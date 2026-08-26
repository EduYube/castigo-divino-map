import { INITIAL_CAMPAIGN_ID } from '../domain/adminCampaignRoster';

export type AdminCampaignContextListener = (campaignId: string) => void;

export class AdminCampaignContext {
  readonly #listeners = new Set<AdminCampaignContextListener>();
  #campaignId: string;

  constructor(initialCampaignId = INITIAL_CAMPAIGN_ID) {
    this.#campaignId = initialCampaignId;
  }

  getCampaignId(): string {
    return this.#campaignId;
  }

  setCampaignId(campaignId: string): void {
    if (!campaignId || campaignId === this.#campaignId) return;
    this.#campaignId = campaignId;
    for (const listener of this.#listeners) listener(campaignId);
  }

  subscribe(listener: AdminCampaignContextListener): () => void {
    this.#listeners.add(listener);
    listener(this.#campaignId);
    return () => this.#listeners.delete(listener);
  }
}
