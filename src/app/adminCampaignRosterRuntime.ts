import { AdminCampaignRosterController } from '../application/adminCampaignRosterController';
import { adminCampaignContext } from '../application/adminCampaignContext';
import type { AdminAuthController } from '../auth/adminAuthController';
import {
  AdminCampaignRosterRepositoryError,
  type AdminCampaignRosterRepository,
} from '../data-access/adminCampaignRoster';
import type {
  AdminCampaignDraft,
  AdminCampaignRecord,
  AdminPlayerDraft,
  AdminPlayerRecord,
  CampaignStatus,
} from '../domain/adminCampaignRoster';
import { SupabaseAdminCampaignRosterRepository } from '../infrastructure/supabase/adminCampaignRosterRepository';
import { mountAdminCampaignRoster } from './adminCampaignRoster';
import '../styles/admin-campaign-roster.css';

export interface AdminCampaignRosterRuntime {
  readonly controller: AdminCampaignRosterController;
  destroy(): void;
}

class UnavailableAdminCampaignRosterRepository implements AdminCampaignRosterRepository {
  readonly #error: AdminCampaignRosterRepositoryError;

  constructor(error: AdminCampaignRosterRepositoryError) {
    this.#error = error;
  }

  listCampaigns(): Promise<readonly AdminCampaignRecord[]> {
    return Promise.reject(this.#error);
  }

  createCampaign(_draft: AdminCampaignDraft): Promise<AdminCampaignRecord> {
    return Promise.reject(this.#error);
  }

  updateCampaign(
    _original: AdminCampaignRecord,
    _draft: AdminCampaignDraft,
  ): Promise<AdminCampaignRecord> {
    return Promise.reject(this.#error);
  }

  setCampaignStatus(
    _original: AdminCampaignRecord,
    _status: CampaignStatus,
  ): Promise<AdminCampaignRecord> {
    return Promise.reject(this.#error);
  }

  listPlayers(_campaignId: string): Promise<readonly AdminPlayerRecord[]> {
    return Promise.reject(this.#error);
  }

  createPlayer(_campaignId: string, _draft: AdminPlayerDraft): Promise<AdminPlayerRecord> {
    return Promise.reject(this.#error);
  }

  updatePlayer(
    _campaignId: string,
    _original: AdminPlayerRecord,
    _draft: AdminPlayerDraft,
  ): Promise<AdminPlayerRecord> {
    return Promise.reject(this.#error);
  }

  setPlayerArchived(
    _campaignId: string,
    _original: AdminPlayerRecord,
    _archived: boolean,
  ): Promise<AdminPlayerRecord> {
    return Promise.reject(this.#error);
  }
}

function createRepository(): AdminCampaignRosterRepository {
  const testConfig = import.meta.env.DEV ? window.__MAP017_AUTH_TEST_CONFIG__ : undefined;
  const projectUrl = testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const publishableKey =
    testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

  try {
    return new SupabaseAdminCampaignRosterRepository({
      projectUrl,
      publishableKey,
      timeoutMs: testConfig?.timeoutMs,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    const normalized =
      error instanceof AdminCampaignRosterRepositoryError
        ? error
        : new AdminCampaignRosterRepositoryError(
            'backend-unavailable',
            'La administración de campañas no pudo inicializarse.',
            { cause: error },
          );
    return new UnavailableAdminCampaignRosterRepository(normalized);
  }
}

export function bootstrapAdminCampaignRosterRuntime(
  root: ParentNode,
  authController: AdminAuthController,
  options: { readonly onCampaignChanged?: (campaignId: string) => void } = {},
): AdminCampaignRosterRuntime {
  const rejectAuthorization = (status: 401 | 403): void => {
    authController.invalidateFromAdministrativeResponse(status);
  };
  const controller = new AdminCampaignRosterController(createRepository(), adminCampaignContext, {
    onAuthorizationRejected: rejectAuthorization,
  });
  const ui = mountAdminCampaignRoster(root, controller, authController);
  let previousCampaignId = adminCampaignContext.getCampaignId();
  const unsubscribeContext = adminCampaignContext.subscribe((campaignId) => {
    if (campaignId === previousCampaignId) return;
    previousCampaignId = campaignId;
    window.dispatchEvent(
      new CustomEvent('atlas:admin-campaign-changed', { detail: { campaignId } }),
    );
    options.onCampaignChanged?.(campaignId);
  });

  return {
    controller,
    destroy(): void {
      unsubscribeContext();
      ui.destroy();
      controller.destroy();
    },
  };
}
