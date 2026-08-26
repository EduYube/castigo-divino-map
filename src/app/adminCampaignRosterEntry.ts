import { AdminCampaignRosterController } from '../application/adminCampaignRosterController';
import { adminCampaignContext } from '../application/adminCampaignContext';
import type { AdminAuthController } from '../auth/adminAuthController';
import type { AdminAuthState, AdminAuthPhase } from '../auth/authState';
import { AdminCampaignRosterRepositoryError } from '../data-access/adminCampaignRoster';
import { SupabaseAdminCampaignRosterRepository } from '../infrastructure/supabase/adminCampaignRosterRepository';
import { mountAdminCampaignRoster } from './adminCampaignRoster';
import '../styles/admin-campaign-roster.css';

class DomAdminAuthBridge {
  readonly #entry: HTMLElement;
  readonly #listeners = new Set<(state: AdminAuthState) => void>();
  readonly #observer: MutationObserver;
  #operationId = 0;

  constructor(entry: HTMLElement) {
    this.#entry = entry;
    this.#observer = new MutationObserver(() => this.#publish());
    this.#observer.observe(entry, { attributes: true, attributeFilter: ['data-auth-phase'] });
  }

  getState(): AdminAuthState {
    const candidate = this.#entry.dataset.authPhase;
    const phase: AdminAuthPhase =
      candidate === 'anonymous' ||
      candidate === 'restoring' ||
      candidate === 'authenticating' ||
      candidate === 'authorizing' ||
      candidate === 'unauthorized' ||
      candidate === 'authorized' ||
      candidate === 'expired' ||
      candidate === 'error'
        ? candidate
        : 'anonymous';
    return { phase, identity: null, issue: null, operationId: this.#operationId };
  }

  subscribe(listener: (state: AdminAuthState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.getState());
    return () => this.#listeners.delete(listener);
  }

  destroy(): void {
    this.#observer.disconnect();
    this.#listeners.clear();
  }

  #publish(): void {
    this.#operationId += 1;
    const state = this.getState();
    for (const listener of this.#listeners) listener(state);
  }
}

function clickAdministrativeReloads(shell: HTMLElement, ownSection: HTMLElement): void {
  for (const button of shell.querySelectorAll<HTMLButtonElement>('button')) {
    if (ownSection.contains(button)) continue;
    if (!button.disabled && /^recargar/i.test(button.textContent?.trim() ?? '')) button.click();
  }
}

function dismissIncompatibleEditors(shell: HTMLElement, ownSection: HTMLElement): void {
  for (const button of shell.querySelectorAll<HTMLButtonElement>('button')) {
    if (ownSection.contains(button)) continue;
    if (button.disabled || button.textContent?.trim() !== 'Cancelar') continue;
    const container = button.closest<HTMLElement>('section, dialog, form');
    if (container && !container.closest('[hidden]')) button.click();
  }
}

function start(): void {
  const shell = document.querySelector<HTMLElement>('.admin-auth__shell');
  const authEntry = document.querySelector<HTMLElement>('.admin-auth-entry');
  if (!shell || !authEntry) return;

  const testConfig = import.meta.env.DEV ? window.__MAP017_AUTH_TEST_CONFIG__ : undefined;
  const projectUrl = testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const publishableKey =
    testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const authBridge = new DomAdminAuthBridge(authEntry);

  let repository: SupabaseAdminCampaignRosterRepository;
  try {
    repository = new SupabaseAdminCampaignRosterRepository({
      projectUrl,
      publishableKey,
      timeoutMs: testConfig?.timeoutMs,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    // The existing admin surfaces already expose configuration failures. Avoid
    // mounting a second broken panel if MAP-054 cannot construct its repository.
    if (error instanceof AdminCampaignRosterRepositoryError) return;
    return;
  }

  const controller = new AdminCampaignRosterController(repository, adminCampaignContext);
  const ui = mountAdminCampaignRoster(
    document,
    controller,
    authBridge as unknown as AdminAuthController,
  );
  const ownSection = shell.querySelector<HTMLElement>('.admin-campaign-roster');
  let previousCampaignId = adminCampaignContext.getCampaignId();
  const unsubscribeContext = adminCampaignContext.subscribe((campaignId) => {
    if (campaignId === previousCampaignId) return;
    previousCampaignId = campaignId;
    if (ownSection) {
      dismissIncompatibleEditors(shell, ownSection);
      clickAdministrativeReloads(shell, ownSection);
    }
    window.dispatchEvent(
      new CustomEvent('atlas:admin-campaign-changed', { detail: { campaignId } }),
    );
  });

  window.addEventListener(
    'pagehide',
    () => {
      unsubscribeContext();
      ui.destroy();
      controller.destroy();
      authBridge.destroy();
    },
    { once: true },
  );
}

start();
