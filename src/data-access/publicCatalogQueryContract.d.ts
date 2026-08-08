export interface PublicCatalogTableQuery {
  readonly name: string;
  readonly select: string;
  readonly order: string;
  readonly published: boolean;
}

export interface ParsedPublicCatalogContentRange {
  readonly start: number | null;
  readonly end: number | null;
  readonly total: number;
}

export type PublicCatalogReadErrorKind =
  | 'partial-response'
  | 'invalid-response'
  | 'request-aborted'
  | 'network-unavailable'
  | 'rate-limited'
  | 'http-error';

export class PublicCatalogReadError extends Error {
  readonly kind: PublicCatalogReadErrorKind;
  readonly status: number | null;

  constructor(
    kind: PublicCatalogReadErrorKind,
    message: string,
    options?: { readonly status?: number; readonly cause?: unknown },
  );
}

export const PUBLIC_CATALOG_PAGE_SIZE: number;
export const PUBLIC_CATALOG_TABLE_QUERIES: Readonly<Record<string, PublicCatalogTableQuery>>;

export function parsePublicCatalogContentRange(
  value: string | null,
  table: string,
): ParsedPublicCatalogContentRange;

export function fetchCompletePublicCatalogTable(options: {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly query: PublicCatalogTableQuery;
  readonly fetchImplementation: typeof fetch;
  readonly signal: AbortSignal;
  readonly pageSize?: number;
}): Promise<readonly Record<string, unknown>[]>;
