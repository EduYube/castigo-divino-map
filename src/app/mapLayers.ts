import {
  MAP_LAYER_IDS,
  normalizeMapLayerIds,
  type MapLayerId,
  type MapLayerState,
} from '../domain/mapLayers';

export interface MapLayersController {
  getState(): MapLayerState;
  setState(state: MapLayerState, options?: MapLayersStateUpdateOptions): void;
  destroy(): void;
}

export interface MapLayersStateUpdateOptions {
  readonly notify?: boolean;
  readonly announce?: boolean;
}

export interface MapLayersOptions {
  readonly initialState?: MapLayerState;
  readonly onChange?: (state: MapLayerState) => void;
}

const LAYER_LABELS: Readonly<Record<MapLayerId, string>> = {
  character: 'Personajes',
  location: 'Emplazamientos puntuales',
  region: 'Regiones',
  mission: 'Misiones',
  hazard: 'Peligros/Alertas',
};

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required map layers element: ${selector}`);
  return element;
}

function describeState(state: MapLayerState): string {
  const active = state.activeLayerIds.length;
  return `Capas · ${active}/${MAP_LAYER_IDS.length}`;
}

export function mountMapLayers(
  root: ParentNode = document,
  options: MapLayersOptions = {},
): MapLayersController {
  const container = getRequiredElement<HTMLElement>(root, '[data-map-layers]');
  const summary = getRequiredElement<HTMLElement>(container, '[data-map-layers-summary]');
  const status = getRequiredElement<HTMLElement>(container, '[data-map-layers-status]');
  const showAll = getRequiredElement<HTMLButtonElement>(container, '[data-map-layers-show-all]');
  const checkboxes = new Map<MapLayerId, HTMLInputElement>();

  for (const layerId of MAP_LAYER_IDS) {
    const checkbox = getRequiredElement<HTMLInputElement>(
      container,
      `[data-map-layer="${layerId}"]`,
    );
    checkboxes.set(layerId, checkbox);
  }

  let state: MapLayerState = {
    activeLayerIds: normalizeMapLayerIds(options.initialState?.activeLayerIds),
  };

  const render = (announce: boolean): void => {
    const activeIds = new Set(state.activeLayerIds);
    for (const [layerId, checkbox] of checkboxes) checkbox.checked = activeIds.has(layerId);
    summary.textContent = describeState(state);
    summary.setAttribute(
      'aria-label',
      `${state.activeLayerIds.length} de ${MAP_LAYER_IDS.length} capas activas`,
    );
    showAll.hidden = state.activeLayerIds.length === MAP_LAYER_IDS.length;
    if (announce) {
      const inactive = MAP_LAYER_IDS.filter((layerId) => !activeIds.has(layerId));
      status.textContent =
        inactive.length === 0
          ? 'Todas las capas están visibles.'
          : `${describeState(state)}. Ocultas: ${inactive.map((layerId) => LAYER_LABELS[layerId]).join(', ')}.`;
    }
  };

  const publish = (): void => options.onChange?.(state);

  const handleChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const layerId = event.target.dataset.mapLayer;
    if (!layerId || !MAP_LAYER_IDS.includes(layerId as MapLayerId)) return;
    state = {
      activeLayerIds: MAP_LAYER_IDS.filter((candidate) => checkboxes.get(candidate)?.checked),
    };
    render(true);
    publish();
  };

  const handleShowAll = (): void => {
    state = { activeLayerIds: MAP_LAYER_IDS };
    render(true);
    publish();
  };

  container.addEventListener('change', handleChange);
  showAll.addEventListener('click', handleShowAll);
  render(false);

  return {
    getState(): MapLayerState {
      return state;
    },
    setState(nextState: MapLayerState, stateOptions: MapLayersStateUpdateOptions = {}): void {
      state = { activeLayerIds: normalizeMapLayerIds(nextState.activeLayerIds) };
      render(stateOptions.announce === true);
      if (stateOptions.notify !== false) publish();
    },
    destroy(): void {
      container.removeEventListener('change', handleChange);
      showAll.removeEventListener('click', handleShowAll);
    },
  };
}
