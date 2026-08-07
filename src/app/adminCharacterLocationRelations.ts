import type {
  AdminCharacterLocationRelationController,
  AdminCharacterLocationRelationState,
} from '../application/adminCharacterLocationRelationController';
import type { AdminAuthController } from '../auth/adminAuthController';
import type { BackendState } from '../data-access/publicCatalog';
import {
  CHARACTER_LOCATION_RELATION_STATUS_LABELS,
  createEmptyCharacterLocationRelationDraft,
  relationRecordToDraft,
  type AdminCharacterLocationRelationDraft,
  type AdminCharacterLocationRelationRecord,
  type CharacterLocationRelationPublicationStatus,
  type CharacterLocationRelationStatus,
} from '../domain/characterLocationRelations';
import { validateCharacterLocationRelationDraft } from '../domain/characterLocationRelationValidation';
import '../styles/admin-character-location-relations.css';

export interface AdminCharacterLocationRelationsUiController {
  destroy(): void;
}

interface PublicDataStatusDetail {
  readonly backendState?: BackendState;
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

export function mountAdminCharacterLocationRelations(
  root: ParentNode,
  controller: AdminCharacterLocationRelationController,
  authController: AdminAuthController,
): AdminCharacterLocationRelationsUiController {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  if (!shell) throw new Error('Missing administrative shell for MAP-020.');

  const section = createElement('section', 'admin-character-location-relation');
  const heading = createElement('h3', 'admin-character-location-relation__heading');
  const intro = createElement('p', 'admin-character-location-relation__intro');
  const toolbar = createElement('div', 'admin-character-location-relation__toolbar');
  const createButton = createElement('button', 'admin-character-location-relation__primary');
  const refreshButton = createElement('button', 'admin-character-location-relation__button');
  const status = createElement('p', 'admin-character-location-relation__status');
  const list = createElement('ul', 'admin-character-location-relation__list');
  const editor = createElement('section', 'admin-character-location-relation__editor');
  const editorHeading = createElement('h4', 'admin-character-location-relation__editor-heading');
  const editorStatus = createElement('p', 'admin-character-location-relation__status');
  const form = createElement('form', 'admin-character-location-relation__form');
  const characterLabel = createElement('label', 'admin-character-location-relation__label');
  const characterSelect = createElement('select', 'admin-character-location-relation__control');
  const characterError = createElement('p', 'admin-character-location-relation__error');
  const locationLabel = createElement('label', 'admin-character-location-relation__label');
  const locationSelect = createElement('select', 'admin-character-location-relation__control');
  const locationError = createElement('p', 'admin-character-location-relation__error');
  const relationLabel = createElement('label', 'admin-character-location-relation__label');
  const relationSelect = createElement('select', 'admin-character-location-relation__control');
  const publication = createElement('p', 'admin-character-location-relation__publication');
  const actions = createElement('div', 'admin-character-location-relation__actions');
  const saveDraftButton = createElement('button', 'admin-character-location-relation__primary');
  const publishButton = createElement('button', 'admin-character-location-relation__button');
  const retireButton = createElement('button', 'admin-character-location-relation__danger');
  const cancelButton = createElement('button', 'admin-character-location-relation__button');

  let state = controller.getState();
  let backendConnected = false;
  let editing: AdminCharacterLocationRelationRecord | null = null;
  let creating = false;
  let restoreFocus: HTMLElement | null = null;

  heading.id = 'admin-character-location-relation-heading';
  heading.textContent = 'Personajes importantes por emplazamiento';
  section.setAttribute('aria-labelledby', heading.id);
  intro.textContent =
    'Relaciona un personaje con un emplazamiento como presente, asociado o visto por última vez. Retirar conserva el historial editorial archivando la relación.';
  createButton.type = 'button';
  createButton.textContent = 'Crear relación';
  refreshButton.type = 'button';
  refreshButton.textContent = 'Recargar relaciones';
  toolbar.append(createButton, refreshButton);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  list.setAttribute('data-testid', 'admin-character-location-relation-list');

  editor.hidden = true;
  editorHeading.id = 'admin-character-location-relation-editor-heading';
  editor.setAttribute('aria-labelledby', editorHeading.id);
  editorStatus.setAttribute('role', 'alert');
  editorStatus.setAttribute('aria-live', 'assertive');
  editorStatus.tabIndex = -1;
  form.noValidate = true;

  characterLabel.htmlFor = 'admin-character-location-relation-character';
  characterLabel.textContent = 'Personaje';
  characterSelect.id = 'admin-character-location-relation-character';
  characterSelect.name = 'characterId';
  characterSelect.setAttribute('data-testid', 'relation-character');
  characterError.id = 'admin-character-location-relation-character-error';
  characterSelect.setAttribute('aria-describedby', characterError.id);

  locationLabel.htmlFor = 'admin-character-location-relation-location';
  locationLabel.textContent = 'Emplazamiento';
  locationSelect.id = 'admin-character-location-relation-location';
  locationSelect.name = 'locationId';
  locationSelect.setAttribute('data-testid', 'relation-location');
  locationError.id = 'admin-character-location-relation-location-error';
  locationSelect.setAttribute('aria-describedby', locationError.id);

  relationLabel.htmlFor = 'admin-character-location-relation-status';
  relationLabel.textContent = 'Estado público';
  relationSelect.id = 'admin-character-location-relation-status';
  relationSelect.name = 'relationStatus';
  relationSelect.setAttribute('data-testid', 'relation-status');
  (
    Object.entries(CHARACTER_LOCATION_RELATION_STATUS_LABELS) as [
      CharacterLocationRelationStatus,
      string,
    ][]
  ).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    relationSelect.append(option);
  });

  publication.setAttribute('aria-live', 'polite');
  saveDraftButton.type = 'button';
  saveDraftButton.textContent = 'Guardar borrador';
  publishButton.type = 'button';
  publishButton.textContent = 'Publicar relación';
  retireButton.type = 'button';
  retireButton.textContent = 'Retirar relación';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cerrar editor';
  actions.append(saveDraftButton, publishButton, retireButton, cancelButton);
  form.append(
    characterLabel,
    characterSelect,
    characterError,
    locationLabel,
    locationSelect,
    locationError,
    relationLabel,
    relationSelect,
    publication,
    actions,
  );
  editor.append(editorHeading, editorStatus, form);
  section.append(heading, intro, toolbar, status, list, editor);
  shell.insertBefore(section, shell.querySelector('.admin-auth__logout'));

  function nameForEntity(id: string): string {
    return (
      [...state.references.characters, ...state.references.locations].find(
        (entity) => entity.id === id,
      )?.name ?? id
    );
  }

  function populateCharacters(selected: string): void {
    characterSelect.replaceChildren();
    state.references.characters
      .filter(({ publicationStatus }) => publicationStatus !== 'archived')
      .forEach((character) => {
        const option = document.createElement('option');
        option.value = character.id;
        option.textContent = `${character.name} · ${character.publicationStatus}`;
        option.selected = character.id === selected;
        characterSelect.append(option);
      });
  }

  function populateLocations(selected: string): void {
    locationSelect.replaceChildren();
    const characterId = characterSelect.value;
    state.references.locations
      .filter(({ publicationStatus }) => publicationStatus !== 'archived')
      .filter((location) => {
        if (editing) return location.id === editing.locationId;
        return !state.records.some(
          (record) => record.characterId === characterId && record.locationId === location.id,
        );
      })
      .forEach((location) => {
        const option = document.createElement('option');
        option.value = location.id;
        option.textContent = `${location.name} · ${location.publicationStatus}`;
        option.selected = location.id === selected;
        locationSelect.append(option);
      });
  }

  function readDraft(
    publicationStatus: CharacterLocationRelationPublicationStatus,
  ): AdminCharacterLocationRelationDraft {
    return {
      characterId: characterSelect.value,
      locationId: locationSelect.value,
      relationStatus: relationSelect.value as CharacterLocationRelationStatus,
      publicationStatus,
    };
  }

  function showValidation(draft: AdminCharacterLocationRelationDraft): boolean {
    const result = validateCharacterLocationRelationDraft(
      draft,
      state.references,
      state.records,
      editing,
    );
    const characterMessage = result.fieldErrors.characterId ?? '';
    const locationMessage = result.fieldErrors.locationId ?? '';
    characterError.textContent = characterMessage;
    locationError.textContent = locationMessage;
    characterSelect.setAttribute('aria-invalid', characterMessage ? 'true' : 'false');
    locationSelect.setAttribute('aria-invalid', locationMessage ? 'true' : 'false');
    return result.valid;
  }

  function openEditor(
    record: AdminCharacterLocationRelationRecord | null,
    trigger: HTMLElement,
  ): void {
    editing = record;
    creating = record === null;
    restoreFocus = trigger;
    const draft = record
      ? relationRecordToDraft(record)
      : createEmptyCharacterLocationRelationDraft(state.references);
    editorHeading.textContent = record ? 'Editar relación' : 'Crear relación';
    populateCharacters(draft.characterId);
    characterSelect.disabled = record !== null;
    populateLocations(draft.locationId);
    locationSelect.disabled = record !== null;
    relationSelect.value = draft.relationStatus;
    publication.textContent = `Estado editorial actual: ${record?.publicationStatus ?? 'nuevo borrador'}.`;
    saveDraftButton.textContent =
      record?.publicationStatus === 'archived' ? 'Volver a borrador' : 'Guardar borrador';
    publishButton.disabled = record?.publicationStatus === 'archived';
    retireButton.hidden = !record || record.publicationStatus === 'archived';
    editorStatus.textContent = '';
    editor.hidden = false;
    list.hidden = true;
    window.requestAnimationFrame(() => characterSelect.focus());
    showValidation(draft);
  }

  function closeEditor(): void {
    editing = null;
    creating = false;
    editor.hidden = true;
    list.hidden = false;
    characterError.textContent = '';
    locationError.textContent = '';
    restoreFocus?.focus();
    restoreFocus = null;
  }

  function renderList(): void {
    list.replaceChildren();
    const records = [...state.records].sort((left, right) => {
      const location = nameForEntity(left.locationId).localeCompare(
        nameForEntity(right.locationId),
      );
      return (
        location || nameForEntity(left.characterId).localeCompare(nameForEntity(right.characterId))
      );
    });
    for (const record of records) {
      const item = createElement('li', 'admin-character-location-relation__item');
      const content = createElement('div', 'admin-character-location-relation__item-content');
      const title = createElement('strong', 'admin-character-location-relation__item-title');
      const meta = createElement('span', 'admin-character-location-relation__item-meta');
      const editButton = createElement('button', 'admin-character-location-relation__button');
      const retire = createElement('button', 'admin-character-location-relation__button');
      title.textContent = `${nameForEntity(record.locationId)} — ${nameForEntity(record.characterId)}`;
      meta.textContent = `${CHARACTER_LOCATION_RELATION_STATUS_LABELS[record.relationStatus]} · ${record.publicationStatus}`;
      editButton.type = 'button';
      editButton.textContent = 'Editar';
      editButton.setAttribute(
        'aria-label',
        `Editar relación de ${nameForEntity(record.characterId)} con ${nameForEntity(record.locationId)}`,
      );
      editButton.addEventListener('click', () => openEditor(record, editButton));
      retire.type = 'button';
      retire.textContent = 'Retirar';
      retire.disabled = record.publicationStatus === 'archived';
      retire.addEventListener('click', () => void controller.retire(record));
      content.append(title, meta);
      item.append(content, editButton, retire);
      list.append(item);
    }
    if (records.length === 0 && state.phase === 'ready') {
      const empty = createElement('li', 'admin-character-location-relation__empty');
      empty.textContent = 'No hay relaciones personaje–emplazamiento.';
      list.append(empty);
    }
  }

  function render(next: AdminCharacterLocationRelationState): void {
    state = next;
    const unavailable = !state.authorized || !state.backendConnected;
    const busy = state.phase === 'loading' || state.phase === 'mutating';
    createButton.disabled = unavailable || busy;
    refreshButton.disabled = unavailable || busy;
    saveDraftButton.disabled = busy;
    publishButton.disabled = busy || editing?.publicationStatus === 'archived';
    retireButton.disabled = busy;
    if (!state.authorized)
      status.textContent = 'La edición de relaciones requiere una sesión autorizada.';
    else if (!state.backendConnected)
      status.textContent =
        'La edición de relaciones está bloqueada mientras el backend público no esté conectado.';
    else if (state.phase === 'loading') status.textContent = 'Cargando relaciones…';
    else if (state.phase === 'mutating') status.textContent = 'Guardando relación…';
    else if (state.issue) status.textContent = state.issue.message;
    else status.textContent = `${state.records.length} relaciones administrativas.`;
    if (state.issue && (editing || creating)) {
      editorStatus.textContent = state.issue.message;
      editorStatus.focus();
    }
    renderList();
    if (editing || creating) list.hidden = true;
  }

  async function saveAs(
    publicationStatus: CharacterLocationRelationPublicationStatus,
  ): Promise<void> {
    const draft = readDraft(publicationStatus);
    if (!showValidation(draft)) {
      editorStatus.textContent = 'Revisa los campos indicados antes de guardar.';
      (characterSelect.getAttribute('aria-invalid') === 'true'
        ? characterSelect
        : locationSelect
      ).focus();
      return;
    }
    const saved = await controller.save(draft, editing);
    if (saved) {
      closeEditor();
      editorStatus.textContent = '';
    }
  }

  const handleCreate = (): void => openEditor(null, createButton);
  const handleRefresh = (): void => void controller.reload();
  const handleCharacterChange = (): void => {
    const previous = locationSelect.value;
    populateLocations(previous);
    showValidation(readDraft(editing?.publicationStatus ?? 'draft'));
  };
  const handleLocationChange = (): void =>
    showValidation(readDraft(editing?.publicationStatus ?? 'draft'));
  const handleRelationChange = (): void =>
    showValidation(readDraft(editing?.publicationStatus ?? 'draft'));
  const handleSaveDraft = (): void => void saveAs('draft');
  const handlePublish = (): void => void saveAs('published');
  const handleRetire = (): void => {
    const record = editing;
    if (!record) return;
    void controller.retire(record).then((saved) => {
      if (saved) closeEditor();
    });
  };
  const handleCancel = (): void => closeEditor();
  const handlePublicDataStatus = (event: Event): void => {
    if (!isPublicDataStatusEvent(event)) return;
    const next = event.detail.backendState;
    if (next === 'connected' || next === 'degraded' || next === 'offline') {
      backendConnected = next === 'connected';
      controller.setAccess(authController.getState().phase === 'authorized', backendConnected);
    }
  };

  createButton.addEventListener('click', handleCreate);
  refreshButton.addEventListener('click', handleRefresh);
  characterSelect.addEventListener('change', handleCharacterChange);
  locationSelect.addEventListener('change', handleLocationChange);
  relationSelect.addEventListener('change', handleRelationChange);
  saveDraftButton.addEventListener('click', handleSaveDraft);
  publishButton.addEventListener('click', handlePublish);
  retireButton.addEventListener('click', handleRetire);
  cancelButton.addEventListener('click', handleCancel);
  window.addEventListener('atlas:public-data-status', handlePublicDataStatus);

  const unsubscribeController = controller.subscribe(render);
  const unsubscribeAuth = authController.subscribe((authState) => {
    controller.setAccess(authState.phase === 'authorized', backendConnected);
    if (authState.phase !== 'authorized' && (editing || creating)) closeEditor();
  });

  return {
    destroy(): void {
      unsubscribeController();
      unsubscribeAuth();
      createButton.removeEventListener('click', handleCreate);
      refreshButton.removeEventListener('click', handleRefresh);
      characterSelect.removeEventListener('change', handleCharacterChange);
      locationSelect.removeEventListener('change', handleLocationChange);
      relationSelect.removeEventListener('change', handleRelationChange);
      saveDraftButton.removeEventListener('click', handleSaveDraft);
      publishButton.removeEventListener('click', handlePublish);
      retireButton.removeEventListener('click', handleRetire);
      cancelButton.removeEventListener('click', handleCancel);
      window.removeEventListener('atlas:public-data-status', handlePublicDataStatus);
      section.remove();
    },
  };
}
