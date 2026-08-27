import { describe, expect, it } from 'vitest';

import { scopeAdminRpcRequest, scopeAdminTableRequest } from './adminCampaignScope';

const SELECTED_CAMPAIGN = '00000000-0000-4000-8000-000000000053';
const ATTACKER_CAMPAIGN = '00000000-0000-4000-8000-000000000666';

function jsonBody(init: RequestInit | undefined): Record<string, unknown> {
  expect(typeof init?.body).toBe('string');
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('MAP-054 administrative campaign scoping', () => {
  it('overwrites a manipulated REST filter with the selected campaign', () => {
    const url = new URL(
      `https://example.supabase.co/rest/v1/players?campaign_id=eq.${ATTACKER_CAMPAIGN}`,
    );

    const scoped = scopeAdminTableRequest(url, { method: 'PATCH' }, SELECTED_CAMPAIGN);

    expect(scoped.url.searchParams.get('campaign_id')).toBe(`eq.${SELECTED_CAMPAIGN}`);
  });

  it('overwrites a manipulated campaign_id in administrative inserts', () => {
    const url = new URL('https://example.supabase.co/rest/v1/map_entities');
    const scoped = scopeAdminTableRequest(
      url,
      {
        method: 'POST',
        body: JSON.stringify({ id: 'entity-test', campaign_id: ATTACKER_CAMPAIGN }),
      },
      SELECTED_CAMPAIGN,
    );

    expect(jsonBody(scoped.init)).toMatchObject({
      id: 'entity-test',
      campaign_id: SELECTED_CAMPAIGN,
    });
  });

  it('rewrites the entity editor RPC and overwrites attacker p_campaign_id', () => {
    const url = new URL('https://example.supabase.co/rest/v1/rpc/admin_get_map_entity_editor_v3');
    const scoped = scopeAdminRpcRequest(
      url,
      {
        method: 'POST',
        body: JSON.stringify({ p_entity_id: 'entity-test', p_campaign_id: ATTACKER_CAMPAIGN }),
      },
      SELECTED_CAMPAIGN,
    );

    expect(scoped.url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v4')).toBe(true);
    expect(jsonBody(scoped.init)).toEqual({
      p_entity_id: 'entity-test',
      p_campaign_id: SELECTED_CAMPAIGN,
    });
  });

  it('rewrites save and moderation RPCs without changing unrelated endpoints', () => {
    const save = scopeAdminRpcRequest(
      new URL('https://example.supabase.co/rest/v1/rpc/admin_save_map_entity_v3'),
      { method: 'POST', body: JSON.stringify({ p_id: 'entity-test' }) },
      SELECTED_CAMPAIGN,
    );
    expect(save.url.pathname.endsWith('/rpc/admin_save_map_entity_v4')).toBe(true);
    expect(jsonBody(save.init).p_campaign_id).toBe(SELECTED_CAMPAIGN);

    const moderation = scopeAdminRpcRequest(
      new URL('https://example.supabase.co/rest/v1/rpc/admin_moderate_public_request'),
      { method: 'POST', body: JSON.stringify({ p_request_id: 'request-id' }) },
      SELECTED_CAMPAIGN,
    );
    expect(moderation.url.pathname.endsWith('/rpc/admin_moderate_public_request_v2')).toBe(true);
    expect(jsonBody(moderation.init).p_campaign_id).toBe(SELECTED_CAMPAIGN);

    const unrelatedUrl = new URL('https://example.supabase.co/rest/v1/rpc/current_user_is_admin');
    const unrelatedInit = { method: 'POST', body: '{}' } satisfies RequestInit;
    const unrelated = scopeAdminRpcRequest(unrelatedUrl, unrelatedInit, SELECTED_CAMPAIGN);
    expect(unrelated.url.pathname.endsWith('/rpc/current_user_is_admin')).toBe(true);
    expect(unrelated.init).toBe(unrelatedInit);
  });
});
