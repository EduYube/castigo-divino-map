import { adminCampaignContext } from '../application/adminCampaignContext';
import type {
  AdminPublicRequestController,
  AdminPublicRequestState,
} from '../application/adminPublicRequestController';
import type { AdminAuthController } from '../auth/adminAuthController';
import type { BackendState } from '../data-access/publicCatalog';
import {
  filterAndSortAdminPublicRequests,
  type AdminPublicRequestFilter,
  type AdminPublicRequestRecord,
  type AdminPublicRequestSort,
} from '../domain/adminPublicRequests';
import '../styles/admin-public-requests.css';

export interface AdminPublicRequestsUiController {
  destroy(): void;
}

interface AdminPublicRequestsUiOptions {
  readonly onOpenDraft?: (entityId: string) => void | Promise<void>;
}

interface PublicDataStatusDetail {
  readonly backendState?: BackendState;
}

type PendingAction = {
  readonly action: 'reject' | 'convert';
  readonly request: AdminPublicRequestRecord;
  readonly moderationNote: string;
};

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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function requestTypeLabel(type: AdminPublicRequestRecord['entityType']): string {
  return type === 'character' ? 'Personaje' : 'Emplazamiento';
}

function statusLabel(status: AdminPublicRequestRecord['requestStatus']): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'accepted':
      return 'Aceptada';
    case 'rejected':
      return 'Rechazada';
    case 'converted':
      return 'Convertida';
    case 'archived':
      return 'Archivada';
  }
}

export function mountAdminPublicRequests(
  root: ParentNode,
  controller: AdminPublicRequestController,
  authController: AdminAuthController,
  options: AdminPublicRequestsUiOptions = {},
): AdminPublicRequestsUiController {
  const shell = root.querySelector<HTMLElement>('.admin-auth__shell');
  if (!shell) throw new Error('Missing administrative shell for MAP-027.');

  const section = createElement('section', 'admin-public-requests');
  const heading = createElement('h3', 'admin-public-requests__heading');
  const intro = createElement('p', 'admin-public-requests__intro');
  const noChangesChannel = createElement('p', 'admin-public-requests__notice');
  const toolbar = createElement('div', 'admin-public-requests__toolbar');
  const filterLabel = createElement('label', 'admin-public-requests__label');
  const filter = createElement('select', 'admin-public-requests__control');
  const sortLabel = createElement('label', 'admin-public-requests__label');
  const sort = createElement('select', 'admin-public-requests__control');
  const refresh = createElement('button', 'admin-public-requests__button');
  const status = createElement('p', 'admin-public-requests__status');
  const list = createElement('ol', 'admin-public-requests__list');
  const empty = createElement('p', 'admin-public-requests__empty');
  const confirmation = createElement('section', 'admin-public-requests__confirmation');
  const confirmationHeading = createElement('h4', 'admin-public-requests__confirmation-heading');
  const confirmationText = createElement('p', 'admin-public-requests__confirmation-text');
  const confirmationActions = createElement('div', 'admin-public-requests__actions');
  const confirmButton = createElement('button', 'admin-public-requests__danger');
  const cancelButton = createElement('button', 'admin-public-requests__button');

  let state: AdminPublicRequestState = controller.getState();
  let backendConnected = false;
  let selectedFilter: AdminPublicRequestFilter = 'pending';
  let selectedSort: AdminPublicRequestSort = 'newest';
  let pendingAction: PendingAction | null = null;
  let restoreFocus: HTMLElement | null = null;
  let feedback = '';
  const moderationNoteDrafts = new Map<string, string>();

  const activeCampaignLabel = (): string => {
    const campaignId = adminCampaignContext.getCampaignId();
    const selector = root.querySelector<HTMLSelectElement>('#admin-campaign-context');
    const option = Array.from(selector?.options ?? []).find(
      (candidate) => candidate.value === campaignId,
    );
    const label = option?.textContent
      ?.replace(/ — archivada/g, '')
      .replace(/ — inicial v1\.0/g, '')
      .trim();
    return label || campaignId;
  };

  heading.textContent = 'Solicitudes públicas';
  heading.id = 'admin-public-requests-heading';
  section.setAttribute('aria-labelledby', heading.id);
  intro.textContent =
    'Revisa únicamente las propuestas de la campaña administrativa activa. Convertir crea un borrador en esa misma campaña y nunca publica contenido.';
  noChangesChannel.textContent =
    '“Necesita cambios” no está disponible en Beta 0.2: el formulario público no recoge un canal de respuesta al remitente.';

  filterLabel.htmlFor = 'admin-public-requests-filter';
  filterLabel.textContent = 'Filtrar por estado';
  filter.id = 'admin-public-requests-filter';
  for (const [value, label] of [
    ['pending', 'Pendientes'],
    ['all', 'Todas'],
    ['rejected', 'Rechazadas'],
    ['converted', 'Convertidas'],
    ['accepted', 'Aceptadas'],
    ['archived', 'Archivadas'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    filter.append(option);
  }

  sortLabel.htmlFor = 'admin-public-requests-sort';
  sortLabel.textContent = 'Orden por fecha';
  sort.id = 'admin-public-requests-sort';
  for (const [value, label] of [
    ['newest', 'Más recientes primero'],
    ['oldest', 'Más antiguas primero'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    sort.append(option);
  }

  refresh.type = 'button';
  refresh.textContent = 'Recargar solicitudes';
  toolbar.append(filterLabel, filter, sortLabel, sort, refresh);

  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  empty.hidden = true;

  confirmation.hidden = true;
  confirmation.setAttribute('role', 'alertdialog');
  confirmation.setAttribute('aria-modal', 'false');
  confirmationHeading.id = 'admin-public-requests-confirm-heading';
  confirmationText.id = 'admin-public-requests-confirm-text';
  confirmation.setAttribute('aria-labelledby', confirmationHeading.id);
  confirmation.setAttribute('aria-describedby', confirmationText.id);
  confirmButton.type = 'button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancelar';
  confirmationActions.append(confirmButton, cancelButton);
  confirmation.append(confirmationHeading, confirmationText, confirmationActions);

  section.append(heading, intro, noChangesChannel, toolbar, status, empty, list, confirmation);
  shell.insertBefore(section, shell.querySelector('.admin-auth__logout'));

  function closeConfirmation(): void {
    confirmation.hidden = true;
    pendingAction = null;
    const target = restoreFocus;
    restoreFocus = null;
    target?.focus();
  }

  function openConfirmation(
    action: PendingAction['action'],
    request: AdminPublicRequestRecord,
    moderationNote: string,
    trigger: HTMLElement,
  ): void {
    pendingAction = { action, request, moderationNote };
    restoreFocus = trigger;
    const campaign = activeCampaignLabel();
    confirmationHeading.textContent =
      action === 'reject' ? 'Confirmar rechazo' : 'Confirmar conversión a borrador';
    confirmationText.textContent =
      action === 'reject'
        ? `La solicitud “${request.proposedName}” de ${campaign} quedará rechazada y conservará su historial de moderación.`
        : `La solicitud “${request.proposedName}” de ${campaign} quedará convertida y se creará un borrador en esa misma campaña, sin categoría ni etiquetas. Esta acción no publica el pin.`;
    confirmButton.textContent = action === 'reject' ? 'Rechazar solicitud' : 'Crear borrador';
    confirmation.hidden = false;
    confirmButton.focus();
  }

  function addDetail(term: string, value: string): HTMLElement {
    const wrapper = createElement('div', 'admin-public-requests__detail');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    wrapper.append(dt, dd);
    return wrapper;
  }

  function renderCard(request: AdminPublicRequestRecord): HTMLLIElement {
    const item = createElement('li', 'admin-public-requests__item');
    const article = createElement('article', 'admin-public-requests__card');
    const cardHeading = createElement('h4', 'admin-public-requests__card-heading');
    const meta = createElement('p', 'admin-public-requests__meta');
    const details = createElement('dl', 'admin-public-requests__details');
    const noteLabel = createElement('label', 'admin-public-requests__label');
    const note = createElement(
      'textarea',
      'admin-public-requests__control admin-public-requests__note',
    );
    const actions = createElement('div', 'admin-public-requests__actions');

    cardHeading.textContent = request.proposedName;
    const headingId = `admin-public-request-${request.id}`;
    cardHeading.id = headingId;
    article.setAttribute('aria-labelledby', headingId);
    meta.textContent = `${statusLabel(request.requestStatus)} · ${requestTypeLabel(request.entityType)} · ${formatDate(request.createdAt)}`;
    details.append(
      addDetail('Campaña', activeCampaignLabel()),
      addDetail('Remitente', request.senderName),
      addDetail('Coordenadas', `X ${request.x} · Y ${request.y}`),
      addDetail('Descripción', request.description),
      addDetail('Motivo', request.reason),
    );

    if (request.moderatorUserId) {
      details.append(addDetail('Administrador revisor', request.moderatorUserId));
    }
    if (request.moderatedAt) {
      details.append(addDetail('Fecha de revisión', formatDate(request.moderatedAt)));
    }
    if (request.moderationNote) {
      details.append(addDetail('Nota administrativa', request.moderationNote));
    }
    if (request.convertedEntityId) {
      details.append(addDetail('Borrador creado', request.convertedEntityId));
    }

    if (request.requestStatus === 'pending') {
      const noteId = `admin-public-request-note-${request.id}`;
      noteLabel.htmlFor = noteId;
      noteLabel.textContent = 'Nota administrativa (opcional)';
      note.id = noteId;
      note.maxLength = 2000;
      note.rows = 3;
      note.placeholder = 'Contexto interno de la decisión';
      note.value = moderationNoteDrafts.get(request.id) ?? '';
      note.addEventListener('input', () => {
        if (note.value) moderationNoteDrafts.set(request.id, note.value);
        else moderationNoteDrafts.delete(request.id);
      });

      const convertButton = createElement('button', 'admin-public-requests__primary');
      const rejectButton = createElement('button', 'admin-public-requests__danger');
      convertButton.type = 'button';
      convertButton.textContent = 'Convertir en borrador';
      rejectButton.type = 'button';
      rejectButton.textContent = 'Rechazar';
      const disabled = state.phase === 'mutating';
      convertButton.disabled = disabled;
      rejectButton.disabled = disabled;
      convertButton.addEventListener('click', () => {
        openConfirmation('convert', request, note.value, convertButton);
      });
      rejectButton.addEventListener('click', () => {
        openConfirmation('reject', request, note.value, rejectButton);
      });
      actions.append(convertButton, rejectButton);
      article.append(cardHeading, meta, details, noteLabel, note, actions);
    } else {
      article.append(cardHeading, meta, details);
    }

    item.append(article);
    return item;
  }

  function render(nextState: AdminPublicRequestState): void {
    state = nextState;
    section.hidden = !state.authorized;
    refresh.disabled = state.phase === 'loading' || state.phase === 'mutating' || !backendConnected;
    filter.disabled = state.phase === 'mutating';
    sort.disabled = state.phase === 'mutating';

    if (!state.authorized) {
      status.textContent = '';
      list.replaceChildren();
      return;
    }

    if (!state.backendConnected) {
      status.textContent =
        'La moderación requiere conexión con el backend antes de leer o procesar solicitudes.';
    } else if (state.phase === 'loading') {
      status.textContent = `Cargando solicitudes de ${activeCampaignLabel()}…`;
    } else if (state.phase === 'mutating') {
      status.textContent = `Procesando la solicitud de ${activeCampaignLabel()}…`;
    } else if (state.issue) {
      status.textContent = state.issue.message;
    } else if (feedback) {
      status.textContent = feedback;
    } else {
      status.textContent = `${state.records.length} solicitudes administrativas disponibles en ${activeCampaignLabel()}.`;
    }

    for (const request of state.records) {
      if (request.requestStatus !== 'pending') moderationNoteDrafts.delete(request.id);
    }
    const visible = filterAndSortAdminPublicRequests(state.records, selectedFilter, selectedSort);
    list.replaceChildren(...visible.map(renderCard));
    empty.hidden = visible.length !== 0 || state.phase === 'loading';
    empty.textContent =
      selectedFilter === 'all'
        ? `No hay solicitudes para mostrar en ${activeCampaignLabel()}.`
        : `No hay solicitudes con estado ${statusLabel(
            selectedFilter as AdminPublicRequestRecord['requestStatus'],
          ).toLowerCase()} en ${activeCampaignLabel()}.`;
  }

  const handleFilter = (): void => {
    selectedFilter = filter.value as AdminPublicRequestFilter;
    render(state);
  };
  const handleSort = (): void => {
    selectedSort = sort.value as AdminPublicRequestSort;
    render(state);
  };
  const handleRefresh = (): void => {
    feedback = '';
    void controller.reload();
  };
  const handleCancel = (): void => closeConfirmation();
  const handleConfirm = (): void => {
    const action = pendingAction;
    confirmation.hidden = true;
    pendingAction = null;
    restoreFocus = null;
    if (!action) return;

    void (async () => {
      if (action.action === 'reject') {
        const succeeded = await controller.reject(action.request, action.moderationNote);
        if (succeeded) {
          moderationNoteDrafts.delete(action.request.id);
          feedback = 'Solicitud rechazada. El historial de moderación se conserva.';
        }
        render(controller.getState());
        return;
      }

      const result = await controller.convert(action.request, action.moderationNote);
      if (!result?.draftEntityId) {
        render(controller.getState());
        return;
      }
      moderationNoteDrafts.delete(action.request.id);
      feedback =
        'Borrador creado en la campaña activa, sin categoría ni etiquetas. Debe revisarse en el editor antes de cualquier publicación.';
      render(controller.getState());
      try {
        await options.onOpenDraft?.(result.draftEntityId);
      } catch {
        feedback =
          'El borrador se creó correctamente, pero no pudo abrirse automáticamente. Recarga la lista de entidades para editarlo.';
        render(controller.getState());
      }
    })();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !confirmation.hidden) {
      event.preventDefault();
      closeConfirmation();
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

  filter.addEventListener('change', handleFilter);
  sort.addEventListener('change', handleSort);
  refresh.addEventListener('click', handleRefresh);
  confirmButton.addEventListener('click', handleConfirm);
  cancelButton.addEventListener('click', handleCancel);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('atlas:public-data-status', handlePublicDataStatus);

  const unsubscribeController = controller.subscribe(render);
  const unsubscribeAuth = authController.subscribe((authState) => {
    controller.setAccess(authState.phase === 'authorized', backendConnected);
    if (authState.phase !== 'authorized' && !confirmation.hidden) closeConfirmation();
  });
  const unsubscribeCampaign = adminCampaignContext.subscribe(() => {
    feedback = '';
    if (!confirmation.hidden) closeConfirmation();
    render(controller.getState());
  });

  return {
    destroy(): void {
      unsubscribeController();
      unsubscribeAuth();
      unsubscribeCampaign();
      moderationNoteDrafts.clear();
      filter.removeEventListener('change', handleFilter);
      sort.removeEventListener('change', handleSort);
      refresh.removeEventListener('click', handleRefresh);
      confirmButton.removeEventListener('click', handleConfirm);
      cancelButton.removeEventListener('click', handleCancel);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('atlas:public-data-status', handlePublicDataStatus);
      section.remove();
    },
  };
}
