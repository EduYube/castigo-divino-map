import {
  AuthGatewayError,
  type AdminAuthorizationGateway,
  type AuthGateway,
  type AuthGatewayEvent,
  type AuthIdentity,
} from './authGateway';
import {
  INITIAL_ADMIN_AUTH_STATE,
  toPublicAuthIssue,
  type AdminAuthState,
  type PublicAuthIssue,
} from './authState';

export type AdminAuthStateListener = (state: AdminAuthState) => void;

export class AdminAuthController {
  readonly #authGateway: AuthGateway;
  readonly #authorizationGateway: AdminAuthorizationGateway;
  readonly #listeners = new Set<AdminAuthStateListener>();
  #state: AdminAuthState = INITIAL_ADMIN_AUTH_STATE;
  #operationId = 0;
  #unsubscribeAuth: (() => void) | null = null;
  #destroyed = false;

  constructor(authGateway: AuthGateway, authorizationGateway: AdminAuthorizationGateway) {
    this.#authGateway = authGateway;
    this.#authorizationGateway = authorizationGateway;
  }

  getState(): AdminAuthState {
    return this.#state;
  }

  subscribe(listener: AdminAuthStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);

    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.#destroyed) {
      return;
    }

    if (!this.#unsubscribeAuth) {
      this.#unsubscribeAuth = this.#authGateway.onAuthStateChange((event) => {
        this.#handleAuthEvent(event);
      });
    }

    await this.restore();
  }

  async restore(): Promise<void> {
    const operationId = this.#beginOperation();
    this.#publish({ phase: 'restoring', identity: null, issue: null, operationId });

    try {
      const identity = await this.#authGateway.restoreSession();

      if (!this.#isCurrent(operationId)) {
        return;
      }

      if (!identity) {
        this.#publish({ phase: 'anonymous', identity: null, issue: null, operationId });
        return;
      }

      await this.#authorize(identity, operationId);
    } catch (error) {
      this.#publishFailure(error, operationId);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const operationId = this.#beginOperation();
    this.#publish({ phase: 'authenticating', identity: null, issue: null, operationId });

    try {
      const identity = await this.#authGateway.signIn({ email, password });

      if (!this.#isCurrent(operationId)) {
        return;
      }

      await this.#authorize(identity, operationId);
    } catch (error) {
      this.#publishFailure(error, operationId);
    }
  }

  async refresh(): Promise<void> {
    const operationId = this.#beginOperation();
    const identity = this.#state.identity;
    this.#publish({ phase: 'authorizing', identity, issue: null, operationId });

    try {
      const refreshedIdentity = await this.#authGateway.refreshSession();

      if (!this.#isCurrent(operationId)) {
        return;
      }

      await this.#authorize(refreshedIdentity, operationId);
    } catch (error) {
      this.#publishFailure(
        error instanceof AuthGatewayError
          ? error
          : new AuthGatewayError('refresh-failed', 'Authentication refresh failed.'),
        operationId,
      );
      this.#bestEffortSignOut();
    }
  }

  async logout(): Promise<void> {
    const operationId = this.#beginOperation();
    this.#publish({ phase: 'anonymous', identity: null, issue: null, operationId });

    try {
      await this.#authGateway.signOut();
    } catch {
      if (this.#isCurrent(operationId)) {
        this.#publish({
          phase: 'anonymous',
          identity: null,
          issue: toPublicAuthIssue(
            new AuthGatewayError('logout-failed', 'Authentication sign-out failed.'),
          ),
          operationId,
        });
      }
    }
  }

  invalidateFromAdministrativeResponse(status: 401 | 403): void {
    const operationId = this.#beginOperation();
    const error = new AuthGatewayError(
      status === 401 ? 'session-expired' : 'forbidden',
      'Administrative authorization was rejected.',
      status,
    );

    this.#publish({
      phase: status === 401 ? 'expired' : 'unauthorized',
      identity: null,
      issue: toPublicAuthIssue(error),
      operationId,
    });
    this.#bestEffortSignOut();
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#operationId += 1;
    this.#unsubscribeAuth?.();
    this.#unsubscribeAuth = null;
    this.#listeners.clear();
    this.#authGateway.dispose();
  }

  #beginOperation(): number {
    this.#operationId += 1;
    return this.#operationId;
  }

  #isCurrent(operationId: number): boolean {
    return !this.#destroyed && operationId === this.#operationId;
  }

  #publish(state: AdminAuthState): void {
    if (this.#destroyed) {
      return;
    }

    this.#state = state;
    for (const listener of this.#listeners) {
      listener(state);
    }
  }

  async #authorize(identity: AuthIdentity, operationId: number): Promise<void> {
    if (!this.#isCurrent(operationId)) {
      return;
    }

    this.#publish({ phase: 'authorizing', identity, issue: null, operationId });

    try {
      const isAdmin = await this.#authorizationGateway.isCurrentUserAdmin();

      if (!this.#isCurrent(operationId)) {
        return;
      }

      if (!isAdmin) {
        this.#publish({
          phase: 'unauthorized',
          identity: null,
          issue: toPublicAuthIssue(
            new AuthGatewayError('unauthorized', 'Authenticated user is not an administrator.'),
          ),
          operationId,
        });
        this.#bestEffortSignOut();
        return;
      }

      this.#publish({ phase: 'authorized', identity, issue: null, operationId });
    } catch (error) {
      if (!this.#isCurrent(operationId)) {
        return;
      }

      const issue = toPublicAuthIssue(error);
      const phase =
        issue.code === 'session-expired' || issue.code === 'refresh-failed'
          ? 'expired'
          : issue.code === 'forbidden' || issue.code === 'unauthorized'
            ? 'unauthorized'
            : 'error';

      this.#publish({ phase, identity: null, issue, operationId });
      this.#bestEffortSignOut();
    }
  }

  #publishFailure(error: unknown, operationId: number): void {
    if (!this.#isCurrent(operationId)) {
      return;
    }

    const issue = toPublicAuthIssue(error);
    const phase =
      issue.code === 'session-expired' || issue.code === 'refresh-failed'
        ? 'expired'
        : issue.code === 'unauthorized' || issue.code === 'forbidden'
          ? 'unauthorized'
          : 'error';

    this.#publish({ phase, identity: null, issue, operationId });
  }

  #handleAuthEvent(event: AuthGatewayEvent): void {
    if (this.#destroyed) {
      return;
    }

    if (event.type === 'refresh-failed') {
      const operationId = this.#beginOperation();
      this.#publish({
        phase: 'expired',
        identity: null,
        issue: toPublicAuthIssue(
          new AuthGatewayError('refresh-failed', 'Automatic session refresh failed.'),
        ),
        operationId,
      });
      this.#bestEffortSignOut();
      return;
    }

    if (
      (this.#state.phase === 'restoring' || this.#state.phase === 'authenticating') &&
      event.type !== 'signed-out'
    ) {
      return;
    }

    if (event.type === 'signed-out') {
      if (this.#state.phase === 'authenticating') {
        return;
      }

      if (
        this.#state.phase === 'anonymous' ||
        this.#state.phase === 'unauthorized' ||
        this.#state.phase === 'expired'
      ) {
        return;
      }

      const operationId = this.#beginOperation();
      this.#publish({
        phase: 'expired',
        identity: null,
        issue: toPublicAuthIssue(
          new AuthGatewayError('session-expired', 'Authentication session ended.'),
        ),
        operationId,
      });
      return;
    }

    if (!event.identity) {
      if (event.type === 'initial-session') {
        const operationId = this.#beginOperation();
        this.#publish({ phase: 'anonymous', identity: null, issue: null, operationId });
      }
      return;
    }

    const operationId = this.#beginOperation();
    void this.#authorize(event.identity, operationId);
  }

  #bestEffortSignOut(): void {
    void this.#authGateway.signOut().catch(() => undefined);
  }
}
