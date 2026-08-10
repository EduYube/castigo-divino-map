import type { MasterModeController, MasterModeState } from '../application/masterModeController';
import '../styles/master-mode.css';

export interface MasterModeUiController {
  destroy(): void;
}

export function mountMasterMode(
  root: ParentNode,
  controller: MasterModeController,
): MasterModeUiController {
  const heading = root.querySelector<HTMLElement>('.map-experience__heading');
  if (!heading) throw new Error('Missing map heading for Modo Máster.');

  const section = document.createElement('section');
  const copy = document.createElement('div');
  const label = document.createElement('strong');
  const hint = document.createElement('span');
  const button = document.createElement('button');
  const status = document.createElement('p');
  let legendItem: HTMLElement | null = null;

  section.className = 'master-mode';
  section.dataset.masterMode = '';
  section.setAttribute('aria-label', 'Modo Máster');
  copy.className = 'master-mode__copy';
  label.textContent = 'Modo Máster';
  hint.textContent = 'Contenido privado, cargado solo durante esta sesión y nunca en el snapshot público.';
  copy.append(label, hint);
  button.type = 'button';
  button.className = 'master-mode__toggle';
  button.dataset.masterModeToggle = '';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-describedby', 'master-mode-status');
  status.id = 'master-mode-status';
  status.className = 'master-mode__status';
  status.dataset.masterModeStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section.append(copy, button, status);

  const ensureMounted = (): void => {
    if (section.isConnected) return;
    const help = heading.querySelector<HTMLElement>('[data-map-help]');
    if (help) help.before(section);
    else heading.append(section);
  };

  const removeLegendItem = (): void => {
    legendItem?.remove();
    legendItem = null;
  };

  const renderLegendItem = (enabled: boolean): void => {
    if (!enabled) {
      removeLegendItem();
      return;
    }
    const typeGroup = root.querySelector<HTMLElement>('[data-pin-legend] .pin-legend__group');
    if (!typeGroup || legendItem?.isConnected) return;
    const item = document.createElement('span');
    const shape = document.createElement('span');
    const symbol = document.createElement('span');
    item.className = 'pin-legend__item master-mode__legend-item';
    item.dataset.masterModeLegend = '';
    shape.className = 'pin-legend__shape pin-legend__shape--master';
    shape.setAttribute('aria-hidden', 'true');
    symbol.textContent = '✦';
    shape.append(symbol);
    item.append(shape, document.createTextNode('Solo Máster'));
    typeGroup.append(item);
    legendItem = item;
  };

  const render = (state: MasterModeState): void => {
    if (!state.available && state.phase !== 'error') {
      section.remove();
      removeLegendItem();
      return;
    }

    ensureMounted();
    const active = state.enabled && (state.phase === 'loading' || state.phase === 'on');
    button.setAttribute('aria-pressed', String(active));
    button.disabled = state.phase === 'loading';
    button.textContent = active ? 'Desactivar Modo Máster' : 'Activar Modo Máster';
    section.dataset.state = state.phase;
    status.textContent =
      state.phase === 'loading'
        ? 'Cargando contenido privado autorizado…'
        : state.message ??
          (state.phase === 'on'
            ? 'Modo Máster activo.'
            : state.phase === 'error'
              ? 'No se pudo activar Modo Máster.'
              : 'Modo Máster desactivado.');
    renderLegendItem(state.phase === 'on');
  };

  const handleToggle = (): void => {
    const state = controller.getState();
    void controller.setEnabled(!(state.enabled && state.phase !== 'error'));
  };
  button.addEventListener('click', handleToggle);
  const unsubscribe = controller.subscribe(render);

  return {
    destroy(): void {
      unsubscribe();
      button.removeEventListener('click', handleToggle);
      removeLegendItem();
      section.remove();
    },
  };
}
