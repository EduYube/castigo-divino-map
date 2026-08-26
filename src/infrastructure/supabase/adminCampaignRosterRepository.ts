import {
  AdminCampaignRosterRepositoryError,
  type AdminCampaignRosterRepository,
} from '../../data-access/adminCampaignRoster';
import {
  normalizeAccentColor,
  type AdminCampaignDraft,
  type AdminCampaignRecord,
  type AdminPlayerDraft,
  type AdminPlayerRecord,
  type CampaignStatus,
  type PlayerPublicationStatus,
} from '../../domain/adminCampaignRoster';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 8_000;
const CAMPAIGN_SELECT = 'id,slug,name,status,display_order,archived_at,updated_at';
const PLAYER_SELECT =
  'id,campaign_id,slug,display_name,publication_status,published_at,display_order,accent_color,archived_at,updated_at';

interface AdminCampaignRosterRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly storage?: BrowserAuthSessionStorage;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly uuid?: () => string;
  readonly allowLocalProject?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
}

function isLegacyAnonKey(value: string): boolean {
  if (!LEGACY_ANON_KEY_PATTERN.test(value)) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(value.split('.')[1] ?? '')) as unknown;
    return isRecord(payload) && payload.role === 'anon';
  } catch {
    return false;
  }
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdminCampaignRosterRepositoryError(
      'invalid-response',
      'Supabase devolvió datos de campaña o roster no válidos.',
    );
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AdminCampaignRosterRepositoryError(
      'invalid-response',
      'Supabase devolvió datos de campaña o roster no válidos.',
    );
  }
  return value;
}

function nonNegativeInteger(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new AdminCampaignRosterRepositoryError(
      'invalid-response',
      'Supabase devolvió un orden de campaña o roster no válido.',
    );
  }
  return value as number;
}

function campaignStatus(value: unknown): CampaignStatus {
  if (value === 'active' || value === 'archived') return value;
  throw new AdminCampaignRosterRepositoryError(
    'invalid-response',
    'Supabase devolvió un estado de campaña no válido.',
  );
}

function playerStatus(value: unknown): PlayerPublicationStatus {
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new AdminCampaignRosterRepositoryError(
    'invalid-response',
    'Supabase devolvió un estado de jugador no válido.',
  );
}

function mapCampaign(row: Record<string, unknown>): AdminCampaignRecord {
  return {
    id: requiredString(row, 'id'),
    slug: requiredString(row, 'slug'),
    name: requiredString(row, 'name'),
    status: campaignStatus(row.status),
    displayOrder: nonNegativeInteger(row, 'display_order'),
    archivedAt: nullableString(row, 'archived_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

function mapPlayer(row: Record<string, unknown>): AdminPlayerRecord {
  return {
    id: requiredString(row, 'id'),
    campaignId: requiredString(row, 'campaign_id'),
    slug: requiredString(row, 'slug'),
    displayName: requiredString(row, 'display_name'),
    publicationStatus: playerStatus(row.publication_status),
    publishedAt: nullableString(row, 'published_at'),
    displayOrder: nonNegativeInteger(row, 'display_order'),
    accentColor: requiredString(row, 'accent_color'),
    archivedAt: nullableString(row, 'archived_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'player';
}

function parseErrorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null;
}

export class SupabaseAdminCampaignRosterRepository implements AdminCampaignRosterRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;
  readonly #uuid: () => string;

  constructor(options: AdminCampaignRosterRepositoryOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const isLocalProject = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);
    const validUrl =
      HOSTED_PROJECT_URL_PATTERN.test(projectUrl) ||
      (options.allowLocalProject === true && isLocalProject);
    const validKey =
      PUBLISHABLE_KEY_PATTERN.test(publishableKey) ||
      (options.allowLocalProject === true && isLocalProject && isLegacyAnonKey(publishableKey));

    if (!projectUrl || !publishableKey || !validUrl || !validKey) {
      throw new AdminCampaignRosterRepositoryError(
        'backend-unavailable',
        'La configuración administrativa de campañas no está disponible.',
      );
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#storage = options.storage ?? new BrowserAuthSessionStorage();
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? Date.now;
    this.#uuid = options.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
    this.#storage.assertAvailable();
  }

  async listCampaigns(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminCampaignRecord[]> {
    const url = this.#tableUrl('campaigns');
    url.searchParams.set('select', CAMPAIGN_SELECT);
    url.searchParams.set('order', 'status.asc,display_order.asc,name.asc,id.asc');
    return (await this.#getRows(url, options.signal)).map(mapCampaign);
  }

  async createCampaign(
    draft: AdminCampaignDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCampaignRecord> {
    return mapCampaign(
      await this.#mutateOne(
        this.#tableUrl('campaigns'),
        'POST',
        {
          id: this.#uuid(),
          slug: draft.slug.trim(),
          name: draft.name.trim(),
          status: 'active',
          display_order: draft.displayOrder,
        },
        CAMPAIGN_SELECT,
        options.signal,
      ),
    );
  }

  async updateCampaign(
    original: AdminCampaignRecord,
    draft: AdminCampaignDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCampaignRecord> {
    if (draft.slug !== original.slug) {
      throw new AdminCampaignRosterRepositoryError(
        'validation',
        'El slug estable de una campaña existente no puede cambiar.',
        { field: 'slug' },
      );
    }
    const url = this.#tableUrl('campaigns');
    url.searchParams.set('id', `eq.${original.id}`);
    url.searchParams.set('updated_at', `eq.${original.updatedAt}`);
    return mapCampaign(
      await this.#mutateOne(
        url,
        'PATCH',
        { name: draft.name.trim(), display_order: draft.displayOrder },
        CAMPAIGN_SELECT,
        options.signal,
      ),
    );
  }

  async setCampaignStatus(
    original: AdminCampaignRecord,
    status: CampaignStatus,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCampaignRecord> {
    const url = this.#tableUrl('campaigns');
    url.searchParams.set('id', `eq.${original.id}`);
    url.searchParams.set('updated_at', `eq.${original.updatedAt}`);
    return mapCampaign(
      await this.#mutateOne(url, 'PATCH', { status }, CAMPAIGN_SELECT, options.signal),
    );
  }

  async listPlayers(
    campaignId: string,
    options: { readonly signal: AbortSignal },
  ): Promise<readonly AdminPlayerRecord[]> {
    const url = this.#tableUrl('players');
    url.searchParams.set('select', PLAYER_SELECT);
    url.searchParams.set('campaign_id', `eq.${campaignId}`);
    url.searchParams.set('order', 'publication_status.asc,display_order.asc,display_name.asc,id.asc');
    const players = (await this.#getRows(url, options.signal)).map(mapPlayer);
    if (players.some((player) => player.campaignId !== campaignId)) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'Supabase mezcló jugadores de campañas distintas.',
      );
    }
    return players;
  }

  async createPlayer(
    campaignId: string,
    draft: AdminPlayerDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPlayerRecord> {
    const uuid = this.#uuid().replace(/-/g, '');
    const id = `player-${uuid}`;
    const slug = `${slugify(draft.displayName)}-${uuid.slice(0, 8)}`;
    const row = await this.#mutateOne(
      this.#tableUrl('players'),
      'POST',
      {
        campaign_id: campaignId,
        id,
        slug,
        display_name: draft.displayName.trim(),
        name_language: 'en',
        publication_status: 'published',
        display_order: draft.displayOrder,
        accent_color: normalizeAccentColor(draft.accentColor),
      },
      PLAYER_SELECT,
      options.signal,
    );
    const player = mapPlayer(row);
    if (player.campaignId !== campaignId) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'Supabase creó el jugador fuera de la campaña seleccionada.',
      );
    }
    return player;
  }

  async updatePlayer(
    campaignId: string,
    original: AdminPlayerRecord,
    draft: AdminPlayerDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPlayerRecord> {
    this.#assertPlayerScope(campaignId, original);
    return this.#patchPlayer(
      campaignId,
      original,
      {
        display_name: draft.displayName.trim(),
        display_order: draft.displayOrder,
        accent_color: normalizeAccentColor(draft.accentColor),
      },
      options.signal,
    );
  }

  async setPlayerArchived(
    campaignId: string,
    original: AdminPlayerRecord,
    archived: boolean,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPlayerRecord> {
    this.#assertPlayerScope(campaignId, original);
    if (archived) {
      return this.#patchPlayer(
        campaignId,
        original,
        { publication_status: 'archived' },
        options.signal,
      );
    }

    // The established editorial lifecycle only permits archived -> draft.
    // If this player had previously been public, restore that state in a second
    // optimistic write so published_at remains immutable and history is kept.
    const draft = await this.#patchPlayer(
      campaignId,
      original,
      { publication_status: 'draft' },
      options.signal,
    );
    return original.publishedAt
      ? this.#patchPlayer(
          campaignId,
          draft,
          { publication_status: 'published' },
          options.signal,
        )
      : draft;
  }

  #assertPlayerScope(campaignId: string, player: AdminPlayerRecord): void {
    if (player.campaignId !== campaignId) {
      throw new AdminCampaignRosterRepositoryError(
        'operation-prohibited',
        'El jugador no pertenece a la campaña administrativa seleccionada.',
      );
    }
  }

  async #patchPlayer(
    campaignId: string,
    original: AdminPlayerRecord,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<AdminPlayerRecord> {
    const url = this.#tableUrl('players');
    url.searchParams.set('id', `eq.${original.id}`);
    url.searchParams.set('campaign_id', `eq.${campaignId}`);
    url.searchParams.set('updated_at', `eq.${original.updatedAt}`);
    const player = mapPlayer(
      await this.#mutateOne(url, 'PATCH', body, PLAYER_SELECT, signal),
    );
    if (player.campaignId !== campaignId) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'Supabase devolvió un jugador fuera del contexto de campaña.',
      );
    }
    return player;
  }

  #tableUrl(table: string): URL {
    return new URL(`${this.#projectUrl}/rest/v1/${table}`);
  }

  async #getRows(url: URL, signal: AbortSignal): Promise<readonly Record<string, unknown>[]> {
    const response = await this.#request(
      url,
      {
        method: 'GET',
        headers: { Prefer: 'count=exact', Range: '0-999', 'Range-Unit': 'items' },
      },
      signal,
    );
    const rows = await this.#readRows(response);
    const range = response.headers.get('content-range');
    const match = range?.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
    if (!match || Number(match[3]) !== rows.length) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'La colección administrativa excede el límite seguro o llegó incompleta.',
      );
    }
    return rows;
  }

  async #mutateOne(
    url: URL,
    method: 'POST' | 'PATCH',
    body: Record<string, unknown>,
    select: string,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    url.searchParams.set('select', select);
    const response = await this.#request(
      url,
      {
        method,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
      signal,
    );
    const rows = await this.#readRows(response);
    if (rows.length === 0) {
      throw new AdminCampaignRosterRepositoryError(
        'stale-write',
        'El registro cambió mientras lo editabas. Recarga antes de continuar.',
      );
    }
    if (rows.length !== 1) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'Supabase no confirmó una única mutación administrativa.',
      );
    }
    return rows[0] as Record<string, unknown>;
  }

  async #request(url: URL, init: RequestInit, parentSignal: AbortSignal): Promise<Response> {
    const accessToken = this.#readAccessToken();
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener('abort', abort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.#fetchImplementation(url, {
          ...init,
          headers: {
            Accept: 'application/json',
            apikey: this.#publishableKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...init.headers,
          },
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted && !parentSignal.aborted) {
          throw new AdminCampaignRosterRepositoryError(
            'request-timeout',
            'La operación de campañas superó el tiempo de espera.',
            { cause: error },
          );
        }
        throw new AdminCampaignRosterRepositoryError(
          'backend-unavailable',
          'No se pudo contactar con el servicio administrativo de campañas.',
          { cause: error },
        );
      }

      if (response.status === 401) {
        throw new AdminCampaignRosterRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
          { status: 401 },
        );
      }
      if (response.status === 403) {
        throw new AdminCampaignRosterRepositoryError(
          'unauthorized',
          'La sesión ya no dispone de autorización administrativa.',
          { status: 403 },
        );
      }
      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        const code = parseErrorCode(payload);
        if (code === '23505') {
          throw new AdminCampaignRosterRepositoryError(
            'conflict',
            'El ID, slug o identidad entra en conflicto con un registro existente.',
            { status: response.status },
          );
        }
        if (code === '23503' || code === '23514' || code === '22P02') {
          throw new AdminCampaignRosterRepositoryError(
            'operation-prohibited',
            'PostgreSQL rechazó el cambio para proteger la campaña, el roster o su historial.',
            { status: response.status },
          );
        }
        if (code === '42501') {
          throw new AdminCampaignRosterRepositoryError(
            'unauthorized',
            'PostgreSQL rechazó la operación administrativa.',
            { status: response.status },
          );
        }
        throw new AdminCampaignRosterRepositoryError(
          response.status >= 500 ? 'backend-unavailable' : 'unexpected',
          'El servicio administrativo rechazó la operación.',
          { status: response.status },
        );
      }
      return response;
    } finally {
      globalThis.clearTimeout(timeout);
      parentSignal.removeEventListener('abort', abort);
    }
  }

  #readAccessToken(): string {
    let serialized: string | null;
    try {
      serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
    } catch (error) {
      throw new AdminCampaignRosterRepositoryError(
        'session-expired',
        'No se pudo leer la sesión administrativa de esta pestaña.',
        { cause: error },
      );
    }
    if (!serialized) {
      throw new AdminCampaignRosterRepositoryError(
        'session-expired',
        'No hay una sesión administrativa activa.',
      );
    }
    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (
        !isRecord(parsed) ||
        parsed.version !== 1 ||
        typeof parsed.accessToken !== 'string' ||
        parsed.accessToken.length === 0 ||
        typeof parsed.expiresAt !== 'number' ||
        parsed.expiresAt * 1000 <= this.#now()
      ) {
        throw new Error('invalid administrative session');
      }
      return parsed.accessToken;
    } catch (error) {
      throw new AdminCampaignRosterRepositoryError(
        'session-expired',
        'La sesión administrativa almacenada no es válida.',
        { cause: error },
      );
    }
  }

  async #readRows(response: Response): Promise<readonly Record<string, unknown>[]> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'Supabase devolvió JSON administrativo no válido.',
        { cause: error },
      );
    }
    if (!Array.isArray(payload) || payload.some((row) => !isRecord(row))) {
      throw new AdminCampaignRosterRepositoryError(
        'invalid-response',
        'Supabase devolvió una colección administrativa no válida.',
      );
    }
    return payload as Record<string, unknown>[];
  }
}
