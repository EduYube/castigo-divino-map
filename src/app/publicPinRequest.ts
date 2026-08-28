import L, { type LeafletMouseEvent, type Map as LeafletMap, type Marker } from 'leaflet';

import { PublicPinRequestRepositoryError } from '../data-access/publicPinRequest';
import {
  validatePublicPinRequest,
  type PublicPinRequestDraft,
  type PublicPinRequestField,
} from '../domain/publicPinRequest';
import { SupabasePublicPinRequestRepository } from '../infrastructure/supabase/publicPinRequestRepository';
import { getCurrentPublicCampaignSelection } from './campaignSelection';

const DEFAULT_COOLDOWN_MS = 60_000;
const LAST_SUCCESS_STORAGE_KEY = 'atlas:public-pin-request:last-success-at';
const CAMPAIGN_WILL_CHANGE_EVENT = 'atlas:campaign-will-change';

interface PublicPinRequestTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly cooldownMs?: number;
}

interface PublicRequestCampaignTarget {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

interface CampaignWillChangeDetail {
  readonly fromCampaignId: string;
  readonly fromCampaignSlug: string;
  readonly toCampaignId: string;
  readonly toCampaignSlug: string;
}

declare global {
  interface Window {
    __MAP026_PUBLIC_REQUEST_TEST_CONFIG__?: PublicPinRequestTestConfig;
  }
}

export interface PublicPinRequestController {
  destroy(): void;
}

interface PublicPinRequestElements {
  readonly openButton: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly heading: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  readonly form: HTMLFormElement;
  readonly campaignTarget: HTMLElement;
  readonly campaignTargetName: HTMLElement;
  readonly campaignChangePrompt: HTMLElement;
  readonly campaignChangeText: HTMLElement;
  readonly campaignKeepButton: HTMLButtonElement;
  readonly campaignMoveButton: HTMLButtonElement;
  readonly senderName: HTMLInputElement;
  readonly proposedName: HTMLInputElement;
  readonly entityType: HTMLSelectElement;
  readonly description: HTMLTextAreaElement;
  readonly reason: HTMLTextAreaElement;
  readonly honeypot: HTMLInputElement;
  readonly choosePositionButton: HTMLButtonElement;
  readonly useCenterButton: HTMLButtonElement;
  readonly positionOutput: HTMLOutputElement;
  readonly submitButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly mapCanvas: HTMLElement;
}

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required public request element: ${selector}`);
  return element;
}

function ensurePublicPinRequestMarkup(root: ParentNode): void {
  if (root.querySelector('[data-public-pin-request-panel]')) return;

  const mapHeading = getRequiredElement<HTMLElement>(root, '.map-experience__heading');
  const mapWorkspace = getRequiredElement<HTMLElement>(root, '[data-map-workspace]');
  const openButton = document.createElement('button');
  const panel = document.createElement('section');

  openButton.type = 'button';
  openButton.className = 'public-pin-request__open';
  openButton.dataset.publicPinRequestOpen = '';
  openButton.setAttribute('aria-expanded', 'false');
  openButton.setAttribute('aria-controls', 'public-pin-request-panel');
  openButton.textContent = 'Proponer un pin';
  mapHeading.append(openButton);

  panel.id = 'public-pin-request-panel';
  panel.className = 'public-pin-request';
  panel.dataset.publicPinRequestPanel = '';
  panel.setAttribute('aria-labelledby', 'public-pin-request-heading');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="public-pin-request__header">
      <div>
        <p class="eyebrow">Solicitud pública</p>
        <h3 id="public-pin-request-heading" data-public-pin-request-heading tabindex="-1">
          Proponer un nuevo pin
        </h3>
      </div>
      <button
        class="public-pin-request__close"
        data-public-pin-request-close
        type="button"
        aria-label="Cerrar el formulario de solicitud"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
    <p class="public-pin-request__lead">
      Elige una posición del mapa y describe tu propuesta. La solicitud queda pendiente de revisión:
      nunca crea ni publica un pin automáticamente.
    </p>
    <p id="public-pin-request-privacy" class="public-pin-request__privacy">
      Guardamos tu nombre o apodo y el contenido de esta solicitud exclusivamente para moderarla.
      Otros visitantes no pueden leer estos datos. No incluyas correo, teléfono ni otros datos
      personales. Si el envío falla, el formulario permanece en esta página para que puedas
      corregirlo o reintentarlo; sus campos no se guardan en el almacenamiento del navegador.
    </p>
    <form
      class="public-pin-request__form"
      data-public-pin-request-form
      data-submit-state="idle"
      novalidate
      aria-describedby="public-pin-request-privacy public-pin-request-campaign-target public-pin-request-status"
    >
      <div
        id="public-pin-request-campaign-target"
        class="public-pin-request__campaign-target public-pin-request__field--wide"
        data-public-pin-request-campaign-target
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>Campaña destinataria:</strong>
        <span data-public-pin-request-campaign-target-name></span>
        <span>Esta propuesta se enviará únicamente a esa campaña.</span>
      </div>

      <div
        class="public-pin-request__campaign-change public-pin-request__field--wide"
        data-public-pin-request-campaign-change
        role="group"
        aria-labelledby="public-pin-request-campaign-change-text"
        hidden
      >
        <p id="public-pin-request-campaign-change-text" data-public-pin-request-campaign-change-text></p>
        <div class="public-pin-request__campaign-change-actions">
          <button type="button" data-public-pin-request-campaign-keep></button>
          <button type="button" data-public-pin-request-campaign-move></button>
        </div>
      </div>

      <div class="public-pin-request__field">
        <label for="public-pin-request-sender">Nombre o apodo</label>
        <input
          id="public-pin-request-sender"
          data-public-pin-request-sender
          data-public-pin-request-field="senderName"
          name="sender-name"
          type="text"
          maxlength="80"
          autocomplete="nickname"
          required
        />
        <p id="public-pin-request-sender-error" class="public-pin-request__error" data-public-pin-request-error="senderName" hidden></p>
      </div>

      <div class="public-pin-request__field">
        <label for="public-pin-request-name">Nombre propuesto del pin</label>
        <input
          id="public-pin-request-name"
          data-public-pin-request-name
          data-public-pin-request-field="proposedName"
          name="proposed-name"
          type="text"
          maxlength="160"
          autocomplete="off"
          required
        />
        <p id="public-pin-request-name-error" class="public-pin-request__error" data-public-pin-request-error="proposedName" hidden></p>
      </div>

      <div class="public-pin-request__field">
        <label for="public-pin-request-type">Tipo de pin</label>
        <select
          id="public-pin-request-type"
          data-public-pin-request-type
          data-public-pin-request-field="entityType"
          name="entity-type"
          required
        >
          <option value="">Elige un tipo</option>
          <option value="character">Personaje</option>
          <option value="location">Emplazamiento</option>
        </select>
        <p class="public-pin-request__hint">La lista es cerrada; no se pueden proponer categorías ni etiquetas.</p>
        <p id="public-pin-request-type-error" class="public-pin-request__error" data-public-pin-request-error="entityType" hidden></p>
      </div>

      <fieldset class="public-pin-request__field public-pin-request__position-field">
        <legend>Posición en el mapa</legend>
        <p class="public-pin-request__hint">
          Puedes señalarla con ratón o toque. Si navegas con teclado, usa el centro visible del mapa.
        </p>
        <div class="public-pin-request__position-actions">
          <button type="button" data-public-pin-request-choose-position data-public-pin-request-field="position" aria-pressed="false">
            Elegir posición en el mapa
          </button>
          <button type="button" data-public-pin-request-use-center>Usar el centro visible</button>
        </div>
        <output class="public-pin-request__position" data-public-pin-request-position aria-live="polite" aria-atomic="true"></output>
        <p id="public-pin-request-position-error" class="public-pin-request__error" data-public-pin-request-error="position" hidden></p>
      </fieldset>

      <div class="public-pin-request__field public-pin-request__field--wide">
        <label for="public-pin-request-description">Descripción</label>
        <textarea
          id="public-pin-request-description"
          data-public-pin-request-description
          data-public-pin-request-field="description"
          name="description"
          rows="5"
          maxlength="2000"
          required
        ></textarea>
        <p class="public-pin-request__hint">Máximo 2000 caracteres.</p>
        <p id="public-pin-request-description-error" class="public-pin-request__error" data-public-pin-request-error="description" hidden></p>
      </div>

      <div class="public-pin-request__field public-pin-request__field--wide">
        <label for="public-pin-request-reason">Motivo de la solicitud</label>
        <textarea
          id="public-pin-request-reason"
          data-public-pin-request-reason
          data-public-pin-request-field="reason"
          name="reason"
          rows="4"
          maxlength="1000"
          required
        ></textarea>
        <p class="public-pin-request__hint">Máximo 1000 caracteres.</p>
        <p id="public-pin-request-reason-error" class="public-pin-request__error" data-public-pin-request-error="reason" hidden></p>
      </div>

      <div class="public-pin-request__trap" aria-hidden="true">
        <label for="public-pin-request-contact">Deja este campo vacío</label>
        <input id="public-pin-request-contact" data-public-pin-request-honeypot name="contact" type="text" tabindex="-1" autocomplete="off" />
      </div>

      <p
        id="public-pin-request-status"
        class="public-pin-request__status public-pin-request__field--wide"
        data-public-pin-request-status
        data-status-kind="neutral"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      ></p>
      <div class="public-pin-request__actions public-pin-request__field--wide">
        <button class="public-pin-request__submit" data-public-pin-request-submit type="submit">
          Enviar solicitud para revisión
        </button>
      </div>
    </form>
  `;
  mapWorkspace.before(panel);
}

function resolveElements(root: ParentNode): PublicPinRequestElements {
  return {
    openButton: getRequiredElement(root, '[data-public-pin-request-open]'),
    panel: getRequiredElement(root, '[data-public-pin-request-panel]'),
    heading: getRequiredElement(root, '[data-public-pin-request-heading]'),
    closeButton: getRequiredElement(root, '[data-public-pin-request-close]'),
    form: getRequiredElement(root, '[data-public-pin-request-form]'),
    campaignTarget: getRequiredElement(root, '[data-public-pin-request-campaign-target]'),
    campaignTargetName: getRequiredElement(root, '[data-public-pin-request-campaign-target-name]'),
    campaignChangePrompt: getRequiredElement(root, '[data-public-pin-request-campaign-change]'),
    campaignChangeText: getRequiredElement(root, '[data-public-pin-request-campaign-change-text]'),
    campaignKeepButton: getRequiredElement(root, '[data-public-pin-request-campaign-keep]'),
    campaignMoveButton: getRequiredElement(root, '[data-public-pin-request-campaign-move]'),
    senderName: getRequiredElement(root, '[data-public-pin-request-sender]'),
    proposedName: getRequiredElement(root, '[data-public-pin-request-name]'),
    entityType: getRequiredElement(root, '[data-public-pin-request-type]'),
    description: getRequiredElement(root, '[data-public-pin-request-description]'),
    reason: getRequiredElement(root, '[data-public-pin-request-reason]'),
    honeypot: getRequiredElement(root, '[data-public-pin-request-honeypot]'),
    choosePositionButton: getRequiredElement(root, '[data-public-pin-request-choose-position]'),
    useCenterButton: getRequiredElement(root, '[data-public-pin-request-use-center]'),
    positionOutput: getRequiredElement(root, '[data-public-pin-request-position]'),
    submitButton: getRequiredElement(root, '[data-public-pin-request-submit]'),
    status: getRequiredElement(root, '[data-public-pin-request-status]'),
    mapCanvas: getRequiredElement(root, '[data-map-canvas]'),
  };
}

function resolveTestConfig(): PublicPinRequestTestConfig | undefined {
  return import.meta.env.DEV ? window.__MAP026_PUBLIC_REQUEST_TEST_CONFIG__ : undefined;
}

function readLastSuccessAt(): number | null {
  try {
    const parsed = Number(window.sessionStorage.getItem(LAST_SUCCESS_STORAGE_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function storeLastSuccessAt(value: number): void {
  try {
    window.sessionStorage.setItem(LAST_SUCCESS_STORAGE_KEY, String(value));
  } catch {
    // The timestamp-only cooldown is optional; request submission still works without storage.
  }
}

function createSelectionMarker(): L.DivIcon {
  return L.divIcon({
    className: 'public-request-position-marker',
    html: '<span aria-hidden="true">✚</span>',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function errorMessage(error: unknown): string {
  if (!(error instanceof PublicPinRequestRepositoryError)) {
    return 'No se pudo enviar la solicitud. Los datos siguen en el formulario para que puedas intentarlo de nuevo.';
  }

  switch (error.kind) {
    case 'configuration':
      return 'El envío de solicitudes no está disponible con la configuración actual. Los datos siguen en el formulario.';
    case 'network':
    case 'server':
    case 'invalid-response':
      return 'No se pudo confirmar el envío por un problema de red o del servicio. Los datos siguen en el formulario para que puedas reintentarlo.';
    case 'rate-limited':
      return 'Hay demasiados intentos de envío. Espera un poco antes de reintentarlo; los datos siguen en el formulario.';
    case 'rejected':
      return 'El servidor rechazó la solicitud. Revisa los datos antes de intentarlo de nuevo; el formulario se ha conservado.';
  }
}

function resolveCampaignName(root: ParentNode, slug: string): string {
  const selector = root.querySelector<HTMLSelectElement>('[data-campaign-select]');
  const option = Array.from(selector?.options ?? []).find((candidate) => candidate.value === slug);
  return option?.textContent?.trim() || slug;
}

function resolveCampaignTarget(root: ParentNode): PublicRequestCampaignTarget {
  const selection = getCurrentPublicCampaignSelection();
  return {
    id: selection.id,
    slug: selection.slug,
    name: resolveCampaignName(root, selection.slug),
  };
}

export function mountPublicPinRequest(
  root: ParentNode,
  map: LeafletMap,
): PublicPinRequestController {
  ensurePublicPinRequestMarkup(root);
  const elements = resolveElements(root);
  const testConfig = resolveTestConfig();
  const cooldownMs = testConfig?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const projectUrl = testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const publishableKey =
    testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  let repository: SupabasePublicPinRequestRepository | null = null;
  let repositoryConfigurationError: unknown = null;
  let selectedX: number | null = null;
  let selectedY: number | null = null;
  let selectionMarker: Marker | null = null;
  let selectingPosition = false;
  let lastSuccessAt = readLastSuccessAt();
  let submitController: AbortController | null = null;
  let requestCampaign = resolveCampaignTarget(root);
  let pendingCampaign: PublicRequestCampaignTarget | null = null;

  try {
    repository = new SupabasePublicPinRequestRepository({
      projectUrl,
      publishableKey,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    repositoryConfigurationError = error;
  }

  const errorTargets: Readonly<Record<PublicPinRequestField, HTMLElement>> = {
    senderName: elements.senderName,
    proposedName: elements.proposedName,
    entityType: elements.entityType,
    position: elements.choosePositionButton,
    description: elements.description,
    reason: elements.reason,
  };

  const setStatus = (message: string, kind: 'neutral' | 'success' | 'error' = 'neutral'): void => {
    elements.status.textContent = message;
    elements.status.dataset.statusKind = kind;
  };

  const renderCampaignTarget = (): void => {
    elements.campaignTargetName.textContent = `${requestCampaign.name}. `;
    elements.campaignTarget.dataset.campaignId = requestCampaign.id;
    elements.campaignTarget.dataset.campaignSlug = requestCampaign.slug;
  };

  const hideCampaignChangePrompt = (): void => {
    pendingCampaign = null;
    elements.campaignChangePrompt.hidden = true;
    elements.campaignChangeText.textContent = '';
    elements.campaignKeepButton.textContent = '';
    elements.campaignMoveButton.textContent = '';
  };

  const renderCampaignChangePrompt = (): void => {
    if (!pendingCampaign) {
      hideCampaignChangePrompt();
      return;
    }
    elements.campaignChangeText.textContent =
      `Has cambiado el mapa a ${pendingCampaign.name}, pero este borrador sigue destinado a ${requestCampaign.name}. ` +
      'Elige qué campaña debe recibirlo; tus datos no se modificarán.';
    elements.campaignKeepButton.textContent = `Conservar borrador en ${requestCampaign.name}`;
    elements.campaignMoveButton.textContent = `Mover borrador a ${pendingCampaign.name}`;
    elements.campaignChangePrompt.hidden = false;
  };

  const isDraftDirty = (): boolean =>
    elements.senderName.value.trim().length > 0 ||
    elements.proposedName.value.trim().length > 0 ||
    elements.entityType.value.length > 0 ||
    elements.description.value.trim().length > 0 ||
    elements.reason.value.trim().length > 0 ||
    elements.honeypot.value.length > 0 ||
    selectedX !== null ||
    selectedY !== null;

  const setSelectingPosition = (value: boolean): void => {
    selectingPosition = value;
    elements.mapCanvas.dataset.publicRequestSelecting = value ? 'true' : 'false';
    elements.choosePositionButton.setAttribute('aria-pressed', value ? 'true' : 'false');
    elements.choosePositionButton.textContent = value
      ? 'Cancelar selección en el mapa'
      : 'Elegir posición en el mapa';

    if (value) {
      setStatus(
        'Modo de selección activo. Toca o haz clic en el mapa. Con teclado puedes usar el centro visible.',
      );
    }
  };

  const clearPosition = (): void => {
    selectedX = null;
    selectedY = null;
    selectionMarker?.removeFrom(map);
    selectionMarker = null;
    elements.positionOutput.textContent = 'Todavía no has elegido una posición.';
    delete elements.positionOutput.dataset.x;
    delete elements.positionOutput.dataset.y;
  };

  function clearFieldError(field: PublicPinRequestField): void {
    const target = errorTargets[field];
    const error = elements.form.querySelector<HTMLElement>(
      `[data-public-pin-request-error="${field}"]`,
    );
    target.removeAttribute('aria-invalid');
    target.removeAttribute('aria-errormessage');
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
  }

  const setPosition = (x: number, y: number, source: 'map' | 'center'): void => {
    selectedX = x;
    selectedY = y;
    selectionMarker?.removeFrom(map);
    selectionMarker = L.marker(L.latLng(y, x), {
      icon: createSelectionMarker(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 2500,
    }).addTo(map);
    elements.positionOutput.dataset.x = String(x);
    elements.positionOutput.dataset.y = String(y);
    elements.positionOutput.textContent = `Posición seleccionada: x ${formatCoordinate(x)}, y ${formatCoordinate(y)}.`;
    setSelectingPosition(false);
    setStatus(
      source === 'map'
        ? 'Posición seleccionada en el mapa. Puedes volver a elegirla antes de enviar.'
        : 'Se ha usado el centro visible del mapa. Puedes corregir la posición antes de enviar.',
    );
    clearFieldError('position');
  };

  const syncEmptyDraftToCurrentCampaign = (): void => {
    if (isDraftDirty()) return;
    requestCampaign = resolveCampaignTarget(root);
    hideCampaignChangePrompt();
    renderCampaignTarget();
  };

  const openPanel = (): void => {
    syncEmptyDraftToCurrentCampaign();
    elements.panel.hidden = false;
    elements.openButton.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => elements.heading.focus({ preventScroll: true }));
  };

  const closePanel = (): void => {
    setSelectingPosition(false);
    elements.panel.hidden = true;
    elements.openButton.setAttribute('aria-expanded', 'false');
    elements.openButton.focus({ preventScroll: true });
  };

  const clearValidationErrors = (): void => {
    (Object.keys(errorTargets) as PublicPinRequestField[]).forEach(clearFieldError);
  };

  const showValidationErrors = (errors: Partial<Record<PublicPinRequestField, string>>): void => {
    clearValidationErrors();
    const orderedFields: readonly PublicPinRequestField[] = [
      'senderName',
      'proposedName',
      'entityType',
      'position',
      'description',
      'reason',
    ];
    let firstInvalid: HTMLElement | null = null;

    for (const field of orderedFields) {
      const message = errors[field];
      if (!message) continue;
      const target = errorTargets[field];
      const error = elements.form.querySelector<HTMLElement>(
        `[data-public-pin-request-error="${field}"]`,
      );
      if (!error) continue;
      error.textContent = message;
      error.hidden = false;
      target.setAttribute('aria-invalid', 'true');
      target.setAttribute('aria-errormessage', error.id);
      firstInvalid ??= target;
    }

    setStatus('Revisa los campos indicados antes de enviar.', 'error');
    firstInvalid?.focus({ preventScroll: false });
  };

  const handleMapClick = (event: LeafletMouseEvent): void => {
    if (!selectingPosition) return;
    setPosition(event.latlng.lng, event.latlng.lat, 'map');
  };

  const handleOpen = (): void => openPanel();
  const handleClose = (): void => closePanel();
  const handleChoosePosition = (): void => setSelectingPosition(!selectingPosition);
  const handleUseCenter = (): void => {
    const center = map.getCenter();
    setPosition(center.lng, center.lat, 'center');
  };
  const handleInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.dataset.publicPinRequestField as PublicPinRequestField | undefined;
    if (field) clearFieldError(field);
  };

  const handleCampaignWillChange = (event: Event): void => {
    const detail = (event as CustomEvent<CampaignWillChangeDetail>).detail;
    if (!detail?.toCampaignId || !detail.toCampaignSlug) return;

    if (detail.toCampaignId === requestCampaign.id) {
      hideCampaignChangePrompt();
      return;
    }

    const nextCampaign: PublicRequestCampaignTarget = {
      id: detail.toCampaignId,
      slug: detail.toCampaignSlug,
      name: resolveCampaignName(root, detail.toCampaignSlug),
    };

    if (!isDraftDirty()) {
      requestCampaign = nextCampaign;
      hideCampaignChangePrompt();
      renderCampaignTarget();
      if (!elements.panel.hidden) {
        setStatus(`La propuesta vacía ahora está destinada a ${nextCampaign.name}.`);
      }
      return;
    }

    pendingCampaign = nextCampaign;
    renderCampaignChangePrompt();
    setStatus(
      `El borrador sigue destinado a ${requestCampaign.name}. Confirma si quieres moverlo a ${nextCampaign.name}.`,
    );
  };

  const handleKeepCampaign = (): void => {
    const keptCampaign = requestCampaign;
    hideCampaignChangePrompt();
    setStatus(
      `Borrador conservado en ${keptCampaign.name}. El cambio del mapa no ha cambiado el destino de la solicitud.`,
    );
  };

  const handleMoveCampaign = (): void => {
    if (!pendingCampaign) return;
    requestCampaign = pendingCampaign;
    hideCampaignChangePrompt();
    renderCampaignTarget();
    setStatus(`Borrador movido a ${requestCampaign.name}. Tus datos se han conservado.`);
  };

  const handleSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();

    if (pendingCampaign) {
      setStatus(
        `Antes de enviar, decide si el borrador permanece en ${requestCampaign.name} o se mueve a ${pendingCampaign.name}.`,
        'error',
      );
      elements.campaignKeepButton.focus({ preventScroll: false });
      return;
    }

    const draft: PublicPinRequestDraft = {
      senderName: elements.senderName.value,
      proposedName: elements.proposedName.value,
      entityType: elements.entityType.value,
      x: selectedX,
      y: selectedY,
      description: elements.description.value,
      reason: elements.reason.value,
      honeypot: elements.honeypot.value,
    };
    const validation = validatePublicPinRequest(draft);

    if (!validation.ok) {
      showValidationErrors(validation.errors);
      return;
    }

    clearValidationErrors();
    const now = Date.now();
    const remainingCooldown =
      lastSuccessAt === null ? 0 : Math.max(0, cooldownMs - (now - lastSuccessAt));

    if (remainingCooldown > 0) {
      setStatus(
        `Espera ${Math.ceil(remainingCooldown / 1000)} segundos antes de enviar otra solicitud desde esta pestaña.`,
        'error',
      );
      return;
    }

    if (!repository) {
      setStatus(errorMessage(repositoryConfigurationError), 'error');
      return;
    }

    submitController?.abort();
    const controller = new AbortController();
    submitController = controller;
    elements.submitButton.disabled = true;
    elements.form.dataset.submitState = 'submitting';
    setStatus(`Enviando la solicitud a ${requestCampaign.name}…`);

    try {
      await repository.submit(validation.value, requestCampaign.id, controller.signal);
      const completedAt = Date.now();
      lastSuccessAt = completedAt;
      storeLastSuccessAt(completedAt);
      elements.form.reset();
      clearPosition();
      requestCampaign = resolveCampaignTarget(root);
      hideCampaignChangePrompt();
      renderCampaignTarget();
      setStatus(
        `Solicitud enviada a ${requestCampaign.name} para revisión. No se publicará automáticamente en el mapa.`,
        'success',
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(errorMessage(error), 'error');
    } finally {
      if (submitController === controller) {
        elements.submitButton.disabled = false;
        elements.form.dataset.submitState = 'idle';
        submitController = null;
      }
    }
  };
  const handleSubmitEvent = (event: SubmitEvent): void => void handleSubmit(event);

  elements.openButton.addEventListener('click', handleOpen);
  elements.closeButton.addEventListener('click', handleClose);
  elements.choosePositionButton.addEventListener('click', handleChoosePosition);
  elements.useCenterButton.addEventListener('click', handleUseCenter);
  elements.campaignKeepButton.addEventListener('click', handleKeepCampaign);
  elements.campaignMoveButton.addEventListener('click', handleMoveCampaign);
  elements.form.addEventListener('input', handleInput);
  elements.form.addEventListener('change', handleInput);
  elements.form.addEventListener('submit', handleSubmitEvent);
  window.addEventListener(CAMPAIGN_WILL_CHANGE_EVENT, handleCampaignWillChange);
  map.on('click', handleMapClick);
  clearPosition();
  renderCampaignTarget();

  return {
    destroy(): void {
      submitController?.abort();
      selectionMarker?.removeFrom(map);
      map.off('click', handleMapClick);
      elements.openButton.removeEventListener('click', handleOpen);
      elements.closeButton.removeEventListener('click', handleClose);
      elements.choosePositionButton.removeEventListener('click', handleChoosePosition);
      elements.useCenterButton.removeEventListener('click', handleUseCenter);
      elements.campaignKeepButton.removeEventListener('click', handleKeepCampaign);
      elements.campaignMoveButton.removeEventListener('click', handleMoveCampaign);
      elements.form.removeEventListener('input', handleInput);
      elements.form.removeEventListener('change', handleInput);
      elements.form.removeEventListener('submit', handleSubmitEvent);
      window.removeEventListener(CAMPAIGN_WILL_CHANGE_EVENT, handleCampaignWillChange);
      delete elements.mapCanvas.dataset.publicRequestSelecting;
    },
  };
}
