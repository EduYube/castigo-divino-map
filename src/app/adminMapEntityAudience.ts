import type { AdminMapEntityController } from '../application/adminMapEntityController';
import type { MapEntityAudience } from '../domain/adminMapEntities';

export interface AdminMapEntityAudienceUiController {
  destroy(): void;
}

const FIELD_ID = 'admin-map-entity-audience';
const WRAPPER_SELECTOR = '[data-admin-map-entity-audience]';

function createAudienceField(
  controller: AdminMapEntityController,
  audience: MapEntityAudience,
): HTMLElement {
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  const select = document.createElement('select');
  const help = document.createElement('p');

  wrapper.className = 'admin-map-entity__field admin-map-entity__audience';
  wrapper.dataset.adminMapEntityAudience = '';
  label.className = 'admin-map-entity__label';
  label.htmlFor = FIELD_ID;
  label.textContent = 'Audiencia';
  select.className = 'admin-map-entity__control';
  select.id = FIELD_ID;
  select.name = 'audience';
  select.dataset.testid = 'admin-map-entity-audience';
  select.append(new Option('Público · jugadores y visitantes', 'public'));
  select.append(new Option('Solo Máster · privado', 'master'));
  select.value = audience;
  help.className = 'admin-map-entity__help admin-map-entity__audience-help';
  help.id = `${FIELD_ID}-help`;
  select.setAttribute('aria-describedby', help.id);

  const updateHelp = (): void => {
    help.textContent =
      select.value === 'master'
        ? 'Solo Máster: aunque esté publicada, esta entidad quedará fuera del catálogo público, búsqueda, autocompletado y próximo snapshot. Solo una sesión admin con Modo Máster activo podrá verla.'
        : 'Público: si además está publicada y cumple las reglas editoriales, puede ser visible y buscable por jugadores y formar parte del snapshot público.';
  };

  select.addEventListener('change', () => {
    const next = select.value === 'master' ? 'master' : 'public';
    controller.setPendingAudience(next);
    updateHelp();
  });
  updateHelp();
  wrapper.append(label, select, help);
  return wrapper;
}

export function mountAdminMapEntityAudience(
  root: ParentNode,
  controller: AdminMapEntityController,
): AdminMapEntityAudienceUiController {
  let destroyed = false;
  let scheduledFrame: number | null = null;

  const scheduleRender = (): void => {
    if (destroyed || scheduledFrame !== null) return;
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = null;
      if (destroyed) return;

      const state = controller.getState();
      const fields = root.querySelector<HTMLElement>('.admin-map-entity__fields');
      const existing = root.querySelector<HTMLElement>(WRAPPER_SELECTOR);
      const shouldExist =
        state.authorized &&
        state.backendConnected &&
        state.phase !== 'blocked' &&
        (state.creating || state.editorDetail !== null) &&
        Boolean(fields);

      if (!shouldExist) {
        existing?.remove();
        return;
      }

      const currentSelect = existing?.querySelector<HTMLSelectElement>('select');
      if (currentSelect) {
        if (currentSelect.value !== state.pendingAudience) {
          currentSelect.value = state.pendingAudience;
          currentSelect.dispatchEvent(new Event('change'));
        }
        return;
      }

      const field = createAudienceField(controller, state.pendingAudience);
      const visibility = fields
        ?.querySelector<HTMLElement>('#admin-map-entity-field-visibility')
        ?.closest('.admin-map-entity__field');
      if (visibility?.parentElement === fields) visibility.after(field);
      else fields?.prepend(field);
    });
  };

  const unsubscribe = controller.subscribe(scheduleRender);
  scheduleRender();

  return {
    destroy(): void {
      destroyed = true;
      unsubscribe();
      if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
      root.querySelector<HTMLElement>(WRAPPER_SELECTOR)?.remove();
    },
  };
}
