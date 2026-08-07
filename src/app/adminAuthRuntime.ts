import { AdminCatalogController } from '../application/adminCatalogController';
import { AdminAuthController } from '../auth/adminAuthController';
import {
  AuthGatewayError,
  type AdminAuthorizationGateway,
  type AuthGateway,
  type AuthGatewayListener,
  type AuthIdentity,
} from '../auth/authGateway';
import {
  AdminCatalogRepositoryError,
  type AdminCatalogRepository,
} from '../data-access/adminCatalog';
import type {
  AdminCatalogDraft,
  AdminCatalogRecord,
  AdminCatalogResourceKind,
  AdminEntityReference,
  AdminGeographicNameReference,
} from '../domain/adminCatalog';
import { SupabaseAdminAuthAdapter } from '../infrastructure/supabase/adminAuthAdapter';
import { SupabaseAdminCatalogRepository } from '../infrastructure/supabase/adminCatalogRepository';
import './adminCatalog';
import { mountAdminCatalog } from './adminCatalog';
import { mountAdminAuth } from './adminAuth';
import '../styles/admin-catalog.css';

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

class UnavailableAdminCatalogRepository implements AdminCatalogRepository {
  readonly #error: AdminCatalogRepositoryError;

  constructor(error: AdminCatalogRepositoryError) {
    this.#error = error;
  }

  list(
    _kind: AdminCatalogResourceKind,
    _options: { readonly signal: AbortSignal },
  ): Promise<readonly AdminCatalogRecord[]> {
    return Promise.reject(this.#error);
  }

  create(
    _draft: AdminCatalogDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    return Promise.reject(this.#error);
  }

  update(
    _original: AdminCatalogRecord,
    _draft: AdminCatalogDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    return Promise.reject(this.#error);
  }

  archive(
    _record: AdminCatalogRecord,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    return Promise.reject(this.#error);
  }

  delete(_record: AdminCatalogRecord, _options: { readonly signal: AbortSignal }): Promise<void> {
    return Promise.reject(this.#error);
  }

  listEntityReferences(_options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminEntityReference[]> {
    return Promise.reject(this.#error);
  }

  listGeographicNameReferences(_options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminGeographicNameReference[]> {
    return Promise.reject(this.#error);
  }
}

function resolveTestConfig(): AdminAuthTestConfig | undefined {
  return import.meta.env.DEV ? window.__MAP017_AUTH_TEST_CONFIG__ : undefined;
}

function resolveConfiguration(): {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly timeoutMs: number | undefined;
} {
  const testConfig = resolveTestConfig();
  return {
    projectUrl: testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey:
      testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    timeoutMs: testConfig?.timeoutMs,
  };
}

function createAuthAdapter(): SupabaseAdminAuthAdapter | UnavailableAdminAuthAdapter {
  const configuration = resolveConfiguration();

  try {
    return new SupabaseAdminAuthAdapter({
      ...configuration,
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

function createCatalogRepository(): AdminCatalogRepository {
  const configuration = resolveConfiguration();

  try {
    return new SupabaseAdminCatalogRepository({
      ...configuration,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    const normalized =
      error instanceof AdminCatalogRepositoryError
        ? error
        : new AdminCatalogRepositoryError(
            'backend-unavailable',
            'El catálogo administrativo no pudo inicializarse.',
            { cause: error },
          );
    return new UnavailableAdminCatalogRepository(normalized);
  }
}

export function bootstrapAdminAuthRuntime(root: ParentNode): AdminAuthRuntime {
  const adapter = createAuthAdapter();
  const authController = new AdminAuthController(adapter, adapter);
  const authUi = mountAdminAuth(root, authController);
  const catalogController = new AdminCatalogController(createCatalogRepository(), {
    onAuthorizationRejected(status): void {
      authController.invalidateFromAdministrativeResponse(status);
    },
  });
  const catalogUi = mountAdminCatalog(root, catalogController, authController);
  void authController.start();

  return {
    destroy(): void {
      catalogUi.destroy();
      catalogController.destroy();
      authUi.destroy();
      authController.destroy();
    },
  };
}
