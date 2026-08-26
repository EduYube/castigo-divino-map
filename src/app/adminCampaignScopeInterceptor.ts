import { adminCampaignContext } from '../application/adminCampaignContext';
import { AUTH_SESSION_STORAGE_KEY } from '../infrastructure/supabase/authSessionStorage';

const CAMPAIGN_SCOPED_TABLES = new Set([
  'categories',
  'tags',
  'players',
  'map_entities',
  'entity_aliases',
  'entity_tags',
  'entity_player_dispositions',
  'public_notes',
  'public_note_tags',
  'character_location_relations',
  'character_location_events',
  'public_requests',
  'campaign_geographic_entity_links',
]);

const originalFetch = globalThis.fetch.bind(globalThis);

function storedAdminAccessToken(): string | null {
  try {
    const serialized = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const token = (parsed as Record<string, unknown>).accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

function isCurrentAdminRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const token = storedAdminAccessToken();
  if (!token) return false;
  return requestHeaders(input, init).get('Authorization') === `Bearer ${token}`;
}

function toUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return new URL(input.href);
    if (input instanceof Request) return new URL(input.url);
    return new URL(input, window.location.href);
  } catch {
    return null;
  }
}

function parseJsonObject(body: BodyInit | null | undefined): Record<string, unknown> | null {
  if (typeof body !== 'string') return null;
  try {
    const value = JSON.parse(body) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function scopeTableRequest(
  url: URL,
  init: RequestInit | undefined,
  campaignId: string,
): { readonly url: URL; readonly init: RequestInit | undefined } {
  const match = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
  const table = match?.[1];
  if (!table || !CAMPAIGN_SCOPED_TABLES.has(table)) return { url, init };

  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'PATCH' || method === 'DELETE') {
    if (!url.searchParams.has('campaign_id')) {
      url.searchParams.set('campaign_id', `eq.${campaignId}`);
    }
    return { url, init };
  }

  if (method === 'POST') {
    const body = parseJsonObject(init?.body);
    if (body && body.campaign_id === undefined) {
      return {
        url,
        init: { ...init, body: JSON.stringify({ ...body, campaign_id: campaignId }) },
      };
    }
  }

  return { url, init };
}

function scopeRpcRequest(
  url: URL,
  init: RequestInit | undefined,
  campaignId: string,
): { readonly url: URL; readonly init: RequestInit | undefined } {
  const body = parseJsonObject(init?.body);
  if (!body) return { url, init };

  if (url.pathname.endsWith('/rest/v1/rpc/admin_get_map_entity_editor_v3')) {
    url.pathname = url.pathname.replace(
      '/admin_get_map_entity_editor_v3',
      '/admin_get_map_entity_editor_v4',
    );
    return {
      url,
      init: { ...init, body: JSON.stringify({ p_campaign_id: campaignId, ...body }) },
    };
  }

  if (url.pathname.endsWith('/rest/v1/rpc/admin_save_map_entity_v3')) {
    url.pathname = url.pathname.replace('/admin_save_map_entity_v3', '/admin_save_map_entity_v4');
    return {
      url,
      init: { ...init, body: JSON.stringify({ p_campaign_id: campaignId, ...body }) },
    };
  }

  if (url.pathname.endsWith('/rest/v1/rpc/admin_moderate_public_request')) {
    url.pathname = url.pathname.replace(
      '/admin_moderate_public_request',
      '/admin_moderate_public_request_v2',
    );
    return {
      url,
      init: { ...init, body: JSON.stringify({ p_campaign_id: campaignId, ...body }) },
    };
  }

  return { url, init };
}

async function campaignScopedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isCurrentAdminRequest(input, init)) return originalFetch(input, init);

  const url = toUrl(input);
  if (!url) return originalFetch(input, init);
  const campaignId = adminCampaignContext.getCampaignId();
  const tableScoped = scopeTableRequest(url, init, campaignId);
  const rpcScoped = scopeRpcRequest(tableScoped.url, tableScoped.init, campaignId);
  return originalFetch(rpcScoped.url, rpcScoped.init);
}

globalThis.fetch = campaignScopedFetch;
