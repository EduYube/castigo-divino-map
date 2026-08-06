import type { CampaignCatalog } from '../../data/model';
import { assertValidCampaignData } from '../../data/validate';
import {
  PublicDataRepositoryError,
  createSha256Checksum,
  type PublicCatalogEnvelope,
  type PublicCatalogRepository,
} from '../../data-access/publicCatalog';

export const PUBLIC_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface PublicCatalogSnapshotV1 {
  readonly schemaVersion: 1;
  readonly contract: 'beta01';
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly catalog: CampaignCatalog;
}

export interface SnapshotRepositoryOptions {
  readonly url: string;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, property: string): string {
  const value = record[property];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PublicDataRepositoryError(
      'invalid-snapshot',
      `El snapshot público no contiene un valor válido en “${property}”.`,
      { source: 'snapshot' },
    );
  }

  return value;
}

export async function parsePublicCatalogSnapshotV1(
  value: unknown,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  if (!isRecord(value)) {
    throw new PublicDataRepositoryError(
      'invalid-snapshot',
      'El snapshot público no es un objeto.',
      {
        source: 'snapshot',
      },
    );
  }

  if (value.schemaVersion !== 1 || value.contract !== 'beta01') {
    throw new PublicDataRepositoryError(
      'unsupported-schema',
      'La versión del snapshot público no es compatible con la Beta 0.1.',
      { source: 'snapshot', recoverable: false },
    );
  }

  const generatedAt = readRequiredString(value, 'generatedAt');
  const generatedAtMs = Date.parse(generatedAt);

  if (!Number.isFinite(generatedAtMs)) {
    throw new PublicDataRepositoryError(
      'invalid-snapshot',
      'La fecha de generación del snapshot público no es válida.',
      { source: 'snapshot' },
    );
  }

  const sourceRevision = readRequiredString(value, 'sourceRevision');
  const checksum = readRequiredString(value, 'checksum');
  const catalog = value.catalog;

  try {
    assertValidCampaignData(catalog);
  } catch (error) {
    throw new PublicDataRepositoryError(
      'invalid-snapshot',
      'El catálogo del snapshot público no supera la validación de datos.',
      { source: 'snapshot', cause: error },
    );
  }

  const calculatedChecksum = await createSha256Checksum({
    schemaVersion: 1,
    contract: 'beta01',
    generatedAt,
    sourceRevision,
    catalog,
  });

  if (checksum !== calculatedChecksum) {
    throw new PublicDataRepositoryError(
      'checksum-mismatch',
      'El checksum del snapshot público no coincide con su contenido.',
      { source: 'snapshot' },
    );
  }

  const loadedAt = new Date(now()).toISOString();

  return {
    data: {
      contract: 'beta01',
      catalog: catalog as CampaignCatalog,
    },
    source: 'bundled-snapshot',
    metadata: {
      contract: 'beta01',
      schemaVersion: 1,
      generatedAt,
      loadedAt,
      sourceRevision,
      checksum,
      stale: now() - generatedAtMs > PUBLIC_SNAPSHOT_MAX_AGE_MS,
    },
  };
}

export class BundledPublicCatalogRepository implements PublicCatalogRepository {
  readonly #url: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #now: () => number;

  constructor(options: SnapshotRepositoryOptions) {
    this.#url = options.url;
    this.#fetchImplementation = options.fetchImplementation ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async load(options: { readonly signal: AbortSignal }): Promise<PublicCatalogEnvelope> {
    let response: Response;

    try {
      response = await this.#fetchImplementation(this.#url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-cache',
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal.aborted) {
        throw new PublicDataRepositoryError(
          'request-aborted',
          'La carga del snapshot público se canceló.',
          { source: 'snapshot', cause: error },
        );
      }

      throw new PublicDataRepositoryError(
        'invalid-snapshot',
        'No se pudo descargar el snapshot público empaquetado.',
        { source: 'snapshot', cause: error },
      );
    }

    if (!response.ok) {
      throw new PublicDataRepositoryError(
        'invalid-snapshot',
        `No se pudo descargar el snapshot público empaquetado (${response.status}).`,
        { source: 'snapshot', status: response.status },
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch (error) {
      throw new PublicDataRepositoryError(
        'invalid-snapshot',
        'El snapshot público empaquetado no contiene JSON válido.',
        { source: 'snapshot', cause: error },
      );
    }

    return parsePublicCatalogSnapshotV1(payload, this.#now);
  }
}

export class StaticPublicCatalogRepository implements PublicCatalogRepository {
  readonly #catalog: CampaignCatalog;
  readonly #sourceRevision: string;
  readonly #now: () => number;

  constructor(
    catalog: CampaignCatalog,
    options: { readonly sourceRevision: string; readonly now?: () => number },
  ) {
    this.#catalog = catalog;
    this.#sourceRevision = options.sourceRevision;
    this.#now = options.now ?? Date.now;
  }

  async load(options: { readonly signal: AbortSignal }): Promise<PublicCatalogEnvelope> {
    if (options.signal.aborted) {
      throw new PublicDataRepositoryError(
        'request-aborted',
        'La carga del catálogo estático se canceló.',
        { source: 'application' },
      );
    }

    assertValidCampaignData(this.#catalog);
    const loadedAt = new Date(this.#now()).toISOString();
    const checksum = await createSha256Checksum(this.#catalog);

    return {
      data: { contract: 'beta01', catalog: this.#catalog },
      source: 'legacy-static',
      metadata: {
        contract: 'beta01',
        schemaVersion: 1,
        generatedAt: loadedAt,
        loadedAt,
        sourceRevision: this.#sourceRevision,
        checksum,
        stale: false,
      },
    };
  }
}
