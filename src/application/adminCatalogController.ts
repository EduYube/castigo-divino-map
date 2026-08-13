import {
  AdminCatalogRepositoryError,
  toAdminCatalogIssue,
  type AdminCatalogIssue,
  type AdminCatalogRepository,
} from '../data-access/adminCatalog';
import {
  getAdminRecordDisplayName,
  type AdminCatalogDraft,
  type AdminCatalogRecord,
  type AdminCatalogResourceKind,
  type AdminEntityReference,
  type AdminGeographicNameReference,
} from '../domain/adminCatalog';
import {
  normalizeAdminSearchText,
  validateAdminCatalogDraft,
} from '../domain/adminCatalogValidation';

export type AdminCatalogSort = 'name' | 'id' | 'status';
export type AdminCatalogSortDirection = 'asc' | 'desc';
export type AdminCatalogPhase = 'blocked' | 'loading' | 'ready' | 'mutating' | 'error';

export interface AdminCatalogState {
  readonly resourceKind: AdminCatalogResourceKind;
  readonly records: readonly AdminCatalogRecord[];
  readonly visibleRecords: readonly AdminCatalogRecord[];
  readonly entityReferences: readonly AdminEntityReference[];
  readonly geographicNameReferences: readonly AdminGeographicNameReference[];
  readonly query: string;
  readonly sort: AdminCatalogSort;
  readonly sortDirection: AdminCatalogSortDirection;
  readonly phase: AdminCatalogPhase;
  readonly issue: AdminCatalogIssue | null;
  readonly authorized: boolean;
  readonly backendConnected: boolean;
}

export type AdminCatalogStateListener = (state: AdminCatalogState) => void;

interface AdminCatalogControllerOptions {
  readonly onAuthorizationRejected?: (status: 401 | 403) => void;
}

const INITIAL_STATE: AdminCatalogState = {
  resourceKind: 'category',
  records: [],
  visibleRecords: [],
  entityReferences: [],
  geographicNameReferences: [],
  query: '',
  sort: 'name',
  sortDirection: 'asc',
  phase: 'blocked',
  issue: null,
  authorized: false,
  backendConnected: false,
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true });
}

function deriveVisibleRecords(state: AdminCatalogState): readonly AdminCatalogRecord[] {
  const query = normalizeAdminSearchText(state.query);
  const filtered = query
    ? state.records.filter((record) => {
        const haystack = normalizeAdminSearchText(
          `${record.id} ${getAdminRecordDisplayName(record)} ${record.publicationStatus}`,
        );
        return haystack.includes(query);
      })
    : [...state.records];

  return filtered.sort((left, right) => {
    let comparison: number;
    if (state.sort === 'id') {
      comparison = compareText(left.id, right.id);
    } else if (state.sort === 'status') {
      comparison = compareText(left.publicationStatus, right.publicationStatus);
    } else {
      comparison = compareText(getAdminRecordDisplayName(left), getAdminRecordDisplayName(right));
    }
    return state.sortDirection === 'asc' ? comparison : -comparison;
  });
}

export class AdminCatalogController {
  readonly #repository: AdminCatalogRepository;
  readonly #onAuthorizationRejected: ((status: 401 | 403) => void) | undefined;
  readonly #listeners = new Set<AdminCatalogStateListener>();
  #state = INITIAL_STATE;
  #generation = 0;
  #activeController: AbortController | null = null;
  #destroyed = false;

  constructor(repository: AdminCatalogRepository, options: AdminCatalogControllerOptions = {}) {
    this.#repository = repository;
    this.#onAuthorizationRejected = options.onAuthorizationRejected;
  }

  getState(): AdminCatalogState {
    return this.#state;
  }

  subscribe(listener: AdminCatalogStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setAccess(authorized: boolean, backendConnected: boolean): void {
    if (this.#destroyed) {
      return;
    }
    if (
      authorized === this.#state.authorized &&
      backendConnected === this.#state.backendConnected
    ) {
      return;
    }

    const wasAvailable = this.#state.authorized && this.#state.backendConnected;
    const isAvailable = authorized && backendConnected;

    if (!isAvailable) {
      this.#cancelActive();
      this.#publish({
        ...this.#state,
        authorized,
        backendConnected,
        records: [],
        visibleRecords: [],
        entityReferences: [],
        geographicNameReferences: [],
        phase: 'blocked',
        issue: null,
      });
      return;
    }

    this.#publish({ ...this.#state, authorized, backendConnected, issue: null });
    if (!wasAvailable) {
      void this.reload();
    }
  }

  selectResource(resourceKind: AdminCatalogResourceKind): void {
    if (resourceKind === this.#state.resourceKind) {
      return;
    }
    this.#cancelActive();
    this.#publish({
      ...this.#state,
      resourceKind,
      records: [],
      visibleRecords: [],
      entityReferences: [],
      geographicNameReferences: [],
      query: '',
      issue: null,
      phase: this.#canMutate() ? 'loading' : 'blocked',
    });
    if (this.#canMutate()) {
      void this.reload();
    }
  }

  setQuery(query: string): void {
    this.#publishDerived({ ...this.#state, query });
  }

  setSort(sort: AdminCatalogSort, sortDirection: AdminCatalogSortDirection): void {
    this.#publishDerived({ ...this.#state, sort, sortDirection });
  }

  async reload(): Promise<void> {
    if (!this.#canMutate()) {
      this.#publishBlocked();
      return;
    }

    const operation = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'loading', issue: null });

    try {
      const [records, entityReferences, geographicNameReferences] = await Promise.all([
        this.#repository.list(this.#state.resourceKind, { signal: operation.signal }),
        this.#state.resourceKind === 'entity-alias' ||
        this.#state.resourceKind === 'geographic-name'
          ? this.#repository.listEntityReferences({ signal: operation.signal })
          : Promise.resolve([] as readonly AdminEntityReference[]),
        this.#state.resourceKind === 'geographic-alias'
          ? this.#repository.listGeographicNameReferences({ signal: operation.signal })
          : Promise.resolve([] as readonly AdminGeographicNameReference[]),
      ]);

      if (!this.#isCurrent(operation.generation)) {
        return;
      }
      this.#publishDerived({
        ...this.#state,
        records,
        entityReferences,
        geographicNameReferences,
        phase: 'ready',
        issue: null,
      });
    } catch (error) {
      this.#handleFailure(error, operation.generation);
    }
  }

  async create(draft: AdminCatalogDraft): Promise<boolean> {
    const validation = validateAdminCatalogDraft(draft, { existing: this.#state.records });
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
    return this.#mutate(
      async (signal) => this.#repository.create(draft, { signal }),
      (created) => {
        const records = [...this.#state.records, created];
        return { records };
      },
    );
  }

  async update(original: AdminCatalogRecord, draft: AdminCatalogDraft): Promise<boolean> {
    const validation = validateAdminCatalogDraft(draft, {
      original,
      existing: this.#state.records,
    });
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
    return this.#mutate(
      async (signal) => this.#repository.update(original, draft, { signal }),
      (updated) => ({
        records: this.#state.records.map((record) => (record.id === updated.id ? updated : record)),
      }),
    );
  }

  async archive(record: AdminCatalogRecord): Promise<boolean> {
    return this.#mutate(
      async (signal) => this.#repository.archive(record, { signal }),
      (updated) => ({
        records: this.#state.records.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      }),
    );
  }

  async delete(record: AdminCatalogRecord): Promise<boolean> {
    return this.#mutate(
      async (signal) => {
        await this.#repository.delete(record, { signal });
        return record;
      },
      () => ({ records: this.#state.records.filter((candidate) => candidate.id !== record.id) }),
    );
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
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
          ? 'Las mutaciones permanecen bloqueadas hasta que el backend público vuelva a estar conectado.'
          : 'Necesitas una sesión administrativa autorizada.',
        field: null,
        status: null,
      },
    });
  }

  async #mutate(
    operation: (signal: AbortSignal) => Promise<AdminCatalogRecord>,
    applyResult: (record: AdminCatalogRecord) => {
      readonly records: readonly AdminCatalogRecord[];
    },
  ): Promise<boolean> {
    if (!this.#canMutate() || this.#state.phase === 'mutating') {
      this.#publishBlocked();
      return false;
    }

    const active = this.#beginOperation();
    this.#publish({ ...this.#state, phase: 'mutating', issue: null });
    try {
      const record = await operation(active.signal);
      if (!this.#isCurrent(active.generation)) {
        return false;
      }
      const result = applyResult(record);
      this.#publishDerived({ ...this.#state, ...result, phase: 'ready', issue: null });
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
    this.#generation += 1;
  }

  #isCurrent(generation: number): boolean {
    return !this.#destroyed && generation === this.#generation;
  }

  #handleFailure(error: unknown, generation: number): void {
    if (!this.#isCurrent(generation)) {
      return;
    }
    const issue = toAdminCatalogIssue(error);
    if (issue.status === 401 || issue.code === 'session-expired') {
      this.#onAuthorizationRejected?.(401);
    } else if (issue.status === 403 || issue.code === 'unauthorized') {
      this.#onAuthorizationRejected?.(403);
    }
    this.#publish({ ...this.#state, phase: 'error', issue });
  }

  #publishDerived(state: AdminCatalogState): void {
    this.#publish({ ...state, visibleRecords: deriveVisibleRecords(state) });
  }

  #publish(state: AdminCatalogState): void {
    if (this.#destroyed) {
      return;
    }
    this.#state = state;
    for (const listener of this.#listeners) {
      listener(state);
    }
  }
}

export function isAdministrativeAuthorizationError(error: unknown): boolean {
  return (
    error instanceof AdminCatalogRepositoryError &&
    (error.code === 'session-expired' || error.code === 'unauthorized')
  );
}
