export interface RemotePublicRowsOptions {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export function loadRemotePublicRows(
  options?: RemotePublicRowsOptions,
): Promise<Record<string, readonly Record<string, unknown>[]>>;
