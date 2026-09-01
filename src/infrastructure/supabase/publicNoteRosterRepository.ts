import type { EntityId, PlayerId } from '../../data/beta02-model';
import { PublicNoteRepositoryError } from './publicNoteRepository';

export interface PublicNoteRosterPlayer {
  readonly id: PlayerId;
  readonly displayName: string;
}

export interface SupabasePublicNoteRosterRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PublicNoteRepositoryError('invalid-response', 'Supabase devolvió JSON inválido.');
  }
}

export class SupabasePublicNoteRosterRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: SupabasePublicNoteRosterRepositoryOptions) {
    this.#projectUrl = options.projectUrl.replace(/\/$/, '');
    this.#publishableKey = options.publishableKey;
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 8_000;
  }

  async load(entityId: EntityId, parentSignal?: AbortSignal): Promise<readonly PublicNoteRosterPlayer[]> {
    const entityUrl = new URL(`${this.#projectUrl}/rest/v1/map_entities`);
    entityUrl.searchParams.set('select', 'campaign_id');
    entityUrl.searchParams.set('id', `eq.${entityId}`);
    entityUrl.searchParams.set('publication_status', 'eq.published');
    entityUrl.searchParams.set('audience', 'eq.public');
    const entityResponse = await this.#request(entityUrl, parentSignal);
    const entityPayload = await readJson(entityResponse);
    if (!Array.isArray(entityPayload) || entityPayload.length !== 1 || !isRecord(entityPayload[0])) {
      throw new PublicNoteRepositoryError('unavailable', 'La entidad no está disponible para notas públicas.');
    }
    const campaignId = entityPayload[0].campaign_id;
    if (typeof campaignId !== 'string' || campaignId.length === 0) {
      throw new PublicNoteRepositoryError('invalid-response', 'La campaña pública de la entidad es inválida.');
    }

    const playersUrl = new URL(`${this.#projectUrl}/rest/v1/players`);
    playersUrl.searchParams.set('select', 'id,display_name,display_order');
    playersUrl.searchParams.set('campaign_id', `eq.${campaignId}`);
    playersUrl.searchParams.set('publication_status', 'eq.published');
    playersUrl.searchParams.set('order', 'display_order.asc,display_name.asc,id.asc');
    const playersResponse = await this.#request(playersUrl, parentSignal);
    const playersPayload = await readJson(playersResponse);
    if (!Array.isArray(playersPayload)) {
      throw new PublicNoteRepositoryError('invalid-response', 'El roster público es inválido.');
    }
    return playersPayload.map((value) => {
      if (!isRecord(value) || typeof value.id !== 'string' || typeof value.display_name !== 'string') {
        throw new PublicNoteRepositoryError('invalid-response', 'El roster público contiene un jugador inválido.');
      }
      if (!/^player-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/.test(value.id)) {
        throw new PublicNoteRepositoryError('invalid-response', 'El roster público contiene un identificador inválido.');
      }
      return { id: value.id as PlayerId, displayName: value.display_name };
    });
  }

  async #request(url: URL, parentSignal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.#timeoutMs);
    const abort = (): void => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.#fetchImplementation(url, {
        method: 'GET',
        headers: { Accept: 'application/json', apikey: this.#publishableKey },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new PublicNoteRepositoryError(
          response.status >= 500 ? 'unavailable' : 'invalid-input',
          'No se pudo cargar el roster para las notas públicas.',
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof PublicNoteRepositoryError) throw error;
      throw new PublicNoteRepositoryError(
        controller.signal.aborted && !parentSignal?.aborted ? 'timeout' : 'network',
        'No se pudo contactar con Supabase para cargar el roster.',
      );
    } finally {
      globalThis.clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    }
  }
}
