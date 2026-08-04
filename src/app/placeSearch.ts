import type { CampaignCatalog, PlaceId } from '../data/model';
import {
  normalizePlaceSearchQuery,
  searchPublicPlaces,
  type PlaceSearchMatchKind,
  type PlaceSearchResult,
} from '../data/search';

export interface PlaceSearchController {
  getQuery(): string;
  setQuery(query: string, options?: PlaceSearchStateUpdateOptions): void;
  clear(): void;
  destroy(): void;
}

export interface PlaceSearchStateUpdateOptions {
  readonly notify?: boolean;
}

export interface PlaceSearchOptions {
  readonly catalog: CampaignCatalog;
  readonly onSelect: (placeId: PlaceId) => void;
  readonly onQueryChange?: (query: string) => void;
}

interface PlaceSearchElements {
  readonly input: HTMLInputElement;
  readonly clearButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly results: HTMLUListElement;
}

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required place search element: ${selector}`);
  }

  return element;
}

function resolveElements(root: ParentNode): PlaceSearchElements {
  return {
    input: getRequiredElement<HTMLInputElement>(root, '[data-place-search-input]'),
    clearButton: getRequiredElement<HTMLButtonElement>(root, '[data-place-search-clear]'),
    status: getRequiredElement(root, '[data-place-search-status]'),
    results: getRequiredElement<HTMLUListElement>(root, '[data-place-search-results]'),
  };
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  element.className = className;
  element.textContent = text;

  return element;
}

function describeMatch(matchKind: PlaceSearchMatchKind, matchedText: string): string {
  switch (matchKind) {
    case 'alias':
      return `Coincidencia por alias: ${matchedText}`;
    case 'note-title':
      return `Coincidencia por nota pública: ${matchedText}`;
    case 'name':
      return 'Coincidencia por nombre principal';
  }
}

function createResultItem(
  result: PlaceSearchResult,
  onSelect: (placeId: PlaceId) => void,
): HTMLLIElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  const matchDescription = describeMatch(result.matchKind, result.matchedText);

  item.className = 'place-search__result-item';
  button.className = 'place-search__result';
  button.type = 'button';
  button.dataset.placeId = result.placeId;
  button.dataset.matchKind = result.matchKind;
  button.append(
    createTextElement('span', 'place-search__result-name', result.placeName),
    createTextElement('span', 'place-search__result-match', matchDescription),
  );
  button.addEventListener('click', () => onSelect(result.placeId));
  item.append(button);

  return item;
}

function getResultButtons(results: HTMLUListElement): readonly HTMLButtonElement[] {
  return Array.from(results.querySelectorAll<HTMLButtonElement>('.place-search__result'));
}

export function mountPlaceSearch(
  root: ParentNode = document,
  options: PlaceSearchOptions,
): PlaceSearchController {
  const elements = resolveElements(root);
  let query = '';

  const render = (): void => {
    const normalizedQuery = normalizePlaceSearchQuery(query);
    const searchResults = searchPublicPlaces(options.catalog, query);

    elements.clearButton.disabled = query.length === 0;
    elements.results.replaceChildren(
      ...searchResults.map((result) => createResultItem(result, options.onSelect)),
    );

    if (!normalizedQuery) {
      elements.status.textContent = 'Escribe un nombre, alias o título de nota pública.';
      elements.results.hidden = true;
      return;
    }

    if (searchResults.length === 0) {
      elements.status.textContent = `No hay lugares para “${query.trim()}”.`;
      elements.results.hidden = true;
      return;
    }

    elements.status.textContent =
      searchResults.length === 1
        ? '1 lugar encontrado.'
        : `${searchResults.length} lugares encontrados.`;
    elements.results.hidden = false;
  };

  const publishQueryChange = (): void => options.onQueryChange?.(query);

  const setQuery = (nextQuery: string, stateOptions: PlaceSearchStateUpdateOptions = {}): void => {
    query = nextQuery;
    elements.input.value = nextQuery;
    render();

    if (stateOptions.notify !== false) {
      publishQueryChange();
    }
  };

  const handleInput = (): void => {
    query = elements.input.value;
    render();
    publishQueryChange();
  };

  const handleClear = (): void => {
    setQuery('');
    elements.input.focus();
  };

  const handleInputKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown') {
      return;
    }

    const firstResult = getResultButtons(elements.results)[0];

    if (firstResult) {
      event.preventDefault();
      firstResult.focus();
    }
  };

  const handleResultsKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLButtonElement)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      elements.input.focus();
      return;
    }

    const buttons = getResultButtons(elements.results);
    const currentIndex = buttons.indexOf(event.target);
    let nextIndex: number | undefined;

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = buttons.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  elements.input.addEventListener('input', handleInput);
  elements.input.addEventListener('keydown', handleInputKeyDown);
  elements.clearButton.addEventListener('click', handleClear);
  elements.results.addEventListener('keydown', handleResultsKeyDown);
  render();

  return {
    getQuery(): string {
      return query;
    },
    setQuery,
    clear: handleClear,
    destroy(): void {
      elements.input.removeEventListener('input', handleInput);
      elements.input.removeEventListener('keydown', handleInputKeyDown);
      elements.clearButton.removeEventListener('click', handleClear);
      elements.results.removeEventListener('keydown', handleResultsKeyDown);
      elements.results.replaceChildren();
    },
  };
}
