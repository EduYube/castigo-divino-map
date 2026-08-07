import { AdminAuthController } from '../auth/adminAuthController';
import {
  AuthGatewayError,
  type AdminAuthorizationGateway,
  type AuthGateway,
  type AuthGatewayListener,
  type AuthIdentity,
} from '../auth/authGateway';
import { SupabaseAdminAuthAdapter } from '../infrastructure/supabase/adminAuthAdapter';
import { mountAdminAuth } from './adminAuth';

interface AdminAuthTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly timeoutMs?: number;
}

declare global {
  interface Window {
    __MAP017_AUTH_TEST_CONFIG__?: AdminAuthTestConfig;
  }
}

export interface AdminAuthRuntime {
  destroy(): void;
}

class UnavailableAdminAuthAdapter implements AuthGateway, AdminAuthorizationGateway {
  readonly #error: AuthGatewayError;

  constructor(error: AuthGatewayError) {
    this.#error = error;
  }

  signIn(): Promise<AuthIdentity> {
    return Promise.reject(this.#error);
  }

  restoreSession(): Promise<AuthIdentity | null> {
    return Promise.reject(this.#error);
  }

  refreshSession(): Promise<AuthIdentity> {
    return Promise.reject(this.#error);
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }

  onAuthStateChange(listener: AuthGatewayListener): () => void {
    queueMicrotask(() => listener({ type: 'initial-session', identity: null }));
    return () => undefined;
  }

  isCurrentUserAdmin(): Promise<boolean> {
    return Promise.reject(this.#error);
  }

  dispose(): void {
    // No resources were allocated when configuration or storage initialization failed.
  }
}

function resolveTestConfig(): AdminAuthTestConfig | undefined {
  return import.meta.env.DEV ? window.__MAP017_AUTH_TEST_CONFIG__ : undefined;
}

function createAdapter(): SupabaseAdminAuthAdapter | UnavailableAdminAuthAdapter {
  const testConfig = resolveTestConfig();
  const projectUrl = testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const publishableKey =
    testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

  try {
    return new SupabaseAdminAuthAdapter({
      projectUrl,
      publishableKey,
      timeoutMs: testConfig?.timeoutMs,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    const normalized =
      error instanceof AuthGatewayError
        ? error
        : new AuthGatewayError(
            'unexpected',
            'Administrative authentication could not be initialized.',
          );
    return new UnavailableAdminAuthAdapter(normalized);
  }
}

export function bootstrapAdminAuthRuntime(root: ParentNode): AdminAuthRuntime {
  const adapter = createAdapter();
  const controller = new AdminAuthController(adapter, adapter);
  const ui = mountAdminAuth(root, controller);
  void controller.start();

  return {
    destroy(): void {
      ui.destroy();
      controller.destroy();
    },
  };
}
