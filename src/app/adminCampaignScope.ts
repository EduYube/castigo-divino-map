const CAMPAIGN_SCOPED_TABLES = new Set([
  'categories',
  'tags',
  'players',
  'map_entities',
  'entity_aliases',
  'entity_tags',
  'entity_player_dispositions',
  'entity_player_associations',
  'public_notes',
  'public_note_tags',
  'character_location_relations',
  'character_location_events',
  'public_requests',
  'campaign_geographic_entity_links',
]);

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

export interface ScopedAdminRequest {
  readonly url: URL;
  readonly init: RequestInit | undefined;
}

export function scopeAdminTableRequest(
  url: URL,
  init: RequestInit | undefined,
  campaignId: string,
): ScopedAdminRequest {
  const match = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
  const table = match?.[1];
  if (!table || !CAMPAIGN_SCOPED_TABLES.has(table)) return { url, init };

  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'PATCH' || method === 'DELETE') {
    url.searchParams.set('campaign_id', `eq.${campaignId}`);
    return { url, init };
  }

  if (method === 'POST') {
    const body = parseJsonObject(init?.body);
    if (body) {
      return {
        url,
        init: { ...init, body: JSON.stringify({ ...body, campaign_id: campaignId }) },
      };
    }
  }

  return { url, init };
}

export function scopeAdminRpcRequest(
  url: URL,
  init: RequestInit | undefined,
  campaignId: string,
): ScopedAdminRequest {
  const body = parseJsonObject(init?.body);
  if (!body) return { url, init };

  if (url.pathname.endsWith('/rest/v1/rpc/admin_get_map_entity_editor_v3')) {
    url.pathname = url.pathname.replace(
      '/admin_get_map_entity_editor_v3',
      '/admin_get_map_entity_editor_v6',
    );
    return {
      url,
      init: { ...init, body: JSON.stringify({ ...body, p_campaign_id: campaignId }) },
    };
  }

  if (url.pathname.endsWith('/rest/v1/rpc/admin_save_map_entity_v3')) {
    url.pathname = url.pathname.replace('/admin_save_map_entity_v3', '/admin_save_map_entity_v7');
    return {
      url,
      init: { ...init, body: JSON.stringify({ ...body, p_campaign_id: campaignId }) },
    };
  }

  if (url.pathname.endsWith('/rest/v1/rpc/admin_moderate_public_request')) {
    url.pathname = url.pathname.replace(
      '/admin_moderate_public_request',
      '/admin_moderate_public_request_v2',
    );
    return {
      url,
      init: { ...init, body: JSON.stringify({ ...body, p_campaign_id: campaignId }) },
    };
  }

  if (url.pathname.endsWith('/rest/v1/rpc/admin_moderate_public_request_v2')) {
    return {
      url,
      init: { ...init, body: JSON.stringify({ ...body, p_campaign_id: campaignId }) },
    };
  }

  return { url, init };
}
