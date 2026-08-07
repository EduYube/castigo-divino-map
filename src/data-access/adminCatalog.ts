import type {
  AdminCatalogDraft,
  AdminCatalogRecord,
  AdminCatalogResourceKind,
  AdminEntityReference,
  AdminGeographicNameReference,
} from '../domain/adminCatalog';

export type AdminCatalogErrorCode =
  | 'validation'
  | 'conflict'
  | 'referenced'
  | 'operation-prohibited'
  | 'session-expired'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'invalid-response'
  | 'stale-write'
  | 'unexpected';

export interface AdminCatalogIssue {
  readonly code: AdminCatalogErrorCode;
  readonly message: string;
  readonly field: string | null;
  readonly status: number | null;
}

export class AdminCatalogRepositoryError extends Error {
  readonly code: AdminCatalogErrorCode;
  readonly field: string | null;
  readonly status: number | null;

  constructor(
    code: AdminCatalogErrorCode,
    message: string,
    options: {
      readonly field?: string | null;
      readonly status?: number | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AdminCatalogRepositoryError';
    this.code = code;
    this.field = options.field ?? null;
    this.status = options.status ?? null;
  }
}

export function toAdminCatalogIssue(error: unknown): AdminCatalogIssue {
  if (error instanceof AdminCatalogRepositoryError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      status: error.status,
    };
  }

  return {
    code: 'unexpected',
    message: 'No se pudo completar la operación administrativa.',
    field: null,
    status: null,
  };
}

export interface AdminCatalogRepository {
  list(
    kind: AdminCatalogResourceKind,
    options: { readonly signal: AbortSignal },
  ): Promise<readonly AdminCatalogRecord[]>;
  create(
    draft: AdminCatalogDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord>;
  update(
    original: AdminCatalogRecord,
    draft: AdminCatalogDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord>;
  archive(
    record: AdminCatalogRecord,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord>;
  delete(record: AdminCatalogRecord, options: { readonly signal: AbortSignal }): Promise<void>;
  listEntityReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminEntityReference[]>;
  listGeographicNameReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminGeographicNameReference[]>;
}
