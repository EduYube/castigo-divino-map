import {
  toAdminPublicRequestIssue,
  type AdminPublicRequestIssue,
  type AdminPublicRequestRepository,
} from '../data-access/adminPublicRequests';
import type {
  AdminPublicRequestModerationResult,
  AdminPublicRequestRecord,
} from '../domain/adminPublicRequests';

export type AdminPublicRequestPhase = 'blocked' | 'loading' | 'ready' | 'mutating' | 'error';

export interface AdminPublicRequestState {
  readonly records: readonly AdminPublicRequestRecord[];
  readonly phase: AdminPublicRequestPhase;
  readonly issue: AdminPublicRequestIssue | null;
  readonly authorized: boolean;
  readonly backendConnected: boolean;
}

export type AdminPublicRequestStateListener = (state: AdminPublicRequestState) => void;

interface AdminPublicRequestControllerOptions {
  readonly onAuthorizationRejected?: (status: 401 | 403) => void;
}

const INITIAL_STATE: AdminPublicRequestState = {
  records: [],
  phase: 'blocked',
  issue: null,
  authorized: false,
  backendConnected: false,
};

export class AdminPublicRequestController {
  readonly #repository: AdminPublicRequestRepository;
  readonly #onAuthorizationRejected: ((status: 401 | 403) => void) | undefined;
  readonly #listeners = new Set<AdminPublicRequestStateListener>();
  #state = INITIAL_STATE;
  #generation = 0;
  #activeController: AbortController | null = null;
  #destroyed = false;

  constructor(
    repository: AdminPublicRequestRepository,
    options: AdminPublicRequestControllerOptions = {},
  ) {
    this.#repository = repository;
    this.#onAuthorizationRejected = options.onAuthorizationRejected;
  }

  getState(): AdminPublicRequestState {
    return this.#state;
  }

  subscribe(listener: AdminPublicRequestStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setAccess(authorized: boolean, backendConnected: boolean): void {
    if (this.#destroyed) return;
    if (
      authorized === this.#state.authorized &&
      backendConnected === this.#state.backendConnected
    ) {
      return;
    }
    const wasAvailable = this.#state.authorized && this.#state.backendConnected;
    const isAvailable = authorized && backendConnected;
    if (!isAvailable) {
      this.#cancelActive();
      this.#publish({
        records: [],
        phase: 'blocked',
        issue: null,
        authorized,
        backendConnected,
      });
      return;
    }
    this.#publish({ ...this.#state, authorized, backendConnected, issue: null });
    if (!wasAvailable) void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.#canUse()) {
      this.#publishBlocked();
      return;
    }
    const operation = this.#beginOperation();
    // Campaign switches trigger reloads. Clear the previous campaign immediately so
    // stale cards can never remain visible under the newly selected context.
    this.#publish({ ...this.#state, records: [], phase: 'loading', issue: null });
    try {
      const records = await this.#repository.list({ signal: operation.signal });
      if (!this.#isCurrent(operation.generation)) return;
      this.#publish({ ...this.#state, records, phase: 'ready', issue: null });
    } catch (error) {
      this.#handleFailure(error, operation.generation);
    }
  }

  async reject(request: AdminPublicRequestRecord, moderationNote: string): Promise<boolean> {
    const result = await this.#moderate('reject', request, moderationNote);
    return result !== null;
  }

  async convert(
    request: AdminPublicRequestRecord,
    moderationNote: string,
  ): Promise<AdminPublicRequestModerationResult | null> {
    return this.#moderate('convert', request, moderationNote);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelActive();
    this.#listeners.clear();
  }

  async #moderate(
    action: 'reject' | 'convert',
    request: AdminPublicRequestRecord,
    moderationNote: string,
  ): Promise<AdminPublicRequestModerationResult | null> {
    if (!this.#canUse()) {
      this.#publishBlocked();
      return null;
    }
    if (this.#state.phase === 'mutating') return null;
    if (request.requestStatus !== 'pending') {
      this.#publish({
        ...this.#state,
        issue: {
          code: 'stale-write',
          message: 'La solicitud ya no está pendiente. Recarga la bandeja antes de continuar.',
          status: null,
        },
      });
      return null;
    }

    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      const result = await this.#repository[action](request, moderationNote, {
        signal: operation.signal,
      });
      if (!this.#isCurrent(operation.generation)) return null;
      this.#publish({
        ...this.#state,
        records: this.#state.records.map((candidate) =>
          candidate.id === result.request.id ? result.request : candidate,
        ),
        phase: 'ready',
        issue: null,
      });
      return result;
    } catch (error) {
      this.#handleFailure(error, operation.generation);
      return null;
    }
  }

  #canUse(): boolean {
    return !this.#destroyed && this.#state.authorized && this.#state.backendConnected;
  }

  #beginOperation(): { readonly generation: number; readonly signal: AbortSignal } {
    this.#cancelActive();
    this.#generation += 1;
    const controller = new AbortController();
    this.#activeController = controller;
    return { generation: this.#generation, signal: controller.signal };
  }

  #cancelActive(): void {
    this.#generation += 1;
    this.#activeController?.abort();
    this.#activeController = null;
  }

  #isCurrent(generation: number): boolean {
    return !this.#destroyed && generation === this.#generation;
  }

  #publishBlocked(): void {
    if (this.#destroyed) return;
    this.#publish({
      ...this.#state,
      phase: 'blocked',
      issue: null,
    });
  }

  #handleFailure(error: unknown, generation: number): void {
    if (!this.#isCurrent(generation)) return;
    const issue = toAdminPublicRequestIssue(error);
    if (issue.status === 401 || issue.status === 403) {
      this.#onAuthorizationRejected?.(issue.status);
    }
    this.#publish({
      ...this.#state,
      phase: issue.status === 401 || issue.status === 403 ? 'blocked' : 'error',
      issue,
    });
  }

  #publish(state: AdminPublicRequestState): void {
    if (this.#destroyed) return;
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }
}
