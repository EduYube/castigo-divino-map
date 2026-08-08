import {
  AdminPublicRequestRepositoryError,
  type AdminPublicRequestRepository,
} from '../../data-access/adminPublicRequests';
import type {
  AdminPublicRequestEntityType,
  AdminPublicRequestModerationResult,
  AdminPublicRequestRecord,
  AdminPublicRequestStatus,
} from '../../domain/adminPublicRequests';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 8_000;
const PAGE_SIZE = 1000;

interface AdminPublicRequestRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly storage?: BrowserAuthSessionStorage;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
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
    throw new AdminPublicRequestRepositoryError(
      'invalid-response',
      'Supabase devolvió una solicitud administrativa no válida.',
    );
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AdminPublicRequestRepositoryError(
      'invalid-response',
      'Supabase devolvió una solicitud administrativa no válida.',
    );
  }
  return value;
}

function finiteNumber(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdminPublicRequestRepositoryError(
      'invalid-response',
      'Supabase devolvió coordenadas de solicitud no válidas.',
    );
  }
  return value;
}

function requestStatus(value: unknown): AdminPublicRequestStatus {
  if (
    value === 'pending' ||
    value === 'accepted' ||
    value === 'rejected' ||
    value === 'converted' ||
    value === 'archived'
  ) {
    return value;
  }
  throw new AdminPublicRequestRepositoryError(
    'invalid-response',
    'Supabase devolvió un estado de solicitud no válido.',
  );
}

function entityType(value: unknown): AdminPublicRequestEntityType {
  if (value === 'character' || value === 'location') return value;
  throw new AdminPublicRequestRepositoryError(
    'invalid-response',
    'Supabase devolvió un tipo de solicitud no válido.',
  );
}

function mapRequest(row: Record<string, unknown>): AdminPublicRequestRecord {
  return {
    id: requiredString(row, 'id'),
    senderName: requiredString(row, 'sender_name'),
    proposedName: requiredString(row, 'proposed_name'),
    entityType: entityType(row.entity_type),
    x: finiteNumber(row, 'x'),
    y: finiteNumber(row, 'y'),
    description: requiredString(row, 'description'),
    reason: requiredString(row, 'reason'),
    requestStatus: requestStatus(row.request_status),
    moderatorUserId: nullableString(row, 'moderator_user_id'),
    moderationNote: nullableString(row, 'moderation_note'),
    convertedEntityId: nullableString(row, 'converted_entity_id'),
    moderatedAt: nullableString(row, 'moderated_at'),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

function mapModerationResult(payload: unknown): AdminPublicRequestModerationResult {
  if (!isRecord(payload) || !isRecord(payload.request)) {
    throw new AdminPublicRequestRepositoryError(
      'invalid-response',
      'Supabase no devolvió el resultado de moderación esperado.',
    );
  }
  const draftEntityId = payload.draft_entity_id;
  if (draftEntityId !== null && typeof draftEntityId !== 'string') {
    throw new AdminPublicRequestRepositoryError(
      'invalid-response',
      'Supabase devolvió una referencia de borrador no válida.',
    );
  }
  return {
    request: mapRequest(payload.request),
    draftEntityId,
  };
}

function parseErrorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null;
}

export class SupabaseAdminPublicRequestRepository implements AdminPublicRequestRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;

  constructor(options: AdminPublicRequestRepositoryOptions) {
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
      throw new AdminPublicRequestRepositoryError(
        'backend-unavailable',
        'La moderación administrativa no está disponible.',
      );
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#storage = options.storage ?? new BrowserAuthSessionStorage();
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? Date.now;
    this.#storage.assertAvailable();
  }

  async list(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminPublicRequestRecord[]> {
    const rows: Record<string, unknown>[] = [];
    let offset = 0;
    let expectedTotal: number | null = null;

    do {
      const url = new URL(`${this.#projectUrl}/rest/v1/public_requests`);
      url.searchParams.set(
        'select',
        'id,sender_name,proposed_name,entity_type,x,y,description,reason,request_status,moderator_user_id,moderation_note,converted_entity_id,moderated_at,created_at,updated_at',
      );
      url.searchParams.set('order', 'created_at.desc,id.asc');
      const response = await this.#request(
        url,
        {
          method: 'GET',
          headers: {
            Prefer: 'count=exact',
            Range: `${offset}-${offset + PAGE_SIZE - 1}`,
            'Range-Unit': 'items',
          },
        },
        options.signal,
      );
      const payload = await this.#readJson(response);
      if (!Array.isArray(payload) || payload.some((row) => !isRecord(row))) {
        throw new AdminPublicRequestRepositoryError(
          'invalid-response',
          'Supabase devolvió una bandeja de solicitudes no válida.',
        );
      }
      const contentRange = response.headers.get('content-range');
      const match = contentRange?.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
      if (!match) {
        throw new AdminPublicRequestRepositoryError(
          'invalid-response',
          'Supabase no confirmó el tamaño de la bandeja administrativa.',
        );
      }
      const total = Number(match[3]);
      if (!Number.isSafeInteger(total)) {
        throw new AdminPublicRequestRepositoryError(
          'invalid-response',
          'Supabase devolvió un tamaño de bandeja no válido.',
        );
      }
      if (expectedTotal === null) expectedTotal = total;
      else if (expectedTotal !== total) {
        throw new AdminPublicRequestRepositoryError(
          'stale-write',
          'Las solicitudes cambiaron durante la lectura. Vuelve a cargar la bandeja.',
        );
      }
      if (total === 0) return [];
      const page = payload as Record<string, unknown>[];
      if (Number(match[1]) !== offset || Number(match[2]) !== offset + page.length - 1) {
        throw new AdminPublicRequestRepositoryError(
          'invalid-response',
          'Supabase devolvió una página de solicitudes incompleta.',
        );
      }
      rows.push(...page);
      offset += page.length;
    } while (expectedTotal === null || offset < expectedTotal);

    return rows.map(mapRequest);
  }

  reject(
    request: AdminPublicRequestRecord,
    moderationNote: string,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPublicRequestModerationResult> {
    return this.#moderate('reject', request, moderationNote, options.signal);
  }

  convert(
    request: AdminPublicRequestRecord,
    moderationNote: string,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPublicRequestModerationResult> {
    return this.#moderate('convert', request, moderationNote, options.signal);
  }

  async #moderate(
    action: 'reject' | 'convert',
    request: AdminPublicRequestRecord,
    moderationNote: string,
    signal: AbortSignal,
  ): Promise<AdminPublicRequestModerationResult> {
    const response = await this.#request(
      new URL(`${this.#projectUrl}/rest/v1/rpc/admin_moderate_public_request`),
      {
        method: 'POST',
        body: JSON.stringify({
          p_request_id: request.id,
          p_expected_updated_at: request.updatedAt,
          p_action: action,
          p_moderation_note: moderationNote.trim() || null,
        }),
      },
      signal,
    );
    return mapModerationResult(await this.#readJson(response));
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
          throw new AdminPublicRequestRepositoryError(
            'request-timeout',
            'La moderación superó el tiempo de espera.',
            { cause: error },
          );
        }
        throw new AdminPublicRequestRepositoryError(
          'backend-unavailable',
          'No se pudo contactar con el servicio de moderación.',
          { cause: error },
        );
      }

      if (response.status === 401) {
        throw new AdminPublicRequestRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
          { status: 401 },
        );
      }
      if (response.status === 403) {
        throw new AdminPublicRequestRepositoryError(
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
        if (code === '40001' || code === '23505') {
          throw new AdminPublicRequestRepositoryError(
            'stale-write',
            'La solicitud ya cambió o fue procesada. Recarga la bandeja antes de continuar.',
            { status: response.status },
          );
        }
        if (code === '23514' || code === '22P02' || code === '23503') {
          throw new AdminPublicRequestRepositoryError(
            'operation-prohibited',
            'PostgreSQL rechazó la moderación para proteger el flujo editorial.',
            { status: response.status },
          );
        }
        if (code === '42501') {
          throw new AdminPublicRequestRepositoryError(
            'unauthorized',
            'PostgreSQL rechazó la operación administrativa.',
            { status: response.status },
          );
        }
        throw new AdminPublicRequestRepositoryError(
          response.status >= 500 ? 'backend-unavailable' : 'unexpected',
          'El servicio administrativo rechazó la moderación.',
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
      throw new AdminPublicRequestRepositoryError(
        'session-expired',
        'No se pudo leer la sesión administrativa de esta pestaña.',
        { cause: error },
      );
    }
    if (!serialized) {
      throw new AdminPublicRequestRepositoryError(
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
      throw new AdminPublicRequestRepositoryError(
        'session-expired',
        'La sesión administrativa almacenada no es válida.',
        { cause: error },
      );
    }
  }

  async #readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new AdminPublicRequestRepositoryError(
        'invalid-response',
        'Supabase devolvió JSON administrativo no válido.',
        { cause: error },
      );
    }
  }
}
