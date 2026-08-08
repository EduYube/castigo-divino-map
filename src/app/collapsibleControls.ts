export interface CollapsibleControlInitialState {
  readonly searchExpanded: boolean;
  readonly filtersExpanded: boolean;
}

export interface CollapsibleMapControlsController {
  destroy(): void;
}

interface CollapsibleSectionOptions {
  readonly rootSelector: string;
  readonly toggleSelector: string;
  readonly regionSelector: string;
  readonly expandedLabel: string;
  readonly collapsedLabel: string;
  readonly initiallyExpanded: boolean;
}

const MOBILE_CONTROLS_MEDIA_QUERY = '(max-width: 48rem)';

export function getInitialCollapsibleControlState(
  isMobileViewport: boolean,
): CollapsibleControlInitialState {
  return {
    searchExpanded: !isMobileViewport,
    filtersExpanded: !isMobileViewport,
  };
}

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required collapsible control element: ${selector}`);
  }

  return element;
}

function mountCollapsibleSection(
  root: ParentNode,
  options: CollapsibleSectionOptions,
): () => void {
  const section = getRequiredElement<HTMLElement>(root, options.rootSelector);
  const toggle = getRequiredElement<HTMLButtonElement>(section, options.toggleSelector);
  const region = getRequiredElement<HTMLElement>(section, options.regionSelector);

  if (toggle.getAttribute('aria-controls') !== region.id) {
    throw new Error(`Collapsible control ${options.toggleSelector} must reference ${region.id}.`);
  }

  let expanded = options.initiallyExpanded;

  const render = (): void => {
    section.dataset.collapsibleExpanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? options.expandedLabel : options.collapsedLabel;
    region.hidden = !expanded;
  };

  const handleToggle = (): void => {
    if (expanded && region.contains(document.activeElement)) {
      toggle.focus({ preventScroll: true });
    }

    expanded = !expanded;
    render();
  };

  toggle.addEventListener('click', handleToggle);
  render();

  return () => toggle.removeEventListener('click', handleToggle);
}

export function mountCollapsibleMapControls(
  root: ParentNode = document,
  mediaQueryList: Pick<MediaQueryList, 'matches'> = window.matchMedia(MOBILE_CONTROLS_MEDIA_QUERY),
): CollapsibleMapControlsController {
  const initialState = getInitialCollapsibleControlState(mediaQueryList.matches);
  const destroySearch = mountCollapsibleSection(root, {
    rootSelector: '[data-place-search]',
    toggleSelector: '[data-place-search-toggle]',
    regionSelector: '[data-place-search-region]',
    expandedLabel: 'Ocultar búsqueda',
    collapsedLabel: 'Mostrar búsqueda',
    initiallyExpanded: initialState.searchExpanded,
  });
  const destroyFilters = mountCollapsibleSection(root, {
    rootSelector: '[data-place-filters]',
    toggleSelector: '[data-place-filters-toggle]',
    regionSelector: '[data-place-filters-region]',
    expandedLabel: 'Ocultar filtros',
    collapsedLabel: 'Mostrar filtros',
    initiallyExpanded: initialState.filtersExpanded,
  });

  return {
    destroy(): void {
      destroySearch();
      destroyFilters();
    },
  };
}
