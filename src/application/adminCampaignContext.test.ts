import { describe, expect, it, vi } from 'vitest';

import { AdminCampaignContext } from './adminCampaignContext';

const CAMPAIGN_A = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B = '00000000-0000-4000-8000-000000000540';

describe('AdminCampaignContext', () => {
  it('starts a transition synchronously without exposing the target campaign until commit', () => {
    const context = new AdminCampaignContext(CAMPAIGN_A);
    const campaignListener = vi.fn();
    const transitionListener = vi.fn();
    context.subscribe(campaignListener);
    context.subscribeTransition(transitionListener);

    const transition = context.beginTransition(CAMPAIGN_B);

    expect(context.getCampaignId()).toBe(CAMPAIGN_A);
    expect(context.isTransitioning()).toBe(true);
    expect(context.getTransition()).toEqual(transition);
    expect(transitionListener).toHaveBeenLastCalledWith(transition);
    expect(campaignListener).toHaveBeenCalledTimes(1);

    expect(context.commitTransition(transition)).toBe(true);
    expect(context.getCampaignId()).toBe(CAMPAIGN_B);
    expect(context.isTransitioning()).toBe(false);
    expect(transitionListener).toHaveBeenLastCalledWith(null);
    expect(campaignListener).toHaveBeenLastCalledWith(CAMPAIGN_B);
  });

  it('cancels a transition without changing the authoritative campaign', () => {
    const context = new AdminCampaignContext(CAMPAIGN_A);
    const transition = context.beginTransition(CAMPAIGN_B);

    expect(context.cancelTransition(transition)).toBe(true);
    expect(context.getCampaignId()).toBe(CAMPAIGN_A);
    expect(context.isTransitioning()).toBe(false);
    expect(context.commitTransition(transition)).toBe(false);
  });

  it('ignores stale transition tokens after a newer switch starts', () => {
    const context = new AdminCampaignContext(CAMPAIGN_A);
    const first = context.beginTransition(CAMPAIGN_B);
    const second = context.beginTransition(CAMPAIGN_A);

    expect(context.commitTransition(first)).toBe(false);
    expect(context.getTransition()).toEqual(second);
    expect(context.commitTransition(second)).toBe(true);
    expect(context.getCampaignId()).toBe(CAMPAIGN_A);
    expect(context.isTransitioning()).toBe(false);
  });
});
