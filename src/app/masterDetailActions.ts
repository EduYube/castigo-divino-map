import type { AdminMapEntityController } from '../application/adminMapEntityController';
import { getMapEntityAudience, type MapEntityAudience } from '../domain/adminMapEntities';
import type { EntityId } from '../data/beta02-model';

export interface MasterDetailActionsOptions {
  readonly getMasterEntityIds: () => ReadonlySet<EntityId>;
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

  const render = (): void => {
    frame = null;
    if (destroyed) return;

    const state = controller.getState();
    const entityIdValue = panel.dataset.entityId;
    if (
      panel.hidden ||
      !isEntityId(entityIdValue) ||
      !state.authorized ||
      !state.backendConnected ||
      state.phase === 'blocked'
    ) {
      if (renderedSignature) removeInjected();
      return;
    }

    const entityId = entityIdValue;
    const audience = resolveAudience(entityId);
    const signature = `${entityId}:${audience}:${state.phase}`;
    const existingAction = content.querySelector<HTMLElement>('[data-master-audience-action]');
    if (renderedSignature === signature && existingAction) return;
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
    confirmation.hidden = true;
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

    button.addEventListener('click', () => {
      button.hidden = true;
      confirmation.hidden = false;
      confirmButton.focus();
    });
    cancelButton.addEventListener('click', () => {
      confirmation.hidden = true;
      button.hidden = false;
      status.textContent = 'Cambio de audiencia cancelado.';
      button.focus();
    });
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      cancelButton.disabled = true;
      status.textContent = 'Guardando audiencia en PostgreSQL…';
      const saved = await controller.changeAudience(entityId, nextAudience);
      if (!saved) {
        confirmButton.disabled = false;
        cancelButton.disabled = false;
        const issue = controller.getState().issue;
        status.textContent = issue?.message ?? 'No se pudo guardar el cambio de audiencia.';
        return;
      }
      status.textContent =
        'Audiencia guardada. El runtime actualizará mapa y búsquedas desde el cambio del controlador.';
    });
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
      observer.disconnect();
      unsubscribe();
      if (frame !== null) window.cancelAnimationFrame(frame);
      removeInjected();
    },
  };
}
