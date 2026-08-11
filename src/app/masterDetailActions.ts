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
  let confirmingSignature: string | null = null;
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
    confirmingSignature = null;
    savingSignature = null;
    statusSignature = null;
    statusMessage = '';
  };

  const syncActionState = (signature: string): void => {
    const action = content.querySelector<HTMLElement>('[data-master-audience-action]');
    if (!action) return;

    const start = action.querySelector<HTMLButtonElement>('[data-master-audience-start]');
    const confirmation = action.querySelector<HTMLElement>('[data-master-audience-confirmation]');
    const confirm = action.querySelector<HTMLButtonElement>('[data-master-audience-confirm]');
    const cancel = action.querySelector<HTMLButtonElement>('[data-master-audience-cancel]');
    const status = action.querySelector<HTMLElement>('[data-master-audience-status]');
    const isConfirming = confirmingSignature === signature;
    const isSaving = savingSignature === signature;

    if (start) start.hidden = isConfirming;
    if (confirmation) confirmation.hidden = !isConfirming;
    if (confirm) confirm.disabled = isSaving;
    if (cancel) cancel.disabled = isSaving;
    if (status) status.textContent = statusSignature === signature ? statusMessage : '';
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
    // Preserve an open confirmation in that case; a real close deletes data-entity-id,
    // which is handled by the fail-closed branch above on the next observer pass.
    if (panel.hidden) {
      if (renderedSignature) removeInjected();
      return;
    }

    const entityId = entityIdValue;
    const audience = resolveAudience(entityId);
    const signature = `${entityId}:${audience}`;
    if (confirmingSignature !== null && confirmingSignature !== signature) {
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
    const button = document.createElement('button');
    const confirmation = document.createElement('div');
    const warning = document.createElement('p');
    const confirmButton = document.createElement('button');
    const cancelButton = document.createElement('button');
    const status = document.createElement('p');
    const nextAudience: MapEntityAudience = audience === 'master' ? 'public' : 'master';

    section.className = 'compact-details__audience-action';
    section.dataset.masterAudienceAction = '';
    heading.className = 'compact-details__section-title';
    heading.textContent = 'Audiencia';
    description.textContent =
      audience === 'master'
        ? 'Solo una sesión administrativa con Modo Máster activo puede ver esta entidad.'
        : 'Esta entidad forma parte de la audiencia pública cuando está publicada.';
    button.type = 'button';
    button.className = 'compact-details__full-action';
    button.dataset.masterAudienceStart = '';
    button.textContent = audience === 'master' ? 'Cambiar a Público' : 'Cambiar a Solo Máster';
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
    cancelButton.type = 'button';
    cancelButton.className = 'place-details__return';
    cancelButton.dataset.masterAudienceCancel = '';
    cancelButton.textContent = 'Cancelar';
    status.className = 'compact-details__audience-status';
    status.dataset.masterAudienceStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    confirmation.append(warning, confirmButton, cancelButton);
    section.append(heading, description, button, confirmation, status);
    content.append(section);
    syncActionState(signature);
  };

  const schedule = (): void => {
    if (destroyed || frame !== null) return;
    frame = window.requestAnimationFrame(render);
  };

  const getCurrentSignature = (): { entityId: EntityId; signature: string } | null => {
    const entityIdValue = panel.dataset.entityId;
    if (!isEntityId(entityIdValue) || panel.hidden) return null;
    const audience = resolveAudience(entityIdValue);
    return { entityId: entityIdValue, signature: `${entityIdValue}:${audience}` };
  };

  const handleActionClick = async (event: MouseEvent): Promise<void> => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const start = target.closest<HTMLButtonElement>('[data-master-audience-start]');
    const confirm = target.closest<HTMLButtonElement>('[data-master-audience-confirm]');
    const cancel = target.closest<HTMLButtonElement>('[data-master-audience-cancel]');
    const actionButton = start ?? confirm ?? cancel;
    if (!actionButton || !content.contains(actionButton)) return;

    const current = getCurrentSignature();
    if (!current) return;

    if (start) {
      confirmingSignature = current.signature;
      savingSignature = null;
      statusSignature = null;
      statusMessage = '';
      syncActionState(current.signature);
      content.querySelector<HTMLButtonElement>('[data-master-audience-confirm]')?.focus();
      schedule();
      return;
    }

    if (cancel) {
      if (savingSignature === current.signature) return;
      confirmingSignature = null;
      statusSignature = current.signature;
      statusMessage = 'Cambio de audiencia cancelado.';
      syncActionState(current.signature);
      content.querySelector<HTMLButtonElement>('[data-master-audience-start]')?.focus();
      schedule();
      return;
    }

    if (!confirm || savingSignature === current.signature) return;

    const currentAudience = resolveAudience(current.entityId);
    const nextAudience: MapEntityAudience = currentAudience === 'master' ? 'public' : 'master';
    confirmingSignature = current.signature;
    savingSignature = current.signature;
    statusSignature = current.signature;
    statusMessage = 'Guardando audiencia en PostgreSQL…';
    syncActionState(current.signature);

    const saved = await controller.changeAudience(current.entityId, nextAudience);
    if (destroyed) return;

    savingSignature = null;
    if (!saved) {
      confirmingSignature = current.signature;
      statusSignature = current.signature;
      statusMessage =
        controller.getState().issue?.message ?? 'No se pudo guardar el cambio de audiencia.';
      syncActionState(current.signature);
      schedule();
      return;
    }

    confirmingSignature = null;
    statusSignature = null;
    statusMessage = '';
    schedule();
  };

  content.addEventListener('click', handleActionClick);
  const observer = new MutationObserver(schedule);
  observer.observe(content, { childList: true, subtree: true });
  const unsubscribe = controller.subscribe(schedule);
  schedule();

  return {
    refresh: schedule,
    destroy(): void {
      destroyed = true;
      clearInteractionState();
      content.removeEventListener('click', handleActionClick);
      observer.disconnect();
      unsubscribe();
      if (frame !== null) window.cancelAnimationFrame(frame);
      removeInjected();
    },
  };
}
