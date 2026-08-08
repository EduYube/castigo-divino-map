import type { ValidatedPublicPinRequest } from '../domain/publicPinRequest';

export type PublicPinRequestErrorKind =
  | 'configuration'
  | 'network'
  | 'rate-limited'
  | 'rejected'
  | 'server'
  | 'invalid-response';

export class PublicPinRequestRepositoryError extends Error {
  readonly kind: PublicPinRequestErrorKind;
  readonly status: number | null;

  constructor(
    kind: PublicPinRequestErrorKind,
    message: string,
    options: { readonly status?: number; readonly cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'PublicPinRequestRepositoryError';
    this.kind = kind;
    this.status = options.status ?? null;
  }
}

export interface PublicPinRequestRepository {
  submit(request: ValidatedPublicPinRequest, signal: AbortSignal): Promise<void>;
}
