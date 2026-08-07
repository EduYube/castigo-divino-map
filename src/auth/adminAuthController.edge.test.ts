import { describe, expect, test } from 'vitest';

import { AdminAuthController } from './adminAuthController';
import {
  AuthGatewayError,
  type AdminAuthorizationGateway,
  type AuthGateway,
  type AuthGatewayEvent,
  type AuthGatewayListener,
  type AuthIdentity,
} from './authGateway';

const IDENTITY: AuthIdentity = {
  userId: 'admin-test-user',
  email: 'admin@example.invalid',
  expiresAt: 1_900_000_000,
};

class EventAuthGateway implements AuthGateway {
  readonly listeners = new Set<AuthGatewayListener>();
  restoreError: unknown = null;
  signOutCount = 0;

  signIn(): Promise<AuthIdentity> {
    return Promise.resolve(IDENTITY);
  }

  restoreSession(): Promise<AuthIdentity | null> {
    return this.restoreError ? Promise.reject(this.restoreError) : Promise.resolve(null);
  }

  refreshSession(): Promise<AuthIdentity> {
    return Promise.resolve(IDENTITY);
  }

  signOut(): Promise<void> {
    this.signOutCount += 1;
    return Promise.resolve();
  }

  onAuthStateChange(listener: AuthGatewayListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AuthGatewayEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

class CountingAuthorizationGateway implements AdminAuthorizationGateway {
  count = 0;

  isCurrentUserAdmin(): Promise<boolean> {
    this.count += 1;
    return Promise.resolve(true);
  }
}

describe('AdminAuthController edge cases', () => {
  test('clears a restored session after refresh failure', async () => {
    const auth = new EventAuthGateway();
    auth.restoreError = new AuthGatewayError('refresh-failed', 'stale refresh token');
    const authorization = new CountingAuthorizationGateway();
    const controller = new AdminAuthController(auth, authorization);

    await controller.start();
    await Promise.resolve();

    expect(controller.getState()).toMatchObject({
      phase: 'expired',
      identity: null,
      issue: { code: 'refresh-failed' },
    });
    expect(auth.signOutCount).toBe(1);
  });

  test('deduplicates identical consecutive token refresh events while authorizing', async () => {
    const auth = new EventAuthGateway();
    const authorization = new CountingAuthorizationGateway();
    let resolveAuthorization!: (value: boolean) => void;
    authorization.isCurrentUserAdmin = () => {
      authorization.count += 1;
      return new Promise<boolean>((resolve) => {
        resolveAuthorization = resolve;
      });
    };
    const controller = new AdminAuthController(auth, authorization);
    await controller.start();

    auth.emit({ type: 'token-refreshed', identity: IDENTITY });
    auth.emit({ type: 'token-refreshed', identity: IDENTITY });

    expect(authorization.count).toBe(1);
    resolveAuthorization(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getState().phase).toBe('authorized');
  });
});
