import { describe, expect, test } from 'vitest';

import { AdminAuthController } from './adminAuthController';
import {
  AuthGatewayError,
  type AdminAuthorizationGateway,
  type AuthCredentials,
  type AuthGateway,
  type AuthGatewayEvent,
  type AuthGatewayListener,
  type AuthIdentity,
} from './authGateway';

const ADMIN_IDENTITY: AuthIdentity = {
  userId: 'admin-test-user',
  email: 'admin@example.invalid',
  expiresAt: 1_900_000_000,
};

const OTHER_IDENTITY: AuthIdentity = {
  userId: 'other-test-user',
  email: 'other@example.invalid',
  expiresAt: 1_900_000_000,
};

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakeAuthGateway implements AuthGateway {
  readonly listeners = new Set<AuthGatewayListener>();
  signOutCount = 0;
  disposed = false;
  signInImplementation: (credentials: AuthCredentials) => Promise<AuthIdentity> = async () =>
    ADMIN_IDENTITY;
  restoreImplementation: () => Promise<AuthIdentity | null> = async () => null;
  refreshImplementation: () => Promise<AuthIdentity> = async () => ADMIN_IDENTITY;
  signOutImplementation: () => Promise<void> = async () => undefined;

  signIn(credentials: AuthCredentials): Promise<AuthIdentity> {
    return this.signInImplementation(credentials);
  }

  restoreSession(): Promise<AuthIdentity | null> {
    return this.restoreImplementation();
  }

  refreshSession(): Promise<AuthIdentity> {
    return this.refreshImplementation();
  }

  async signOut(): Promise<void> {
    this.signOutCount += 1;
    await this.signOutImplementation();
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
    this.disposed = true;
    this.listeners.clear();
  }
}

class FakeAuthorizationGateway implements AdminAuthorizationGateway {
  implementation: () => Promise<boolean> = async () => true;

  isCurrentUserAdmin(): Promise<boolean> {
    return this.implementation();
  }
}

function createController(): {
  readonly auth: FakeAuthGateway;
  readonly authorization: FakeAuthorizationGateway;
  readonly controller: AdminAuthController;
} {
  const auth = new FakeAuthGateway();
  const authorization = new FakeAuthorizationGateway();
  const controller = new AdminAuthController(auth, authorization);
  return { auth, authorization, controller };
}

describe('AdminAuthController', () => {
  test('restores to anonymous when the tab has no session', async () => {
    const { controller } = createController();

    await controller.start();

    expect(controller.getState()).toMatchObject({
      phase: 'anonymous',
      identity: null,
      issue: null,
    });
  });

  test('restores and separately authorizes an existing administrator session', async () => {
    const { auth, authorization, controller } = createController();
    auth.restoreImplementation = async () => ADMIN_IDENTITY;
    authorization.implementation = async () => true;

    await controller.start();

    expect(controller.getState()).toMatchObject({
      phase: 'authorized',
      identity: ADMIN_IDENTITY,
      issue: null,
    });
  });

  test('authorizes a valid password login without exposing credentials in state', async () => {
    const { auth, controller } = createController();
    let receivedCredentials: AuthCredentials | null = null;
    auth.signInImplementation = async (credentials) => {
      receivedCredentials = credentials;
      return ADMIN_IDENTITY;
    };

    await controller.login('admin@example.invalid', 'test-password');

    expect(receivedCredentials).toEqual({
      email: 'admin@example.invalid',
      password: 'test-password',
    });
    expect(controller.getState()).toMatchObject({ phase: 'authorized', identity: ADMIN_IDENTITY });
    expect(JSON.stringify(controller.getState())).not.toContain('test-password');
  });

  test('normalizes invalid credentials to a generic public error', async () => {
    const { auth, controller } = createController();
    auth.signInImplementation = async () => {
      throw new AuthGatewayError('invalid-credentials', 'Internal credential detail.');
    };

    await controller.login('missing@example.invalid', 'wrong-password');

    expect(controller.getState()).toMatchObject({
      phase: 'error',
      identity: null,
      issue: {
        code: 'invalid-credentials',
        message: 'No se pudo iniciar sesión. Revisa las credenciales e inténtalo de nuevo.',
      },
    });
    expect(JSON.stringify(controller.getState())).not.toContain('Internal credential detail');
  });

  test('rejects an authenticated user outside the administrative allowlist', async () => {
    const { auth, authorization, controller } = createController();
    auth.signInImplementation = async () => OTHER_IDENTITY;
    authorization.implementation = async () => false;

    await controller.login('other@example.invalid', 'test-password');

    expect(controller.getState()).toMatchObject({
      phase: 'unauthorized',
      identity: null,
      issue: { code: 'unauthorized' },
    });
    expect(auth.signOutCount).toBe(1);
  });

  test('re-authorizes after an explicit successful refresh', async () => {
    const { auth, controller } = createController();
    auth.refreshImplementation = async () => ADMIN_IDENTITY;

    await controller.refresh();

    expect(controller.getState()).toMatchObject({ phase: 'authorized', identity: ADMIN_IDENTITY });
  });

  test('drops administrative mode immediately when refresh fails', async () => {
    const { auth, controller } = createController();
    auth.refreshImplementation = async () => {
      throw new AuthGatewayError('refresh-failed', 'Refresh token rejected.');
    };

    await controller.refresh();

    expect(controller.getState()).toMatchObject({
      phase: 'expired',
      identity: null,
      issue: { code: 'refresh-failed' },
    });
    expect(auth.signOutCount).toBe(1);
  });

  test('moves to anonymous before a remote logout completes', async () => {
    const { auth, controller } = createController();
    const remoteLogout = deferred<void>();
    auth.signOutImplementation = () => remoteLogout.promise;

    const logoutPromise = controller.logout();

    expect(controller.getState()).toMatchObject({ phase: 'anonymous', identity: null });
    remoteLogout.resolve(undefined);
    await logoutPromise;
  });

  test('keeps the public-safe anonymous state when remote logout fails', async () => {
    const { auth, controller } = createController();
    auth.signOutImplementation = async () => {
      throw new Error('network failure');
    };

    await controller.logout();

    expect(controller.getState()).toMatchObject({
      phase: 'anonymous',
      identity: null,
      issue: { code: 'logout-failed' },
    });
  });

  test('discards a stale login response after a newer login wins', async () => {
    const { auth, controller } = createController();
    const first = deferred<AuthIdentity>();
    let calls = 0;
    auth.signInImplementation = () => {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve(ADMIN_IDENTITY);
    };

    const staleLogin = controller.login('first@example.invalid', 'first-password');
    await controller.login('admin@example.invalid', 'second-password');
    first.resolve(OTHER_IDENTITY);
    await staleLogin;

    expect(controller.getState()).toMatchObject({ phase: 'authorized', identity: ADMIN_IDENTITY });
  });

  test('ignores a stale authorization response after logout', async () => {
    const { authorization, controller } = createController();
    const roleCheck = deferred<boolean>();
    authorization.implementation = () => roleCheck.promise;

    const loginPromise = controller.login('admin@example.invalid', 'test-password');
    await Promise.resolve();
    await controller.logout();
    roleCheck.resolve(true);
    await loginPromise;

    expect(controller.getState()).toMatchObject({ phase: 'anonymous', identity: null });
  });

  test('treats a signed-out event from an active session as expiration', async () => {
    const { auth, controller } = createController();
    await controller.start();
    await controller.login('admin@example.invalid', 'test-password');

    auth.emit({ type: 'signed-out', identity: null });

    expect(controller.getState()).toMatchObject({
      phase: 'expired',
      identity: null,
      issue: { code: 'session-expired' },
    });
  });

  test('invalidates future administrative 401 and 403 responses safely', async () => {
    const { auth, controller } = createController();
    controller.invalidateFromAdministrativeResponse(403);

    expect(controller.getState()).toMatchObject({
      phase: 'unauthorized',
      identity: null,
      issue: { code: 'forbidden' },
    });
    expect(auth.signOutCount).toBe(1);
  });

  test('disposes listeners and the gateway', async () => {
    const { auth, controller } = createController();
    await controller.start();

    controller.destroy();

    expect(auth.disposed).toBe(true);
    expect(auth.listeners.size).toBe(0);
  });
});
