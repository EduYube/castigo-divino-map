import type { CategoryId, PublicCatalogSnapshotV2, TagId } from '../data/beta02-model';
import {
  derivePublicFilterFacets,
  getPublicPlaceFilterTagIds,
  type PublicPlaceFilterState,
} from '../data/filters';
import type { CampaignCatalog } from '../data/model';

export interface PlaceFiltersController {
  getState(): PublicPlaceFilterState;
  setState(state: PublicPlaceFilterState, options?: PlaceFiltersStateUpdateOptions): void;
  setCatalogState(catalog: CampaignCatalog, beta02Catalog: PublicCatalogSnapshotV2 | null): void;
  clear(): void;
  setMatchSummary(matchCount: number, activeResultMatches: boolean | null): void;
  destroy(): void;
}

export interface PlaceFiltersStateUpdateOptions {
  readonly notify?: boolean;
}

export interface PlaceFiltersOptions {
  readonly catalog: CampaignCatalog;
  readonly beta02Catalog?: PublicCatalogSnapshotV2 | null;
  readonly onChange: () => void;
}

interface PlaceFiltersElements {
  readonly root: HTMLElement;
  readonly categories: HTMLElement;
  readonly tags: HTMLElement;
  readonly clearButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly summary: HTMLElement;
}

interface FilterOptionModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly count: number;
}

interface FilterOptionsModel {
  readonly categories: readonly FilterOptionModel[];
  readonly tags: readonly FilterOptionModel[];
}

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required place filters element: ${selector}`);
  }

  return element;
}

function resolveElements(root: ParentNode): PlaceFiltersElements {
  return {
    root: getRequiredElement(root, '[data-place-filters]'),
    categories: getRequiredElement(root, '[data-place-filter-categories]'),
    tags: getRequiredElement(root, '[data-place-filter-tags]'),
    clearButton: getRequiredElement<HTMLButtonElement>(root, '[data-place-filters-clear]'),
    status: getRequiredElement(root, '[data-place-filters-status]'),
    summary: getRequiredElement(root, '[data-place-filters-summary]'),
  };
}

function createFilterOption(
  kind: 'category' | 'tag',
  id: string,
  name: string,
  description: string,
  resultCount: number,
): HTMLLabelElement {
  const label = document.createElement('label');
  const input = document.createElement('input');
  const text = document.createElement('span');
  const nameElement = document.createElement('span');
  const countElement = document.createElement('span');
  const descriptionElement = document.createElement('span');
  const countId = `place-filter-${kind}-${id}-count`;
  const descriptionId = `place-filter-${kind}-${id}-description`;

  label.className = 'place-filters__option';
  input.type = 'checkbox';
  input.name = `place-filter-${kind}`;
  input.value = id;
  input.dataset.placeFilterKind = kind;
  input.dataset.placeFilterId = id;
  input.disabled = resultCount === 0;
  input.setAttribute('aria-describedby', `${descriptionId} ${countId}`);

  text.className = 'place-filters__option-text';
  nameElement.className = 'place-filters__option-name';
  nameElement.textContent = name;
  countElement.id = countId;
  countElement.className = 'place-filters__option-count';
  countElement.textContent =
    resultCount === 0
      ? 'Sin resultados públicos'
      : resultCount === 1
        ? '1 resultado'
        : `${resultCount} resultados`;
  descriptionElement.id = descriptionId;
  descriptionElement.className = 'visually-hidden';
  descriptionElement.textContent = description;

  text.append(nameElement, countElement, descriptionElement);
  label.append(input, text);

  return label;
}

function setText(element: HTMLElement, message: string): void {
  if (element.textContent !== message) {
    element.textContent = message;
  }
}

function deriveFilterOptions(
  catalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
): FilterOptionsModel {
  if (beta02Catalog) {
    const facets = derivePublicFilterFacets(beta02Catalog);

    return {
      categories: facets.categories,
      tags: facets.tags,
    };
  }

  return {
    categories: catalog.categories.map((category) => ({
      ...category,
      count: catalog.places.filter(({ categoryId }) => categoryId === category.id).length,
    })),
    tags: catalog.tags.map((tag) => ({
      ...tag,
      count: catalog.places.filter((place) =>
        getPublicPlaceFilterTagIds(catalog, place).includes(tag.id),
      ).length,
    })),
  };
}

function getFocusedFilterKey(root: HTMLElement): string | null {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLInputElement) || !root.contains(activeElement)) {
    return null;
  }

  const kind = activeElement.dataset.placeFilterKind;
  const id = activeElement.dataset.placeFilterId;
  return kind && id ? `${kind}:${id}` : null;
}

function restoreFocusedFilter(root: HTMLElement, key: string | null): void {
  if (!key) return;

  const [kind, id] = key.split(':', 2);
  const target = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find(
    (input) => input.dataset.placeFilterKind === kind && input.dataset.placeFilterId === id,
  );

  target?.focus({ preventScroll: true });
}

export function mountPlaceFilters(
  root: ParentNode = document,
  options: PlaceFiltersOptions,
): PlaceFiltersController {
  const elements = resolveElements(root);
  const selectedCategoryIds = new Set<CategoryId>();
  const selectedTagIds = new Set<TagId>();
  let catalog = options.catalog;
  let beta02Catalog = options.beta02Catalog ?? null;
  let filterOptions = deriveFilterOptions(catalog, beta02Catalog);
  let previousOptionsSignature = '';
  let removedFilterCount = 0;

  const createOptionsSignature = (): string =>
    JSON.stringify({
      categories: filterOptions.categories.map(({ id, name, description, count }) => [
        id,
        name,
        description,
        count,
      ]),
      tags: filterOptions.tags.map(({ id, name, description, count }) => [
        id,
        name,
        description,
        count,
      ]),
    });

  const getState = (): PublicPlaceFilterState => ({
    selectedCategoryIds: filterOptions.categories
      .filter(({ id }) => selectedCategoryIds.has(id as CategoryId))
      .map(({ id }) => id as CategoryId),
    selectedTagIds: filterOptions.tags
      .filter(({ id }) => selectedTagIds.has(id))
      .map(({ id }) => id),
  });

  const renderCollapsedSummary = (): void => {
    const activeFilterCount = selectedCategoryIds.size + selectedTagIds.size;
    const rawMatchCount = elements.root.dataset.matchCount;
    const matchCount = rawMatchCount === undefined ? null : Number(rawMatchCount);
    const filterMessage =
      activeFilterCount === 0
        ? 'Sin filtros activos'
        : activeFilterCount === 1
          ? '1 filtro activo'
          : `${activeFilterCount} filtros activos`;
    const matchMessage =
      matchCount === null || !Number.isFinite(matchCount)
        ? ''
        : matchCount === 1
          ? ' · 1 resultado coincide'
          : ` · ${matchCount} resultados coinciden`;

    setText(elements.summary, `${filterMessage}${matchMessage}.`);
  };

  const synchronizeControls = (): void => {
    elements.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      const kind = input.dataset.placeFilterKind;
      const id = input.dataset.placeFilterId;

      input.checked =
        Boolean(id) &&
        (kind === 'category'
          ? selectedCategoryIds.has(id as CategoryId)
          : kind === 'tag'
            ? selectedTagIds.has(id as TagId)
            : false);
    });
  };

  const renderOptions = (): void => {
    const nextSignature = createOptionsSignature();
    if (nextSignature === previousOptionsSignature) {
      synchronizeControls();
      return;
    }

    const focusedFilterKey = getFocusedFilterKey(elements.root);
    previousOptionsSignature = nextSignature;
    elements.categories.replaceChildren(
      ...filterOptions.categories.map((category) =>
        createFilterOption(
          'category',
          category.id,
          category.name,
          category.description,
          category.count,
        ),
      ),
    );
    elements.tags.replaceChildren(
      ...filterOptions.tags.map((tag) =>
        createFilterOption('tag', tag.id, tag.name, tag.description, tag.count),
      ),
    );
    synchronizeControls();
    restoreFocusedFilter(elements.root, focusedFilterKey);
  };

  const setState = (
    state: PublicPlaceFilterState,
    stateOptions: PlaceFiltersStateUpdateOptions = {},
  ): void => {
    const nextCategoryIds = new Set(state.selectedCategoryIds);
    const nextTagIds = new Set(state.selectedTagIds);
    const validCategoryIds = new Set(filterOptions.categories.map(({ id }) => id));
    const validTagIds = new Set(filterOptions.tags.map(({ id }) => id));

    selectedCategoryIds.clear();
    selectedTagIds.clear();
    nextCategoryIds.forEach((id) => {
      if (validCategoryIds.has(id)) selectedCategoryIds.add(id);
    });
    nextTagIds.forEach((id) => {
      if (validTagIds.has(id)) selectedTagIds.add(id);
    });
    synchronizeControls();
    renderCollapsedSummary();

    if (stateOptions.notify !== false) {
      options.onChange();
    }
  };

  const setCatalogState = (
    nextCatalog: CampaignCatalog,
    nextBeta02Catalog: PublicCatalogSnapshotV2 | null,
  ): void => {
    catalog = nextCatalog;
    beta02Catalog = nextBeta02Catalog;
    filterOptions = deriveFilterOptions(catalog, beta02Catalog);
    const validCategoryIds = new Set(filterOptions.categories.map(({ id }) => id));
    const validTagIds = new Set(filterOptions.tags.map(({ id }) => id));
    let removed = 0;

    selectedCategoryIds.forEach((id) => {
      if (!validCategoryIds.has(id)) {
        selectedCategoryIds.delete(id);
        removed += 1;
      }
    });
    selectedTagIds.forEach((id) => {
      if (!validTagIds.has(id)) {
        selectedTagIds.delete(id);
        removed += 1;
      }
    });
    removedFilterCount += removed;
    renderOptions();
    renderCollapsedSummary();
  };

  const handleChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox') {
      return;
    }

    const kind = event.target.dataset.placeFilterKind;
    const id = event.target.dataset.placeFilterId;

    if (!id) {
      return;
    }

    if (kind === 'category') {
      const categoryId = id as CategoryId;

      if (event.target.checked) {
        selectedCategoryIds.add(categoryId);
      } else {
        selectedCategoryIds.delete(categoryId);
      }
    } else if (kind === 'tag') {
      if (event.target.checked) {
        selectedTagIds.add(id);
      } else {
        selectedTagIds.delete(id);
      }
    } else {
      return;
    }

    synchronizeControls();
    renderCollapsedSummary();
    options.onChange();
  };

  const clear = (): void => {
    setState({ selectedCategoryIds: [], selectedTagIds: [] });
  };

  const handleClear = (): void => {
    clear();
    elements.clearButton.focus();
  };

  renderOptions();
  renderCollapsedSummary();
  elements.root.addEventListener('change', handleChange);
  elements.clearButton.addEventListener('click', handleClear);

  return {
    getState,
    setState,
    setCatalogState,
    clear,
    setMatchSummary(matchCount: number, activeResultMatches: boolean | null): void {
      elements.root.dataset.matchCount = String(matchCount);
      elements.root.dataset.hasMatches = matchCount === 0 ? 'false' : 'true';

      const countMessage =
        matchCount === 0
          ? 'Ningún resultado coincide con la búsqueda y los filtros actuales.'
          : matchCount === 1
            ? '1 resultado coincide con la búsqueda y los filtros actuales.'
            : `${matchCount} resultados coinciden con la búsqueda y los filtros actuales.`;
      const activeMessage =
        activeResultMatches === false
          ? ' El elemento activo no coincide, pero permanece disponible y se puede consultar.'
          : '';
      const removedMessage =
        removedFilterCount === 0
          ? ''
          : removedFilterCount === 1
            ? ' Se ha retirado un filtro que ya no está disponible en el catálogo público.'
            : ` Se han retirado ${removedFilterCount} filtros que ya no están disponibles en el catálogo público.`;
      const message = `${countMessage}${activeMessage}${removedMessage}`;

      removedFilterCount = 0;
      setText(elements.status, message);
      renderCollapsedSummary();
    },
    destroy(): void {
      elements.root.removeEventListener('change', handleChange);
      elements.clearButton.removeEventListener('click', handleClear);
      elements.categories.replaceChildren();
      elements.tags.replaceChildren();
    },
  };
}
