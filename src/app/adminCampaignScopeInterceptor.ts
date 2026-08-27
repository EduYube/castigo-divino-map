import { adminCampaignContext } from '../application/adminCampaignContext';
import { AUTH_SESSION_STORAGE_KEY } from '../infrastructure/supabase/authSessionStorage';
import { scopeAdminRpcRequest, scopeAdminTableRequest } from './adminCampaignScope';

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

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
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

export function shouldBlockAdminMutationDuringCampaignTransition(
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  if (!adminCampaignContext.isTransitioning()) return false;
  const method = requestMethod(input, init);
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

async function campaignScopedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isCurrentAdminRequest(input, init)) return originalFetch(input, init);

  const url = toUrl(input);
  if (!url) return originalFetch(input, init);
  if (shouldBlockAdminMutationDuringCampaignTransition(input, init)) {
    return new Response(
      JSON.stringify({
        code: 'campaign_transition',
        message: 'Administrative mutations are blocked while the campaign is changing.',
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  const campaignId = adminCampaignContext.getCampaignId();
  const tableScoped = scopeAdminTableRequest(url, init, campaignId);
  const rpcScoped = scopeAdminRpcRequest(tableScoped.url, tableScoped.init, campaignId);
  return originalFetch(rpcScoped.url, rpcScoped.init);
}

globalThis.fetch = campaignScopedFetch;
