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
const MAX_SUBMISSION_TOKEN_LENGTH = 512;

interface PublicRequestCampaignBinding {
  readonly campaign_id: string;
  readonly campaign_slug: string;
  readonly campaign_name: string;
  readonly submission_token: string;
  readonly expires_at: string;
}

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

function responseErrorKind(status: number): 'rate-limited' | 'server' | 'rejected' {
  return status === 429 ? 'rate-limited' : status >= 500 ? 'server' : 'rejected';
}

function isCampaignBinding(
  value: unknown,
  campaignId: string,
): value is PublicRequestCampaignBinding {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.campaign_id === campaignId &&
    typeof record.campaign_slug === 'string' &&
    record.campaign_slug.length > 0 &&
    typeof record.campaign_name === 'string' &&
    record.campaign_name.length > 0 &&
    typeof record.submission_token === 'string' &&
    record.submission_token.length > 0 &&
    record.submission_token.length <= MAX_SUBMISSION_TOKEN_LENGTH &&
    typeof record.expires_at === 'string' &&
    record.expires_at.length > 0
  );
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

  async #beginCampaignBinding(campaignId: string, signal: AbortSignal): Promise<string> {
    let response: Response;

    try {
      response = await this.#fetchImplementation(
        `${this.#projectUrl}/rest/v1/rpc/begin_public_request_submission`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            apikey: this.#publishableKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_campaign_id: campaignId }),
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
      throw new PublicPinRequestRepositoryError(
        responseErrorKind(response.status),
        `Supabase rechazó la vinculación de campaña (${response.status}).`,
        { status: response.status },
      );
    }

    let binding: unknown;
    try {
      binding = await response.json();
    } catch (error) {
      throw new PublicPinRequestRepositoryError(
        'invalid-response',
        'Supabase devolvió una vinculación de campaña no verificable.',
        { cause: error },
      );
    }

    if (!isCampaignBinding(binding, campaignId)) {
      throw new PublicPinRequestRepositoryError(
        'invalid-response',
        'Supabase no confirmó de forma verificable la campaña destinataria.',
      );
    }

    return binding.submission_token;
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

    const submissionToken = await this.#beginCampaignBinding(campaignId, signal);
    let response: Response;

    try {
      response = await this.#fetchImplementation(
        `${this.#projectUrl}/rest/v1/rpc/submit_public_request_v3`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            apikey: this.#publishableKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_submission_token: submissionToken,
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
      throw new PublicPinRequestRepositoryError(
        responseErrorKind(response.status),
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
