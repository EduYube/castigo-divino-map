import L, { type LeafletMouseEvent, type Map as LeafletMap, type Marker } from 'leaflet';

import { PublicPinRequestRepositoryError } from '../data-access/publicPinRequest';
import {
  validatePublicPinRequest,
  type PublicPinRequestDraft,
  type PublicPinRequestField,
} from '../domain/publicPinRequest';
import { SupabasePublicPinRequestRepository } from '../infrastructure/supabase/publicPinRequestRepository';

const DEFAULT_COOLDOWN_MS = 60_000;
const LAST_SUCCESS_STORAGE_KEY = 'atlas:public-pin-request:last-success-at';

interface PublicPinRequestTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly cooldownMs?: number;
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

  if (!element) {
    throw new Error(`Missing required public request element: ${selector}`);
  }

  return element;
}

function resolveElements(root: ParentNode): PublicPinRequestElements {
  return {
    openButton: getRequiredElement(root, '[data-public-pin-request-open]'),
    panel: getRequiredElement(root, '[data-public-pin-request-panel]'),
    heading: getRequiredElement(root, '[data-public-pin-request-heading]'),
    closeButton: getRequiredElement(root, '[data-public-pin-request-close]'),
    form: getRequiredElement(root, '[data-public-pin-request-form]'),
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
    // A timestamp-only cooldown is an optional abuse control; submission still works without storage.
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

export function mountPublicPinRequest(
  root: ParentNode,
  map: LeafletMap,
): PublicPinRequestController {
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

  const setSelectingPosition = (value: boolean): void => {
    selectingPosition = value;
    elements.mapCanvas.dataset.publicRequestSelecting = value ? 'true' : 'false';
    elements.choosePositionButton.setAttribute('aria-pressed', value ? 'true' : 'false');
    elements.choosePositionButton.textContent = value
      ? 'Cancela la selección en el mapa'
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

  const openPanel = (): void => {
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

  function clearFieldError(field: PublicPinRequestField): void {
    const target = errorTargets[field];
    const error = elements.form.querySelector<HTMLElement>(`[data-public-pin-request-error="${field}"]`);

    target.removeAttribute('aria-invalid');
    target.removeAttribute('aria-errormessage');
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
  }

  const clearValidationErrors = (): void => {
    (Object.keys(errorTargets) as PublicPinRequestField[]).forEach(clearFieldError);
  };

  const showValidationErrors = (
    errors: Partial<Record<PublicPinRequestField, string>>,
  ): void => {
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

  const handleSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();

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
    submitController = new AbortController();
    elements.submitButton.disabled = true;
    elements.form.dataset.submitState = 'submitting';
    setStatus('Enviando la solicitud…');

    try {
      await repository.submit(validation.value, submitController.signal);
      const completedAt = Date.now();
      lastSuccessAt = completedAt;
      storeLastSuccessAt(completedAt);
      elements.form.reset();
      clearPosition();
      setStatus(
        'Solicitud enviada para revisión. No se publicará automáticamente en el mapa.',
        'success',
      );
    } catch (error) {
      if (submitController.signal.aborted) return;
      setStatus(errorMessage(error), 'error');
    } finally {
      elements.submitButton.disabled = false;
      elements.form.dataset.submitState = 'idle';
      submitController = null;
    }
  };

  elements.openButton.addEventListener('click', handleOpen);
  elements.closeButton.addEventListener('click', handleClose);
  elements.choosePositionButton.addEventListener('click', handleChoosePosition);
  elements.useCenterButton.addEventListener('click', handleUseCenter);
  elements.form.addEventListener('input', handleInput);
  elements.form.addEventListener('change', handleInput);
  elements.form.addEventListener('submit', (event) => void handleSubmit(event));
  map.on('click', handleMapClick);
  clearPosition();

  return {
    destroy(): void {
      submitController?.abort();
      selectionMarker?.removeFrom(map);
      map.off('click', handleMapClick);
      elements.openButton.removeEventListener('click', handleOpen);
      elements.closeButton.removeEventListener('click', handleClose);
      elements.choosePositionButton.removeEventListener('click', handleChoosePosition);
      elements.useCenterButton.removeEventListener('click', handleUseCenter);
      elements.form.removeEventListener('input', handleInput);
      elements.form.removeEventListener('change', handleInput);
      delete elements.mapCanvas.dataset.publicRequestSelecting;
    },
  };
}
