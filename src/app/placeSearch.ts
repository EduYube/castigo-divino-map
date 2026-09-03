import type { PublicCatalogSnapshotV2 } from '../data/beta02-model';
import type { CampaignCatalog, PlaceId } from '../data/model';
import {
  normalizePlaceSearchQuery,
  searchPublicAtlas,
  type AtlasSearchResult,
  type AtlasSearchResultType,
  type PlaceSearchMatchKind,
} from '../data/search';
import { getPublicAtlasSuggestions } from '../data/searchSuggestions';

export interface PlaceSearchController {
  getQuery(): string;
  setQuery(query: string, options?: PlaceSearchStateUpdateOptions): void;
  setCatalogState(catalog: CampaignCatalog, beta02Catalog: PublicCatalogSnapshotV2 | null): void;
  refresh(): void;
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
  readonly isResultVisible?: (result: AtlasSearchResult) => boolean;
}

interface PlaceSearchElements {
  readonly combobox: HTMLElement;
  readonly input: HTMLInputElement;
  readonly clearButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly summary: HTMLElement;
  readonly suggestions: HTMLUListElement;
  readonly results: HTMLUListElement;
}

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required place search element: ${selector}`);
  }

  return element;
}

function ensureAutocompleteStructure(
  root: ParentNode,
  input: HTMLInputElement,
): Pick<PlaceSearchElements, 'combobox' | 'suggestions'> {
  let combobox = root.querySelector<HTMLElement>('[data-place-search-combobox]');
  let suggestions = root.querySelector<HTMLUListElement>('[data-place-search-suggestions]');

  if (!combobox) {
    combobox = document.createElement('div');
    combobox.className = 'place-search__combobox';
    combobox.dataset.placeSearchCombobox = '';
    input.before(combobox);
    combobox.append(input);
  }

  if (!suggestions) {
    suggestions = document.createElement('ul');
    suggestions.id = 'place-search-suggestions';
    suggestions.className = 'place-search__suggestions';
    suggestions.dataset.placeSearchSuggestions = '';
    suggestions.setAttribute('role', 'listbox');
    suggestions.setAttribute('aria-label', 'Sugerencias de búsqueda');
    suggestions.hidden = true;
    combobox.append(suggestions);
  }

  combobox.setAttribute('role', 'combobox');
  combobox.setAttribute('aria-haspopup', 'listbox');
  combobox.setAttribute('aria-expanded', 'false');
  combobox.setAttribute('aria-controls', suggestions.id);
  combobox.setAttribute('aria-labelledby', 'place-search-label');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', suggestions.id);

  return { combobox, suggestions };
}

function resolveElements(root: ParentNode): PlaceSearchElements {
  const input = getRequiredElement<HTMLInputElement>(root, '[data-place-search-input]');
  const autocomplete = ensureAutocompleteStructure(root, input);

  return {
    ...autocomplete,
    input,
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
    case 'mission':
      return 'Misión';
    case 'hazard':
      return 'Peligro';
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

function createSuggestionItem(
  result: AtlasSearchResult,
  index: number,
  isActive: boolean,
  onSelect: (result: AtlasSearchResult) => void,
): HTMLLIElement {
  const item = document.createElement('li');

  item.id = `place-search-suggestion-${index}`;
  item.className = 'place-search__suggestion';
  item.dataset.searchSuggestionId = result.id;
  item.dataset.searchSuggestionType = result.type;
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', String(isActive));
  item.append(
    createTextElement('span', 'place-search__result-name', result.name),
    createTextElement('span', 'place-search__result-type', describeResultType(result.type)),
    createTextElement(
      'span',
      'place-search__result-match',
      describeMatch(result.matchKind, result.matchedText),
    ),
  );
  item.addEventListener('mousedown', (event) => event.preventDefault());
  item.addEventListener('click', () => onSelect(result));

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
  let catalog = options.catalog;
  let beta02Catalog: PublicCatalogSnapshotV2 | null = null;
  let suggestionsEnabled = false;
  let activeSuggestionIndex = -1;
  let suppressNextSuggestionFocusOpen = false;

  const closeSuggestions = (): void => {
    suggestionsEnabled = false;
    activeSuggestionIndex = -1;
    elements.suggestions.hidden = true;
    elements.combobox.setAttribute('aria-expanded', 'false');
    elements.input.removeAttribute('aria-activedescendant');
  };

  const publishQueryChange = (): void => options.onQueryChange?.(query);
  const filterVisibleResults = (
    results: readonly AtlasSearchResult[],
  ): readonly AtlasSearchResult[] =>
    options.isResultVisible ? results.filter(options.isResultVisible) : results;

  const getVisibleSuggestions = (): readonly AtlasSearchResult[] =>
    filterVisibleResults(getPublicAtlasSuggestions(catalog, beta02Catalog, query));

  const render = (): void => {
    const normalizedQuery = normalizePlaceSearchQuery(query);
    const searchResults = filterVisibleResults(searchPublicAtlas(catalog, beta02Catalog, query));
    const suggestions = getVisibleSuggestions();
    const suggestionsOpen =
      suggestionsEnabled &&
      document.activeElement === elements.input &&
      Boolean(normalizedQuery) &&
      suggestions.length > 0;

    if (activeSuggestionIndex >= suggestions.length) {
      activeSuggestionIndex = -1;
    }

    elements.clearButton.disabled = query.length === 0;
    elements.results.replaceChildren(
      ...searchResults.map((result) =>
        createResultItem(result, options.onSelect, options.onOpenPlace),
      ),
    );
    elements.suggestions.replaceChildren(
      ...suggestions.map((result, index) =>
        createSuggestionItem(
          result,
          index,
          suggestionsOpen && index === activeSuggestionIndex,
          selectSuggestion,
        ),
      ),
    );
    setStatusText(elements.summary, describeCollapsedSearchSummary(query, searchResults.length));

    if (suggestionsOpen) {
      elements.suggestions.hidden = false;
      elements.combobox.setAttribute('aria-expanded', 'true');

      if (activeSuggestionIndex >= 0) {
        elements.input.setAttribute(
          'aria-activedescendant',
          `place-search-suggestion-${activeSuggestionIndex}`,
        );
      } else {
        elements.input.removeAttribute('aria-activedescendant');
      }
    } else {
      closeSuggestions();
    }

    if (!normalizedQuery) {
      setStatusText(elements.status, 'Escribe un nombre, alias o título de nota pública.');
      elements.results.hidden = true;
      return;
    }

    if (searchResults.length === 0) {
      setStatusText(
        elements.status,
        `No hay lugares, personajes ni nombres geográficos para “${query.trim()}”; tampoco misiones ni peligros.`,
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

  function selectSuggestion(result: AtlasSearchResult): void {
    query = result.name;
    elements.input.value = result.name;
    suggestionsEnabled = false;
    activeSuggestionIndex = -1;
    render();
    publishQueryChange();
    options.onSelect(result);
  }

  const setQuery = (nextQuery: string, stateOptions: PlaceSearchStateUpdateOptions = {}): void => {
    query = nextQuery;
    elements.input.value = nextQuery;
    suggestionsEnabled = false;
    activeSuggestionIndex = -1;
    render();

    if (stateOptions.notify !== false) {
      publishQueryChange();
    }
  };

  const handleInput = (): void => {
    query = elements.input.value;
    suggestionsEnabled = true;
    activeSuggestionIndex = -1;
    render();
    publishQueryChange();
  };

  const handleInputFocus = (): void => {
    if (suppressNextSuggestionFocusOpen) {
      suppressNextSuggestionFocusOpen = false;
      render();
      return;
    }

    suggestionsEnabled = true;
    render();
  };

  const handleInputBlur = (): void => {
    window.setTimeout(() => {
      if (document.activeElement === elements.input) {
        return;
      }

      closeSuggestions();
    }, 0);
  };

  const handleClear = (): void => {
    setQuery('');
    elements.input.focus();
  };

  const handleInputKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) {
      return;
    }

    const suggestions = getVisibleSuggestions();

    if (event.key === 'Escape' && elements.combobox.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      event.stopPropagation();
      closeSuggestions();
      return;
    }

    if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      const suggestion = suggestions[activeSuggestionIndex];

      if (suggestion) {
        event.preventDefault();
        selectSuggestion(suggestion);
      }
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    if (suggestions.length === 0) {
      return;
    }

    event.preventDefault();
    suggestionsEnabled = true;

    if (activeSuggestionIndex < 0) {
      activeSuggestionIndex = event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
    } else if (event.key === 'ArrowDown') {
      activeSuggestionIndex = (activeSuggestionIndex + 1) % suggestions.length;
    } else {
      activeSuggestionIndex = (activeSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    }

    render();
  };

  const handleResultsKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLButtonElement)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      suppressNextSuggestionFocusOpen = true;
      closeSuggestions();
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
  elements.input.addEventListener('focus', handleInputFocus);
  elements.input.addEventListener('blur', handleInputBlur);
  elements.input.addEventListener('keydown', handleInputKeyDown);
  elements.clearButton.addEventListener('click', handleClear);
  elements.results.addEventListener('keydown', handleResultsKeyDown);
  render();

  return {
    getQuery(): string {
      return query;
    },
    setQuery,
    setCatalogState(
      nextCatalog: CampaignCatalog,
      nextBeta02Catalog: PublicCatalogSnapshotV2 | null,
    ): void {
      catalog = nextCatalog;
      beta02Catalog = nextBeta02Catalog;
      activeSuggestionIndex = -1;
      render();
    },
    refresh: render,
    clear: handleClear,
    destroy(): void {
      elements.input.removeEventListener('input', handleInput);
      elements.input.removeEventListener('focus', handleInputFocus);
      elements.input.removeEventListener('blur', handleInputBlur);
      elements.input.removeEventListener('keydown', handleInputKeyDown);
      elements.clearButton.removeEventListener('click', handleClear);
      elements.results.removeEventListener('keydown', handleResultsKeyDown);
      elements.suggestions.replaceChildren();
      elements.results.replaceChildren();
    },
  };
}
