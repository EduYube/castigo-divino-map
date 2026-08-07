import {
  toAdminCharacterLocationRelationIssue,
  type AdminCharacterLocationRelationIssue,
  type AdminCharacterLocationRelationRepository,
} from '../data-access/adminCharacterLocationRelations';
import type {
  AdminCharacterLocationRelationDraft,
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
} from '../domain/characterLocationRelations';
import { validateCharacterLocationRelationDraft } from '../domain/characterLocationRelationValidation';

export type AdminCharacterLocationRelationPhase =
  'blocked' | 'loading' | 'ready' | 'mutating' | 'error';

export interface AdminCharacterLocationRelationState {
  readonly records: readonly AdminCharacterLocationRelationRecord[];
  readonly references: AdminCharacterLocationRelationReferences;
  readonly phase: AdminCharacterLocationRelationPhase;
  readonly issue: AdminCharacterLocationRelationIssue | null;
  readonly authorized: boolean;
  readonly backendConnected: boolean;
}

interface AdminCharacterLocationRelationControllerOptions {
  readonly onAuthorizationRejected?: (status: 401 | 403) => void;
}

const EMPTY_REFERENCES: AdminCharacterLocationRelationReferences = {
  characters: [],
  locations: [],
};
const INITIAL_STATE: AdminCharacterLocationRelationState = {
  records: [],
  references: EMPTY_REFERENCES,
  phase: 'blocked',
  issue: null,
  authorized: false,
  backendConnected: false,
};

export class AdminCharacterLocationRelationController {
  readonly #repository: AdminCharacterLocationRelationRepository;
  readonly #onAuthorizationRejected: ((status: 401 | 403) => void) | undefined;
  readonly #listeners = new Set<(state: AdminCharacterLocationRelationState) => void>();
  #state = INITIAL_STATE;
  #activeController: AbortController | null = null;
  #generation = 0;
  #destroyed = false;

  constructor(
    repository: AdminCharacterLocationRelationRepository,
    options: AdminCharacterLocationRelationControllerOptions = {},
  ) {
    this.#repository = repository;
    this.#onAuthorizationRejected = options.onAuthorizationRejected;
  }

  getState(): AdminCharacterLocationRelationState {
    return this.#state;
  }

  subscribe(listener: (state: AdminCharacterLocationRelationState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setAccess(authorized: boolean, backendConnected: boolean): void {
    if (this.#destroyed) return;
    const wasAvailable = this.#state.authorized && this.#state.backendConnected;
    const available = authorized && backendConnected;
    if (!available) {
      this.#cancelActive();
      this.#publish({
        records: [],
        references: EMPTY_REFERENCES,
        phase: 'blocked',
        issue: null,
        authorized,
        backendConnected,
      });
      return;
    }
    this.#publish({ ...this.#state, authorized, backendConnected, issue: null });
    if (!wasAvailable || this.#state.records.length === 0) void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.#canMutate()) {
      this.#publishBlocked();
      return;
    }
    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'loading', issue: null });
    try {
      const [records, references] = await Promise.all([
        this.#repository.list({ signal: operation.signal }),
        this.#repository.loadReferences({ signal: operation.signal }),
      ]);
      if (!this.#isCurrent(operation.generation)) return;
      this.#publish({ ...this.#state, records, references, phase: 'ready', issue: null });
    } catch (error) {
      this.#handleFailure(error, operation.generation);
    }
  }

  async save(
    draft: AdminCharacterLocationRelationDraft,
    original: AdminCharacterLocationRelationRecord | null,
  ): Promise<boolean> {
    const validation = validateCharacterLocationRelationDraft(
      draft,
      this.#state.references,
      this.#state.records,
      original,
    );
    if (!validation.valid) {
      this.#publish({
        ...this.#state,
        issue: {
          code: 'validation',
          message: 'Revisa la relación antes de guardarla.',
          field: Object.keys(validation.fieldErrors)[0] ?? null,
          status: null,
        },
      });
      return false;
    }
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return false;
    }
    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      const saved = original
        ? await this.#repository.update(original, draft, { signal: operation.signal })
        : await this.#repository.create(draft, { signal: operation.signal });
      if (!this.#isCurrent(operation.generation)) return false;
      const records = original
        ? this.#state.records.map((record) =>
            record.characterId === original.characterId && record.locationId === original.locationId
              ? saved
              : record,
          )
        : [...this.#state.records, saved];
      this.#publish({ ...this.#state, records, phase: 'ready', issue: null });
      return true;
    } catch (error) {
      this.#handleFailure(error, operation.generation);
      return false;
    }
  }

  async retire(record: AdminCharacterLocationRelationRecord): Promise<boolean> {
    if (record.publicationStatus === 'archived') return true;
    return this.save(
      {
        characterId: record.characterId,
        locationId: record.locationId,
        relationStatus: record.relationStatus,
        publicationStatus: 'archived',
      },
      record,
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelActive();
    this.#listeners.clear();
  }

  #canMutate(): boolean {
    return this.#state.authorized && this.#state.backendConnected && !this.#destroyed;
  }

  #publishBlocked(): void {
    this.#publish({
      ...this.#state,
      phase: 'blocked',
      issue: {
        code: 'backend-unavailable',
        message: this.#state.authorized
          ? 'La edición de relaciones requiere que el backend público esté conectado.'
          : 'Necesitas una sesión administrativa autorizada.',
        field: null,
        status: null,
      },
    });
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
    this.#generation += 1;
  }

  #isCurrent(generation: number): boolean {
    return !this.#destroyed && generation === this.#generation;
  }

  #handleFailure(error: unknown, generation: number): void {
    if (!this.#isCurrent(generation)) return;
    const issue = toAdminCharacterLocationRelationIssue(error);
    if (issue.status === 401 || issue.code === 'session-expired') {
      this.#onAuthorizationRejected?.(401);
    } else if (issue.status === 403 || issue.code === 'unauthorized') {
      this.#onAuthorizationRejected?.(403);
    }
    this.#publish({ ...this.#state, phase: 'error', issue });
  }

  #publish(state: AdminCharacterLocationRelationState): void {
    if (this.#destroyed) return;
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }
}
