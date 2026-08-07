import type {
  AdminMapEntityDetail,
  AdminMapEntityDraft,
  AdminMapEntityRecord,
  AdminMapEntityReferences,
} from '../domain/adminMapEntities';

export type AdminMapEntityErrorCode =
  | 'validation'
  | 'conflict'
  | 'invalid-relation'
  | 'referenced'
  | 'operation-prohibited'
  | 'session-expired'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'invalid-response'
  | 'stale-write'
  | 'unexpected';

export interface AdminMapEntityIssue {
  readonly code: AdminMapEntityErrorCode;
  readonly message: string;
  readonly field: string | null;
  readonly status: number | null;
}

export class AdminMapEntityRepositoryError extends Error {
  readonly code: AdminMapEntityErrorCode;
  readonly field: string | null;
  readonly status: number | null;

  constructor(
    code: AdminMapEntityErrorCode,
    message: string,
    options: {
      readonly field?: string | null;
      readonly status?: number | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AdminMapEntityRepositoryError';
    this.code = code;
    this.field = options.field ?? null;
    this.status = options.status ?? null;
  }
}

export function toAdminMapEntityIssue(error: unknown): AdminMapEntityIssue {
  if (error instanceof AdminMapEntityRepositoryError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      status: error.status,
    };
  }

  return {
    code: 'unexpected',
    message: 'No se pudo completar la operación sobre la entidad.',
    field: null,
    status: null,
  };
}

export interface AdminMapEntityRepository {
  list(options: { readonly signal: AbortSignal }): Promise<readonly AdminMapEntityRecord[]>;
  loadReferences(options: { readonly signal: AbortSignal }): Promise<AdminMapEntityReferences>;
  load(entityId: string, options: { readonly signal: AbortSignal }): Promise<AdminMapEntityDetail>;
  save(
    original: AdminMapEntityDetail | null,
    draft: AdminMapEntityDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminMapEntityDetail>;
  delete(detail: AdminMapEntityDetail, options: { readonly signal: AbortSignal }): Promise<void>;
}
