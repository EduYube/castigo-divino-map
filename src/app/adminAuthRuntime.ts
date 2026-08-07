import { AdminCatalogController } from '../application/adminCatalogController';
import { AdminCharacterLocationRelationController } from '../application/adminCharacterLocationRelationController';
import { AdminMapEntityController } from '../application/adminMapEntityController';
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
import {
  AdminCharacterLocationRelationRepositoryError,
  type AdminCharacterLocationRelationRepository,
} from '../data-access/adminCharacterLocationRelations';
import {
  AdminMapEntityRepositoryError,
  type AdminMapEntityRepository,
} from '../data-access/adminMapEntities';
import type {
  AdminCatalogDraft,
  AdminCatalogRecord,
  AdminCatalogResourceKind,
  AdminEntityReference,
  AdminGeographicNameReference,
} from '../domain/adminCatalog';
import type {
  AdminMapEntityDetail,
  AdminMapEntityDraft,
  AdminMapEntityRecord,
  AdminMapEntityReferences,
} from '../domain/adminMapEntities';
import type {
  AdminCharacterLocationRelationDraft,
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
} from '../domain/characterLocationRelations';
import { SupabaseAdminAuthAdapter } from '../infrastructure/supabase/adminAuthAdapter';
import { SupabaseAdminCatalogRepository } from '../infrastructure/supabase/adminCatalogRepository';
import { SupabaseAdminCharacterLocationRelationRepository } from '../infrastructure/supabase/adminCharacterLocationRelationRepository';
import { SupabaseAdminMapEntityRepository } from '../infrastructure/supabase/adminMapEntityRepository';
import { mountAdminCatalog } from './adminCatalog';
import { mountAdminCharacterLocationRelations } from './adminCharacterLocationRelations';
import { mountAdminMapEntities } from './adminMapEntities';
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
    void _kind;
    void _options;
    return Promise.reject(this.#error);
  }

  create(
    _draft: AdminCatalogDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    void _draft;
    void _options;
    return Promise.reject(this.#error);
  }

  update(
    _original: AdminCatalogRecord,
    _draft: AdminCatalogDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    void _original;
    void _draft;
    void _options;
    return Promise.reject(this.#error);
  }

  archive(
    _record: AdminCatalogRecord,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    void _record;
    void _options;
    return Promise.reject(this.#error);
  }

  delete(_record: AdminCatalogRecord, _options: { readonly signal: AbortSignal }): Promise<void> {
    void _record;
    void _options;
    return Promise.reject(this.#error);
  }

  listEntityReferences(_options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminEntityReference[]> {
    void _options;
    return Promise.reject(this.#error);
  }

  listGeographicNameReferences(_options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminGeographicNameReference[]> {
    void _options;
    return Promise.reject(this.#error);
  }
}

class UnavailableAdminMapEntityRepository implements AdminMapEntityRepository {
  readonly #error: AdminMapEntityRepositoryError;

  constructor(error: AdminMapEntityRepositoryError) {
    this.#error = error;
  }

  list(_options: { readonly signal: AbortSignal }): Promise<readonly AdminMapEntityRecord[]> {
    void _options;
    return Promise.reject(this.#error);
  }

  loadReferences(_options: { readonly signal: AbortSignal }): Promise<AdminMapEntityReferences> {
    void _options;
    return Promise.reject(this.#error);
  }

  load(
    _entityId: string,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminMapEntityDetail> {
    void _entityId;
    void _options;
    return Promise.reject(this.#error);
  }

  save(
    _original: AdminMapEntityDetail | null,
    _draft: AdminMapEntityDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminMapEntityDetail> {
    void _original;
    void _draft;
    void _options;
    return Promise.reject(this.#error);
  }

  delete(_detail: AdminMapEntityDetail, _options: { readonly signal: AbortSignal }): Promise<void> {
    void _detail;
    void _options;
    return Promise.reject(this.#error);
  }
}

class UnavailableAdminCharacterLocationRelationRepository
  implements AdminCharacterLocationRelationRepository
{
  readonly #error: AdminCharacterLocationRelationRepositoryError;

  constructor(error: AdminCharacterLocationRelationRepositoryError) {
    this.#error = error;
  }

  list(
    _options: { readonly signal: AbortSignal },
  ): Promise<readonly AdminCharacterLocationRelationRecord[]> {
    void _options;
    return Promise.reject(this.#error);
  }

  loadReferences(_options: {
    readonly signal: AbortSignal;
  }): Promise<AdminCharacterLocationRelationReferences> {
    void _options;
    return Promise.reject(this.#error);
  }

  create(
    _draft: AdminCharacterLocationRelationDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCharacterLocationRelationRecord> {
    void _draft;
    void _options;
    return Promise.reject(this.#error);
  }

  update(
    _original: AdminCharacterLocationRelationRecord,
    _draft: AdminCharacterLocationRelationDraft,
    _options: { readonly signal: AbortSignal },
  ): Promise<AdminCharacterLocationRelationRecord> {
    void _original;
    void _draft;
    void _options;
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

function createMapEntityRepository(): AdminMapEntityRepository {
  const configuration = resolveConfiguration();
  try {
    return new SupabaseAdminMapEntityRepository({
      ...configuration,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    const normalized =
      error instanceof AdminMapEntityRepositoryError
        ? error
        : new AdminMapEntityRepositoryError(
            'backend-unavailable',
            'El editor administrativo de entidades no pudo inicializarse.',
            { cause: error },
          );
    return new UnavailableAdminMapEntityRepository(normalized);
  }
}

function createCharacterLocationRelationRepository(): AdminCharacterLocationRelationRepository {
  const configuration = resolveConfiguration();
  try {
    return new SupabaseAdminCharacterLocationRelationRepository({
      ...configuration,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    const normalized =
      error instanceof AdminCharacterLocationRelationRepositoryError
        ? error
        : new AdminCharacterLocationRelationRepositoryError(
            'backend-unavailable',
            'El editor administrativo de relaciones no pudo inicializarse.',
            { cause: error },
          );
    return new UnavailableAdminCharacterLocationRelationRepository(normalized);
  }
}

export function bootstrapAdminAuthRuntime(root: ParentNode): AdminAuthRuntime {
  const adapter = createAuthAdapter();
  const authController = new AdminAuthController(adapter, adapter);
  const authUi = mountAdminAuth(root, authController);
  const rejectAuthorization = (status: 401 | 403): void => {
    authController.invalidateFromAdministrativeResponse(status);
  };
  const catalogController = new AdminCatalogController(createCatalogRepository(), {
    onAuthorizationRejected: rejectAuthorization,
  });
  const mapEntityController = new AdminMapEntityController(createMapEntityRepository(), {
    onAuthorizationRejected: rejectAuthorization,
  });
  const relationController = new AdminCharacterLocationRelationController(
    createCharacterLocationRelationRepository(),
    { onAuthorizationRejected: rejectAuthorization },
  );
  const catalogUi = mountAdminCatalog(root, catalogController, authController);
  const mapEntityUi = mountAdminMapEntities(root, mapEntityController, authController);
  const relationUi = mountAdminCharacterLocationRelations(root, relationController, authController);
  void authController.start();

  return {
    destroy(): void {
      relationUi.destroy();
      relationController.destroy();
      mapEntityUi.destroy();
      mapEntityController.destroy();
      catalogUi.destroy();
      catalogController.destroy();
      authUi.destroy();
      authController.destroy();
    },
  };
}
