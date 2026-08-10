import type { AdminMapEntityController } from './adminMapEntityController';
import type { AdminAuthController } from '../auth/adminAuthController';
import {
  MasterCatalogRepositoryError,
  type AuthorizedMasterCatalog,
  type MasterCatalogRepository,
} from '../data-access/masterCatalog';

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
  #operationId = 0;
  #abortController: AbortController | null = null;
  #destroyed = false;

  constructor(
    repository: MasterCatalogRepository,
    authController: AdminAuthController,
    mapEntityController: AdminMapEntityController,
  ) {
    this.#repository = repository;
    this.#authController = authController;
    this.#mapEntityController = mapEntityController;
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
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.#destroyed) return;
    if (!enabled) {
      this.#purge(this.#isAvailable() ? 'off' : 'unavailable', null);
      return;
    }
    if (!this.#isAvailable()) {
      this.#purge('unavailable', 'Modo Máster requiere una sesión administrativa autorizada y Supabase conectado.');
      return;
    }
    await this.reload();
  }

  async reload(): Promise<void> {
    if (this.#destroyed || !this.#isAvailable()) {
      this.#purge('unavailable', null);
      return;
    }

    this.#cancelActive();
    const operationId = ++this.#operationId;
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
      const catalog = await this.#repository.load({ signal: controller.signal });
      if (!this.#isCurrent(operationId) || !this.#isAvailable()) return;
      this.#publish({
        available: true,
        enabled: true,
        phase: 'on',
        catalog,
        message:
          catalog.entities.length === 0
            ? 'Modo Máster activo. No hay entidades Máster publicadas.'
            : `Modo Máster activo. ${catalog.entities.length} entidades privadas cargadas solo en memoria.`,
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
        available: true,
        enabled: false,
        phase: 'error',
        catalog: null,
        message: normalized.message,
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

  #isAvailable(): boolean {
    const authAuthorized = this.#authController.getState().phase === 'authorized';
    const entityState = this.#mapEntityController.getState();
    return authAuthorized && entityState.authorized && entityState.backendConnected;
  }

  #synchronizeAvailability(): void {
    if (this.#destroyed) return;
    const available = this.#isAvailable();
    if (!available) {
      this.#purge('unavailable', null);
      return;
    }
    if (!this.#state.available) {
      // A restored admin session never restores Modo Máster. It always starts OFF.
      this.#publish({ available: true, enabled: false, phase: 'off', catalog: null, message: null });
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
