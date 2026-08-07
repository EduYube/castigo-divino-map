import type {
  AdminCharacterLocationRelationDraft,
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
} from '../domain/characterLocationRelations';

export type AdminCharacterLocationRelationErrorCode =
  | 'validation'
  | 'conflict'
  | 'invalid-relation'
  | 'operation-prohibited'
  | 'session-expired'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'invalid-response'
  | 'stale-write'
  | 'unexpected';

export interface AdminCharacterLocationRelationIssue {
  readonly code: AdminCharacterLocationRelationErrorCode;
  readonly message: string;
  readonly field: string | null;
  readonly status: number | null;
}

export class AdminCharacterLocationRelationRepositoryError extends Error {
  readonly code: AdminCharacterLocationRelationErrorCode;
  readonly field: string | null;
  readonly status: number | null;

  constructor(
    code: AdminCharacterLocationRelationErrorCode,
    message: string,
    options: {
      readonly field?: string | null;
      readonly status?: number | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AdminCharacterLocationRelationRepositoryError';
    this.code = code;
    this.field = options.field ?? null;
    this.status = options.status ?? null;
  }
}

export function toAdminCharacterLocationRelationIssue(
  error: unknown,
): AdminCharacterLocationRelationIssue {
  if (error instanceof AdminCharacterLocationRelationRepositoryError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      status: error.status,
    };
  }
  return {
    code: 'unexpected',
    message: 'No se pudo completar la operación sobre la relación.',
    field: null,
    status: null,
  };
}

export interface AdminCharacterLocationRelationRepository {
  list(options: { readonly signal: AbortSignal }): Promise<readonly AdminCharacterLocationRelationRecord[]>;
  loadReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<AdminCharacterLocationRelationReferences>;
  create(
    draft: AdminCharacterLocationRelationDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCharacterLocationRelationRecord>;
  update(
    original: AdminCharacterLocationRelationRecord,
    draft: AdminCharacterLocationRelationDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCharacterLocationRelationRecord>;
}
