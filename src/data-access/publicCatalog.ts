import type { PublicCatalogSnapshotV2 } from '../data/beta02-model';
import type { CampaignCatalog } from '../data/model';

export type BackendState = 'connected' | 'degraded' | 'offline';
export type PublicCatalogContract = 'beta01' | 'beta02';
export type PublicDataSource =
  | 'supabase'
  | 'memory-cache'
  | 'session-cache'
  | 'bundled-snapshot'
  | 'legacy-static';

export type PublicDataErrorCode =
  | 'configuration-missing'
  | 'configuration-invalid'
  | 'network-unavailable'
  | 'request-timeout'
  | 'request-aborted'
  | 'http-error'
  | 'rate-limited'
  | 'invalid-response'
  | 'partial-response'
  | 'invalid-snapshot'
  | 'checksum-mismatch'
  | 'unsupported-schema'
  | 'cache-unavailable'
  | 'unexpected';

export type PublicCatalogPayload =
  | {
      readonly contract: 'beta01';
      readonly catalog: CampaignCatalog;
    }
  | {
      readonly contract: 'beta02';
      readonly catalog: PublicCatalogSnapshotV2;
    };

export interface PublicCatalogMetadata {
  readonly contract: PublicCatalogContract;
  readonly schemaVersion: 1 | 2;
  readonly generatedAt: string;
  readonly loadedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly stale: boolean;
}

export interface PublicCatalogEnvelope {
  readonly data: PublicCatalogPayload;
  readonly source: PublicDataSource;
  readonly metadata: PublicCatalogMetadata;
}

export interface PublicDataIssue {
  readonly code: PublicDataErrorCode;
  readonly source: 'supabase' | 'snapshot' | 'cache' | 'application';
  readonly recoverable: boolean;
  readonly message: string;
  readonly status: number | null;
}

export interface BackendObservation {
  readonly state: BackendState;
  readonly checkedAt: string;
  readonly latencyMs: number | null;
  readonly attempt: number;
  readonly reason: PublicDataErrorCode | null;
}

export interface PublicDataDegradation {
  readonly usingFallback: boolean;
  readonly fallbackReason: PublicDataErrorCode | null;
  readonly snapshotAgeMs: number | null;
  readonly retryScheduledAt: string | null;
}

export interface PublicCatalogLoadResult {
  readonly availability: 'ready' | 'unavailable';
  readonly data: PublicCatalogPayload | null;
  readonly source: PublicDataSource | null;
  readonly metadata: PublicCatalogMetadata | null;
  readonly remoteSource: Extract<
    PublicDataSource,
    'supabase' | 'memory-cache' | 'session-cache'
  > | null;
  readonly remoteMetadata: PublicCatalogMetadata | null;
  readonly backend: BackendObservation;
  readonly errors: readonly PublicDataIssue[];
  readonly degradation: PublicDataDegradation;
}

export interface PublicCatalogRepository {
  load(options: { readonly signal: AbortSignal }): Promise<PublicCatalogEnvelope>;
}

export class PublicDataRepositoryError extends Error {
  readonly code: PublicDataErrorCode;
  readonly source: PublicDataIssue['source'];
  readonly recoverable: boolean;
  readonly status: number | null;

  constructor(
    code: PublicDataErrorCode,
    message: string,
    options: {
      readonly source: PublicDataIssue['source'];
      readonly recoverable?: boolean;
      readonly status?: number | null;
      readonly cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'PublicDataRepositoryError';
    this.code = code;
    this.source = options.source;
    this.recoverable = options.recoverable ?? true;
    this.status = options.status ?? null;
  }
}

export function toPublicDataIssue(error: unknown): PublicDataIssue {
  if (error instanceof PublicDataRepositoryError) {
    return {
      code: error.code,
      source: error.source,
      recoverable: error.recoverable,
      message: error.message,
      status: error.status,
    };
  }

  return {
    code: 'unexpected',
    source: 'application',
    recoverable: true,
    message: 'Se produjo un error inesperado al cargar el contenido público.',
    status: null,
  };
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalizeValue(entryValue)]),
    );
  }

  return value;
}

export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export async function createSha256Checksum(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serializeCanonicalJson(value)),
  );
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return `sha256:${hexadecimal}`;
}
