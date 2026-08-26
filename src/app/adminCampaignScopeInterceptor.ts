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

async function campaignScopedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isCurrentAdminRequest(input, init)) return originalFetch(input, init);

  const url = toUrl(input);
  if (!url) return originalFetch(input, init);
  const campaignId = adminCampaignContext.getCampaignId();
  const tableScoped = scopeAdminTableRequest(url, init, campaignId);
  const rpcScoped = scopeAdminRpcRequest(tableScoped.url, tableScoped.init, campaignId);
  return originalFetch(rpcScoped.url, rpcScoped.init);
}

globalThis.fetch = campaignScopedFetch;
