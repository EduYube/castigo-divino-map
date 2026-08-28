import { MasterModeController } from '../application/masterModeController';
import {
  MasterCatalogRepositoryError,
  type AuthorizedMasterCatalog,
  type MasterCatalogRepository,
} from '../data-access/masterCatalog';
import { SupabaseMasterCatalogRepository } from '../infrastructure/supabase/masterCatalogRepository';
import type { AdminAuthRuntime } from './adminAuthRuntime';
import { getCurrentPublicCampaignSelection } from './campaignSelection';
import { mountMasterMode } from './masterMode';

interface MasterModeTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly timeoutMs?: number;
}

interface WindowWithAdminTestConfig extends Window {
  __MAP017_AUTH_TEST_CONFIG__?: MasterModeTestConfig;
}

interface CampaignWillChangeDetail {
  readonly toCampaignId: string;
}

class UnavailableMasterCatalogRepository implements MasterCatalogRepository {
  readonly #error: MasterCatalogRepositoryError;

  constructor(error: MasterCatalogRepositoryError) {
    this.#error = error;
  }

  load(_options: {
    readonly signal: AbortSignal;
    readonly campaignId: string;
  }): Promise<AuthorizedMasterCatalog> {
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

function getCampaignWillChangeDetail(event: Event): CampaignWillChangeDetail | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as unknown;
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return null;
  const toCampaignId = (detail as Record<string, unknown>).toCampaignId;
  return typeof toCampaignId === 'string' && toCampaignId.length > 0 ? { toCampaignId } : null;
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
    getCurrentPublicCampaignSelection().id,
  );
  const ui = mountMasterMode(root, controller);
  const handleCampaignWillChange = (event: Event): void => {
    const detail = getCampaignWillChangeDetail(event);
    if (!detail) return;

    // publicDataRuntime fires this before publishing the next public catalog. setCampaign
    // synchronously purges the previous private catalog before starting any B request,
    // so A and B secrets can never coexist in runtime state or DOM-derived views.
    controller.setCampaign(detail.toCampaignId);
  };

  window.addEventListener('atlas:campaign-will-change', handleCampaignWillChange);

  return {
    controller,
    destroy(): void {
      window.removeEventListener('atlas:campaign-will-change', handleCampaignWillChange);
      ui.destroy();
      controller.destroy();
    },
  };
}
