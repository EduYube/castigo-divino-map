import type {
  AdminMapEntityController,
  AdminMapEntityState,
} from '../application/adminMapEntityController';
import type { AdminAuthController } from '../auth/adminAuthController';
import type { BackendState } from '../data-access/publicCatalog';
import {
  canPhysicallyDeleteMapEntity,
  createEmptyMapEntityDraft,
  detailToDraft,
  type AdminMapEntityDraft,
  type AdminMapEntityRecord,
  type MapEntityLifecycleStatus,
  type MapEntityPublicationStatus,
  type MapEntityType,
  type MapVisibility,
  type PlayerDisposition,
} from '../domain/adminMapEntities';
import { validateAdminMapEntityDraft } from '../domain/adminMapEntityValidation';
import {
  CHARACTER_PORTRAIT_ACCEPT,
  validateCharacterPortraitFile,
} from '../domain/characterPortrait';
import { isMapCoordinateWithinBounds } from '../domain/mapCoordinates';
import { createPointMapGeometry, type MapEntityGeometry } from '../domain/mapGeometry';
import { getEntityLifecycleLabel } from '../domain/entityLifecycle';
import { getPinDispositionVisual, getPinTypeVisual } from '../domain/pinVisualSystem';
import {
  mountAdminEntityEditorMap,
  type AdminEntityEditorMapController,
} from '../map/adminEntityEditorMap';
import '../styles/admin-map-entities.css';

export interface AdminMapEntitiesUiController {
  destroy(): void;
}

interface PublicDataStatusDetail {
  readonly backendState?: BackendState;
}

interface FieldControl {
  readonly input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  readonly error: HTMLParagraphElement;
}

type PendingConfirmation =
  | { readonly action: 'archive-record'; readonly record: AdminMapEntityRecord }
  | { readonly action: 'archive-editor' }
  | { readonly action: 'delete-editor' }
  | { readonly action: 'convert-to-point' };

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

function readNumber(input: HTMLInputElement): number {
  const value = input.value.trim();
  return value === '' ? Number.NaN : Number(value);
}

export function mountAdminMapEntities(
  root: ParentNode,
  controller: AdminMapEntityController,
  authController: AdminAuthController,
): AdminMapEntitiesUiController {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  if (!shell) throw new Error('Missing administrative shell for MAP-019.');

  const section = createElement('section', 'admin-map-entity');
  const heading = createElement('h3', 'admin-map-entity__heading');
  const intro = createElement('p', 'admin-map-entity__intro');
  const toolbar = createElement('div', 'admin-map-entity__toolbar');
  const searchLabel = createElement('label', 'admin-map-entity__label');
  const search = createElement('input', 'admin-map-entity__control');
  const createCharacterButton = createElement('button', 'admin-map-entity__primary');
  const createLocationButton = createElement('button', 'admin-map-entity__button');
  const createMissionButton = createElement('button', 'admin-map-entity__button');
  const createHazardButton = createElement('button', 'admin-map-entity__button');
  const refreshButton = createElement('button', 'admin-map-entity__button');
  const status = createElement('p', 'admin-map-entity__status');
  const empty = createElement('p', 'admin-map-entity__empty');
  const list = createElement('ul', 'admin-map-entity__list');
  const editor = createElement('section', 'admin-map-entity__editor');
  const editorHeading = createElement('h4', 'admin-map-entity__editor-heading');
  const editorStatus = createElement('p', 'admin-map-entity__status');
  const form = createElement('form', 'admin-map-entity__form');
  const fields = createElement('div', 'admin-map-entity__fields');
  const mapRegion = createElement('section', 'admin-map-entity__map-region');
  const mapHeading = createElement('h5', 'admin-map-entity__subheading');
  const mapHelp = createElement('p', 'admin-map-entity__help');
  const mapStatus = createElement('p', 'admin-map-entity__map-status');
  const mapCanvas = createElement('div', 'admin-map-entity__map');
  const preview = createElement('section', 'admin-map-entity__preview');
  const previewHeading = createElement('h5', 'admin-map-entity__subheading');
  const previewMarker = createElement('span', 'admin-map-entity__preview-marker');
  const previewName = createElement('strong', 'admin-map-entity__preview-name');
  const previewMeta = createElement('p', 'admin-map-entity__preview-meta');
  const previewDescription = createElement('p', 'admin-map-entity__preview-description');
  const actions = createElement('div', 'admin-map-entity__actions');
  const saveDraftButton = createElement('button', 'admin-map-entity__primary');
  const previewButton = createElement('button', 'admin-map-entity__button');
  const publishButton = createElement('button', 'admin-map-entity__button');
  const archiveButton = createElement('button', 'admin-map-entity__button');
  const deleteButton = createElement('button', 'admin-map-entity__danger');
  const cancelButton = createElement('button', 'admin-map-entity__button');
  const confirmation = createElement('section', 'admin-map-entity__confirmation');
  const confirmationHeading = createElement('h4', 'admin-map-entity__editor-heading');
  const confirmationText = createElement('p', 'admin-map-entity__help');
  const confirmationActions = createElement('div', 'admin-map-entity__actions');
  const confirmButton = createElement('button', 'admin-map-entity__danger');
  const dismissButton = createElement('button', 'admin-map-entity__button');

  let state = controller.getState();
  let backendConnected = false;
  let query = '';
  let renderedEditorKey: string | null = null;
  let requestedEntityType: MapEntityType = 'character';
  let mapController: AdminEntityEditorMapController | null = null;
  let draftGeometry: MapEntityGeometry | null = null;
  let geometryKindSelect: HTMLSelectElement | null = null;
  let controls = new Map<string, FieldControl>();
  let tagCheckboxes: HTMLInputElement[] = [];
  let dispositionSelects: HTMLSelectElement[] = [];
  let preservedDispositions: AdminMapEntityDraft['dispositions'] = [];
  let tagError: HTMLParagraphElement | null = null;
  let dispositionError: HTMLParagraphElement | null = null;
  let restoreFocus: HTMLElement | null = null;
  let pendingConfirmation: PendingConfirmation | null = null;
  let pendingPortraitFile: File | null = null;
  let removePortraitOnSave = false;
  let portraitSelectionInvalid = false;
  let portraitSelectionPending = false;
  let portraitPreviewUrl: string | null = null;
  let portraitError: HTMLParagraphElement | null = null;

  heading.textContent = 'Entidades del mapa';
  heading.id = 'admin-map-entity-heading';
  section.setAttribute('aria-labelledby', heading.id);
  intro.textContent =
    'Edita la entidad completa, sus relaciones y su geometría. La previsualización no publica contenido.';

  searchLabel.htmlFor = 'admin-map-entity-search';
  searchLabel.textContent = 'Buscar entidades';
  search.id = 'admin-map-entity-search';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = 'Nombre, ID, tipo o estado';
  createCharacterButton.type = 'button';
  createCharacterButton.textContent = 'Crear personaje';
  createLocationButton.type = 'button';
  createLocationButton.textContent = 'Crear emplazamiento';
  createMissionButton.type = 'button';
  createMissionButton.textContent = 'Crear misión';
  createHazardButton.type = 'button';
  createHazardButton.textContent = 'Crear peligro';
  refreshButton.type = 'button';
  refreshButton.textContent = 'Recargar entidades';
  toolbar.append(
    searchLabel,
    search,
    createCharacterButton,
    createLocationButton,
    createMissionButton,
    createHazardButton,
    refreshButton,
  );

  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  empty.hidden = true;

  editor.hidden = true;
  editorHeading.id = 'admin-map-entity-editor-heading';
  editor.setAttribute('aria-labelledby', editorHeading.id);
  editorStatus.setAttribute('role', 'alert');
  editorStatus.setAttribute('aria-live', 'assertive');
  editorStatus.tabIndex = -1;
  form.noValidate = true;
  form.append(fields);

  mapHeading.textContent = 'Geometría sobre el mapa';
  mapHeading.id = 'admin-map-entity-map-heading';
  mapRegion.setAttribute('aria-labelledby', mapHeading.id);
  mapHelp.textContent =
    'Pulsa el mapa para seleccionar un punto o arrastra el marcador. Para teclado o tecnologías asistivas, edita directamente X e Y en el formulario.';
  mapStatus.setAttribute('role', 'status');
  mapStatus.setAttribute('aria-live', 'polite');
  mapCanvas.setAttribute('aria-label', 'Editor visual de geometría de Faerûn');
  mapCanvas.setAttribute('data-testid', 'admin-coordinate-map');
  mapRegion.append(mapHeading, mapHelp, mapStatus, mapCanvas);
  form.append(mapRegion);

  preview.hidden = true;
  previewHeading.textContent = 'Previsualización no publicada';
  previewMarker.setAttribute('aria-hidden', 'true');
  preview.append(previewHeading, previewMarker, previewName, previewMeta, previewDescription);
  form.append(preview);

  saveDraftButton.type = 'button';
  saveDraftButton.textContent = 'Guardar borrador';
  previewButton.type = 'button';
  previewButton.textContent = 'Previsualizar';
  publishButton.type = 'button';
  publishButton.textContent = 'Publicar';
  archiveButton.type = 'button';
  archiveButton.textContent = 'Archivar';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Eliminar definitivamente';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cerrar editor';
  actions.append(
    saveDraftButton,
    previewButton,
    publishButton,
    archiveButton,
    deleteButton,
    cancelButton,
  );
  form.append(actions);
  editor.append(editorHeading, editorStatus, form);

  confirmation.hidden = true;
  confirmation.setAttribute('role', 'alertdialog');
  confirmation.setAttribute('aria-modal', 'false');
  confirmationHeading.id = 'admin-map-entity-confirm-heading';
  confirmation.setAttribute('aria-labelledby', confirmationHeading.id);
  confirmation.setAttribute('aria-describedby', 'admin-map-entity-confirm-text');
  confirmationText.id = 'admin-map-entity-confirm-text';
  confirmButton.type = 'button';
  dismissButton.type = 'button';
  dismissButton.textContent = 'Cancelar';
  confirmationActions.append(confirmButton, dismissButton);
  confirmation.append(confirmationHeading, confirmationText, confirmationActions);

  section.append(heading, intro, toolbar, status, empty, list, editor, confirmation);
  shell.insertBefore(section, shell.querySelector('.admin-auth__logout'));

  function addField(options: {
    readonly name: string;
    readonly label: string;
    readonly value: string;
    readonly textarea?: boolean;
    readonly type?: HTMLInputElement['type'];
    readonly required?: boolean;
    readonly readOnly?: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly step?: string;
  }): HTMLInputElement | HTMLTextAreaElement {
    const wrapper = createElement('div', 'admin-map-entity__field');
    const label = createElement('label', 'admin-map-entity__label');
    const input = options.textarea
      ? createElement('textarea', 'admin-map-entity__control')
      : createElement('input', 'admin-map-entity__control');
    const error = createElement('p', 'admin-map-entity__field-error');
    const id = `admin-map-entity-field-${options.name}`;
    const errorId = `${id}-error`;
    label.htmlFor = id;
    label.textContent = options.label;
    input.id = id;
    input.name = options.name;
    input.value = options.value;
    input.required = options.required ?? false;
    input.readOnly = options.readOnly ?? false;
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
    fields.append(wrapper);
    controls.set(options.name, { input, error });
    return input;
  }

  function addSelect(options: {
    readonly name: string;
    readonly label: string;
    readonly value: string;
    readonly choices: readonly {
      readonly value: string;
      readonly label: string;
      readonly disabled?: boolean;
    }[];
    readonly disabled?: boolean;
  }): HTMLSelectElement {
    const wrapper = createElement('div', 'admin-map-entity__field');
    const label = createElement('label', 'admin-map-entity__label');
    const select = createElement('select', 'admin-map-entity__control');
    const error = createElement('p', 'admin-map-entity__field-error');
    const id = `admin-map-entity-field-${options.name}`;
    const errorId = `${id}-error`;
    label.htmlFor = id;
    label.textContent = options.label;
    select.id = id;
    select.name = options.name;
    select.disabled = options.disabled ?? false;
    select.setAttribute('aria-describedby', errorId);
    error.id = errorId;
    error.setAttribute('aria-live', 'polite');
    for (const choice of options.choices) {
      const option = document.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      option.disabled = choice.disabled ?? false;
      option.selected = choice.value === options.value;
      select.append(option);
    }
    wrapper.append(label, select, error);
    fields.append(wrapper);
    controls.set(options.name, { input: select, error });
    return select;
  }

  function readDraft(publicationStatus: MapEntityPublicationStatus): AdminMapEntityDraft {
    const input = (name: string): string => controls.get(name)?.input.value ?? '';
    const xInput = controls.get('x')?.input;
    const yInput = controls.get('y')?.input;
    const x = xInput instanceof HTMLInputElement ? readNumber(xInput) : Number.NaN;
    const y = yInput instanceof HTMLInputElement ? readNumber(yInput) : Number.NaN;
    const coordinate = { x, y };
    const pointFallback = isMapCoordinateWithinBounds(coordinate)
      ? createPointMapGeometry(coordinate)
      : undefined;
    return {
      id: input('id'),
      slug: input('slug'),
      entityType: input('entityType') as MapEntityType,
      lifecycleStatus: (input('lifecycleStatus') || null) as MapEntityLifecycleStatus | null,
      visibility: input('visibility') as MapVisibility,
      portraitPath: state.editorDetail?.record.portraitPath ?? null,
      geometry: draftGeometry ?? pointFallback,
      name: input('name'),
      summary: input('summary'),
      description: input('description'),
      x,
      y,
      categoryId: input('categoryId'),
      tagIds: tagCheckboxes
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value),
      dispositions: [
        ...dispositionSelects.map((select) => ({
          playerId: select.dataset.playerId ?? '',
          disposition: select.value as PlayerDisposition,
        })),
        ...preservedDispositions,
      ],
      publicationStatus,
    };
  }

  function currentTargetStatus(): MapEntityPublicationStatus {
    return state.editorDetail?.record.publicationStatus ?? 'draft';
  }

  function showFieldErrors(draft: AdminMapEntityDraft): boolean {
    const validation = validateAdminMapEntityDraft(draft, state.references, state.editorDetail);
    for (const [name, control] of controls) {
      const message = validation.fieldErrors[name] ?? '';
      control.error.textContent = message;
      control.input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    const coordinateMessage = validation.fieldErrors.coordinates ?? '';
    for (const name of ['x', 'y']) {
      const control = controls.get(name);
      if (control) {
        control.input.setAttribute('aria-invalid', coordinateMessage ? 'true' : 'false');
        if (!control.error.textContent) control.error.textContent = coordinateMessage;
      }
    }
    const geometryMessage = validation.fieldErrors.geometry ?? '';
    const geometryControl = controls.get('geometryKind');
    if (geometryControl) {
      geometryControl.error.textContent = geometryMessage;
      geometryControl.input.setAttribute('aria-invalid', geometryMessage ? 'true' : 'false');
    }
    mapCanvas.setAttribute('aria-invalid', geometryMessage ? 'true' : 'false');
    if (tagError) tagError.textContent = validation.fieldErrors.tagIds ?? '';
    if (dispositionError) {
      const message = validation.fieldErrors.dispositions ?? '';
      dispositionError.textContent = message;
      dispositionSelects.forEach((select) =>
        select.setAttribute('aria-invalid', message ? 'true' : 'false'),
      );
    }
    return validation.valid;
  }

  function renderPreview(draft: AdminMapEntityDraft): void {
    const category = state.references.categories.find(({ id }) => id === draft.categoryId);
    const tagNames = draft.tagIds
      .map((tagId) => state.references.tags.find(({ id }) => id === tagId)?.name ?? tagId)
      .join(', ');
    const dispositions = draft.dispositions
      .filter(({ playerId }) =>
        state.references.players.some(
          ({ id, publicationStatus }) => id === playerId && publicationStatus !== 'archived',
        ),
      )
      .map(({ playerId, disposition: value }) => {
        const player = state.references.players.find(({ id }) => id === playerId);
        return `${player?.displayName ?? playerId}: ${getPinDispositionVisual(value).label}`;
      })
      .join(' · ');
    const polygon = draft.geometry?.kind === 'polygon' ? draft.geometry : null;
    const geometryLabel = polygon ? `Área/Región · ${polygon.vertices.length} vértices` : 'Punto';
    const typeVisual = getPinTypeVisual(draft.entityType);
    const lifecycleLabel = getEntityLifecycleLabel(draft.entityType, draft.lifecycleStatus ?? null);
    const isFunctionalPin = draft.entityType === 'mission' || draft.entityType === 'hazard';
    const previewTypeLabel = isFunctionalPin
      ? `${typeVisual.label}${lifecycleLabel ? ` · ${lifecycleLabel}` : ''}`
      : draft.entityType;
    previewMarker.textContent = polygon
      ? '◇'
      : draft.visibility === 'pin'
        ? isFunctionalPin
          ? typeVisual.symbol
          : '◆'
        : '';
    previewMarker.hidden = draft.visibility !== 'pin';
    previewName.textContent = draft.name.trim() || 'Sin nombre';
    previewMeta.textContent = `${previewTypeLabel} · ${geometryLabel} · ${category?.name ?? 'Sin categoría'} · X ${draft.x}, Y ${draft.y}${tagNames ? ` · ${tagNames}` : ''}${dispositions ? ` · ${dispositions}` : ''}`;
    previewDescription.textContent =
      draft.summary.trim() || draft.description.trim() || 'Sin resumen.';
    preview.hidden = false;
  }

  function synchronizeCoordinateInputs(coordinate: {
    readonly x: number;
    readonly y: number;
  }): void {
    const xControl = controls.get('x')?.input;
    const yControl = controls.get('y')?.input;
    if (!(xControl instanceof HTMLInputElement) || !(yControl instanceof HTMLInputElement)) return;
    xControl.value = String(Number(coordinate.x.toFixed(2)));
    yControl.value = String(Number(coordinate.y.toFixed(2)));
  }

  function synchronizeGeometryUi(): void {
    const polygon = draftGeometry?.kind === 'polygon';
    const x = controls.get('x')?.input;
    const y = controls.get('y')?.input;
    if (x instanceof HTMLInputElement) x.readOnly = polygon;
    if (y instanceof HTMLInputElement) y.readOnly = polygon;
    if (geometryKindSelect) geometryKindSelect.value = polygon ? 'polygon' : 'point';
    mapCanvas.dataset.geometryKind = polygon ? 'polygon' : 'point';
    mapHelp.textContent = polygon
      ? 'Área/Región: pulsa el mapa para añadir un vértice, selecciona y arrastra un vértice para moverlo, o usa las flechas del teclado. El botón de borrar permite eliminar el vértice seleccionado también en touch. X e Y son el punto representativo derivado y no se editan manualmente.'
      : 'Punto: pulsa el mapa para seleccionar la posición o arrastra el marcador. Para teclado o tecnologías asistivas, también puedes editar directamente X e Y.';
  }

  function synchronizeMapFromInputs(): void {
    if (draftGeometry?.kind === 'polygon') return;
    const x = controls.get('x')?.input;
    const y = controls.get('y')?.input;
    if (!(x instanceof HTMLInputElement) || !(y instanceof HTMLInputElement)) return;
    const coordinate = { x: readNumber(x), y: readNumber(y) };
    if (!isMapCoordinateWithinBounds(coordinate)) return;
    draftGeometry = createPointMapGeometry(coordinate);
    mapController?.setCoordinate(coordinate);
  }

  function clearPortraitPreviewUrl(): void {
    if (portraitPreviewUrl) URL.revokeObjectURL(portraitPreviewUrl);
    portraitPreviewUrl = null;
  }

  function renderEditorForm(): void {
    clearPortraitPreviewUrl();
    pendingPortraitFile = null;
    removePortraitOnSave = false;
    portraitSelectionInvalid = false;
    portraitSelectionPending = false;
    portraitError = null;
    mapController?.destroy();
    mapController = null;
    draftGeometry = null;
    geometryKindSelect = null;
    controls = new Map();
    tagCheckboxes = [];
    dispositionSelects = [];
    preservedDispositions = [];
    tagError = null;
    dispositionError = null;
    fields.replaceChildren();
    preview.hidden = true;
    editorStatus.textContent = '';

    const detail = state.editorDetail;
    const draft = detail
      ? detailToDraft(detail)
      : createEmptyMapEntityDraft(state.references, requestedEntityType);
    draftGeometry =
      draft.geometry ?? (isMapCoordinateWithinBounds(draft) ? createPointMapGeometry(draft) : null);
    const existing = Boolean(detail);
    const activePlayers = state.references.players.filter(
      ({ publicationStatus }) => publicationStatus !== 'archived',
    );
    const activePlayerIds = new Set(activePlayers.map(({ id }) => id));
    preservedDispositions = draft.dispositions.filter(
      ({ playerId }) => !activePlayerIds.has(playerId),
    );
    const createLabel =
      draft.entityType === 'mission' || draft.entityType === 'hazard'
        ? getPinTypeVisual(draft.entityType).label.toLocaleLowerCase('es')
        : draft.entityType;
    editorHeading.textContent = existing ? `Editar ${draft.name}` : `Crear ${createLabel}`;

    addField({
      name: 'id',
      label: 'ID estable',
      value: draft.id,
      required: true,
      readOnly: existing,
    });
    addField({
      name: 'slug',
      label: 'Slug',
      value: draft.slug,
      required: true,
      readOnly: Boolean(detail?.record.publishedAt),
    });
    addSelect({
      name: 'entityType',
      label: 'Tipo',
      value: draft.entityType,
      disabled: existing,
      choices: [
        { value: 'character', label: 'Personaje' },
        { value: 'location', label: 'Emplazamiento' },
        { value: 'mission', label: 'Misión' },
        { value: 'hazard', label: 'Peligro' },
      ],
    });
    addField({
      name: 'name',
      label: 'Nombre principal (inglés)',
      value: draft.name,
      required: true,
    });
    if (draft.entityType === 'mission' || draft.entityType === 'hazard') {
      addSelect({
        name: 'lifecycleStatus',
        label: 'Estado funcional',
        value: draft.lifecycleStatus ?? 'active',
        choices:
          draft.entityType === 'mission'
            ? [
                { value: 'active', label: 'Activa' },
                { value: 'completed', label: 'Completada' },
                { value: 'failed', label: 'Fallida' },
              ]
            : [
                { value: 'active', label: 'Activo' },
                { value: 'resolved', label: 'Resuelto' },
              ],
      });
    }
    addField({ name: 'summary', label: 'Resumen', value: draft.summary, textarea: true });
    addField({
      name: 'description',
      label: 'Descripción',
      value: draft.description,
      textarea: true,
    });

    if (draft.entityType === 'character') {
      const portraitField = createElement('fieldset', 'admin-map-entity__fieldset');
      const portraitLegend = createElement('legend', 'admin-map-entity__legend');
      const portraitHelp = createElement('p', 'admin-map-entity__help');
      const portraitInput = createElement('input', 'admin-map-entity__control');
      const portraitState = createElement('p', 'admin-map-entity__help');
      const portraitPreview = createElement('img', 'admin-map-entity__portrait-preview');
      const removeButton = createElement('button', 'admin-map-entity__button');
      portraitLegend.textContent = 'Retrato opcional';
      portraitHelp.textContent =
        'JPEG, PNG o WebP, máximo 4 MiB. El retrato se guarda junto con el resto de cambios al pulsar Guardar/Publicar.';
      portraitInput.type = 'file';
      portraitInput.accept = CHARACTER_PORTRAIT_ACCEPT;
      portraitInput.id = 'admin-map-entity-portrait';
      portraitInput.setAttribute('data-testid', 'admin-character-portrait-input');
      portraitPreview.alt = 'Previsualización del retrato seleccionado';
      portraitPreview.hidden = true;
      portraitState.textContent = draft.portraitPath
        ? 'Hay un retrato guardado para este personaje.'
        : 'Este personaje no tiene retrato.';
      removeButton.type = 'button';
      removeButton.textContent = 'Quitar retrato al guardar';
      removeButton.disabled = !draft.portraitPath;
      removeButton.setAttribute('data-testid', 'admin-character-portrait-remove');
      portraitError = createElement('p', 'admin-map-entity__field-error');
      portraitError.setAttribute('aria-live', 'polite');

      portraitInput.addEventListener('change', () => {
        const selected = portraitInput.files?.[0] ?? null;
        clearPortraitPreviewUrl();
        pendingPortraitFile = null;
        removePortraitOnSave = false;
        portraitSelectionInvalid = false;
        portraitSelectionPending = Boolean(selected);
        if (portraitError) portraitError.textContent = '';
        portraitPreview.hidden = true;
        removeButton.disabled = !draft.portraitPath;
        if (!selected) {
          portraitState.textContent = draft.portraitPath
            ? 'Hay un retrato guardado para este personaje.'
            : 'Este personaje no tiene retrato.';
          return;
        }
        void validateCharacterPortraitFile(selected)
          .then(() => {
            if (portraitInput.files?.[0] !== selected) return;
            portraitSelectionPending = false;
            pendingPortraitFile = selected;
            removePortraitOnSave = false;
            portraitPreviewUrl = URL.createObjectURL(selected);
            portraitPreview.src = portraitPreviewUrl;
            portraitPreview.hidden = false;
            portraitState.textContent = draft.portraitPath
              ? 'El retrato actual se sustituirá al guardar.'
              : 'El retrato se añadirá al guardar.';
            removeButton.disabled = false;
          })
          .catch((error: unknown) => {
            if (portraitInput.files?.[0] !== selected) return;
            portraitSelectionPending = false;
            portraitSelectionInvalid = true;
            if (portraitError)
              portraitError.textContent =
                error instanceof Error ? error.message : 'El retrato seleccionado no es válido.';
          });
      });

      removeButton.addEventListener('click', () => {
        clearPortraitPreviewUrl();
        portraitInput.value = '';
        pendingPortraitFile = null;
        portraitSelectionInvalid = false;
        portraitSelectionPending = false;
        removePortraitOnSave = true;
        portraitPreview.hidden = true;
        portraitState.textContent = 'El retrato se quitará al guardar.';
        if (portraitError) portraitError.textContent = '';
      });

      portraitField.append(
        portraitLegend,
        portraitHelp,
        portraitInput,
        portraitState,
        portraitPreview,
        removeButton,
        portraitError,
      );
      fields.append(portraitField);
    }

    addSelect({
      name: 'categoryId',
      label: 'Categoría',
      value: draft.categoryId,
      choices: [
        { value: '', label: 'Selecciona una categoría' },
        ...state.references.categories.map((category) => ({
          value: category.id,
          label: `${category.name} · ${category.publicationStatus}`,
          disabled: category.publicationStatus === 'archived',
        })),
      ],
    });
    addSelect({
      name: 'visibility',
      label: 'Visibilidad cartográfica',
      value: draft.visibility,
      choices: [
        { value: 'pin', label: 'Visible en el mapa' },
        { value: 'search_only', label: 'Solo búsqueda' },
      ],
    });
    if (draft.entityType === 'location') {
      geometryKindSelect = addSelect({
        name: 'geometryKind',
        label: 'Representación del emplazamiento',
        value: draftGeometry?.kind ?? 'point',
        disabled: true,
        choices: [
          { value: 'point', label: 'Punto' },
          { value: 'polygon', label: 'Área/Región' },
        ],
      });
      geometryKindSelect.setAttribute('data-testid', 'admin-geometry-kind');
    }

    const polygon = draftGeometry?.kind === 'polygon';
    const x = addField({
      name: 'x',
      label: polygon ? 'Coordenada X representativa' : 'Coordenada X',
      value: Number.isFinite(draft.x) ? String(draft.x) : '',
      type: 'number',
      required: true,
      readOnly: polygon,
      min: 0,
      max: 3600,
      step: 'any',
    });
    const y = addField({
      name: 'y',
      label: polygon ? 'Coordenada Y representativa' : 'Coordenada Y',
      value: Number.isFinite(draft.y) ? String(draft.y) : '',
      type: 'number',
      required: true,
      readOnly: polygon,
      min: 0,
      max: 2329,
      step: 'any',
    });

    const tagFieldset = createElement('fieldset', 'admin-map-entity__fieldset');
    const tagLegend = createElement('legend', 'admin-map-entity__legend');
    tagLegend.textContent = 'Etiquetas';
    tagError = createElement('p', 'admin-map-entity__field-error');
    tagError.setAttribute('aria-live', 'polite');
    for (const tag of state.references.tags) {
      const row = createElement('label', 'admin-map-entity__check');
      const checkbox = document.createElement('input');
      const text = document.createElement('span');
      checkbox.type = 'checkbox';
      checkbox.value = tag.id;
      checkbox.checked = draft.tagIds.includes(tag.id);
      checkbox.disabled = tag.publicationStatus === 'archived';
      text.textContent = `${tag.name} · ${tag.publicationStatus}`;
      row.append(checkbox, text);
      tagFieldset.append(row);
      tagCheckboxes.push(checkbox);
    }
    tagFieldset.prepend(tagLegend);
    tagFieldset.append(tagError);
    fields.append(tagFieldset);

    const dispositionFieldset = createElement(
      'fieldset',
      'admin-map-entity__fieldset admin-map-entity__dispositions',
    );
    const dispositionLegend = createElement('legend', 'admin-map-entity__legend');
    const dispositionHelp = createElement('p', 'admin-map-entity__help');
    const dispositionHelpId = 'admin-map-entity-dispositions-help';
    const dispositionErrorId = 'admin-map-entity-dispositions-error';
    dispositionLegend.textContent = 'Relación con los personajes';
    dispositionHelp.id = dispositionHelpId;
    dispositionHelp.textContent =
      'Define cómo se relaciona esta entidad con cada personaje jugador activo de la campaña. Las relaciones históricas de jugadores archivados se conservan sin mostrarse aquí.';
    dispositionFieldset.setAttribute(
      'aria-describedby',
      `${dispositionHelpId} ${dispositionErrorId}`,
    );
    dispositionFieldset.append(dispositionLegend, dispositionHelp);
    dispositionError = createElement('p', 'admin-map-entity__field-error');
    dispositionError.id = dispositionErrorId;
    dispositionError.setAttribute('aria-live', 'polite');

    if (activePlayers.length === 0) {
      const noPlayers = createElement('p', 'admin-map-entity__help');
      noPlayers.textContent = 'No hay personajes jugadores configurados.';
      dispositionFieldset.append(noPlayers);
    }

    for (const player of activePlayers) {
      const wrapper = createElement('div', 'admin-map-entity__field admin-map-entity__disposition');
      const label = createElement('label', 'admin-map-entity__label');
      const select = createElement('select', 'admin-map-entity__control');
      const selected = draft.dispositions.find(
        ({ playerId }) => playerId === player.id,
      )?.disposition;
      const id = `admin-map-entity-disposition-${player.id}`;
      label.htmlFor = id;
      label.textContent = player.displayName;
      select.id = id;
      select.dataset.playerId = player.id;
      select.setAttribute('data-testid', `admin-player-disposition-${player.id}`);
      select.setAttribute('aria-describedby', `${dispositionHelpId} ${dispositionErrorId}`);

      if (!selected) {
        const missing = document.createElement('option');
        missing.value = '';
        missing.textContent = 'Relación sin configurar';
        missing.selected = true;
        missing.disabled = true;
        select.append(missing);
      }

      for (const value of ['ally', 'neutral', 'enemy'] as const) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = getPinDispositionVisual(value).label;
        option.selected = value === selected;
        select.append(option);
      }

      const updateAccessibleName = (): void => {
        const disposition = select.value as PlayerDisposition;
        const labelText = select.value
          ? getPinDispositionVisual(disposition).label
          : 'Relación sin configurar';
        select.setAttribute('aria-label', `${player.displayName}: ${labelText}`);
      };
      updateAccessibleName();
      select.addEventListener('change', updateAccessibleName);
      wrapper.append(label, select);
      dispositionFieldset.append(wrapper);
      dispositionSelects.push(select);
    }
    dispositionFieldset.append(dispositionError);
    fields.append(dispositionFieldset);

    const allInputs = [
      ...Array.from(controls.values()).map(({ input }) => input),
      ...tagCheckboxes,
      ...dispositionSelects,
    ];
    const refreshValidation = (): void => {
      const next = readDraft(currentTargetStatus());
      const valid = showFieldErrors(next);
      if (!preview.hidden && valid) renderPreview(next);
    };
    allInputs.forEach((input) => {
      input.addEventListener('input', refreshValidation);
      input.addEventListener('change', refreshValidation);
    });
    x.addEventListener('input', synchronizeMapFromInputs);
    y.addEventListener('input', synchronizeMapFromInputs);
    geometryKindSelect?.addEventListener('change', () => {
      if (!geometryKindSelect || !mapController) return;
      const requestedKind = geometryKindSelect.value as MapEntityGeometry['kind'];
      if (requestedKind === 'point' && draftGeometry?.kind === 'polygon') {
        geometryKindSelect.value = 'polygon';
        openConfirmation({ action: 'convert-to-point' }, geometryKindSelect);
        return;
      }
      mapController.setGeometryKind(requestedKind);
    });

    archiveButton.hidden = !existing || detail?.record.publicationStatus === 'archived';
    deleteButton.hidden = !detail || !canPhysicallyDeleteMapEntity(detail);
    publishButton.disabled = detail?.record.publicationStatus === 'archived';
    saveDraftButton.textContent =
      detail?.record.publicationStatus === 'archived' ? 'Volver a borrador' : 'Guardar borrador';

    editor.hidden = false;
    list.hidden = true;
    empty.hidden = true;
    synchronizeGeometryUi();
    window.requestAnimationFrame(() => {
      mapController = mountAdminEntityEditorMap(mapCanvas, {
        coordinate: isMapCoordinateWithinBounds(draft) ? draft : null,
        geometry: draftGeometry,
        entityType: draft.entityType,
        dispositions: draft.dispositions.map(({ playerId, disposition }) => ({
          playerId,
          playerName:
            state.references.players.find(({ id }) => id === playerId)?.displayName ?? playerId,
          disposition,
        })),
        onGeometryChange(geometry): void {
          draftGeometry = geometry;
          synchronizeGeometryUi();
          const next = readDraft(currentTargetStatus());
          const valid = showFieldErrors(next);
          if (!preview.hidden && valid) renderPreview(next);
        },
        onCoordinateChange(coordinate): void {
          synchronizeCoordinateInputs(coordinate);
          const next = readDraft(currentTargetStatus());
          const valid = showFieldErrors(next);
          if (!preview.hidden && valid) renderPreview(next);
        },
        onImageStateChange(next): void {
          mapStatus.textContent =
            next === 'loading'
              ? 'Cargando cartografía oficial…'
              : next === 'ready'
                ? 'Cartografía lista.'
                : 'La imagen oficial no está disponible; la geometría sigue siendo editable.';
        },
      });
      if (geometryKindSelect) geometryKindSelect.disabled = false;
      synchronizeGeometryUi();
      const first = Array.from(controls.values()).find(
        ({ input }) =>
          !input.disabled &&
          (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) ||
            !input.readOnly),
      );
      if (!editor.contains(document.activeElement)) {
        first?.input.focus();
      }
    });
    showFieldErrors(readDraft(currentTargetStatus()));
  }

  function closeEditorUi(): void {
    clearPortraitPreviewUrl();
    mapController?.destroy();
    mapController = null;
    draftGeometry = null;
    geometryKindSelect = null;
    preservedDispositions = [];
    renderedEditorKey = null;
    editor.hidden = true;
    preview.hidden = true;
    list.hidden = false;
    restoreFocus?.focus();
    restoreFocus = null;
  }

  function openConfirmation(next: PendingConfirmation, trigger: HTMLElement): void {
    pendingConfirmation = next;
    restoreFocus = trigger;
    if (next.action === 'convert-to-point') {
      confirmationHeading.textContent = 'Convertir la región en un punto';
      confirmationText.textContent =
        'Esta acción sustituirá el contorno y todos sus vértices por un único punto representativo. ID, slug, URL, nombre, etiquetas, relaciones, notas, audiencia, estado editorial y campaña no cambian. La conversión no se persiste hasta Guardar/Publicar.';
      confirmButton.textContent = 'Convertir a punto';
    } else {
      confirmationHeading.textContent =
        next.action === 'delete-editor' ? 'Confirmar eliminación física' : 'Confirmar archivado';
      confirmationText.textContent =
        next.action === 'delete-editor'
          ? 'Se eliminará definitivamente este borrador nunca publicado. PostgreSQL bloqueará la operación si apareció cualquier relación mientras confirmabas.'
          : 'Se archivará la entidad y dejará de formar parte de la proyección pública Beta 0.2. Puedes devolverla a borrador más adelante.';
      confirmButton.textContent =
        next.action === 'delete-editor' ? 'Eliminar definitivamente' : 'Archivar';
    }
    confirmation.hidden = false;
    editor.hidden = true;
    list.hidden = true;
    window.requestAnimationFrame(() => confirmButton.focus());
  }

  function closeConfirmation(): void {
    pendingConfirmation = null;
    confirmation.hidden = true;
    const hasEditor = renderedEditorKey !== null;
    editor.hidden = !hasEditor;
    list.hidden = hasEditor;
    restoreFocus?.focus();
    restoreFocus = null;
  }

  function filteredRecords(): readonly AdminMapEntityRecord[] {
    const normalized = query.trim().toLocaleLowerCase('en');
    if (!normalized) return state.records;
    return state.records.filter((record) =>
      `${record.name} ${record.id} ${record.entityType} ${record.publicationStatus}`
        .toLocaleLowerCase('en')
        .includes(normalized),
    );
  }

  function renderList(): void {
    list.replaceChildren();
    const records = filteredRecords();
    if (records.length === 0 && state.phase === 'ready' && renderedEditorKey === null) {
      empty.textContent = query ? 'No hay coincidencias.' : 'No hay entidades.';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const record of records) {
      const item = createElement('li', 'admin-map-entity__item');
      const content = createElement('div', 'admin-map-entity__item-content');
      const title = createElement('strong', 'admin-map-entity__item-title');
      const meta = createElement('span', 'admin-map-entity__item-meta');
      const itemActions = createElement('div', 'admin-map-entity__item-actions');
      const editButton = createElement('button', 'admin-map-entity__button');
      const itemArchiveButton = createElement('button', 'admin-map-entity__button');
      title.textContent = record.name;
      const geometryLabel = record.geometry?.kind === 'polygon' ? 'región' : 'punto';
      meta.textContent = `${record.id} · ${record.entityType} · ${geometryLabel} · ${record.publicationStatus} · (${record.x}, ${record.y})`;
      content.append(title, meta);
      editButton.type = 'button';
      editButton.textContent = 'Editar';
      editButton.setAttribute('aria-label', `Editar ${record.name}`);
      editButton.addEventListener('click', () => {
        restoreFocus = editButton;
        void controller.openEditor(record.id);
      });
      itemArchiveButton.type = 'button';
      itemArchiveButton.textContent = 'Archivar';
      itemArchiveButton.disabled = record.publicationStatus === 'archived';
      itemArchiveButton.setAttribute('aria-label', `Archivar ${record.name}`);
      itemArchiveButton.addEventListener('click', () =>
        openConfirmation({ action: 'archive-record', record }, itemArchiveButton),
      );
      itemActions.append(editButton, itemArchiveButton);
      item.append(content, itemActions);
      list.append(item);
    }
  }

  function render(nextState: AdminMapEntityState): void {
    state = nextState;
    const unavailable = !state.authorized || !state.backendConnected;
    const busy =
      state.phase === 'loading' || state.phase === 'loading-editor' || state.phase === 'mutating';
    search.disabled = unavailable || busy;
    createCharacterButton.disabled =
      unavailable || state.phase !== 'ready' || renderedEditorKey !== null;
    createLocationButton.disabled = createCharacterButton.disabled;
    createMissionButton.disabled = createCharacterButton.disabled;
    createHazardButton.disabled = createCharacterButton.disabled;
    refreshButton.disabled = unavailable || busy;
    saveDraftButton.disabled = busy;
    previewButton.disabled = busy;
    publishButton.disabled = busy || state.editorDetail?.record.publicationStatus === 'archived';
    archiveButton.disabled = busy;
    deleteButton.disabled = busy;
    confirmButton.disabled = busy;

    if (!state.authorized)
      status.textContent = 'La edición de entidades permanece cerrada hasta autorizar la sesión.';
    else if (!state.backendConnected)
      status.textContent =
        'La edición de entidades está bloqueada mientras el backend público no esté conectado.';
    else if (state.phase === 'loading') status.textContent = 'Cargando entidades y relaciones…';
    else if (state.phase === 'loading-editor') status.textContent = 'Cargando editor de entidad…';
    else if (state.phase === 'mutating')
      status.textContent = 'Guardando la entidad de forma atómica…';
    else if (state.issue) status.textContent = state.issue.message;
    else status.textContent = `${state.records.length} entidades administrativas.`;

    if (state.issue && renderedEditorKey !== null) {
      editorStatus.textContent = state.issue.message;
      editorStatus.focus();
    } else if (state.phase !== 'error') {
      editorStatus.textContent = '';
    }

    const desiredEditorKey = state.creating
      ? `new:${requestedEntityType}`
      : state.editorDetail
        ? `${state.editorDetail.record.id}:${state.editorDetail.record.updatedAt}`
        : null;
    if (desiredEditorKey !== renderedEditorKey) {
      renderedEditorKey = desiredEditorKey;
      if (desiredEditorKey === null) closeEditorUi();
      else renderEditorForm();
    }
    renderList();
    if (renderedEditorKey !== null && confirmation.hidden) {
      list.hidden = true;
      empty.hidden = true;
    }
  }

  async function saveWithStatus(publicationStatus: MapEntityPublicationStatus): Promise<void> {
    const draft = readDraft(publicationStatus);
    if (portraitSelectionPending) {
      editorStatus.textContent = 'Espera a que termine la validación local del retrato.';
      return;
    }
    if (portraitSelectionInvalid) {
      editorStatus.textContent = 'Corrige el retrato seleccionado antes de guardar.';
      return;
    }
    if (!showFieldErrors(draft)) {
      editorStatus.textContent =
        publicationStatus === 'published'
          ? 'No se ha publicado. Corrige los campos indicados antes de volver a intentarlo.'
          : 'Revisa los campos indicados antes de guardar.';
      const invalid = Array.from(controls.values()).find(
        ({ input }) => input.getAttribute('aria-invalid') === 'true',
      );
      invalid?.input.focus();
      return;
    }
    const saved = await controller.save(
      draft,
      pendingPortraitFile
        ? { kind: 'replace', file: pendingPortraitFile }
        : removePortraitOnSave
          ? { kind: 'remove' }
          : { kind: 'keep' },
    );
    if (saved) {
      editorStatus.textContent =
        publicationStatus === 'published'
          ? 'Entidad publicada correctamente.'
          : publicationStatus === 'archived'
            ? 'Entidad archivada correctamente.'
            : 'Borrador guardado correctamente.';
    }
  }

  const handleSearch = (): void => {
    query = search.value;
    renderList();
  };
  const handleCreateCharacter = (): void => {
    requestedEntityType = 'character';
    restoreFocus = createCharacterButton;
    controller.openCreate();
  };
  const handleCreateLocation = (): void => {
    requestedEntityType = 'location';
    restoreFocus = createLocationButton;
    controller.openCreate();
  };
  const handleCreateMission = (): void => {
    requestedEntityType = 'mission';
    restoreFocus = createMissionButton;
    controller.openCreate();
  };
  const handleCreateHazard = (): void => {
    requestedEntityType = 'hazard';
    restoreFocus = createHazardButton;
    controller.openCreate();
  };
  const handleRefresh = (): void => void controller.reload();
  const handleSaveDraft = (): void => void saveWithStatus('draft');
  const handlePreview = (): void => {
    const draft = readDraft(currentTargetStatus());
    if (!showFieldErrors(draft)) {
      editorStatus.textContent = 'Corrige los campos antes de previsualizar.';
      return;
    }
    renderPreview(draft);
    preview.scrollIntoView({ block: 'nearest' });
  };
  const handlePublish = (): void => void saveWithStatus('published');
  const handleArchiveEditor = (): void =>
    openConfirmation({ action: 'archive-editor' }, archiveButton);
  const handleDelete = (): void => openConfirmation({ action: 'delete-editor' }, deleteButton);
  const handleCancel = (): void => controller.closeEditor();
  const handleConfirm = (): void => {
    const pending = pendingConfirmation;
    if (!pending) return;
    if (pending.action === 'convert-to-point') {
      closeConfirmation();
      mapController?.setGeometryKind('point');
      if (geometryKindSelect) geometryKindSelect.value = 'point';
      synchronizeGeometryUi();
      editorStatus.textContent =
        'Conversión preparada. El contorno no se eliminará de forma persistente hasta Guardar/Publicar.';
      return;
    }
    if (pending.action === 'archive-record') {
      void controller.archive(pending.record).then((saved) => {
        if (saved) closeConfirmation();
      });
      return;
    }
    if (pending.action === 'archive-editor') {
      closeConfirmation();
      void saveWithStatus('archived');
      return;
    }
    const detail = state.editorDetail;
    if (!detail) return;
    void controller.delete(detail).then((deleted) => {
      if (deleted) closeConfirmation();
    });
  };
  const handleDismiss = (): void => {
    if (pendingConfirmation?.action === 'convert-to-point' && geometryKindSelect) {
      geometryKindSelect.value = 'polygon';
    }
    closeConfirmation();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !confirmation.hidden) {
      event.preventDefault();
      handleDismiss();
    }
  };
  const handlePublicDataStatus = (event: Event): void => {
    if (!isPublicDataStatusEvent(event)) return;
    const next = event.detail.backendState;
    if (next === 'connected' || next === 'degraded' || next === 'offline') {
      backendConnected = next === 'connected';
      controller.setAccess(authController.getState().phase === 'authorized', backendConnected);
    }
  };

  search.addEventListener('input', handleSearch);
  createCharacterButton.addEventListener('click', handleCreateCharacter);
  createLocationButton.addEventListener('click', handleCreateLocation);
  createMissionButton.addEventListener('click', handleCreateMission);
  createHazardButton.addEventListener('click', handleCreateHazard);
  refreshButton.addEventListener('click', handleRefresh);
  saveDraftButton.addEventListener('click', handleSaveDraft);
  previewButton.addEventListener('click', handlePreview);
  publishButton.addEventListener('click', handlePublish);
  archiveButton.addEventListener('click', handleArchiveEditor);
  deleteButton.addEventListener('click', handleDelete);
  cancelButton.addEventListener('click', handleCancel);
  confirmButton.addEventListener('click', handleConfirm);
  dismissButton.addEventListener('click', handleDismiss);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('atlas:public-data-status', handlePublicDataStatus);

  const unsubscribeController = controller.subscribe(render);
  const unsubscribeAuth = authController.subscribe((authState) => {
    controller.setAccess(authState.phase === 'authorized', backendConnected);
    if (authState.phase !== 'authorized' && renderedEditorKey !== null) controller.closeEditor();
  });

  return {
    destroy(): void {
      mapController?.destroy();
      unsubscribeController();
      unsubscribeAuth();
      search.removeEventListener('input', handleSearch);
      createCharacterButton.removeEventListener('click', handleCreateCharacter);
      createLocationButton.removeEventListener('click', handleCreateLocation);
      createMissionButton.removeEventListener('click', handleCreateMission);
      createHazardButton.removeEventListener('click', handleCreateHazard);
      refreshButton.removeEventListener('click', handleRefresh);
      saveDraftButton.removeEventListener('click', handleSaveDraft);
      previewButton.removeEventListener('click', handlePreview);
      publishButton.removeEventListener('click', handlePublish);
      archiveButton.removeEventListener('click', handleArchiveEditor);
      deleteButton.removeEventListener('click', handleDelete);
      cancelButton.removeEventListener('click', handleCancel);
      confirmButton.removeEventListener('click', handleConfirm);
      dismissButton.removeEventListener('click', handleDismiss);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('atlas:public-data-status', handlePublicDataStatus);
      clearPortraitPreviewUrl();
      draftGeometry = null;
      geometryKindSelect = null;
      preservedDispositions = [];
      section.remove();
    },
  };
}
