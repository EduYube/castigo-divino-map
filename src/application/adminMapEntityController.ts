import {
  toAdminMapEntityIssue,
  type AdminCharacterPortraitMutation,
  type AdminMapEntityIssue,
  type AdminMapEntityRepository,
} from '../data-access/adminMapEntities';
import {
  detailToDraft,
  getMapEntityAudience,
  type AdminMapEntityDetail,
  type AdminMapEntityDraft,
  type AdminMapEntityRecord,
  type AdminMapEntityReferences,
  type MapEntityAudience,
} from '../domain/adminMapEntities';
import { validateAdminMapEntityDraft } from '../domain/adminMapEntityValidation';

export type AdminMapEntityPhase =
  'blocked' | 'loading' | 'ready' | 'loading-editor' | 'mutating' | 'error';

export interface AdminMapEntityState {
  readonly records: readonly AdminMapEntityRecord[];
  readonly references: AdminMapEntityReferences;
  readonly editorDetail: AdminMapEntityDetail | null;
  readonly creating: boolean;
  readonly phase: AdminMapEntityPhase;
  readonly issue: AdminMapEntityIssue | null;
  readonly authorized: boolean;
  readonly backendConnected: boolean;
  readonly pendingAudience: MapEntityAudience;
}

export type AdminMapEntityStateListener = (state: AdminMapEntityState) => void;

interface AdminMapEntityControllerOptions {
  readonly onAuthorizationRejected?: (status: 401 | 403) => void;
}

const EMPTY_REFERENCES: AdminMapEntityReferences = {
  categories: [],
  tags: [],
  players: [],
};

const INITIAL_STATE: AdminMapEntityState = {
  records: [],
  references: EMPTY_REFERENCES,
  editorDetail: null,
  creating: false,
  phase: 'blocked',
  issue: null,
  authorized: false,
  backendConnected: false,
  pendingAudience: 'public',
};

export class AdminMapEntityController {
  readonly #repository: AdminMapEntityRepository;
  readonly #onAuthorizationRejected: ((status: 401 | 403) => void) | undefined;
  readonly #listeners = new Set<AdminMapEntityStateListener>();
  #state = INITIAL_STATE;
  #generation = 0;
  #activeController: AbortController | null = null;
  #destroyed = false;

  constructor(repository: AdminMapEntityRepository, options: AdminMapEntityControllerOptions = {}) {
    this.#repository = repository;
    this.#onAuthorizationRejected = options.onAuthorizationRejected;
  }

  getState(): AdminMapEntityState {
    return this.#state;
  }

  subscribe(listener: AdminMapEntityStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setAccess(authorized: boolean, backendConnected: boolean): void {
    if (this.#destroyed) return;
    const wasAvailable = this.#state.authorized && this.#state.backendConnected;
    const isAvailable = authorized && backendConnected;
    if (!isAvailable) {
      this.#cancelActive();
      this.#publish({
        ...this.#state,
        authorized,
        backendConnected,
        records: [],
        references: EMPTY_REFERENCES,
        editorDetail: null,
        creating: false,
        phase: 'blocked',
        issue: null,
        pendingAudience: 'public',
      });
      return;
    }
    this.#publish({ ...this.#state, authorized, backendConnected, issue: null });
    if (!wasAvailable || this.#state.records.length === 0) void this.reload();
  }

  setPendingAudience(audience: MapEntityAudience): void {
    if (!this.#canMutate() || (audience !== 'public' && audience !== 'master')) return;
    this.#publish({ ...this.#state, pendingAudience: audience });
  }

  async reload(): Promise<void> {
    if (!this.#canMutate()) {
      this.#publishBlocked();
      return;
    }
    const operation = this.#beginOperation();
    this.#publish({
      ...this.#state,
      phase: 'loading',
      issue: null,
      editorDetail: null,
      creating: false,
      pendingAudience: 'public',
    });
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

  openCreate(): void {
    if (!this.#canMutate() || this.#state.phase !== 'ready') {
      this.#publishBlocked();
      return;
    }
    this.#cancelActive();
    this.#publish({
      ...this.#state,
      creating: true,
      editorDetail: null,
      issue: null,
      pendingAudience: 'public',
    });
  }

  async openEditor(entityId: string): Promise<void> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return;
    }
    const operation = this.#beginOperation();
    this.#publish({
      ...this.#state,
      phase: 'loading-editor',
      issue: null,
      creating: false,
      editorDetail: null,
      pendingAudience: 'public',
    });
    try {
      const detail = await this.#repository.load(entityId, { signal: operation.signal });
      if (!this.#isCurrent(operation.generation)) return;
      this.#publish({
        ...this.#state,
        editorDetail: detail,
        phase: 'ready',
        issue: null,
        pendingAudience: getMapEntityAudience(detail.record),
      });
    } catch (error) {
      this.#handleFailure(error, operation.generation);
    }
  }

  closeEditor(): void {
    this.#cancelActive();
    this.#publish({
      ...this.#state,
      editorDetail: null,
      creating: false,
      phase: this.#canMutate() ? 'ready' : 'blocked',
      issue: null,
      pendingAudience: 'public',
    });
  }

  async save(
    draft: AdminMapEntityDraft,
    portraitMutation: AdminCharacterPortraitMutation = { kind: 'keep' },
  ): Promise<boolean> {
    const original = this.#state.editorDetail;
    const currentPortraitPath = original?.record.portraitPath ?? null;
    const effectiveDraft: AdminMapEntityDraft = {
      ...draft,
      audience: draft.audience ?? this.#state.pendingAudience,
      portraitPath: draft.portraitPath ?? currentPortraitPath,
    };
    const validation = validateAdminMapEntityDraft(
      effectiveDraft,
      this.#state.references,
      original,
    );
    if (!validation.valid) {
      this.#publish({
        ...this.#state,
        issue: {
          code: 'validation',
          message: 'Revisa los campos indicados antes de guardar.',
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
    let uploadedPortraitPath: string | null = null;
    try {
      let draftToSave = effectiveDraft;
      if (portraitMutation.kind === 'replace') {
        if (effectiveDraft.entityType !== 'character') {
          throw new Error('Only character entities can have a portrait.');
        }
        uploadedPortraitPath = await this.#repository.uploadPortrait(portraitMutation.file, {
          signal: operation.signal,
        });
        draftToSave = { ...effectiveDraft, portraitPath: uploadedPortraitPath };
      } else if (portraitMutation.kind === 'remove') {
        draftToSave = { ...effectiveDraft, portraitPath: null };
      }

      const saved = await this.#repository.save(original, draftToSave, {
        signal: operation.signal,
      });
      if (!this.#isCurrent(operation.generation)) return false;
      const records = original
        ? this.#state.records.map((record) =>
            record.id === saved.record.id ? saved.record : record,
          )
        : [...this.#state.records, saved.record];
      this.#publish({
        ...this.#state,
        records,
        editorDetail: saved,
        creating: false,
        phase: 'ready',
        issue: null,
        pendingAudience: getMapEntityAudience(saved.record),
      });
      const savedPortraitPath = saved.record.portraitPath ?? null;
      if (currentPortraitPath && currentPortraitPath !== savedPortraitPath) {
        try {
          await this.#repository.deletePortrait(currentPortraitPath, { signal: operation.signal });
        } catch (cleanupError) {
          console.warn(
            'MAP-045 portrait cleanup deferred after successful entity save.',
            cleanupError,
          );
        }
      }
      return true;
    } catch (error) {
      if (uploadedPortraitPath) {
        try {
          await this.#repository.deletePortrait(uploadedPortraitPath, { signal: operation.signal });
        } catch (cleanupError) {
          console.warn(
            'MAP-045 orphan portrait cleanup failed after rejected entity save.',
            cleanupError,
          );
        }
      }
      this.#handleFailure(error, operation.generation);
      return false;
    }
  }

  async changeAudience(entityId: string, audience: MapEntityAudience): Promise<boolean> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return false;
    }
    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      const detail = await this.#repository.load(entityId, { signal: operation.signal });
      if (!this.#isCurrent(operation.generation)) return false;
      if (getMapEntityAudience(detail.record) === audience) {
        this.#publish({ ...this.#state, phase: 'ready', issue: null });
        return true;
      }
      const saved = await this.#repository.save(
        detail,
        { ...detailToDraft(detail), audience },
        { signal: operation.signal },
      );
      if (!this.#isCurrent(operation.generation)) return false;
      const editorMatches = this.#state.editorDetail?.record.id === saved.record.id;
      this.#publish({
        ...this.#state,
        records: this.#state.records.map((record) =>
          record.id === saved.record.id ? saved.record : record,
        ),
        editorDetail: editorMatches ? saved : this.#state.editorDetail,
        phase: 'ready',
        issue: null,
        pendingAudience: editorMatches
          ? getMapEntityAudience(saved.record)
          : this.#state.pendingAudience,
      });
      return true;
    } catch (error) {
      this.#handleFailure(error, operation.generation);
      return false;
    }
  }

  async archive(record: AdminMapEntityRecord): Promise<boolean> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return false;
    }
    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      const detail = await this.#repository.load(record.id, { signal: operation.signal });
      if (!this.#isCurrent(operation.generation)) return false;
      const saved = await this.#repository.save(
        detail,
        { ...detailToDraft(detail), publicationStatus: 'archived' },
        { signal: operation.signal },
      );
      if (!this.#isCurrent(operation.generation)) return false;
      this.#publish({
        ...this.#state,
        records: this.#state.records.map((candidate) =>
          candidate.id === saved.record.id ? saved.record : candidate,
        ),
        editorDetail:
          this.#state.editorDetail?.record.id === saved.record.id
            ? saved
            : this.#state.editorDetail,
        phase: 'ready',
        issue: null,
        pendingAudience:
          this.#state.editorDetail?.record.id === saved.record.id
            ? getMapEntityAudience(saved.record)
            : this.#state.pendingAudience,
      });
      return true;
    } catch (error) {
      this.#handleFailure(error, operation.generation);
      return false;
    }
  }

  async delete(detail: AdminMapEntityDetail): Promise<boolean> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return false;
    }
    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      await this.#repository.delete(detail, { signal: operation.signal });
      if (!this.#isCurrent(operation.generation)) return false;
      if (detail.record.portraitPath) {
        try {
          await this.#repository.deletePortrait(detail.record.portraitPath, {
            signal: operation.signal,
          });
        } catch (cleanupError) {
          console.warn(
            'MAP-045 draft portrait cleanup failed after entity deletion.',
            cleanupError,
          );
        }
      }
      this.#publish({
        ...this.#state,
        records: this.#state.records.filter((record) => record.id !== detail.record.id),
        editorDetail: null,
        creating: false,
        phase: 'ready',
        issue: null,
        pendingAudience: 'public',
      });
      return true;
    } catch (error) {
      this.#handleFailure(error, operation.generation);
      return false;
    }
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
          ? 'La edición de entidades permanece bloqueada hasta que el backend público vuelva a estar conectado.'
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
    const issue = toAdminMapEntityIssue(error);
    if (issue.status === 401 || issue.code === 'session-expired') {
      this.#onAuthorizationRejected?.(401);
    } else if (issue.status === 403 || issue.code === 'unauthorized') {
      this.#onAuthorizationRejected?.(403);
    }
    this.#publish({ ...this.#state, phase: 'error', issue });
  }

  #publish(state: AdminMapEntityState): void {
    if (this.#destroyed) return;
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }
}
