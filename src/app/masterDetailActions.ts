import type { AdminMapEntityController } from '../application/adminMapEntityController';
import { getMapEntityAudience, type MapEntityAudience } from '../domain/adminMapEntities';
import type { EntityId } from '../data/beta02-model';

export interface MasterDetailActionsOptions {
  readonly getMasterEntityIds: () => ReadonlySet<EntityId>;
  // Kept for call-site compatibility while MAP-044 is in Draft. The detail action does
  // not invoke this callback; controller state is the single source of refresh events.
  readonly onAudienceChanged?: (entityId: EntityId, audience: MapEntityAudience) => Promise<void>;
}

export interface MasterDetailActionsController {
  refresh(): void;
  destroy(): void;
}

function isEntityId(value: string | undefined): value is EntityId {
  return Boolean(value && /^(?:entity|place)-/.test(value));
}

export function mountMasterDetailActions(
  root: ParentNode,
  controller: AdminMapEntityController,
  options: MasterDetailActionsOptions,
): MasterDetailActionsController {
  const panel = root.querySelector<HTMLElement>('[data-place-details]');
  const content = root.querySelector<HTMLElement>('[data-place-details-content]');
  if (!panel || !content) throw new Error('Missing compact details for MAP-044 audience actions.');

  let frame: number | null = null;
  let destroyed = false;
  let renderedSignature = '';
  let openConfirmationSignature: string | null = null;
  let savingSignature: string | null = null;
  let statusSignature: string | null = null;
  let statusMessage = '';

  const resolveAudience = (entityId: EntityId): MapEntityAudience => {
    if (options.getMasterEntityIds().has(entityId)) return 'master';
    const adminRecord = controller.getState().records.find(({ id }) => id === entityId);
    return adminRecord ? getMapEntityAudience(adminRecord) : 'public';
  };

  const removeInjected = (): void => {
    content.querySelector<HTMLElement>('[data-master-detail-badge]')?.remove();
    content.querySelector<HTMLElement>('[data-master-audience-action]')?.remove();
    renderedSignature = '';
  };

  const clearInteractionState = (): void => {
    openConfirmationSignature = null;
    savingSignature = null;
    statusSignature = null;
    statusMessage = '';
  };

  const syncActionState = (signature: string): void => {
    const action = content.querySelector<HTMLElement>('[data-master-audience-action]');
    if (!action) return;

    const disclosure = action.querySelector<HTMLDetailsElement>(
      '[data-master-audience-disclosure]',
    );
    const summary = action.querySelector<HTMLElement>('[data-master-audience-start]');
    const confirm = action.querySelector<HTMLButtonElement>('[data-master-audience-confirm]');
    const status = action.querySelector<HTMLElement>('[data-master-audience-status]');
    if (!disclosure || !summary || !confirm || !status) return;

    const shouldBeOpen = openConfirmationSignature === signature;
    const isSaving = savingSignature === signature;
    const startLabel = disclosure.dataset.startLabel ?? 'Cambiar audiencia';
    const summaryLabel = shouldBeOpen ? 'Cancelar' : startLabel;
    const nextStatus = statusSignature === signature ? statusMessage : '';

    if (disclosure.open !== shouldBeOpen) disclosure.open = shouldBeOpen;
    if (summary.textContent !== summaryLabel) summary.textContent = summaryLabel;
    if (summary.getAttribute('aria-label') !== summaryLabel) {
      summary.setAttribute('aria-label', summaryLabel);
    }
    confirm.disabled = isSaving;
    summary.setAttribute('aria-disabled', isSaving ? 'true' : 'false');
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
  };

  const render = (): void => {
    frame = null;
    if (destroyed) return;

    const state = controller.getState();
    const entityIdValue = panel.dataset.entityId;
    if (
      !isEntityId(entityIdValue) ||
      !state.authorized ||
      !state.backendConnected ||
      state.phase === 'blocked'
    ) {
      clearInteractionState();
      if (renderedSignature) removeInjected();
      return;
    }

    // Compact details can transiently hide while the same entity is being redrawn.
    // Preserve a native disclosure in that case; a real close deletes data-entity-id,
    // which is handled by the fail-closed branch above on the next observer pass.
    if (panel.hidden) {
      if (renderedSignature) removeInjected();
      return;
    }

    const entityId = entityIdValue;
    const audience = resolveAudience(entityId);
    const signature = `${entityId}:${audience}`;
    if (
      (openConfirmationSignature !== null && openConfirmationSignature !== signature) ||
      (savingSignature !== null && savingSignature !== signature)
    ) {
      clearInteractionState();
    }

    const existingAction = content.querySelector<HTMLElement>('[data-master-audience-action]');
    if (renderedSignature === signature && existingAction) {
      syncActionState(signature);
      return;
    }
    removeInjected();
    renderedSignature = signature;

    if (audience === 'master') {
      const badge = document.createElement('p');
      badge.className = 'compact-details__master-badge';
      badge.dataset.masterDetailBadge = '';
      badge.textContent = 'Contenido del Máster';
      badge.setAttribute('role', 'status');
      content.prepend(badge);
    }

    const section = document.createElement('section');
    const heading = document.createElement('h4');
    const description = document.createElement('p');
    const disclosure = document.createElement('details');
    const summary = document.createElement('summary');
    const confirmation = document.createElement('div');
    const warning = document.createElement('p');
    const confirmButton = document.createElement('button');
    const status = document.createElement('p');
    const nextAudience: MapEntityAudience = audience === 'master' ? 'public' : 'master';
    const startLabel = audience === 'master' ? 'Cambiar a Público' : 'Cambiar a Solo Máster';

    section.className = 'compact-details__audience-action';
    section.dataset.masterAudienceAction = '';
    heading.className = 'compact-details__section-title';
    heading.textContent = 'Audiencia';
    description.textContent =
      audience === 'master'
        ? 'Solo una sesión administrativa con Modo Máster activo puede ver esta entidad.'
        : 'Esta entidad forma parte de la audiencia pública cuando está publicada.';

    disclosure.className = 'compact-details__audience-disclosure';
    disclosure.dataset.masterAudienceDisclosure = '';
    disclosure.dataset.startLabel = startLabel;
    disclosure.open = openConfirmationSignature === signature;

    summary.className = 'compact-details__full-action compact-details__audience-summary';
    summary.dataset.masterAudienceStart = '';
    summary.textContent = disclosure.open ? 'Cancelar' : startLabel;
    summary.setAttribute('aria-label', disclosure.open ? 'Cancelar' : startLabel);

    confirmation.className = 'compact-details__audience-confirmation';
    confirmation.dataset.masterAudienceConfirmation = '';
    warning.id = `master-audience-warning-${entityId}`;
    warning.textContent =
      nextAudience === 'master'
        ? 'Al confirmar, esta entidad dejará de salir de nuevas consultas públicas y se revocará de inmediato en esta sesión incluso si el refresh cae a un fallback antiguo. Si ya fue pública, el cambio no puede borrar copias previamente entregadas ni convertir ese contenido histórico en un secreto fuerte; para confidencialidad fuerte crea una entidad nueva que nunca haya sido pública.'
        : 'Al confirmar, si la entidad está publicada volverá a ser visible y buscable para jugadores y podrá entrar en el próximo snapshot público.';
    confirmButton.type = 'button';
    confirmButton.className = 'compact-details__full-action';
    confirmButton.dataset.masterAudienceConfirm = '';
    confirmButton.textContent = 'Confirmar cambio de audiencia';
    confirmButton.setAttribute('aria-describedby', warning.id);
    status.className = 'compact-details__audience-status';
    status.dataset.masterAudienceStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    confirmation.append(warning, confirmButton);
    disclosure.append(summary, confirmation);
    section.append(heading, description, disclosure, status);
    content.append(section);

    disclosure.addEventListener('toggle', () => {
      if (destroyed) return;
      if (savingSignature === signature && !disclosure.open) {
        disclosure.open = true;
        return;
      }

      openConfirmationSignature = disclosure.open ? signature : null;
      if (!disclosure.open) {
        statusSignature = signature;
        statusMessage = 'Cambio de audiencia cancelado.';
      } else {
        statusSignature = null;
        statusMessage = '';
      }
      syncActionState(signature);
      if (disclosure.open) confirmButton.focus();
    });

    confirmButton.addEventListener('click', async () => {
      if (savingSignature === signature) return;

      openConfirmationSignature = signature;
      savingSignature = signature;
      statusSignature = signature;
      statusMessage = 'Guardando audiencia en PostgreSQL…';
      syncActionState(signature);

      const saved = await controller.changeAudience(entityId, nextAudience);
      if (destroyed) return;

      savingSignature = null;
      if (!saved) {
        openConfirmationSignature = signature;
        statusSignature = signature;
        statusMessage =
          controller.getState().issue?.message ?? 'No se pudo guardar el cambio de audiencia.';
        syncActionState(signature);
        return;
      }

      openConfirmationSignature = null;
      statusSignature = null;
      statusMessage = '';
      schedule();
    });

    syncActionState(signature);
  };

  const schedule = (): void => {
    if (destroyed || frame !== null) return;
    frame = window.requestAnimationFrame(render);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(content, { childList: true, subtree: true });
  const unsubscribe = controller.subscribe(schedule);
  schedule();

  return {
    refresh: schedule,
    destroy(): void {
      destroyed = true;
      clearInteractionState();
      observer.disconnect();
      unsubscribe();
      if (frame !== null) window.cancelAnimationFrame(frame);
      removeInjected();
    },
  };
}
