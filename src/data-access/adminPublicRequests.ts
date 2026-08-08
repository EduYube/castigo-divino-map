import type {
  AdminPublicRequestModerationResult,
  AdminPublicRequestRecord,
} from '../domain/adminPublicRequests';

export type AdminPublicRequestErrorCode =
  | 'operation-prohibited'
  | 'session-expired'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'invalid-response'
  | 'stale-write'
  | 'unexpected';

export interface AdminPublicRequestIssue {
  readonly code: AdminPublicRequestErrorCode;
  readonly message: string;
  readonly status: number | null;
}

export class AdminPublicRequestRepositoryError extends Error {
  readonly code: AdminPublicRequestErrorCode;
  readonly status: number | null;

  constructor(
    code: AdminPublicRequestErrorCode,
    message: string,
    options: { readonly status?: number | null; readonly cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AdminPublicRequestRepositoryError';
    this.code = code;
    this.status = options.status ?? null;
  }
}

export function toAdminPublicRequestIssue(error: unknown): AdminPublicRequestIssue {
  if (error instanceof AdminPublicRequestRepositoryError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return {
    code: 'unexpected',
    message: 'No se pudo completar la moderación de la solicitud.',
    status: null,
  };
}

export interface AdminPublicRequestRepository {
  list(options: { readonly signal: AbortSignal }): Promise<readonly AdminPublicRequestRecord[]>;
  reject(
    request: AdminPublicRequestRecord,
    moderationNote: string,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPublicRequestModerationResult>;
  convert(
    request: AdminPublicRequestRecord,
    moderationNote: string,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPublicRequestModerationResult>;
}
