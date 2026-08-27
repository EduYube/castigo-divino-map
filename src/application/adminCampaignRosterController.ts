import {
  AdminCampaignContext,
  type AdminCampaignTransition,
} from './adminCampaignContext';
import {
  toAdminCampaignRosterIssue,
  type AdminCampaignRosterIssue,
  type AdminCampaignRosterRepository,
} from '../data-access/adminCampaignRoster';
import {
  INITIAL_CAMPAIGN_ID,
  validateCampaignDraft,
  validatePlayerDraft,
  type AdminCampaignDraft,
  type AdminCampaignRecord,
  type AdminPlayerDraft,
  type AdminPlayerRecord,
} from '../domain/adminCampaignRoster';

export type AdminCampaignRosterPhase = 'blocked' | 'loading' | 'ready' | 'mutating' | 'error';

export interface AdminCampaignRosterState {
  readonly campaigns: readonly AdminCampaignRecord[];
  readonly players: readonly AdminPlayerRecord[];
  readonly selectedCampaignId: string;
  readonly phase: AdminCampaignRosterPhase;
  readonly issue: AdminCampaignRosterIssue | null;
  readonly authorized: boolean;
  readonly backendConnected: boolean;
}

export type AdminCampaignRosterStateListener = (state: AdminCampaignRosterState) => void;

interface AdminCampaignRosterControllerOptions {
  readonly onAuthorizationRejected?: (status: 401 | 403) => void;
}

function sortCampaigns(campaigns: readonly AdminCampaignRecord[]): readonly AdminCampaignRecord[] {
  return [...campaigns].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    return (
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base', numeric: true }) ||
      left.id.localeCompare(right.id)
    );
  });
}

function sortPlayers(players: readonly AdminPlayerRecord[]): readonly AdminPlayerRecord[] {
  return [...players].sort((left, right) => {
    if (left.publicationStatus !== right.publicationStatus) {
      if (left.publicationStatus === 'archived') return 1;
      if (right.publicationStatus === 'archived') return -1;
    }
    return (
      left.displayOrder - right.displayOrder ||
      left.displayName.localeCompare(right.displayName, 'es', {
        sensitivity: 'base',
        numeric: true,
      }) ||
      left.id.localeCompare(right.id)
    );
  });
}

export class AdminCampaignRosterController {
  readonly #repository: AdminCampaignRosterRepository;
  readonly #context: AdminCampaignContext;
  readonly #onAuthorizationRejected: ((status: 401 | 403) => void) | undefined;
  readonly #listeners = new Set<AdminCampaignRosterStateListener>();
  #state: AdminCampaignRosterState;
  #generation = 0;
  #activeController: AbortController | null = null;
  #activeTransition: AdminCampaignTransition | null = null;
  #destroyed = false;

  constructor(
    repository: AdminCampaignRosterRepository,
    context: AdminCampaignContext,
    options: AdminCampaignRosterControllerOptions = {},
  ) {
    this.#repository = repository;
    this.#context = context;
    this.#onAuthorizationRejected = options.onAuthorizationRejected;
    this.#state = {
      campaigns: [],
      players: [],
      selectedCampaignId: context.getCampaignId(),
      phase: 'blocked',
      issue: null,
      authorized: false,
      backendConnected: false,
    };
  }

  getState(): AdminCampaignRosterState {
    return this.#state;
  }

  subscribe(listener: AdminCampaignRosterStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setAccess(authorized: boolean, backendConnected: boolean): void {
    if (this.#destroyed) return;
    const wasAvailable = this.#canMutate();
    const isAvailable = authorized && backendConnected;
    if (!isAvailable) {
      this.#cancelActive();
      this.#publish({
        ...this.#state,
        campaigns: [],
        players: [],
        authorized,
        backendConnected,
        phase: 'blocked',
        issue: null,
      });
      return;
    }
    this.#publish({ ...this.#state, authorized, backendConnected, issue: null });
    if (!wasAvailable) void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.#canMutate()) {
      this.#publishBlocked();
      return;
    }
    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'loading', issue: null });
    try {
      const campaigns = sortCampaigns(
        await this.#repository.listCampaigns({ signal: operation.signal }),
      );
      if (!this.#isCurrent(operation.generation)) return;
      const current = campaigns.find(({ id }) => id === this.#context.getCampaignId());
      const fallback =
        current ??
        campaigns.find(({ id }) => id === INITIAL_CAMPAIGN_ID) ??
        campaigns.find(({ status }) => status === 'active') ??
        campaigns[0];
      if (!fallback) {
        this.#publish({
          ...this.#state,
          campaigns: [],
          players: [],
          phase: 'error',
          issue: {
            code: 'invalid-response',
            message: 'No existe ninguna campaña administrativa disponible.',
            field: null,
            status: null,
          },
        });
        return;
      }
      const selectedCampaignId = fallback.id;
      this.#context.setCampaignId(selectedCampaignId);
      const players = sortPlayers(
        await this.#repository.listPlayers(selectedCampaignId, { signal: operation.signal }),
      );
      if (!this.#isCurrent(operation.generation)) return;
      this.#publish({
        ...this.#state,
        campaigns,
        players,
        selectedCampaignId,
        phase: 'ready',
        issue: null,
      });
    } catch (error) {
      this.#handleFailure(error, operation.generation);
    }
  }

  async selectCampaign(campaignId: string): Promise<boolean> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') return false;
    if (campaignId === this.#state.selectedCampaignId) return true;
    if (!this.#state.campaigns.some(({ id }) => id === campaignId)) {
      this.#publish({
        ...this.#state,
        issue: {
          code: 'validation',
          message: 'La campaña seleccionada ya no está disponible.',
          field: 'campaignId',
          status: null,
        },
      });
      return false;
    }
    const operation = this.#beginOperation();
    const transition = this.#context.beginTransition(campaignId);
    this.#activeTransition = transition;
    this.#publish({ ...this.#state, phase: 'loading', issue: null });
    try {
      const players = sortPlayers(
        await this.#repository.listPlayers(campaignId, { signal: operation.signal }),
      );
      if (!this.#isCurrent(operation.generation)) {
        this.#cancelTransition(transition);
        return false;
      }
      if (!this.#context.commitTransition(transition)) return false;
      this.#activeTransition = null;
      this.#publish({
        ...this.#state,
        selectedCampaignId: campaignId,
        players,
        phase: 'ready',
        issue: null,
      });
      return true;
    } catch (error) {
      this.#cancelTransition(transition);
      this.#handleFailure(error, operation.generation);
      return false;
    }
  }

  createCampaign(draft: AdminCampaignDraft): Promise<boolean> {
    const validation = validateCampaignDraft(draft);
    if (!validation.valid) {
      return Promise.resolve(this.#publishValidation(validation.fieldErrors));
    }
    return this.#mutate(
      (signal) => this.#repository.createCampaign(draft, { signal }),
      (created) => ({ campaigns: sortCampaigns([...this.#state.campaigns, created]) }),
    );
  }

  updateCampaign(original: AdminCampaignRecord, draft: AdminCampaignDraft): Promise<boolean> {
    const validation = validateCampaignDraft(draft);
    if (!validation.valid) {
      return Promise.resolve(this.#publishValidation(validation.fieldErrors));
    }
    return this.#mutate(
      (signal) => this.#repository.updateCampaign(original, draft, { signal }),
      (updated) => ({
        campaigns: sortCampaigns(
          this.#state.campaigns.map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        ),
      }),
    );
  }

  setCampaignArchived(original: AdminCampaignRecord, archived: boolean): Promise<boolean> {
    return this.#mutate(
      (signal) =>
        this.#repository.setCampaignStatus(original, archived ? 'archived' : 'active', {
          signal,
        }),
      (updated) => ({
        campaigns: sortCampaigns(
          this.#state.campaigns.map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        ),
      }),
    );
  }

  createPlayer(draft: AdminPlayerDraft): Promise<boolean> {
    const validation = validatePlayerDraft(draft);
    if (!validation.valid) {
      return Promise.resolve(this.#publishValidation(validation.fieldErrors));
    }
    const campaign = this.#selectedCampaign();
    if (!campaign || campaign.status !== 'active') {
      return Promise.resolve(
        this.#publishIssue('No se pueden crear jugadores dentro de una campaña archivada.'),
      );
    }
    return this.#mutate(
      (signal) => this.#repository.createPlayer(this.#state.selectedCampaignId, draft, { signal }),
      (created) => ({ players: sortPlayers([...this.#state.players, created]) }),
    );
  }

  updatePlayer(original: AdminPlayerRecord, draft: AdminPlayerDraft): Promise<boolean> {
    const validation = validatePlayerDraft(draft);
    if (!validation.valid) {
      return Promise.resolve(this.#publishValidation(validation.fieldErrors));
    }
    if (original.campaignId !== this.#state.selectedCampaignId) {
      return Promise.resolve(this.#publishIssue('El jugador pertenece a otra campaña.'));
    }
    return this.#mutate(
      (signal) =>
        this.#repository.updatePlayer(this.#state.selectedCampaignId, original, draft, { signal }),
      (updated) => ({
        players: sortPlayers(
          this.#state.players.map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        ),
      }),
    );
  }

  setPlayerArchived(original: AdminPlayerRecord, archived: boolean): Promise<boolean> {
    if (original.campaignId !== this.#state.selectedCampaignId) {
      return Promise.resolve(this.#publishIssue('El jugador pertenece a otra campaña.'));
    }
    return this.#mutate(
      (signal) =>
        this.#repository.setPlayerArchived(this.#state.selectedCampaignId, original, archived, {
          signal,
        }),
      (updated) => ({
        players: sortPlayers(
          this.#state.players.map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        ),
      }),
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelActive();
    this.#listeners.clear();
  }

  #selectedCampaign(): AdminCampaignRecord | undefined {
    return this.#state.campaigns.find(({ id }) => id === this.#state.selectedCampaignId);
  }

  #canMutate(): boolean {
    return this.#state.authorized && this.#state.backendConnected && !this.#destroyed;
  }

  #publishValidation(fieldErrors: Readonly<Record<string, string>>): false {
    this.#publish({
      ...this.#state,
      issue: {
        code: 'validation',
        message: 'Revisa los campos indicados antes de guardar.',
        field: Object.keys(fieldErrors)[0] ?? null,
        status: null,
      },
    });
    return false;
  }

  #publishIssue(message: string): false {
    this.#publish({
      ...this.#state,
      issue: { code: 'operation-prohibited', message, field: null, status: null },
    });
    return false;
  }

  #publishBlocked(): void {
    this.#publish({
      ...this.#state,
      phase: 'blocked',
      issue: {
        code: 'backend-unavailable',
        message: this.#state.authorized
          ? 'Las mutaciones permanecen bloqueadas hasta recuperar el backend.'
          : 'Necesitas una sesión administrativa autorizada.',
        field: null,
        status: null,
      },
    });
  }

  async #mutate<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    apply: (result: T) => Partial<AdminCampaignRosterState>,
  ): Promise<boolean> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return false;
    }
    const active = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      const result = await operation(active.signal);
      if (!this.#isCurrent(active.generation)) return false;
      this.#publish({ ...this.#state, ...apply(result), phase: 'ready', issue: null });
      return true;
    } catch (error) {
      this.#handleFailure(error, active.generation);
      return false;
    }
  }

  #beginOperation(): { readonly generation: number; readonly signal: AbortSignal } {
    this.#cancelActive();
    this.#generation += 1;
    this.#activeController = new AbortController();
    return { generation: this.#generation, signal: this.#activeController.signal };
  }

  #cancelActive(): void {
    this.#activeController?.abort();
    this.#activeController = null;
    if (this.#activeTransition) this.#cancelTransition(this.#activeTransition);
    this.#generation += 1;
  }

  #cancelTransition(transition: AdminCampaignTransition): void {
    this.#context.cancelTransition(transition);
    if (this.#activeTransition?.token === transition.token) this.#activeTransition = null;
  }

  #isCurrent(generation: number): boolean {
    return !this.#destroyed && generation === this.#generation;
  }

  #handleFailure(error: unknown, generation: number): void {
    if (!this.#isCurrent(generation)) return;
    const issue = toAdminCampaignRosterIssue(error);
    if (issue.status === 401 || issue.code === 'session-expired') {
      this.#onAuthorizationRejected?.(401);
    } else if (issue.status === 403 || issue.code === 'unauthorized') {
      this.#onAuthorizationRejected?.(403);
    }
    this.#publish({ ...this.#state, phase: 'error', issue });
  }

  #publish(state: AdminCampaignRosterState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener(this.#state);
  }
}
