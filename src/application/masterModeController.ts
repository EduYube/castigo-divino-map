import type { AdminMapEntityController } from './adminMapEntityController';
import type { AdminAuthController } from '../auth/adminAuthController';
import {
  MasterCatalogRepositoryError,
  type AuthorizedMasterCatalog,
  type MasterCatalogRepository,
} from '../data-access/masterCatalog';
import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../data-access/publicCatalogQueryContract.js';

export type MasterModePhase = 'unavailable' | 'off' | 'loading' | 'on' | 'error';

export interface MasterModeState {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly phase: MasterModePhase;
  readonly catalog: AuthorizedMasterCatalog | null;
  readonly message: string | null;
}

export type MasterModeStateListener = (state: MasterModeState) => void;

const INITIAL_STATE: MasterModeState = {
  available: false,
  enabled: false,
  phase: 'unavailable',
  catalog: null,
  message: null,
};

export class MasterModeController {
  readonly #repository: MasterCatalogRepository;
  readonly #authController: AdminAuthController;
  readonly #mapEntityController: AdminMapEntityController;
  readonly #listeners = new Set<MasterModeStateListener>();
  readonly #unsubscribeAuth: () => void;
  readonly #unsubscribeMapEntities: () => void;
  #state = INITIAL_STATE;
  #campaignId: string;
  #operationId = 0;
  #abortController: AbortController | null = null;
  #destroyed = false;

  constructor(
    repository: MasterCatalogRepository,
    authController: AdminAuthController,
    mapEntityController: AdminMapEntityController,
    initialCampaignId: string = INITIAL_PUBLIC_CAMPAIGN_ID,
  ) {
    this.#repository = repository;
    this.#authController = authController;
    this.#mapEntityController = mapEntityController;
    this.#campaignId = initialCampaignId;
    this.#unsubscribeAuth = authController.subscribe(() => this.#synchronizeAvailability());
    this.#unsubscribeMapEntities = mapEntityController.subscribe(() =>
      this.#synchronizeAvailability(),
    );
  }

  getState(): MasterModeState {
    return this.#state;
  }

  subscribe(listener: MasterModeStateListener): () => void {
    this.#listeners.add(listener);
    queueMicrotask(() => {
      if (!this.#destroyed && this.#listeners.has(listener)) listener(this.#state);
    });
    return () => this.#listeners.delete(listener);
  }

  setCampaign(campaignId: string): void {
    if (this.#destroyed || campaignId === this.#campaignId) return;
    this.#campaignId = campaignId;

    if (this.#state.enabled) {
      // reload() synchronously aborts and publishes catalog:null before its first await,
      // so the previous campaign's private catalog is purged before public adoption.
      void this.reload();
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.#destroyed) return;
    if (!enabled) {
      this.#purge(this.#isAuthorized() ? 'off' : 'unavailable', null);
      return;
    }
    if (!this.#isAuthorized()) {
      this.#purge('unavailable', 'Modo Máster requiere una sesión administrativa autorizada.');
      return;
    }
    await this.reload();
  }

  async reload(): Promise<void> {
    if (this.#destroyed || !this.#isAuthorized()) {
      this.#purge('unavailable', null);
      return;
    }

    this.#cancelActive();
    const operationId = ++this.#operationId;

    if (!this.#isBackendConnected()) {
      this.#publish({
        available: false,
        enabled: true,
        phase: 'error',
        catalog: null,
        message:
          'Modo Máster sigue activo, pero Supabase no está disponible. El contenido privado se cargará al recuperar la conexión.',
      });
      return;
    }

    const controller = new AbortController();
    this.#abortController = controller;
    this.#publish({
      available: true,
      enabled: true,
      phase: 'loading',
      catalog: null,
      message: null,
    });

    try {
      const catalog = await this.#repository.load({
        signal: controller.signal,
        campaignId: this.#campaignId,
      });
      if (!this.#isCurrent(operationId) || !this.#isAuthorized()) return;
      this.#publish({
        available: true,
        enabled: true,
        phase: 'on',
        catalog,
        message:
          catalog.entities.length === 0
            ? 'Modo Máster activo. No hay entidades Máster publicadas en esta campaña.'
            : `Modo Máster activo. ${catalog.entities.length} entidades privadas de esta campaña cargadas solo en memoria.`,
      });
    } catch (error) {
      if (!this.#isCurrent(operationId) || controller.signal.aborted) return;
      const normalized =
        error instanceof MasterCatalogRepositoryError
          ? error
          : new MasterCatalogRepositoryError(
              'unexpected',
              'No se pudo cargar el catálogo Máster.',
              { cause: error },
            );
      if (
        normalized.status === 401 ||
        normalized.code === 'session-expired' ||
        normalized.status === 403 ||
        normalized.code === 'unauthorized'
      ) {
        const status: 401 | 403 =
          normalized.status === 403 || normalized.code === 'unauthorized' ? 403 : 401;
        this.#purge('unavailable', normalized.message);
        this.#authController.invalidateFromAdministrativeResponse(status);
        return;
      }
      this.#publish({
        available: false,
        enabled: true,
        phase: 'error',
        catalog: null,
        message: `${normalized.message} Modo Máster permanece activo y reintentará al recuperar el backend.`,
      });
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelActive();
    this.#unsubscribeAuth();
    this.#unsubscribeMapEntities();
    this.#listeners.clear();
    this.#state = INITIAL_STATE;
  }

  #isAuthorized(): boolean {
    return (
      this.#authController.getState().phase === 'authorized' &&
      this.#mapEntityController.getState().authorized
    );
  }

  #isBackendConnected(): boolean {
    return this.#mapEntityController.getState().backendConnected;
  }

  #synchronizeAvailability(): void {
    if (this.#destroyed) return;

    if (!this.#isAuthorized()) {
      this.#purge('unavailable', null);
      return;
    }

    if (!this.#isBackendConnected()) {
      this.#cancelActive();
      this.#operationId += 1;
      if (this.#state.enabled) {
        this.#publish({
          available: false,
          enabled: true,
          phase: 'error',
          catalog: null,
          message:
            'Modo Máster sigue activo, pero Supabase no está disponible. El contenido privado se cargará al recuperar la conexión.',
        });
      } else if (this.#state.phase !== 'unavailable' || this.#state.available) {
        this.#publish({
          available: false,
          enabled: false,
          phase: 'unavailable',
          catalog: null,
          message: null,
        });
      }
      return;
    }

    if (this.#state.enabled) {
      if (this.#state.phase !== 'loading' && this.#state.catalog === null) {
        void this.reload();
      }
      return;
    }

    if (!this.#state.available || this.#state.phase !== 'off') {
      // Restoring an authorized session starts OFF; a campaign switch does not alter it.
      this.#publish({
        available: true,
        enabled: false,
        phase: 'off',
        catalog: null,
        message: null,
      });
    }
  }

  #purge(phase: Extract<MasterModePhase, 'off' | 'unavailable'>, message: string | null): void {
    this.#cancelActive();
    this.#operationId += 1;
    this.#publish({
      available: phase === 'off',
      enabled: false,
      phase,
      catalog: null,
      message,
    });
  }

  #cancelActive(): void {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  #isCurrent(operationId: number): boolean {
    return !this.#destroyed && operationId === this.#operationId;
  }

  #publish(state: MasterModeState): void {
    if (this.#destroyed) return;
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }
}
