import {
  PublicDataRepositoryError,
  toPublicDataIssue,
  type BackendState,
  type PublicCatalogEnvelope,
  type PublicCatalogLoadResult,
  type PublicCatalogRepository,
  type PublicDataErrorCode,
  type PublicDataIssue,
} from '../data-access/publicCatalog';
import type { PublicCatalogSessionCache } from '../infrastructure/snapshot/sessionCatalogCache';

const RETRIABLE_ERROR_CODES = new Set<PublicDataErrorCode>([
  'network-unavailable',
  'request-timeout',
  'rate-limited',
  'http-error',
]);

export type PublicCatalogResultListener = (result: PublicCatalogLoadResult) => void;

export interface ResilientPublicCatalogServiceOptions {
  readonly fallbackRepositories: readonly PublicCatalogRepository[];
  readonly remoteRepository: PublicCatalogRepository | null;
  readonly sessionCache?: PublicCatalogSessionCache;
  readonly configurationIssue?: PublicDataIssue | null;
  readonly isOnline?: () => boolean;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly timeoutMs?: number;
  readonly fallbackTimeoutMs?: number;
  readonly retryDelaysMs?: readonly number[];
}

function defaultDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, milliseconds);

    const handleAbort = (): void => {
      globalThis.clearTimeout(timeout);
      signal.removeEventListener('abort', handleAbort);
      reject(
        new PublicDataRepositoryError('request-aborted', 'El reintento remoto se canceló.', {
          source: 'supabase',
        }),
      );
    };

    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof PublicDataRepositoryError)) {
    return false;
  }

  if (!RETRIABLE_ERROR_CODES.has(error.code)) {
    return false;
  }

  return (
    error.status === null || error.status === 408 || error.status === 429 || error.status >= 500
  );
}

export class ResilientPublicCatalogService {
  readonly #fallbackRepositories: readonly PublicCatalogRepository[];
  readonly #remoteRepository: PublicCatalogRepository | null;
  readonly #sessionCache: PublicCatalogSessionCache | undefined;
  readonly #configurationIssue: PublicDataIssue | null;
  readonly #isOnline: () => boolean;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #delay: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly #timeoutMs: number;
  readonly #fallbackTimeoutMs: number;
  readonly #retryDelaysMs: readonly number[];
  readonly #listeners = new Set<PublicCatalogResultListener>();

  #visibleEnvelope: PublicCatalogEnvelope | null = null;
  #lastRemoteEnvelope: PublicCatalogEnvelope | null = null;
  #result: PublicCatalogLoadResult | null = null;
  #refreshController: AbortController | null = null;
  #generation = 0;
  #disposed = false;

  constructor(options: ResilientPublicCatalogServiceOptions) {
    this.#fallbackRepositories = options.fallbackRepositories;
    this.#remoteRepository = options.remoteRepository;
    this.#sessionCache = options.sessionCache;
    this.#configurationIssue = options.configurationIssue ?? null;
    this.#isOnline = options.isOnline ?? (() => navigator.onLine);
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    this.#delay = options.delay ?? defaultDelay;
    this.#timeoutMs = options.timeoutMs ?? 5000;
    this.#fallbackTimeoutMs = options.fallbackTimeoutMs ?? 2000;
    this.#retryDelaysMs = options.retryDelaysMs ?? [0, 2000, 5000];
  }

  subscribe(listener: PublicCatalogResultListener): () => void {
    this.#listeners.add(listener);

    if (this.#result) {
      listener(this.#result);
    }

    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  getCurrentResult(): PublicCatalogLoadResult | null {
    return this.#result;
  }

  getLastRemoteEnvelope(): PublicCatalogEnvelope | null {
    return this.#lastRemoteEnvelope;
  }

  async initialize(): Promise<PublicCatalogLoadResult> {
    if (this.#disposed) {
      throw new Error('The public catalog service has already been disposed.');
    }

    const errors: PublicDataIssue[] = [];

    for (const repository of this.#fallbackRepositories) {
      try {
        this.#visibleEnvelope = await this.#loadFallbackWithTimeout(repository);
        break;
      } catch (error) {
        errors.push(toPublicDataIssue(error));
      }
    }

    if (this.#sessionCache) {
      try {
        this.#lastRemoteEnvelope = await this.#sessionCache.read();
      } catch (error) {
        errors.push(toPublicDataIssue(error));
      }
    }

    const backendState: BackendState = this.#isOnline() ? 'degraded' : 'offline';
    const reason = this.#isOnline()
      ? (this.#configurationIssue?.code ?? 'network-unavailable')
      : 'network-unavailable';

    return this.#publish(
      this.#buildResult({
        backendState,
        reason,
        attempt: 0,
        latencyMs: null,
        errors: this.#configurationIssue ? [...errors, this.#configurationIssue] : errors,
        retryScheduledAt: null,
      }),
    );
  }

  async refresh(): Promise<PublicCatalogLoadResult> {
    if (this.#disposed) {
      throw new Error('The public catalog service has already been disposed.');
    }

    this.#refreshController?.abort();
    const controller = new AbortController();
    this.#refreshController = controller;
    const generation = ++this.#generation;

    if (!this.#isOnline()) {
      return this.#publishIfCurrent(
        generation,
        this.#buildResult({
          backendState: 'offline',
          reason: 'network-unavailable',
          attempt: 0,
          latencyMs: null,
          errors: [],
          retryScheduledAt: null,
        }),
      );
    }

    if (!this.#remoteRepository) {
      const issue =
        this.#configurationIssue ??
        toPublicDataIssue(
          new PublicDataRepositoryError(
            'configuration-missing',
            'No hay configuración pública de Supabase disponible.',
            { source: 'supabase', recoverable: false },
          ),
        );

      return this.#publishIfCurrent(
        generation,
        this.#buildResult({
          backendState: 'degraded',
          reason: issue.code,
          attempt: 0,
          latencyMs: null,
          errors: [issue],
          retryScheduledAt: null,
        }),
      );
    }

    const errors: PublicDataIssue[] = [];
    let lastAttempt = 0;
    let lastLatencyMs: number | null = null;

    for (let index = 0; index < this.#retryDelaysMs.length; index += 1) {
      const delayMs = this.#retryDelaysMs[index] ?? 0;
      lastAttempt = index + 1;

      if (delayMs > 0) {
        const jitteredDelay = Math.max(0, Math.round(delayMs * (0.8 + this.#random() * 0.4)));

        try {
          await this.#delay(jitteredDelay, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) {
            return this.#result ?? this.#buildUnavailableCancellationResult();
          }
          errors.push(toPublicDataIssue(error));
        }
      }

      const startedAt = this.#now();

      try {
        const remoteEnvelope = await this.#loadRemoteWithTimeout(controller.signal);
        lastLatencyMs = Math.max(0, this.#now() - startedAt);

        if (controller.signal.aborted || generation !== this.#generation) {
          return this.#result ?? this.#buildUnavailableCancellationResult();
        }

        this.#lastRemoteEnvelope = remoteEnvelope;

        if (this.#sessionCache) {
          try {
            await this.#sessionCache.write(remoteEnvelope);
          } catch (error) {
            errors.push(toPublicDataIssue(error));
          }
        }

        return this.#publishIfCurrent(
          generation,
          this.#buildResult({
            backendState: 'connected',
            reason: null,
            attempt: lastAttempt,
            latencyMs: lastLatencyMs,
            errors,
            retryScheduledAt: null,
          }),
        );
      } catch (error) {
        lastLatencyMs = Math.max(0, this.#now() - startedAt);

        if (controller.signal.aborted || generation !== this.#generation) {
          return this.#result ?? this.#buildUnavailableCancellationResult();
        }

        const issue = toPublicDataIssue(error);
        errors.push(issue);

        if (!isRetryable(error) || index === this.#retryDelaysMs.length - 1) {
          break;
        }
      }
    }

    const lastError = errors.at(-1);

    return this.#publishIfCurrent(
      generation,
      this.#buildResult({
        backendState: this.#isOnline() ? 'degraded' : 'offline',
        reason: this.#isOnline() ? (lastError?.code ?? 'unexpected') : 'network-unavailable',
        attempt: lastAttempt,
        latencyMs: lastLatencyMs,
        errors,
        retryScheduledAt: null,
      }),
    );
  }

  markOffline(): PublicCatalogLoadResult {
    this.#refreshController?.abort();
    this.#generation += 1;

    return this.#publish(
      this.#buildResult({
        backendState: 'offline',
        reason: 'network-unavailable',
        attempt: 0,
        latencyMs: null,
        errors: [],
        retryScheduledAt: null,
      }),
    );
  }

  dispose(): void {
    this.#disposed = true;
    this.#refreshController?.abort();
    this.#listeners.clear();
  }

  async #loadFallbackWithTimeout(
    repository: PublicCatalogRepository,
  ): Promise<PublicCatalogEnvelope> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#fallbackTimeoutMs);

    try {
      return await repository.load({ signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new PublicDataRepositoryError(
          'request-timeout',
          `El origen local no respondió en ${this.#fallbackTimeoutMs} ms.`,
          { source: 'snapshot', cause: error },
        );
      }

      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async #loadRemoteWithTimeout(parentSignal: AbortSignal): Promise<PublicCatalogEnvelope> {
    const timeoutController = new AbortController();
    let timedOut = false;
    const handleParentAbort = (): void => timeoutController.abort();
    parentSignal.addEventListener('abort', handleParentAbort, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, this.#timeoutMs);

    try {
      return await this.#remoteRepository!.load({ signal: timeoutController.signal });
    } catch (error) {
      if (timedOut) {
        throw new PublicDataRepositoryError(
          'request-timeout',
          `Supabase no respondió en ${this.#timeoutMs} ms.`,
          { source: 'supabase', cause: error },
        );
      }

      if (parentSignal.aborted) {
        throw new PublicDataRepositoryError(
          'request-aborted',
          'La comprobación de Supabase se canceló.',
          { source: 'supabase', cause: error },
        );
      }

      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      parentSignal.removeEventListener('abort', handleParentAbort);
    }
  }

  #buildResult(options: {
    readonly backendState: BackendState;
    readonly reason: PublicDataErrorCode | null;
    readonly attempt: number;
    readonly latencyMs: number | null;
    readonly errors: readonly PublicDataIssue[];
    readonly retryScheduledAt: string | null;
  }): PublicCatalogLoadResult {
    const now = this.#now();
    const visible = this.#visibleEnvelope;
    const remote = this.#lastRemoteEnvelope;
    const remoteSource = remote
      ? remote.source === 'session-cache'
        ? 'session-cache'
        : options.backendState === 'connected' && remote.source === 'supabase'
          ? 'supabase'
          : 'memory-cache'
      : null;
    const generatedAtMs = visible ? Date.parse(visible.metadata.generatedAt) : Number.NaN;

    return {
      availability: visible ? 'ready' : 'unavailable',
      data: visible?.data ?? null,
      source: visible?.source ?? null,
      metadata: visible?.metadata ?? null,
      remoteSource,
      remoteMetadata: remote?.metadata ?? null,
      backend: {
        state: options.backendState,
        checkedAt: new Date(now).toISOString(),
        latencyMs: options.latencyMs,
        attempt: options.attempt,
        reason: options.reason,
      },
      errors: options.errors,
      degradation: {
        usingFallback: options.backendState !== 'connected' || visible?.source !== 'supabase',
        fallbackReason: options.backendState === 'connected' ? null : options.reason,
        snapshotAgeMs: Number.isFinite(generatedAtMs) ? Math.max(0, now - generatedAtMs) : null,
        retryScheduledAt: options.retryScheduledAt,
      },
    };
  }

  #publishIfCurrent(generation: number, result: PublicCatalogLoadResult): PublicCatalogLoadResult {
    if (generation !== this.#generation || this.#disposed) {
      return this.#result ?? result;
    }

    return this.#publish(result);
  }

  #publish(result: PublicCatalogLoadResult): PublicCatalogLoadResult {
    if (this.#disposed) {
      return this.#result ?? result;
    }

    this.#result = result;
    this.#listeners.forEach((listener) => listener(result));
    return result;
  }

  #buildUnavailableCancellationResult(): PublicCatalogLoadResult {
    return this.#buildResult({
      backendState: this.#isOnline() ? 'degraded' : 'offline',
      reason: 'request-aborted',
      attempt: 0,
      latencyMs: null,
      errors: [],
      retryScheduledAt: null,
    });
  }
}
