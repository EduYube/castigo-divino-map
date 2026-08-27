import type { AdminAuthController } from '../auth/adminAuthController';
import type { AdminCampaignRosterController } from '../application/adminCampaignRosterController';
import type { BackendState } from '../data-access/publicCatalog';
import {
  isInitialCampaign,
  normalizeAccentColor,
  validateCampaignDraft,
  validatePlayerDraft,
  type AdminCampaignDraft,
  type AdminCampaignRecord,
  type AdminPlayerDraft,
  type AdminPlayerRecord,
} from '../domain/adminCampaignRoster';

export interface AdminCampaignRosterUiController {
  destroy(): void;
}

interface PublicDataStatusDetail {
  readonly backendState?: BackendState;
}

interface FormSnapshot {
  readonly serialized: string;
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

function serializeForm(form: HTMLFormElement): string {
  const values = Array.from(form.elements)
    .filter(
      (element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement,
    )
    .map((element) => {
      if (
        element instanceof HTMLInputElement &&
        (element.type === 'checkbox' || element.type === 'radio')
      ) {
        return `${element.name}:${element.checked ? '1' : '0'}`;
      }
      return `${element.name}:${element.value}`;
    });
  return values.join('\u001f');
}

function formIsVisible(form: HTMLFormElement): boolean {
  return !form.closest('[hidden]');
}

export function mountAdminCampaignRoster(
  root: ParentNode,
  controller: AdminCampaignRosterController,
  authController: AdminAuthController,
): AdminCampaignRosterUiController {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  const summary = root.querySelector<HTMLElement>('.admin-auth__summary');
  const logout = root.querySelector<HTMLElement>('.admin-auth__logout');
  if (!shell || !summary || !logout) {
    throw new Error('Missing administrative shell for MAP-054.');
  }
  const adminShell: HTMLElement = shell;

  summary.textContent =
    'Modo administrativo activo. La campaña seleccionada delimita todas las ediciones dependientes del dominio.';

  const section = createElement('section', 'admin-campaign-roster');
  const heading = createElement('h3', 'admin-campaign-roster__heading');
  const intro = createElement('p', 'admin-campaign-roster__intro');
  const context = createElement('div', 'admin-campaign-roster__context');
  const campaignLabel = createElement('label', 'admin-campaign-roster__label');
  const campaignSelect = createElement('select', 'admin-campaign-roster__select');
  const campaignBadge = createElement('span', 'admin-campaign-roster__badge');
  const status = createElement('p', 'admin-campaign-roster__status');
  const campaignToolbar = createElement('div', 'admin-campaign-roster__toolbar');
  const newCampaignButton = createElement('button', 'admin-campaign-roster__primary');
  const refreshButton = createElement('button', 'admin-campaign-roster__button');
  const campaignLists = createElement('div', 'admin-campaign-roster__campaign-groups');
  const activeCampaignSection = createElement('section', 'admin-campaign-roster__group');
  const activeCampaignHeading = createElement('h4', 'admin-campaign-roster__subheading');
  const activeCampaignList = createElement('ul', 'admin-campaign-roster__cards');
  const archivedCampaignSection = createElement('section', 'admin-campaign-roster__group');
  const archivedCampaignHeading = createElement('h4', 'admin-campaign-roster__subheading');
  const archivedCampaignList = createElement('ul', 'admin-campaign-roster__cards');
  const rosterSection = createElement('section', 'admin-campaign-roster__roster');
  const rosterHeading = createElement('h4', 'admin-campaign-roster__subheading');
  const rosterSummary = createElement('p', 'admin-campaign-roster__roster-summary');
  const rosterToolbar = createElement('div', 'admin-campaign-roster__toolbar');
  const newPlayerButton = createElement('button', 'admin-campaign-roster__primary');
  const playerList = createElement(
    'ul',
    'admin-campaign-roster__cards admin-campaign-roster__player-cards',
  );
  const emptyPlayers = createElement('p', 'admin-campaign-roster__empty');
  const campaignEditor = createElement('section', 'admin-campaign-roster__editor');
  const campaignEditorHeading = createElement('h4', 'admin-campaign-roster__subheading');
  const campaignForm = createElement('form', 'admin-campaign-roster__form');
  const campaignNameLabel = createElement('label', 'admin-campaign-roster__label');
  const campaignName = createElement('input', 'admin-campaign-roster__control');
  const campaignNameError = createElement('p', 'admin-campaign-roster__field-error');
  const campaignSlugLabel = createElement('label', 'admin-campaign-roster__label');
  const campaignSlug = createElement('input', 'admin-campaign-roster__control');
  const campaignSlugError = createElement('p', 'admin-campaign-roster__field-error');
  const campaignOrderLabel = createElement('label', 'admin-campaign-roster__label');
  const campaignOrder = createElement('input', 'admin-campaign-roster__control');
  const campaignOrderError = createElement('p', 'admin-campaign-roster__field-error');
  const campaignActions = createElement('div', 'admin-campaign-roster__toolbar');
  const saveCampaignButton = createElement('button', 'admin-campaign-roster__primary');
  const cancelCampaignButton = createElement('button', 'admin-campaign-roster__button');
  const playerEditor = createElement('section', 'admin-campaign-roster__editor');
  const playerEditorHeading = createElement('h4', 'admin-campaign-roster__subheading');
  const playerForm = createElement('form', 'admin-campaign-roster__form');
  const playerNameLabel = createElement('label', 'admin-campaign-roster__label');
  const playerName = createElement('input', 'admin-campaign-roster__control');
  const playerNameError = createElement('p', 'admin-campaign-roster__field-error');
  const playerOrderLabel = createElement('label', 'admin-campaign-roster__label');
  const playerOrder = createElement('input', 'admin-campaign-roster__control');
  const playerOrderError = createElement('p', 'admin-campaign-roster__field-error');
  const playerColorLabel = createElement('label', 'admin-campaign-roster__label');
  const playerColorRow = createElement('div', 'admin-campaign-roster__color-row');
  const playerColorPicker = createElement('input', 'admin-campaign-roster__color-picker');
  const playerColor = createElement('input', 'admin-campaign-roster__control');
  const playerColorError = createElement('p', 'admin-campaign-roster__field-error');
  const playerActions = createElement('div', 'admin-campaign-roster__toolbar');
  const savePlayerButton = createElement('button', 'admin-campaign-roster__primary');
  const cancelPlayerButton = createElement('button', 'admin-campaign-roster__button');
  const formSnapshots = new WeakMap<HTMLFormElement, FormSnapshot>();

  let state = controller.getState();
  let backendConnected = false;
  let editingCampaign: AdminCampaignRecord | null = null;
  let editingPlayer: AdminPlayerRecord | null = null;
  let editorFocus: HTMLElement | null = null;

  heading.id = 'admin-campaign-roster-heading';
  heading.textContent = 'Campañas y personajes jugadores';
  intro.textContent =
    'La campaña administrativa es global para esta sesión. Los IDs, slugs e historial no se mueven entre campañas.';
  section.setAttribute('aria-labelledby', heading.id);

  campaignLabel.htmlFor = 'admin-campaign-context';
  campaignLabel.textContent = 'Campaña administrativa';
  campaignSelect.id = 'admin-campaign-context';
  campaignSelect.setAttribute('aria-describedby', 'admin-campaign-context-hint');
  const contextHint = createElement('p', 'admin-campaign-roster__hint');
  contextHint.id = 'admin-campaign-context-hint';
  contextHint.textContent =
    'Cambiarla recarga roster y referencias dependientes. Si hay cambios sin guardar se pedirá confirmación.';
  campaignBadge.hidden = true;
  context.append(campaignLabel, campaignSelect, campaignBadge, contextHint);

  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  newCampaignButton.type = 'button';
  newCampaignButton.textContent = 'Crear campaña';
  refreshButton.type = 'button';
  refreshButton.textContent = 'Recargar campañas';
  campaignToolbar.append(newCampaignButton, refreshButton);

  activeCampaignHeading.textContent = 'Campañas activas';
  activeCampaignSection.append(activeCampaignHeading, activeCampaignList);
  archivedCampaignHeading.textContent = 'Campañas archivadas';
  archivedCampaignSection.append(archivedCampaignHeading, archivedCampaignList);
  campaignLists.append(activeCampaignSection, archivedCampaignSection);

  rosterHeading.textContent = 'Roster de la campaña seleccionada';
  newPlayerButton.type = 'button';
  newPlayerButton.textContent = 'Crear jugador';
  rosterToolbar.append(newPlayerButton);
  emptyPlayers.hidden = true;
  rosterSection.append(rosterHeading, rosterSummary, rosterToolbar, emptyPlayers, playerList);

  function configureField(
    input: HTMLInputElement,
    label: HTMLLabelElement,
    error: HTMLParagraphElement,
    options: { readonly id: string; readonly label: string; readonly type?: string },
  ): void {
    label.htmlFor = options.id;
    label.textContent = options.label;
    input.id = options.id;
    input.name = options.id;
    input.type = options.type ?? 'text';
    input.setAttribute('aria-describedby', `${options.id}-error`);
    error.id = `${options.id}-error`;
    error.setAttribute('aria-live', 'polite');
  }

  configureField(campaignName, campaignNameLabel, campaignNameError, {
    id: 'admin-campaign-name',
    label: 'Nombre',
  });
  campaignName.required = true;
  campaignName.maxLength = 120;
  configureField(campaignSlug, campaignSlugLabel, campaignSlugError, {
    id: 'admin-campaign-slug',
    label: 'Slug estable',
  });
  campaignSlug.required = true;
  campaignSlug.maxLength = 120;
  configureField(campaignOrder, campaignOrderLabel, campaignOrderError, {
    id: 'admin-campaign-order',
    label: 'Orden',
    type: 'number',
  });
  campaignOrder.min = '0';
  campaignOrder.step = '1';
  campaignOrder.required = true;
  campaignForm.noValidate = true;
  saveCampaignButton.type = 'submit';
  saveCampaignButton.textContent = 'Guardar campaña';
  cancelCampaignButton.type = 'button';
  cancelCampaignButton.textContent = 'Cancelar';
  campaignActions.append(saveCampaignButton, cancelCampaignButton);
  campaignForm.append(
    campaignNameLabel,
    campaignName,
    campaignNameError,
    campaignSlugLabel,
    campaignSlug,
    campaignSlugError,
    campaignOrderLabel,
    campaignOrder,
    campaignOrderError,
    campaignActions,
  );
  campaignEditor.append(campaignEditorHeading, campaignForm);
  campaignEditor.hidden = true;

  configureField(playerName, playerNameLabel, playerNameError, {
    id: 'admin-player-name',
    label: 'Nombre visible',
  });
  playerName.required = true;
  playerName.maxLength = 120;
  configureField(playerOrder, playerOrderLabel, playerOrderError, {
    id: 'admin-player-order',
    label: 'Orden en roster',
    type: 'number',
  });
  playerOrder.min = '0';
  playerOrder.step = '1';
  playerOrder.required = true;
  playerColorLabel.htmlFor = 'admin-player-color';
  playerColorLabel.textContent = 'Acento de color';
  playerColorPicker.id = 'admin-player-color-picker';
  playerColorPicker.name = 'admin-player-color-picker';
  playerColorPicker.type = 'color';
  playerColorPicker.setAttribute('aria-label', 'Selector visual del acento');
  configureField(playerColor, createElement('label', 'visually-hidden'), playerColorError, {
    id: 'admin-player-color',
    label: 'Color hexadecimal',
  });
  playerColor.required = true;
  playerColor.pattern = '#[0-9A-Fa-f]{6}';
  playerColor.maxLength = 7;
  playerColorRow.append(playerColorPicker, playerColor);
  playerForm.noValidate = true;
  savePlayerButton.type = 'submit';
  savePlayerButton.textContent = 'Guardar jugador';
  cancelPlayerButton.type = 'button';
  cancelPlayerButton.textContent = 'Cancelar';
  playerActions.append(savePlayerButton, cancelPlayerButton);
  playerForm.append(
    playerNameLabel,
    playerName,
    playerNameError,
    playerOrderLabel,
    playerOrder,
    playerOrderError,
    playerColorLabel,
    playerColorRow,
    playerColorError,
    playerActions,
  );
  playerEditor.append(playerEditorHeading, playerForm);
  playerEditor.hidden = true;

  section.append(
    heading,
    intro,
    context,
    campaignToolbar,
    status,
    campaignLists,
    rosterSection,
    campaignEditor,
    playerEditor,
  );
  adminShell.insertBefore(section, logout);

  function resetFormTracking(form: HTMLFormElement): void {
    formSnapshots.delete(form);
    delete form.dataset.adminDirty;
  }

  function closeCampaignEditor(): void {
    campaignEditor.hidden = true;
    editingCampaign = null;
    resetFormTracking(campaignForm);
    editorFocus?.focus();
    editorFocus = null;
  }

  function closePlayerEditor(): void {
    playerEditor.hidden = true;
    editingPlayer = null;
    resetFormTracking(playerForm);
    editorFocus?.focus();
    editorFocus = null;
  }

  function markFormSnapshot(form: HTMLFormElement): void {
    if (!formSnapshots.has(form)) {
      formSnapshots.set(form, { serialized: serializeForm(form) });
    }
  }

  function updateDirtyState(form: HTMLFormElement): void {
    const snapshot = formSnapshots.get(form);
    if (!snapshot) return;
    form.dataset.adminDirty = String(serializeForm(form) !== snapshot.serialized);
  }

  function hasDirtyAdminForm(): boolean {
    return Array.from(adminShell.querySelectorAll<HTMLFormElement>('form')).some(
      (form) => formIsVisible(form) && form.dataset.adminDirty === 'true',
    );
  }

  function confirmCampaignChange(): boolean {
    if (!hasDirtyAdminForm()) return true;
    return window.confirm(
      'Hay cambios administrativos sin guardar. ¿Quieres descartarlos y cambiar de campaña?',
    );
  }

  function campaignDraft(): AdminCampaignDraft {
    return {
      name: campaignName.value,
      slug: campaignSlug.value,
      displayOrder: Number(campaignOrder.value),
    };
  }

  function playerDraft(): AdminPlayerDraft {
    return {
      displayName: playerName.value,
      displayOrder: Number(playerOrder.value),
      accentColor: playerColor.value,
    };
  }

  function renderCampaignErrors(): boolean {
    const validation = validateCampaignDraft(campaignDraft());
    for (const [field, input, error] of [
      ['name', campaignName, campaignNameError],
      ['slug', campaignSlug, campaignSlugError],
      ['displayOrder', campaignOrder, campaignOrderError],
    ] as const) {
      const message = validation.fieldErrors[field] ?? '';
      error.textContent = message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    return validation.valid;
  }

  function renderPlayerErrors(): boolean {
    const validation = validatePlayerDraft(playerDraft());
    for (const [field, input, error] of [
      ['displayName', playerName, playerNameError],
      ['displayOrder', playerOrder, playerOrderError],
      ['accentColor', playerColor, playerColorError],
    ] as const) {
      const message = validation.fieldErrors[field] ?? '';
      error.textContent = message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    return validation.valid;
  }

  function openCampaignEditor(record: AdminCampaignRecord | null, trigger: HTMLElement): void {
    closePlayerEditor();
    editingCampaign = record;
    editorFocus = trigger;
    campaignEditorHeading.textContent = record ? `Editar ${record.name}` : 'Crear campaña';
    campaignName.value = record?.name ?? '';
    campaignSlug.value = record?.slug ?? '';
    campaignSlug.readOnly = record !== null;
    campaignOrder.value = String(record?.displayOrder ?? state.campaigns.length);
    campaignEditor.hidden = false;
    resetFormTracking(campaignForm);
    renderCampaignErrors();
    window.requestAnimationFrame(() => {
      campaignName.focus();
      markFormSnapshot(campaignForm);
    });
  }

  function openPlayerEditor(record: AdminPlayerRecord | null, trigger: HTMLElement): void {
    closeCampaignEditor();
    editingPlayer = record;
    editorFocus = trigger;
    playerEditorHeading.textContent = record ? `Editar ${record.displayName}` : 'Crear jugador';
    playerName.value = record?.displayName ?? '';
    playerOrder.value = String(record?.displayOrder ?? state.players.length);
    playerColor.value = record?.accentColor ?? '#475569';
    playerColorPicker.value = playerColor.value;
    playerEditor.hidden = false;
    resetFormTracking(playerForm);
    renderPlayerErrors();
    window.requestAnimationFrame(() => {
      playerName.focus();
      markFormSnapshot(playerForm);
    });
  }

  function createCampaignCard(campaign: AdminCampaignRecord): HTMLLIElement {
    const item = createElement('li', 'admin-campaign-roster__card');
    const title = createElement('div', 'admin-campaign-roster__card-title');
    const name = createElement('strong', 'admin-campaign-roster__card-name');
    const metadata = createElement('p', 'admin-campaign-roster__metadata');
    const actions = createElement('div', 'admin-campaign-roster__toolbar');
    const selectButton = createElement('button', 'admin-campaign-roster__button');
    const editButton = createElement('button', 'admin-campaign-roster__button');
    const archiveButton = createElement('button', 'admin-campaign-roster__button');

    name.textContent = campaign.name;
    title.append(name);
    if (isInitialCampaign(campaign)) {
      const badge = createElement('span', 'admin-campaign-roster__badge');
      badge.textContent = 'Campaña inicial v1.0';
      title.append(badge);
    }
    metadata.textContent = `${campaign.slug} · orden ${campaign.displayOrder} · ${campaign.status === 'active' ? 'activa' : 'archivada'}`;
    selectButton.type = 'button';
    selectButton.textContent =
      campaign.id === state.selectedCampaignId ? 'Seleccionada' : 'Seleccionar';
    selectButton.disabled = campaign.id === state.selectedCampaignId || state.phase === 'mutating';
    selectButton.addEventListener('click', () => {
      if (!confirmCampaignChange()) return;
      void controller.selectCampaign(campaign.id);
    });
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.disabled = state.phase === 'mutating';
    editButton.addEventListener('click', () => openCampaignEditor(campaign, editButton));
    archiveButton.type = 'button';
    archiveButton.textContent = campaign.status === 'active' ? 'Archivar' : 'Restaurar';
    archiveButton.disabled = state.phase === 'mutating';
    archiveButton.addEventListener('click', () => {
      if (
        campaign.status === 'active' &&
        !window.confirm(
          `Archivar “${campaign.name}” ocultará su contenido público sin borrarlo. ¿Continuar?`,
        )
      ) {
        return;
      }
      void controller.setCampaignArchived(campaign, campaign.status === 'active');
    });
    actions.append(selectButton, editButton, archiveButton);
    item.append(title, metadata, actions);
    return item;
  }

  function createPlayerCard(player: AdminPlayerRecord): HTMLLIElement {
    const item = createElement(
      'li',
      'admin-campaign-roster__card admin-campaign-roster__player-card',
    );
    const title = createElement('div', 'admin-campaign-roster__card-title');
    const swatch = createElement('span', 'admin-campaign-roster__swatch');
    const name = createElement('strong', 'admin-campaign-roster__card-name');
    const metadata = createElement('p', 'admin-campaign-roster__metadata');
    const actions = createElement('div', 'admin-campaign-roster__toolbar');
    const editButton = createElement('button', 'admin-campaign-roster__button');
    const archiveButton = createElement('button', 'admin-campaign-roster__button');

    swatch.style.setProperty('--player-accent', player.accentColor);
    swatch.setAttribute('aria-hidden', 'true');
    name.textContent = player.displayName;
    title.append(swatch, name);
    metadata.textContent = `${player.accentColor} · orden ${player.displayOrder} · ${player.publicationStatus === 'archived' ? 'archivado' : player.publicationStatus === 'published' ? 'activo y publicado' : 'activo en borrador'}`;
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.disabled = state.phase === 'mutating';
    editButton.addEventListener('click', () => openPlayerEditor(player, editButton));
    archiveButton.type = 'button';
    archiveButton.textContent = player.publicationStatus === 'archived' ? 'Restaurar' : 'Archivar';
    archiveButton.disabled = state.phase === 'mutating';
    archiveButton.addEventListener('click', () => {
      if (
        player.publicationStatus !== 'archived' &&
        !window.confirm(
          `Archivar “${player.displayName}” conservará disposiciones e historial. ¿Continuar?`,
        )
      ) {
        return;
      }
      void controller.setPlayerArchived(player, player.publicationStatus !== 'archived');
    });
    actions.append(editButton, archiveButton);
    item.append(title, metadata, actions);
    return item;
  }

  function render(): void {
    state = controller.getState();
    const selected = state.campaigns.find(({ id }) => id === state.selectedCampaignId) ?? null;
    const currentSelectValue = campaignSelect.value;
    campaignSelect.replaceChildren();
    for (const campaign of state.campaigns) {
      const option = document.createElement('option');
      option.value = campaign.id;
      option.textContent = `${campaign.name}${campaign.status === 'archived' ? ' — archivada' : ''}${isInitialCampaign(campaign) ? ' — inicial v1.0' : ''}`;
      campaignSelect.append(option);
    }
    campaignSelect.value = selected?.id ?? currentSelectValue;
    campaignBadge.hidden = !selected || !isInitialCampaign(selected);
    campaignBadge.textContent = 'Campaña inicial heredada de v1.0';

    activeCampaignList.replaceChildren(
      ...state.campaigns.filter(({ status }) => status === 'active').map(createCampaignCard),
    );
    archivedCampaignList.replaceChildren(
      ...state.campaigns.filter(({ status }) => status === 'archived').map(createCampaignCard),
    );
    archivedCampaignSection.hidden = !state.campaigns.some(({ status }) => status === 'archived');

    rosterSummary.textContent = selected
      ? `${selected.name}: ${state.players.filter(({ publicationStatus }) => publicationStatus !== 'archived').length} activos y ${state.players.filter(({ publicationStatus }) => publicationStatus === 'archived').length} archivados.`
      : 'Selecciona una campaña.';
    playerList.replaceChildren(...state.players.map(createPlayerCard));
    emptyPlayers.hidden = state.players.length !== 0 || state.phase === 'loading';
    emptyPlayers.textContent = 'Esta campaña todavía no tiene personajes jugadores.';

    const unavailable = !state.authorized || !state.backendConnected;
    campaignSelect.disabled =
      unavailable || state.phase === 'loading' || state.phase === 'mutating';
    newCampaignButton.disabled = unavailable || state.phase !== 'ready';
    refreshButton.disabled = unavailable || state.phase === 'loading' || state.phase === 'mutating';
    newPlayerButton.disabled =
      unavailable || state.phase !== 'ready' || !selected || selected.status === 'archived';
    saveCampaignButton.disabled = state.phase === 'mutating';
    savePlayerButton.disabled = state.phase === 'mutating';

    if (!state.authorized) {
      status.textContent =
        'La administración de campañas permanece cerrada hasta autorizar la sesión.';
    } else if (!state.backendConnected) {
      status.textContent =
        'Campañas y roster permanecen bloqueados mientras el backend no esté conectado.';
    } else if (state.phase === 'loading') {
      status.textContent = 'Cargando la campaña administrativa…';
    } else if (state.phase === 'mutating') {
      status.textContent = 'Guardando el cambio…';
    } else if (state.issue) {
      status.textContent = state.issue.message;
    } else if (selected) {
      status.textContent = `Contexto activo: ${selected.name}.`;
    } else {
      status.textContent = 'No hay campaña seleccionada.';
    }
  }

  const handleCampaignSelect = (): void => {
    const requested = campaignSelect.value;
    if (requested === state.selectedCampaignId) return;
    if (!confirmCampaignChange()) {
      campaignSelect.value = state.selectedCampaignId;
      campaignSelect.focus();
      return;
    }
    closeCampaignEditor();
    closePlayerEditor();
    void controller.selectCampaign(requested);
  };
  const handleNewCampaign = (): void => openCampaignEditor(null, newCampaignButton);
  const handleNewPlayer = (): void => openPlayerEditor(null, newPlayerButton);
  const handleRefresh = (): void => void controller.reload();
  const handleCampaignSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!renderCampaignErrors()) {
      campaignForm.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const request = editingCampaign
      ? controller.updateCampaign(editingCampaign, campaignDraft())
      : controller.createCampaign(campaignDraft());
    void request.then((saved) => {
      if (saved) closeCampaignEditor();
    });
  };
  const handlePlayerSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!renderPlayerErrors()) {
      playerForm.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const request = editingPlayer
      ? controller.updatePlayer(editingPlayer, playerDraft())
      : controller.createPlayer(playerDraft());
    void request.then((saved) => {
      if (saved) closePlayerEditor();
    });
  };
  const handleColorPicker = (): void => {
    playerColor.value = playerColorPicker.value;
    renderPlayerErrors();
    updateDirtyState(playerForm);
  };
  const handleColorText = (): void => {
    const normalized = normalizeAccentColor(playerColor.value);
    if (/^#[0-9a-f]{6}$/.test(normalized)) playerColorPicker.value = normalized;
    renderPlayerErrors();
  };
  const handleFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    const form = target instanceof Element ? target.closest<HTMLFormElement>('form') : null;
    if (form && adminShell.contains(form)) markFormSnapshot(form);
  };
  const handleFormChange = (event: Event): void => {
    const target = event.target;
    const form = target instanceof Element ? target.closest<HTMLFormElement>('form') : null;
    if (form && adminShell.contains(form)) {
      markFormSnapshot(form);
      updateDirtyState(form);
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

  campaignSelect.addEventListener('change', handleCampaignSelect);
  newCampaignButton.addEventListener('click', handleNewCampaign);
  newPlayerButton.addEventListener('click', handleNewPlayer);
  refreshButton.addEventListener('click', handleRefresh);
  campaignForm.addEventListener('submit', handleCampaignSubmit);
  playerForm.addEventListener('submit', handlePlayerSubmit);
  cancelCampaignButton.addEventListener('click', closeCampaignEditor);
  cancelPlayerButton.addEventListener('click', closePlayerEditor);
  campaignForm.addEventListener('input', renderCampaignErrors);
  playerForm.addEventListener('input', renderPlayerErrors);
  playerColorPicker.addEventListener('input', handleColorPicker);
  playerColor.addEventListener('input', handleColorText);
  adminShell.addEventListener('focusin', handleFocusIn);
  adminShell.addEventListener('input', handleFormChange);
  adminShell.addEventListener('change', handleFormChange);
  window.addEventListener('atlas:public-data-status', handlePublicDataStatus);

  const unsubscribeRoster = controller.subscribe(render);
  const unsubscribeAuth = authController.subscribe((authState) => {
    controller.setAccess(authState.phase === 'authorized', backendConnected);
    if (authState.phase !== 'authorized') {
      closeCampaignEditor();
      closePlayerEditor();
    }
  });

  return {
    destroy(): void {
      unsubscribeRoster();
      unsubscribeAuth();
      campaignSelect.removeEventListener('change', handleCampaignSelect);
      newCampaignButton.removeEventListener('click', handleNewCampaign);
      newPlayerButton.removeEventListener('click', handleNewPlayer);
      refreshButton.removeEventListener('click', handleRefresh);
      campaignForm.removeEventListener('submit', handleCampaignSubmit);
      playerForm.removeEventListener('submit', handlePlayerSubmit);
      cancelCampaignButton.removeEventListener('click', closeCampaignEditor);
      cancelPlayerButton.removeEventListener('click', closePlayerEditor);
      campaignForm.removeEventListener('input', renderCampaignErrors);
      playerForm.removeEventListener('input', renderPlayerErrors);
      playerColorPicker.removeEventListener('input', handleColorPicker);
      playerColor.removeEventListener('input', handleColorText);
      adminShell.removeEventListener('focusin', handleFocusIn);
      adminShell.removeEventListener('input', handleFormChange);
      adminShell.removeEventListener('change', handleFormChange);
      window.removeEventListener('atlas:public-data-status', handlePublicDataStatus);
      section.remove();
    },
  };
}
