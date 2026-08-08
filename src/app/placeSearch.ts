import type { PublicCatalogSnapshotV2 } from '../data/beta02-model';
import type { CampaignCatalog, PlaceId } from '../data/model';
import {
  normalizePlaceSearchQuery,
  searchPublicAtlas,
  type AtlasSearchResult,
  type AtlasSearchResultType,
  type PlaceSearchMatchKind,
} from '../data/search';

export interface PlaceSearchController {
  getQuery(): string;
  setQuery(query: string, options?: PlaceSearchStateUpdateOptions): void;
  setBeta02Catalog(catalog: PublicCatalogSnapshotV2 | null): void;
  clear(): void;
  destroy(): void;
}

export interface PlaceSearchStateUpdateOptions {
  readonly notify?: boolean;
}

export interface PlaceSearchOptions {
  readonly catalog: CampaignCatalog;
  readonly onSelect: (result: AtlasSearchResult) => void;
  readonly onOpenPlace?: (placeId: PlaceId) => void;
  readonly onQueryChange?: (query: string) => void;
}

interface PlaceSearchElements {
  readonly input: HTMLInputElement;
  readonly clearButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly summary: HTMLElement;
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
    summary: getRequiredElement(root, '[data-place-search-summary]'),
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

function describeResultType(type: AtlasSearchResultType): string {
  switch (type) {
    case 'geographic':
      return 'Lugar geográfico';
    case 'character':
      return 'Personaje';
    case 'location':
      return 'Emplazamiento de campaña';
  }
}

function describeCollapsedSearchSummary(query: string, resultCount: number): string {
  const normalizedQuery = normalizePlaceSearchQuery(query);

  if (!normalizedQuery) {
    return 'Sin consulta activa.';
  }

  const countMessage = resultCount === 1 ? '1 resultado' : `${resultCount} resultados`;

  return `Consulta: “${query.trim()}” · ${countMessage}.`;
}

function createResultItem(
  result: AtlasSearchResult,
  onSelect: (result: AtlasSearchResult) => void,
  onOpenPlace: ((placeId: PlaceId) => void) | undefined,
): HTMLLIElement {
  const item = document.createElement('li');
  const resultButton = document.createElement('button');
  const matchDescription = describeMatch(result.matchKind, result.matchedText);

  item.className = 'place-search__result-item';
  resultButton.className = 'place-search__result';
  resultButton.type = 'button';
  resultButton.dataset.searchResultId = result.id;
  resultButton.dataset.searchResultType = result.type;
  resultButton.dataset.placeId = result.legacyPlaceId ?? '';
  resultButton.append(
    createTextElement('span', 'place-search__result-name', result.name),
    createTextElement('span', 'place-search__result-type', describeResultType(result.type)),
    createTextElement('span', 'place-search__result-match', matchDescription),
  );
  resultButton.addEventListener('click', () => onSelect(result));

  if (result.type === 'geographic' && result.legacyPlaceId && onOpenPlace) {
    const row = document.createElement('div');
    const openPlaceButton = document.createElement('button');

    row.className = 'place-search__result-row';
    openPlaceButton.className = 'place-search__open-details';
    openPlaceButton.type = 'button';
    openPlaceButton.dataset.placeId = result.legacyPlaceId;
    openPlaceButton.textContent = `Abrir ficha de ${result.name}`;
    openPlaceButton.addEventListener('click', () => onOpenPlace(result.legacyPlaceId!));
    row.append(resultButton, openPlaceButton);
    item.append(row);
  } else {
    item.append(resultButton);
  }

  return item;
}

function getResultButtons(results: HTMLUListElement): readonly HTMLButtonElement[] {
  return Array.from(
    results.querySelectorAll<HTMLButtonElement>(
      '.place-search__result, .place-search__open-details',
    ),
  );
}

function setStatusText(status: HTMLElement, message: string): void {
  if (status.textContent !== message) {
    status.textContent = message;
  }
}

export function mountPlaceSearch(
  root: ParentNode = document,
  options: PlaceSearchOptions,
): PlaceSearchController {
  const elements = resolveElements(root);
  let query = '';
  let beta02Catalog: PublicCatalogSnapshotV2 | null = null;

  const render = (): void => {
    const normalizedQuery = normalizePlaceSearchQuery(query);
    const searchResults = searchPublicAtlas(options.catalog, beta02Catalog, query);

    elements.clearButton.disabled = query.length === 0;
    elements.results.replaceChildren(
      ...searchResults.map((result) =>
        createResultItem(result, options.onSelect, options.onOpenPlace),
      ),
    );
    setStatusText(elements.summary, describeCollapsedSearchSummary(query, searchResults.length));

    if (!normalizedQuery) {
      setStatusText(elements.status, 'Escribe un nombre, alias o título de nota pública.');
      elements.results.hidden = true;
      return;
    }

    if (searchResults.length === 0) {
      setStatusText(
        elements.status,
        `No hay lugares, personajes ni nombres geográficos para “${query.trim()}”.`,
      );
      elements.results.hidden = true;
      return;
    }

    setStatusText(
      elements.status,
      searchResults.length === 1
        ? '1 lugar encontrado.'
        : `${searchResults.length} resultados encontrados.`,
    );
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
    setBeta02Catalog(catalog: PublicCatalogSnapshotV2 | null): void {
      beta02Catalog = catalog;
      render();
    },
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
