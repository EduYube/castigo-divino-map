import { MasterModeController } from '../application/masterModeController';
import {
  MasterCatalogRepositoryError,
  type AuthorizedMasterCatalog,
  type MasterCatalogRepository,
} from '../data-access/masterCatalog';
import { SupabaseMasterCatalogRepository } from '../infrastructure/supabase/masterCatalogRepository';
import type { AdminAuthRuntime } from './adminAuthRuntime';
import { mountMasterMode } from './masterMode';

interface MasterModeTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly timeoutMs?: number;
}

interface WindowWithAdminTestConfig extends Window {
  __MAP017_AUTH_TEST_CONFIG__?: MasterModeTestConfig;
}

class UnavailableMasterCatalogRepository implements MasterCatalogRepository {
  readonly #error: MasterCatalogRepositoryError;

  constructor(error: MasterCatalogRepositoryError) {
    this.#error = error;
  }

  load(_options: { readonly signal: AbortSignal }): Promise<AuthorizedMasterCatalog> {
    void _options;
    return Promise.reject(this.#error);
  }
}

function createRepository(): MasterCatalogRepository {
  const testConfig = import.meta.env.DEV
    ? (window as WindowWithAdminTestConfig).__MAP017_AUTH_TEST_CONFIG__
    : undefined;
  const projectUrl = testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const publishableKey =
    testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

  try {
    return new SupabaseMasterCatalogRepository({
      projectUrl,
      publishableKey,
      timeoutMs: testConfig?.timeoutMs,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    return new UnavailableMasterCatalogRepository(
      error instanceof MasterCatalogRepositoryError
        ? error
        : new MasterCatalogRepositoryError(
            'backend-unavailable',
            'Modo Máster no pudo inicializar su acceso privado.',
            { cause: error },
          ),
    );
  }
}

export interface MasterModeRuntime {
  readonly controller: MasterModeController;
  destroy(): void;
}

export function bootstrapMasterModeRuntime(
  root: ParentNode,
  adminRuntime: AdminAuthRuntime,
): MasterModeRuntime {
  const controller = new MasterModeController(
    createRepository(),
    adminRuntime.authController,
    adminRuntime.mapEntityController,
  );
  const ui = mountMasterMode(root, controller);

  return {
    controller,
    destroy(): void {
      ui.destroy();
      controller.destroy();
    },
  };
}
