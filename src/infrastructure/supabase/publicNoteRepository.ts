import { AUTH_SESSION_STORAGE_KEY } from './authSessionStorage';
import type { EntityId, PlayerId } from '../../data/beta02-model';
import type {
  PublicNoteDraft,
  PublicNoteWriteRecord,
  PublicPlayerNoteDraft,
} from '../../domain/publicNotes';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 8_000;
const NOTE_SELECT =
  'id,entity_id,title,body,sort_order,author_kind,author_player_id,created_at,updated_at,last_modifier_kind,last_modifier_player_id';

export type PublicNoteRepositoryErrorCode =
  | 'configuration'
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'rate-limited'
  | 'invalid-input'
  | 'invalid-response'
  | 'unavailable';

export class PublicNoteRepositoryError extends Error {
  readonly code: PublicNoteRepositoryErrorCode;
  readonly status: number | null;

  constructor(code: PublicNoteRepositoryErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'PublicNoteRepositoryError';
    this.code = code;
    this.status = status;
  }
}

export interface SupabasePublicNoteRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly storage?: Storage;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly allowLocalProject?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyAnonKey(value: string): boolean {
  if (!LEGACY_ANON_KEY_PATTERN.test(value)) return false;
  try {
    const segment = value.split('.')[1] ?? '';
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded)) as unknown;
    return isRecord(payload) && payload.role === 'anon';
  } catch {
    return false;
  }
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PublicNoteRepositoryError('invalid-response', `Respuesta inválida: ${field}.`);
  }
  return value;
}

function expectNullablePlayerId(value: unknown, field: string): PlayerId | null {
  if (value === null) return null;
  const parsed = expectString(value, field);
  if (!/^player-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/.test(parsed)) {
    throw new PublicNoteRepositoryError('invalid-response', `Respuesta inválida: ${field}.`);
  }
  return parsed as PlayerId;
}

function parseNoteRow(value: unknown): PublicNoteWriteRecord {
  if (!isRecord(value)) {
    throw new PublicNoteRepositoryError('invalid-response', 'Supabase devolvió una nota inválida.');
  }
  const allowed = new Set([
    'id',
    'entity_id',
    'title',
    'body',
    'sort_order',
    'author_kind',
    'author_player_id',
    'created_at',
    'updated_at',
    'last_modifier_kind',
    'last_modifier_player_id',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new PublicNoteRepositoryError('invalid-response', `Campo inesperado en nota: ${key}.`);
    }
  }
  const authorKind = value.author_kind;
  const lastModifierKind = value.last_modifier_kind;
  if (
    (authorKind !== 'master' && authorKind !== 'player') ||
    (lastModifierKind !== 'master' && lastModifierKind !== 'player')
  ) {
    throw new PublicNoteRepositoryError('invalid-response', 'Supabase devolvió autoría inválida.');
  }
  const authorPlayerId = expectNullablePlayerId(value.author_player_id, 'author_player_id');
  const lastModifierPlayerId = expectNullablePlayerId(
    value.last_modifier_player_id,
    'last_modifier_player_id',
  );
  if ((authorKind === 'master') !== (authorPlayerId === null)) {
    throw new PublicNoteRepositoryError('invalid-response', 'La autoría original es incoherente.');
  }
  if ((lastModifierKind === 'master') !== (lastModifierPlayerId === null)) {
    throw new PublicNoteRepositoryError(
      'invalid-response',
      'La última modificación es incoherente.',
    );
  }
  if (!Number.isSafeInteger(value.sort_order) || (value.sort_order as number) < 0) {
    throw new PublicNoteRepositoryError('invalid-response', 'Supabase devolvió un orden inválido.');
  }

  return {
    id: expectString(value.id, 'id'),
    entityId: expectString(value.entity_id, 'entity_id') as EntityId,
    title: expectString(value.title, 'title'),
    body: expectString(value.body, 'body'),
    sortOrder: value.sort_order as number,
    authorKind,
    authorPlayerId,
    createdAt: expectString(value.created_at, 'created_at'),
    updatedAt: expectString(value.updated_at, 'updated_at'),
    lastModifierKind,
    lastModifierPlayerId,
  };
}

function normalizeErrorStatus(status: number): PublicNoteRepositoryErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 422) return 'invalid-input';
  return status >= 500 ? 'unavailable' : 'invalid-input';
}

export class SupabasePublicNoteRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #storage: Storage;
  readonly #now: () => number;
  readonly #timeoutMs: number;

  constructor(options: SupabasePublicNoteRepositoryOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const local = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);
    if (
      (!HOSTED_PROJECT_URL_PATTERN.test(projectUrl) && !(options.allowLocalProject && local)) ||
      (!PUBLISHABLE_KEY_PATTERN.test(publishableKey) &&
        !(options.allowLocalProject && local && isLegacyAnonKey(publishableKey)))
    ) {
      throw new PublicNoteRepositoryError(
        'configuration',
        'Configuración pública de Supabase inválida.',
      );
    }
    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#storage = options.storage ?? window.sessionStorage;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async list(entityId: EntityId, signal?: AbortSignal): Promise<readonly PublicNoteWriteRecord[]> {
    const url = new URL(`${this.#projectUrl}/rest/v1/public_notes`);
    url.searchParams.set('select', NOTE_SELECT);
    url.searchParams.set('entity_id', `eq.${entityId}`);
    url.searchParams.set('publication_status', 'eq.published');
    url.searchParams.set('order', 'sort_order.asc,id.asc');
    const response = await this.#request(
      url,
      { method: 'GET', headers: this.#publicHeaders() },
      signal,
    );
    const payload = await this.#json(response);
    if (!Array.isArray(payload)) {
      throw new PublicNoteRepositoryError(
        'invalid-response',
        'Supabase devolvió una lista de notas inválida.',
      );
    }
    return payload.map(parseNoteRow);
  }

  async createPlayer(
    entityId: EntityId,
    draft: PublicPlayerNoteDraft,
    signal?: AbortSignal,
  ): Promise<PublicNoteWriteRecord> {
    return this.#rpc(
      'create_public_player_note',
      {
        p_entity_id: entityId,
        p_player_id: draft.playerId,
        p_title: draft.title,
        p_body: draft.body,
      },
      false,
      signal,
    );
  }

  async createMaster(
    entityId: EntityId,
    draft: PublicNoteDraft,
    signal?: AbortSignal,
  ): Promise<PublicNoteWriteRecord> {
    return this.#rpc(
      'create_master_public_note',
      { p_entity_id: entityId, p_title: draft.title, p_body: draft.body },
      true,
      signal,
    );
  }

  async updateMaster(
    entityId: EntityId,
    noteId: string,
    draft: PublicNoteDraft,
    signal?: AbortSignal,
  ): Promise<PublicNoteWriteRecord> {
    return this.#rpc(
      'update_master_public_note',
      { p_entity_id: entityId, p_note_id: noteId, p_title: draft.title, p_body: draft.body },
      true,
      signal,
    );
  }

  async archiveMaster(entityId: EntityId, noteId: string, signal?: AbortSignal): Promise<void> {
    const response = await this.#rpcResponse(
      'archive_master_public_note',
      { p_entity_id: entityId, p_note_id: noteId },
      true,
      signal,
    );
    const payload = await this.#json(response);
    if (payload !== true) {
      throw new PublicNoteRepositoryError(
        'invalid-response',
        'Supabase no confirmó la retirada de la nota.',
      );
    }
  }

  #publicHeaders(): Record<string, string> {
    return { Accept: 'application/json', apikey: this.#publishableKey };
  }

  #adminAccessToken(): string {
    let parsed: unknown;
    try {
      const serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
      parsed = serialized ? JSON.parse(serialized) : null;
    } catch {
      throw new PublicNoteRepositoryError(
        'unauthorized',
        'La sesión administrativa no está disponible.',
      );
    }
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.accessToken !== 'string' ||
      parsed.accessToken.length === 0 ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt * 1000 <= this.#now()
    ) {
      throw new PublicNoteRepositoryError('unauthorized', 'La sesión administrativa ha caducado.');
    }
    return parsed.accessToken;
  }

  async #rpc(
    name: string,
    body: Record<string, unknown>,
    admin: boolean,
    signal?: AbortSignal,
  ): Promise<PublicNoteWriteRecord> {
    const response = await this.#rpcResponse(name, body, admin, signal);
    const payload = await this.#json(response);
    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new PublicNoteRepositoryError(
        'invalid-response',
        'Supabase no devolvió la nota persistida.',
      );
    }
    return parseNoteRow(payload[0]);
  }

  #rpcResponse(
    name: string,
    body: Record<string, unknown>,
    admin: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...this.#publicHeaders(),
      'Content-Type': 'application/json',
    };
    if (admin) headers.Authorization = `Bearer ${this.#adminAccessToken()}`;
    return this.#request(
      `${this.#projectUrl}/rest/v1/rpc/${name}`,
      { method: 'POST', headers, body: JSON.stringify(body) },
      signal,
    );
  }

  async #request(
    input: RequestInfo | URL,
    init: RequestInit,
    parentSignal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.#timeoutMs);
    const abort = (): void => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.#fetchImplementation(input, {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new PublicNoteRepositoryError(
          normalizeErrorStatus(response.status),
          response.status === 429
            ? 'Demasiadas notas en poco tiempo. Inténtalo de nuevo más tarde.'
            : 'No se pudo guardar la nota pública.',
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof PublicNoteRepositoryError) throw error;
      throw new PublicNoteRepositoryError(
        controller.signal.aborted && !parentSignal?.aborted ? 'timeout' : 'network',
        'No se pudo contactar con Supabase para las notas públicas.',
      );
    } finally {
      globalThis.clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    }
  }

  async #json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new PublicNoteRepositoryError('invalid-response', 'Supabase devolvió JSON inválido.');
    }
  }
}
