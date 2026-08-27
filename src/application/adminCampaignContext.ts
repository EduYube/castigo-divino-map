import { INITIAL_CAMPAIGN_ID } from '../domain/adminCampaignRoster';

export type AdminCampaignContextListener = (campaignId: string) => void;

export interface AdminCampaignTransition {
  readonly token: number;
  readonly targetCampaignId: string;
}

export type AdminCampaignTransitionListener = (
  transition: AdminCampaignTransition | null,
) => void;

export class AdminCampaignContext {
  readonly #listeners = new Set<AdminCampaignContextListener>();
  readonly #transitionListeners = new Set<AdminCampaignTransitionListener>();
  #campaignId: string;
  #transition: AdminCampaignTransition | null = null;
  #transitionSequence = 0;

  constructor(initialCampaignId = INITIAL_CAMPAIGN_ID) {
    this.#campaignId = initialCampaignId;
  }

  getCampaignId(): string {
    return this.#campaignId;
  }

  getTransition(): AdminCampaignTransition | null {
    return this.#transition;
  }

  isTransitioning(): boolean {
    return this.#transition !== null;
  }

  beginTransition(targetCampaignId: string): AdminCampaignTransition {
    if (!targetCampaignId) {
      throw new Error('Campaign transition target is required.');
    }
    const transition = {
      token: ++this.#transitionSequence,
      targetCampaignId,
    } satisfies AdminCampaignTransition;
    this.#transition = transition;
    this.#notifyTransition();
    return transition;
  }

  commitTransition(transition: AdminCampaignTransition): boolean {
    if (this.#transition?.token !== transition.token) return false;

    const changed = transition.targetCampaignId !== this.#campaignId;
    this.#campaignId = transition.targetCampaignId;
    this.#transition = null;
    this.#notifyTransition();
    if (changed) this.#notifyCampaign();
    return true;
  }

  cancelTransition(transition: AdminCampaignTransition): boolean {
    if (this.#transition?.token !== transition.token) return false;
    this.#transition = null;
    this.#notifyTransition();
    return true;
  }

  setCampaignId(campaignId: string): void {
    if (!campaignId || campaignId === this.#campaignId) return;
    this.#campaignId = campaignId;
    this.#notifyCampaign();
  }

  subscribe(listener: AdminCampaignContextListener): () => void {
    this.#listeners.add(listener);
    listener(this.#campaignId);
    return () => this.#listeners.delete(listener);
  }

  subscribeTransition(listener: AdminCampaignTransitionListener): () => void {
    this.#transitionListeners.add(listener);
    listener(this.#transition);
    return () => this.#transitionListeners.delete(listener);
  }

  #notifyCampaign(): void {
    for (const listener of this.#listeners) listener(this.#campaignId);
  }

  #notifyTransition(): void {
    for (const listener of this.#transitionListeners) listener(this.#transition);
  }
}

export const adminCampaignContext = new AdminCampaignContext();
