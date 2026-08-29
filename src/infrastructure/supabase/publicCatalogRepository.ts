import type {
  PublicCampaignCatalogV3,
  PublicCampaignV3,
  PublicCatalogSnapshotV3,
  PublicGlobalGeographicNameV3,
} from '../../data/beta03-model';
import {
  PublicDataRepositoryError,
  createSha256Checksum,
  type PublicCatalogEnvelope,
  type PublicCatalogRepository,
} from '../../data-access/publicCatalog';
import {
  fetchCompletePublicCatalogTable,
  INITIAL_PUBLIC_CAMPAIGN_ID,
  PUBLIC_CAMPAIGNS_QUERY,
  projectCampaignGeographicEntityLinks,
  PUBLIC_CATALOG_TABLE_QUERIES,
  PublicCatalogReadError,
  type PublicCatalogTableQuery,
} from '../../data-access/publicCatalogQueryContract.js';
import { parsePublicCatalogSnapshotV3 } from '../snapshot/multicampaignSnapshotCodec';
import { buildPublicCatalogEnvelopeV2 } from './publicCatalogCodec';
import type { PublicCatalogTablePayloadsWithCharacterLocations } from './publicCharacterLocationRelations';

export { parsePublicCatalogSnapshotV2 } from './publicCatalogCodec';

const PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type PublicCatalogPayloadsWithGeographicLinks = PublicCatalogTablePayloadsWithCharacterLocations & {
  readonly geographicEntityLinks: readonly Record<string, unknown>[];
};

export interface SupabasePublicCatalogRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
  readonly allowLocalProject?: boolean;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return globalThis.atob(padded);
}

function isLegacyAnonKey(value: string): boolean {
  if (!LEGACY_ANON_KEY_PATTERN.test(value)) return false;
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

function toRepositoryError(error: PublicCatalogReadError): PublicDataRepositoryError {
  return new PublicDataRepositoryError(error.kind, error.message, {
    source: 'supabase',
    status: error.status ?? undefined,
    cause: error,
  });
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PublicDataRepositoryError('invalid-response', `${path} debe ser texto no vacío.`, {
      source: 'supabase',
    });
  }
  return value;
}

function expectDisplayOrder(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new PublicDataRepositoryError(
      'invalid-response',
      `${path} debe ser un entero no negativo.`,
      {
        source: 'supabase',
      },
    );
  }
  return value as number;
}

function parseCampaignRow(row: Record<string, unknown>, index: number): PublicCampaignV3 {
  const path = `campaigns[${index}]`;
  if (row.status !== 'active') {
    throw new PublicDataRepositoryError(
      'invalid-response',
      `${path}.status debe ser active en la proyección pública.`,
      { source: 'supabase' },
    );
  }
  return {
    id: expectString(row.id, `${path}.id`),
    slug: expectString(row.slug, `${path}.slug`),
    name: expectString(row.name, `${path}.name`),
    status: 'active',
    displayOrder: expectDisplayOrder(row.display_order, `${path}.display_order`),
  };
}

function toCampaignCatalogV3(
  campaign: PublicCampaignV3,
  catalog: Extract<PublicCatalogEnvelope['data'], { contract: 'beta02' }>['catalog'],
): PublicCampaignCatalogV3 {
  return {
    campaignId: campaign.id,
    categories: catalog.categories,
    tags: catalog.tags,
    players: catalog.players,
    entities: catalog.entities,
    dispositions: catalog.dispositions,
    associations: catalog.associations,
    characterLocationRelations: catalog.characterLocationRelations,
    notes: catalog.notes,
    characterLocationEvents: catalog.characterLocationEvents,
    geographicEntityLinks: catalog.geographicNames.flatMap((name) =>
      name.entityId === null
        ? []
        : [
            {
              campaignId: campaign.id,
              geographicNameId: name.id,
              entityId: name.entityId,
            },
          ],
    ),
  };
}

function toGlobalGeographicNames(
  catalog: Extract<PublicCatalogEnvelope['data'], { contract: 'beta02' }>['catalog'],
): readonly PublicGlobalGeographicNameV3[] {
  return catalog.geographicNames.map((name) => ({
    id: name.id,
    slug: name.slug,
    name: name.name,
    language: name.language,
    aliases: name.aliases,
    coordinates: name.coordinates,
    searchExtent: name.searchExtent,
    recommendedZoom: name.recommendedZoom,
  }));
}

export class SupabasePublicCatalogRepository implements PublicCatalogRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #now: () => number;

  constructor(options: SupabasePublicCatalogRepositoryOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const isLocalProject = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);
    const validProjectUrl =
      PROJECT_URL_PATTERN.test(projectUrl) ||
      (options.allowLocalProject === true && isLocalProject);
    const validPublishableKey = PUBLISHABLE_KEY_PATTERN.test(publishableKey);
    const validLocalAnonKey =
      options.allowLocalProject === true && isLocalProject && isLegacyAnonKey(publishableKey);

    if (!projectUrl || !publishableKey) {
      throw new PublicDataRepositoryError(
        'configuration-missing',
        'Falta la URL o la clave publicable de Supabase.',
        { source: 'supabase', recoverable: false },
      );
    }
    if (!validProjectUrl) {
      throw new PublicDataRepositoryError(
        'configuration-invalid',
        'La URL pública de Supabase no tiene un formato permitido.',
        { source: 'supabase', recoverable: false },
      );
    }
    if (!validPublishableKey && !validLocalAnonKey) {
      throw new PublicDataRepositoryError(
        'configuration-invalid',
        'La configuración alojada requiere una clave sb_publishable_; una clave anon legacy solo se admite con Supabase local.',
        { source: 'supabase', recoverable: false },
      );
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#now = options.now ?? Date.now;
  }

  async #loadTable(
    query: PublicCatalogTableQuery,
    signal: AbortSignal,
    campaignId: string = INITIAL_PUBLIC_CAMPAIGN_ID,
  ): Promise<readonly Record<string, unknown>[]> {
    try {
      return await fetchCompletePublicCatalogTable({
        projectUrl: this.#projectUrl,
        publishableKey: this.#publishableKey,
        campaignId,
        query,
        fetchImplementation: this.#fetchImplementation,
        signal,
      });
    } catch (error) {
      if (error instanceof PublicCatalogReadError) throw toRepositoryError(error);
      throw error;
    }
  }

  async #loadCampaign(
    campaign: PublicCampaignV3,
    signal: AbortSignal,
  ): Promise<Extract<PublicCatalogEnvelope['data'], { contract: 'beta02' }>['catalog']> {
    const entries = Object.entries(PUBLIC_CATALOG_TABLE_QUERIES) as [
      keyof PublicCatalogPayloadsWithGeographicLinks,
      PublicCatalogTableQuery,
    ][];
    const responses = await Promise.all(
      entries.map(
        async ([key, query]) => [key, await this.#loadTable(query, signal, campaign.id)] as const,
      ),
    );
    const payloads = Object.fromEntries(
      responses,
    ) as unknown as PublicCatalogPayloadsWithGeographicLinks;
    const geographicNames = projectCampaignGeographicEntityLinks(
      payloads.geographicNames,
      payloads.geographicEntityLinks,
      campaign.id,
    );
    const envelope = await buildPublicCatalogEnvelopeV2(
      { ...payloads, geographicNames } as PublicCatalogTablePayloadsWithCharacterLocations,
      this.#now,
    );
    if (envelope.data.contract !== 'beta02') {
      throw new PublicDataRepositoryError(
        'invalid-response',
        `La campaña ${campaign.slug} no produjo un catálogo Beta 0.2 válido.`,
        { source: 'supabase' },
      );
    }
    return envelope.data.catalog;
  }

  async load(options: { readonly signal: AbortSignal }): Promise<PublicCatalogEnvelope> {
    const controller = new AbortController();
    const handleParentAbort = (): void => controller.abort();
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', handleParentAbort, { once: true });

    try {
      const campaignRows = await this.#loadTable(PUBLIC_CAMPAIGNS_QUERY, controller.signal);
      const campaigns = campaignRows.map(parseCampaignRow);
      if (campaigns.length === 0) {
        throw new PublicDataRepositoryError(
          'invalid-response',
          'Supabase no publicó ninguna campaña activa.',
          { source: 'supabase' },
        );
      }
      const campaignCatalogsV2 = await Promise.all(
        campaigns.map((campaign) => this.#loadCampaign(campaign, controller.signal)),
      );
      const geographicNames = toGlobalGeographicNames(campaignCatalogsV2[0]!);
      const campaignCatalogs = campaigns.map((campaign, index) =>
        toCampaignCatalogV3(campaign, campaignCatalogsV2[index]!),
      );
      const content = {
        schemaVersion: 3 as const,
        campaigns,
        campaignCatalogs,
        geographicNames,
      };
      const checksum = await createSha256Checksum(content);
      const generatedAt = new Date(this.#now()).toISOString();
      const snapshot: PublicCatalogSnapshotV3 = {
        ...content,
        generatedAt,
        sourceRevision: checksum,
        checksum,
      };
      const validated = await parsePublicCatalogSnapshotV3(snapshot, this.#now);
      return {
        ...validated,
        source: 'supabase',
        metadata: {
          ...validated.metadata,
          contract: 'beta03',
          schemaVersion: 3,
          stale: false,
        },
      };
    } catch (error) {
      controller.abort();
      if (error instanceof PublicCatalogReadError) throw toRepositoryError(error);
      throw error;
    } finally {
      options.signal.removeEventListener('abort', handleParentAbort);
    }
  }
}
