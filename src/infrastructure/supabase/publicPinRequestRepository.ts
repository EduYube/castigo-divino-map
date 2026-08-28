import {
  PublicPinRequestRepositoryError,
  type PublicPinRequestRepository,
} from '../../data-access/publicPinRequest';
import {
  buildPublicPinRequestRpcPayload,
  type ValidatedPublicPinRequest,
} from '../../domain/publicPinRequest';

const PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const CAMPAIGN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SupabasePublicPinRequestRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly allowLocalProject?: boolean;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  return globalThis.atob(padded);
}

function isLegacyAnonKey(value: string): boolean {
  if (!LEGACY_ANON_KEY_PATTERN.test(value)) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(value.split('.')[1] ?? '')) as unknown;

    return (
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>).role === 'anon'
    );
  } catch {
    return false;
  }
}

export class SupabasePublicPinRequestRepository implements PublicPinRequestRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #fetchImplementation: typeof fetch;

  constructor(options: SupabasePublicPinRequestRepositoryOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const isLocalProject = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);
    const validProjectUrl =
      PROJECT_URL_PATTERN.test(projectUrl) ||
      (options.allowLocalProject === true && isLocalProject);
    const validPublishableKey = PUBLISHABLE_KEY_PATTERN.test(publishableKey);
    const validLocalAnonKey =
      options.allowLocalProject === true && isLocalProject && isLegacyAnonKey(publishableKey);

    if (
      !projectUrl ||
      !publishableKey ||
      !validProjectUrl ||
      (!validPublishableKey && !validLocalAnonKey)
    ) {
      throw new PublicPinRequestRepositoryError(
        'configuration',
        'La configuración pública de Supabase no permite enviar solicitudes.',
      );
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  async submit(
    request: ValidatedPublicPinRequest,
    campaignId: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!CAMPAIGN_ID_PATTERN.test(campaignId)) {
      throw new PublicPinRequestRepositoryError(
        'configuration',
        'La campaña seleccionada no es válida para enviar solicitudes.',
      );
    }

    let response: Response;

    try {
      response = await this.#fetchImplementation(
        `${this.#projectUrl}/rest/v1/rpc/submit_public_request_v2`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            apikey: this.#publishableKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_campaign_id: campaignId,
            ...buildPublicPinRequestRpcPayload(request),
          }),
          cache: 'no-store',
          signal,
        },
      );
    } catch (error) {
      throw new PublicPinRequestRepositoryError('network', 'No se pudo contactar con Supabase.', {
        cause: error,
      });
    }

    if (!response.ok) {
      const kind =
        response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'server' : 'rejected';

      throw new PublicPinRequestRepositoryError(
        kind,
        `Supabase rechazó la solicitud pública (${response.status}).`,
        { status: response.status },
      );
    }

    let result: unknown;

    try {
      result = await response.json();
    } catch (error) {
      throw new PublicPinRequestRepositoryError(
        'invalid-response',
        'Supabase devolvió una respuesta no verificable.',
        { cause: error },
      );
    }

    if (result !== true) {
      throw new PublicPinRequestRepositoryError(
        'invalid-response',
        'Supabase no confirmó la solicitud pública.',
      );
    }
  }
}
