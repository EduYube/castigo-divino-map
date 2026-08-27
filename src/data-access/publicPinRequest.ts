import type { ValidatedPublicPinRequest } from '../domain/publicPinRequest';

export type PublicPinRequestRepositoryErrorKind =
  'configuration' | 'network' | 'rate-limited' | 'rejected' | 'server' | 'invalid-response';

export class PublicPinRequestRepositoryError extends Error {
  readonly kind: PublicPinRequestRepositoryErrorKind;
  readonly status: number | null;

  constructor(
    kind: PublicPinRequestRepositoryErrorKind,
    message: string,
    options: { readonly status?: number | null; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PublicPinRequestRepositoryError';
    this.kind = kind;
    this.status = options.status ?? null;
  }
}

export interface PublicPinRequestRepository {
  submit(
    request: ValidatedPublicPinRequest,
    campaignId: string,
    signal: AbortSignal,
  ): Promise<void>;
}
