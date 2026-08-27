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
    void _draft;
    return Promise.reject(this.#error);
  }

  updateCampaign(
    _original: AdminCampaignRecord,
    _draft: AdminCampaignDraft,
  ): Promise<AdminCampaignRecord> {
    void _original;
    void _draft;
    return Promise.reject(this.#error);
  }

  setCampaignStatus(
    _original: AdminCampaignRecord,
    _status: CampaignStatus,
  ): Promise<AdminCampaignRecord> {
    void _original;
    void _status;
    return Promise.reject(this.#error);
  }

  listPlayers(_campaignId: string): Promise<readonly AdminPlayerRecord[]> {
    void _campaignId;
    return Promise.reject(this.#error);
  }

  createPlayer(_campaignId: string, _draft: AdminPlayerDraft): Promise<AdminPlayerRecord> {
    void _campaignId;
    void _draft;
    return Promise.reject(this.#error);
  }

  updatePlayer(
    _campaignId: string,
    _original: AdminPlayerRecord,
    _draft: AdminPlayerDraft,
  ): Promise<AdminPlayerRecord> {
    void _campaignId;
    void _original;
    void _draft;
    return Promise.reject(this.#error);
  }

  setPlayerArchived(
    _campaignId: string,
    _original: AdminPlayerRecord,
    _archived: boolean,
  ): Promise<AdminPlayerRecord> {
    void _campaignId;
    void _original;
    void _archived;
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

function discardOtherOpenEditors(root: ParentNode, ownSection: HTMLElement | null): void {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  if (!shell) return;

  for (const button of shell.querySelectorAll<HTMLButtonElement>('button')) {
    if (
      ownSection?.contains(button) ||
      button.disabled ||
      button.textContent?.trim() !== 'Cancelar'
    ) {
      continue;
    }
    const container = button.closest<HTMLElement>('section, dialog, form');
    if (container && !container.closest('[hidden]')) button.click();
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
  const campaignName = root.querySelector<HTMLInputElement>('#admin-campaign-name');
  campaignName?.setAttribute('aria-label', 'Nombre de campaña');
  const campaignNameLabel = root.querySelector<HTMLLabelElement>('label[for="admin-campaign-name"]');
  if (campaignNameLabel) campaignNameLabel.textContent = 'Nombre de campaña';
  const ownSection = root.querySelector<HTMLElement>('.admin-campaign-roster');
  const unsubscribeTransition = adminCampaignContext.subscribeTransition((transition) => {
    if (!transition) return;
    discardOtherOpenEditors(root, ownSection);
    window.dispatchEvent(
      new CustomEvent('atlas:admin-campaign-transition-started', {
        detail: { campaignId: transition.targetCampaignId },
      }),
    );
  });
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
      unsubscribeTransition();
      unsubscribeContext();
      ui.destroy();
      controller.destroy();
    },
  };
}
