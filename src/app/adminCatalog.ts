import type { AdminAuthController } from '../auth/adminAuthController';
import type {
  AdminCatalogController,
  AdminCatalogSort,
  AdminCatalogSortDirection,
  AdminCatalogState,
} from '../application/adminCatalogController';
import type { BackendState } from '../data-access/publicCatalog';
import {
  ADMIN_RESOURCE_LABELS,
  getAdminRecordDisplayName,
  type AdminCatalogDraft,
  type AdminCatalogRecord,
  type AdminCatalogResourceKind,
  type PublicationStatus,
} from '../domain/adminCatalog';
import {
  resourceAllowsPhysicalDelete,
  validateAdminCatalogDraft,
} from '../domain/adminCatalogValidation';

export interface AdminCatalogUiController {
  destroy(): void;
}

interface PublicDataStatusDetail {
  readonly backendState?: BackendState;
}

interface FieldControl {
  readonly input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  readonly error: HTMLParagraphElement;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

function isPublicDataStatusEvent(event: Event): event is CustomEvent<PublicDataStatusDetail> {
  return event instanceof CustomEvent && typeof event.detail === 'object' && event.detail !== null;
}

function addField(
  form: HTMLFormElement,
  controls: Map<string, FieldControl>,
  options: {
    readonly name: string;
    readonly label: string;
    readonly type?: HTMLInputElement['type'];
    readonly value?: string;
    readonly required?: boolean;
    readonly readOnly?: boolean;
    readonly disabled?: boolean;
    readonly textarea?: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly step?: string;
  },
): HTMLInputElement | HTMLTextAreaElement {
  const wrapper = createElement('div', 'admin-catalog__field');
  const label = createElement('label', 'admin-catalog__label');
  const input = options.textarea
    ? createElement('textarea', 'admin-catalog__control')
    : createElement('input', 'admin-catalog__control');
  const error = createElement('p', 'admin-catalog__field-error');
  const id = `admin-catalog-field-${options.name}`;
  const errorId = `${id}-error`;

  label.htmlFor = id;
  label.textContent = options.label;
  input.id = id;
  input.name = options.name;
  input.value = options.value ?? '';
  input.required = options.required ?? false;
  input.readOnly = options.readOnly ?? false;
  input.disabled = options.disabled ?? false;
  input.setAttribute('aria-describedby', errorId);
  error.id = errorId;
  error.setAttribute('aria-live', 'polite');

  if (input instanceof HTMLInputElement) {
    input.type = options.type ?? 'text';
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = options.step;
  }

  wrapper.append(label, input, error);
  form.append(wrapper);
  controls.set(options.name, { input, error });
  return input;
}

function addSelect(
  form: HTMLFormElement,
  controls: Map<string, FieldControl>,
  options: {
    readonly name: string;
    readonly label: string;
    readonly value: string;
    readonly choices: readonly { readonly value: string; readonly label: string }[];
    readonly required?: boolean;
    readonly disabled?: boolean;
  },
): HTMLSelectElement {
  const wrapper = createElement('div', 'admin-catalog__field');
  const label = createElement('label', 'admin-catalog__label');
  const select = createElement('select', 'admin-catalog__control');
  const error = createElement('p', 'admin-catalog__field-error');
  const id = `admin-catalog-field-${options.name}`;
  const errorId = `${id}-error`;

  label.htmlFor = id;
  label.textContent = options.label;
  select.id = id;
  select.name = options.name;
  select.required = options.required ?? false;
  select.disabled = options.disabled ?? false;
  select.setAttribute('aria-describedby', errorId);
  error.id = errorId;
  error.setAttribute('aria-live', 'polite');

  for (const choice of options.choices) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    option.selected = choice.value === options.value;
    select.append(option);
  }

  wrapper.append(label, select, error);
  form.append(wrapper);
  controls.set(options.name, { input: select, error });
  return select;
}

function statusChoices(): readonly { readonly value: PublicationStatus; readonly label: string }[] {
  return [
    { value: 'draft', label: 'Borrador' },
    { value: 'published', label: 'Publicado' },
    { value: 'archived', label: 'Archivado' },
  ];
}

function readControl(controls: Map<string, FieldControl>, name: string): string {
  return controls.get(name)?.input.value ?? '';
}

function parseDraft(
  kind: AdminCatalogResourceKind,
  controls: Map<string, FieldControl>,
): AdminCatalogDraft {
  const publicationStatus = readControl(controls, 'publicationStatus') as PublicationStatus;
  const id = readControl(controls, 'id');

  switch (kind) {
    case 'category':
      return {
        kind,
        id,
        slug: readControl(controls, 'slug'),
        name: readControl(controls, 'name'),
        description: readControl(controls, 'description'),
        publicationStatus,
      };
    case 'tag':
      return {
        kind,
        id,
        name: readControl(controls, 'name'),
        description: readControl(controls, 'description'),
        publicationStatus,
      };
    case 'entity-alias':
      return {
        kind,
        id,
        entityId: readControl(controls, 'entityId'),
        language: 'en',
        value: readControl(controls, 'value'),
        publicationStatus,
      };
    case 'geographic-name': {
      const zoom = readControl(controls, 'recommendedZoom').trim();
      const entityId = readControl(controls, 'entityId');
      return {
        kind,
        id,
        slug: readControl(controls, 'slug'),
        name: readControl(controls, 'name'),
        language: 'en',
        x: Number(readControl(controls, 'x')),
        y: Number(readControl(controls, 'y')),
        recommendedZoom: zoom ? Number(zoom) : null,
        entityId: entityId || null,
        publicationStatus,
      };
    }
    case 'geographic-alias':
      return {
        kind,
        id,
        geographicNameId: readControl(controls, 'geographicNameId'),
        language: 'en',
        value: readControl(controls, 'value'),
        publicationStatus,
      };
  }
}

function recordToDraft(record: AdminCatalogRecord): AdminCatalogDraft {
  switch (record.kind) {
    case 'category':
      return {
        kind: record.kind,
        id: record.id,
        slug: record.slug,
        name: record.name,
        description: record.description,
        publicationStatus: record.publicationStatus,
      };
    case 'tag':
      return {
        kind: record.kind,
        id: record.id,
        name: record.name,
        description: record.description,
        publicationStatus: record.publicationStatus,
      };
    case 'entity-alias':
      return {
        kind: record.kind,
        id: record.id,
        entityId: record.entityId,
        language: 'en',
        value: record.value,
        publicationStatus: record.publicationStatus,
      };
    case 'geographic-name':
      return {
        kind: record.kind,
        id: record.id,
        slug: record.slug,
        name: record.name,
        language: 'en',
        x: record.x,
        y: record.y,
        recommendedZoom: record.recommendedZoom,
        entityId: record.entityId,
        publicationStatus: record.publicationStatus,
      };
    case 'geographic-alias':
      return {
        kind: record.kind,
        id: record.id,
        geographicNameId: record.geographicNameId,
        language: 'en',
        value: record.value,
        publicationStatus: record.publicationStatus,
      };
  }
}

function emptyDraft(kind: AdminCatalogResourceKind): AdminCatalogDraft {
  switch (kind) {
    case 'category':
      return {
        kind,
        id: 'category-',
        slug: '',
        name: '',
        description: '',
        publicationStatus: 'draft',
      };
    case 'tag':
      return { kind, id: '', name: '', description: '', publicationStatus: 'draft' };
    case 'entity-alias':
      return {
        kind,
        id: 'alias-',
        entityId: '',
        language: 'en',
        value: '',
        publicationStatus: 'draft',
      };
    case 'geographic-name':
      return {
        kind,
        id: 'geo-',
        slug: '',
        name: '',
        language: 'en',
        x: 0,
        y: 0,
        recommendedZoom: null,
        entityId: null,
        publicationStatus: 'draft',
      };
    case 'geographic-alias':
      return {
        kind,
        id: 'geo-alias-',
        geographicNameId: '',
        language: 'en',
        value: '',
        publicationStatus: 'draft',
      };
  }
}

export function mountAdminCatalog(
  root: ParentNode,
  catalogController: AdminCatalogController,
  authController: AdminAuthController,
): AdminCatalogUiController {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  const summary = root.querySelector<HTMLElement>('.admin-auth__summary');
  if (!shell || !summary) {
    throw new Error('Missing administrative shell for MAP-018.');
  }

  summary.textContent =
    'Modo administrativo activo. Gestiona categorías, etiquetas y nombres sin mezclar la sesión con el catálogo público.';

  const section = createElement('section', 'admin-catalog');
  const heading = createElement('h3', 'admin-catalog__heading');
  const resourceGroup = createElement('div', 'admin-catalog__resources');
  const toolbar = createElement('div', 'admin-catalog__toolbar');
  const searchLabel = createElement('label', 'admin-catalog__search-label');
  const search = createElement('input', 'admin-catalog__search');
  const sortLabel = createElement('label', 'admin-catalog__sort-label');
  const sort = createElement('select', 'admin-catalog__sort');
  const newButton = createElement('button', 'admin-catalog__primary');
  const refreshButton = createElement('button', 'admin-catalog__button');
  const status = createElement('p', 'admin-catalog__status');
  const list = createElement('ul', 'admin-catalog__list');
  const empty = createElement('p', 'admin-catalog__empty');
  const editor = createElement('section', 'admin-catalog__editor');
  const editorHeading = createElement('h4', 'admin-catalog__editor-heading');
  const editorStatus = createElement('p', 'admin-catalog__status');
  const form = createElement('form', 'admin-catalog__form');
  const fields = createElement('div', 'admin-catalog__fields');
  const preview = createElement('section', 'admin-catalog__preview');
  const previewHeading = createElement('h5', 'admin-catalog__preview-heading');
  const previewText = createElement('p', 'admin-catalog__preview-text');
  const editorActions = createElement('div', 'admin-catalog__actions');
  const saveButton = createElement('button', 'admin-catalog__primary');
  const cancelButton = createElement('button', 'admin-catalog__button');
  const confirmation = createElement('section', 'admin-catalog__confirmation');
  const confirmationHeading = createElement('h4', 'admin-catalog__editor-heading');
  const confirmationText = createElement('p', 'admin-catalog__confirmation-text');
  const confirmationActions = createElement('div', 'admin-catalog__actions');
  const confirmButton = createElement('button', 'admin-catalog__danger');
  const dismissButton = createElement('button', 'admin-catalog__button');
  const controls = new Map<string, FieldControl>();
  const resourceButtons = new Map<AdminCatalogResourceKind, HTMLButtonElement>();

  let state = catalogController.getState();
  let backendConnected = false;
  let original: AdminCatalogRecord | null = null;
  let restoreFocus: HTMLElement | null = null;
  let pendingConfirmation: {
    readonly action: 'archive' | 'delete';
    readonly record: AdminCatalogRecord;
  } | null = null;

  heading.textContent = 'Contenido administrativo';
  heading.id = 'admin-catalog-heading';
  section.setAttribute('aria-labelledby', heading.id);

  resourceGroup.setAttribute('role', 'group');
  resourceGroup.setAttribute('aria-label', 'Tipo de recurso administrativo');
  for (const [kind, label] of Object.entries(ADMIN_RESOURCE_LABELS) as [
    AdminCatalogResourceKind,
    string,
  ][]) {
    const button = createElement('button', 'admin-catalog__resource');
    button.type = 'button';
    button.textContent = label;
    button.dataset.resourceKind = kind;
    button.addEventListener('click', () => catalogController.selectResource(kind));
    resourceButtons.set(kind, button);
    resourceGroup.append(button);
  }

  searchLabel.htmlFor = 'admin-catalog-search';
  searchLabel.textContent = 'Buscar';
  search.id = 'admin-catalog-search';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = 'Nombre, ID o estado';

  sortLabel.htmlFor = 'admin-catalog-sort';
  sortLabel.textContent = 'Ordenar';
  sort.id = 'admin-catalog-sort';
  for (const [value, text] of [
    ['name:asc', 'Nombre A–Z'],
    ['name:desc', 'Nombre Z–A'],
    ['id:asc', 'ID A–Z'],
    ['status:asc', 'Estado'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    sort.append(option);
  }

  newButton.type = 'button';
  newButton.textContent = 'Crear';
  refreshButton.type = 'button';
  refreshButton.textContent = 'Recargar';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  empty.hidden = true;

  editor.hidden = true;
  editorHeading.id = 'admin-catalog-editor-heading';
  editor.setAttribute('aria-labelledby', editorHeading.id);
  editorStatus.setAttribute('role', 'alert');
  editorStatus.setAttribute('aria-live', 'assertive');
  editorStatus.tabIndex = -1;
  form.noValidate = true;
  form.append(fields);
  previewHeading.textContent = 'Previsualización';
  preview.append(previewHeading, previewText);
  form.append(preview);
  saveButton.type = 'submit';
  saveButton.textContent = 'Guardar';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancelar';
  editorActions.append(saveButton, cancelButton);
  form.append(editorActions);
  editor.append(editorHeading, editorStatus, form);

  confirmation.hidden = true;
  confirmation.setAttribute('role', 'alertdialog');
  confirmation.setAttribute('aria-modal', 'false');
  confirmationHeading.id = 'admin-catalog-confirm-heading';
  confirmation.setAttribute('aria-labelledby', confirmationHeading.id);
  confirmation.setAttribute('aria-describedby', 'admin-catalog-confirm-text');
  confirmationText.id = 'admin-catalog-confirm-text';
  confirmButton.type = 'button';
  dismissButton.type = 'button';
  dismissButton.textContent = 'Cancelar';
  confirmationActions.append(confirmButton, dismissButton);
  confirmation.append(confirmationHeading, confirmationText, confirmationActions);

  toolbar.append(searchLabel, search, sortLabel, sort, newButton, refreshButton);
  section.append(heading, resourceGroup, toolbar, status, empty, list, editor, confirmation);
  shell.insertBefore(section, shell.querySelector('.admin-auth__logout'));

  function closeEditor(): void {
    editor.hidden = true;
    original = null;
    controls.clear();
    fields.replaceChildren();
    editorStatus.textContent = '';
    restoreFocus?.focus();
    restoreFocus = null;
  }

  function renderFieldErrors(): boolean {
    const draft = parseDraft(state.resourceKind, controls);
    const validation = validateAdminCatalogDraft(draft, { original, existing: state.records });
    for (const [name, control] of controls) {
      const message = validation.fieldErrors[name] ?? '';
      control.error.textContent = message;
      control.input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    const displayName =
      draft.kind === 'entity-alias' || draft.kind === 'geographic-alias'
        ? draft.value.trim() || 'Sin nombre'
        : draft.kind === 'category' || draft.kind === 'tag' || draft.kind === 'geographic-name'
          ? draft.name.trim() || 'Sin nombre'
          : 'Sin nombre';
    const coordinates = draft.kind === 'geographic-name' ? ` · (${draft.x}, ${draft.y})` : '';
    previewText.textContent = `${displayName} · ${draft.id} · ${draft.publicationStatus}${coordinates}`;
    return validation.valid;
  }

  function renderEditor(record: AdminCatalogRecord | null, trigger: HTMLElement): void {
    original = record;
    restoreFocus = trigger;
    controls.clear();
    fields.replaceChildren();
    editorStatus.textContent = '';
    const draft = record ? recordToDraft(record) : emptyDraft(state.resourceKind);
    editorHeading.textContent = record
      ? `Editar ${getAdminRecordDisplayName(record)}`
      : 'Crear registro';

    addField(form, controls, {
      name: 'id',
      label: 'ID estable',
      value: draft.id,
      required: true,
      readOnly: Boolean(record),
    });
    if (fields.parentElement !== form) {
      fields.append(...Array.from(form.querySelectorAll(':scope > .admin-catalog__field')));
    }

    if (draft.kind === 'category' || draft.kind === 'geographic-name') {
      const input = addField(form, controls, {
        name: 'slug',
        label: 'Slug',
        value: draft.slug,
        required: true,
        readOnly: Boolean(record?.publishedAt),
      });
      fields.append(input.closest('.admin-catalog__field') as HTMLElement);
    }

    if (draft.kind === 'category' || draft.kind === 'tag' || draft.kind === 'geographic-name') {
      const input = addField(form, controls, {
        name: 'name',
        label: draft.kind === 'geographic-name' ? 'Nombre principal (inglés)' : 'Nombre',
        value: draft.name,
        required: true,
      });
      fields.append(input.closest('.admin-catalog__field') as HTMLElement);
    }

    if (draft.kind === 'category' || draft.kind === 'tag') {
      const input = addField(form, controls, {
        name: 'description',
        label: 'Descripción',
        value: draft.description,
        textarea: true,
      });
      fields.append(input.closest('.admin-catalog__field') as HTMLElement);
    }

    if (draft.kind === 'entity-alias') {
      const select = addSelect(form, controls, {
        name: 'entityId',
        label: 'Entidad propietaria',
        value: draft.entityId,
        required: true,
        disabled: Boolean(record?.publishedAt),
        choices: [
          { value: '', label: 'Selecciona una entidad' },
          ...state.entityReferences.map((reference) => ({
            value: reference.id,
            label: `${reference.name} · ${reference.entityType} · ${reference.publicationStatus}`,
          })),
        ],
      });
      fields.append(select.closest('.admin-catalog__field') as HTMLElement);
      const input = addField(form, controls, {
        name: 'value',
        label: 'Nombre alternativo (inglés)',
        value: draft.value,
        required: true,
      });
      fields.append(input.closest('.admin-catalog__field') as HTMLElement);
    }

    if (draft.kind === 'geographic-name') {
      for (const options of [
        { name: 'x', label: 'Coordenada X', value: String(draft.x), min: 0, max: 3600 },
        { name: 'y', label: 'Coordenada Y', value: String(draft.y), min: 0, max: 2329 },
        {
          name: 'recommendedZoom',
          label: 'Zoom recomendado (opcional)',
          value: draft.recommendedZoom === null ? '' : String(draft.recommendedZoom),
          min: -5,
          max: 10,
        },
      ] as const) {
        const input = addField(form, controls, {
          ...options,
          type: 'number',
          step: 'any',
          required: options.name !== 'recommendedZoom',
        });
        fields.append(input.closest('.admin-catalog__field') as HTMLElement);
      }
      const select = addSelect(form, controls, {
        name: 'entityId',
        label: 'Entidad de localización enlazada (opcional)',
        value: draft.entityId ?? '',
        disabled: Boolean(record?.publishedAt),
        choices: [
          { value: '', label: 'Sin entidad enlazada' },
          ...state.entityReferences
            .filter((reference) => reference.entityType === 'location')
            .map((reference) => ({
              value: reference.id,
              label: `${reference.name} · ${reference.publicationStatus}`,
            })),
        ],
      });
      fields.append(select.closest('.admin-catalog__field') as HTMLElement);
    }

    if (draft.kind === 'geographic-alias') {
      const select = addSelect(form, controls, {
        name: 'geographicNameId',
        label: 'Nombre geográfico principal',
        value: draft.geographicNameId,
        required: true,
        disabled: Boolean(record?.publishedAt),
        choices: [
          { value: '', label: 'Selecciona un nombre geográfico' },
          ...state.geographicNameReferences.map((reference) => ({
            value: reference.id,
            label: `${reference.name} · ${reference.publicationStatus}`,
          })),
        ],
      });
      fields.append(select.closest('.admin-catalog__field') as HTMLElement);
      const input = addField(form, controls, {
        name: 'value',
        label: 'Nombre alternativo (inglés)',
        value: draft.value,
        required: true,
      });
      fields.append(input.closest('.admin-catalog__field') as HTMLElement);
    }

    const language = addField(form, controls, {
      name: 'language',
      label: 'Idioma',
      value: 'English (en)',
      disabled: true,
    });
    if (
      draft.kind === 'entity-alias' ||
      draft.kind === 'geographic-name' ||
      draft.kind === 'geographic-alias'
    ) {
      fields.append(language.closest('.admin-catalog__field') as HTMLElement);
    } else {
      language.closest('.admin-catalog__field')?.remove();
      controls.delete('language');
    }

    const statusSelect = addSelect(form, controls, {
      name: 'publicationStatus',
      label: 'Estado editorial',
      value: draft.publicationStatus,
      choices: statusChoices(),
    });
    fields.append(statusSelect.closest('.admin-catalog__field') as HTMLElement);

    editor.hidden = false;
    list.hidden = true;
    empty.hidden = true;
    for (const control of controls.values()) {
      control.input.addEventListener('input', renderFieldErrors);
      control.input.addEventListener('change', renderFieldErrors);
    }
    renderFieldErrors();
    window.requestAnimationFrame(() => {
      const first = Array.from(controls.values()).find(
        (control) => !control.input.disabled && !control.input.readOnly,
      );
      first?.input.focus();
    });
  }

  function openConfirmation(
    action: 'archive' | 'delete',
    record: AdminCatalogRecord,
    trigger: HTMLElement,
  ): void {
    pendingConfirmation = { action, record };
    restoreFocus = trigger;
    confirmationHeading.textContent =
      action === 'archive' ? 'Confirmar archivado' : 'Confirmar eliminación física';
    confirmationText.textContent =
      action === 'archive'
        ? `Se archivará “${getAdminRecordDisplayName(record)}”. Si está en uso, PostgreSQL rechazará la operación.`
        : `Se eliminará físicamente “${getAdminRecordDisplayName(record)}”. Esta opción solo aparece para contenido nunca publicado; las referencias siguen protegidas por PostgreSQL.`;
    confirmButton.textContent = action === 'archive' ? 'Archivar' : 'Eliminar definitivamente';
    confirmation.hidden = false;
    list.hidden = true;
    window.requestAnimationFrame(() => confirmButton.focus());
  }

  function closeConfirmation(): void {
    pendingConfirmation = null;
    confirmation.hidden = true;
    list.hidden = false;
    restoreFocus?.focus();
    restoreFocus = null;
  }

  function renderList(): void {
    list.replaceChildren();
    list.hidden = !editor.hidden || !confirmation.hidden;
    empty.hidden = true;

    if (state.visibleRecords.length === 0 && state.phase === 'ready') {
      empty.textContent = state.query ? 'No hay coincidencias.' : 'No hay registros de este tipo.';
      empty.hidden = false;
      return;
    }

    for (const record of state.visibleRecords) {
      const item = createElement('li', 'admin-catalog__item');
      const content = createElement('div', 'admin-catalog__item-content');
      const title = createElement('strong', 'admin-catalog__item-title');
      const meta = createElement('span', 'admin-catalog__item-meta');
      const actions = createElement('div', 'admin-catalog__item-actions');
      const editButton = createElement('button', 'admin-catalog__button');
      const archiveButton = createElement('button', 'admin-catalog__button');

      title.textContent = getAdminRecordDisplayName(record);
      meta.textContent = `${record.id} · ${record.publicationStatus}`;
      content.append(title, meta);
      editButton.type = 'button';
      editButton.textContent = 'Editar';
      editButton.setAttribute('aria-label', `Editar ${getAdminRecordDisplayName(record)}`);
      editButton.addEventListener('click', () => renderEditor(record, editButton));
      archiveButton.type = 'button';
      archiveButton.textContent = 'Archivar';
      archiveButton.disabled = record.publicationStatus === 'archived';
      archiveButton.setAttribute('aria-label', `Archivar ${getAdminRecordDisplayName(record)}`);
      archiveButton.addEventListener('click', () =>
        openConfirmation('archive', record, archiveButton),
      );
      actions.append(editButton, archiveButton);

      if (resourceAllowsPhysicalDelete(record)) {
        const deleteButton = createElement('button', 'admin-catalog__danger-link');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Eliminar';
        deleteButton.setAttribute(
          'aria-label',
          `Eliminar definitivamente ${getAdminRecordDisplayName(record)}`,
        );
        deleteButton.addEventListener('click', () =>
          openConfirmation('delete', record, deleteButton),
        );
        actions.append(deleteButton);
      }

      item.append(content, actions);
      list.append(item);
    }
  }

  function render(nextState: AdminCatalogState): void {
    state = nextState;
    for (const [kind, button] of resourceButtons) {
      const active = kind === state.resourceKind;
      button.setAttribute('aria-pressed', String(active));
      button.disabled = state.phase === 'mutating';
    }
    search.value = state.query;
    const currentSort = `${state.sort}:${state.sortDirection}`;
    if (Array.from(sort.options).some((option) => option.value === currentSort)) {
      sort.value = currentSort;
    }
    const unavailable = !state.authorized || !state.backendConnected;
    search.disabled = unavailable || state.phase === 'loading' || state.phase === 'mutating';
    sort.disabled = search.disabled;
    newButton.disabled = unavailable || state.phase !== 'ready';
    refreshButton.disabled = unavailable || state.phase === 'loading' || state.phase === 'mutating';
    saveButton.disabled = state.phase === 'mutating';
    confirmButton.disabled = state.phase === 'mutating';

    if (!state.authorized) {
      status.textContent = 'El CRUD permanece cerrado hasta autorizar la sesión.';
    } else if (!state.backendConnected) {
      status.textContent =
        'El CRUD permanece bloqueado mientras el backend público no esté conectado.';
    } else if (state.phase === 'loading') {
      status.textContent = 'Cargando contenido administrativo…';
    } else if (state.phase === 'mutating') {
      status.textContent = 'Guardando el cambio…';
    } else if (state.issue) {
      status.textContent = state.issue.message;
      editorStatus.textContent = editor.hidden ? '' : state.issue.message;
    } else {
      status.textContent = `${state.visibleRecords.length} de ${state.records.length} registros.`;
      editorStatus.textContent = '';
    }
    renderList();
  }

  const handleSearch = (): void => catalogController.setQuery(search.value);
  const handleSort = (): void => {
    const [sortKey, direction] = sort.value.split(':') as [
      AdminCatalogSort,
      AdminCatalogSortDirection,
    ];
    catalogController.setSort(sortKey, direction);
  };
  const handleNew = (): void => renderEditor(null, newButton);
  const handleRefresh = (): void => void catalogController.reload();
  const handleCancel = (): void => closeEditor();
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!renderFieldErrors()) {
      const firstInvalid = Array.from(controls.values()).find(
        (control) => control.input.getAttribute('aria-invalid') === 'true',
      );
      editorStatus.textContent = 'Revisa los campos indicados antes de guardar.';
      firstInvalid?.input.focus();
      return;
    }
    const draft = parseDraft(state.resourceKind, controls);
    const request = original
      ? catalogController.update(original, draft)
      : catalogController.create(draft);
    void request.then((saved) => {
      if (saved) {
        closeEditor();
        status.textContent = 'Cambio guardado correctamente.';
      } else {
        window.requestAnimationFrame(() => {
          const issueField = catalogController.getState().issue?.field;
          const target = issueField ? controls.get(issueField)?.input : null;
          (target ?? editorStatus).focus?.();
        });
      }
    });
  };
  const handleConfirm = (): void => {
    const pending = pendingConfirmation;
    if (!pending) return;
    const request =
      pending.action === 'archive'
        ? catalogController.archive(pending.record)
        : catalogController.delete(pending.record);
    void request.then((saved) => {
      if (saved) {
        closeConfirmation();
      }
    });
  };
  const handleDismiss = (): void => closeConfirmation();
  const handlePublicDataStatus = (event: Event): void => {
    if (!isPublicDataStatusEvent(event)) return;
    const next = event.detail.backendState;
    if (next === 'connected' || next === 'degraded' || next === 'offline') {
      backendConnected = next === 'connected';
      catalogController.setAccess(
        authController.getState().phase === 'authorized',
        backendConnected,
      );
    }
  };

  search.addEventListener('input', handleSearch);
  sort.addEventListener('change', handleSort);
  newButton.addEventListener('click', handleNew);
  refreshButton.addEventListener('click', handleRefresh);
  form.addEventListener('submit', handleSubmit);
  cancelButton.addEventListener('click', handleCancel);
  confirmButton.addEventListener('click', handleConfirm);
  dismissButton.addEventListener('click', handleDismiss);
  window.addEventListener('atlas:public-data-status', handlePublicDataStatus);

  const unsubscribeCatalog = catalogController.subscribe(render);
  const unsubscribeAuth = authController.subscribe((authState) => {
    catalogController.setAccess(authState.phase === 'authorized', backendConnected);
    if (authState.phase !== 'authorized') {
      if (!editor.hidden) closeEditor();
      if (!confirmation.hidden) closeConfirmation();
    }
  });

  return {
    destroy(): void {
      unsubscribeCatalog();
      unsubscribeAuth();
      search.removeEventListener('input', handleSearch);
      sort.removeEventListener('change', handleSort);
      newButton.removeEventListener('click', handleNew);
      refreshButton.removeEventListener('click', handleRefresh);
      form.removeEventListener('submit', handleSubmit);
      cancelButton.removeEventListener('click', handleCancel);
      confirmButton.removeEventListener('click', handleConfirm);
      dismissButton.removeEventListener('click', handleDismiss);
      window.removeEventListener('atlas:public-data-status', handlePublicDataStatus);
      section.remove();
    },
  };
}
