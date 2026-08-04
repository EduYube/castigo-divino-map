import {
  getPublicPlaceFilterTagIds,
  type PublicPlaceFilterState,
} from '../data/filters';
import type { CampaignCatalog, CampaignCategory, TagId } from '../data/model';

export interface PlaceFiltersController {
  getState(): PublicPlaceFilterState;
  clear(): void;
  setMatchSummary(matchCount: number, activePlaceMatches: boolean | null): void;
  destroy(): void;
}

export interface PlaceFiltersOptions {
  readonly catalog: CampaignCatalog;
  readonly onChange: () => void;
}

interface PlaceFiltersElements {
  readonly root: HTMLElement;
  readonly categories: HTMLElement;
  readonly tags: HTMLElement;
  readonly clearButton: HTMLButtonElement;
  readonly status: HTMLElement;
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
  };
}

function createFilterOption(
  kind: 'category' | 'tag',
  id: CampaignCategory['id'] | TagId,
  name: string,
  description: string,
  placeCount: number,
): HTMLLabelElement {
  const label = document.createElement('label');
  const input = document.createElement('input');
  const text = document.createElement('span');
  const nameElement = document.createElement('span');
  const countElement = document.createElement('span');

  label.className = 'place-filters__option';
  input.type = 'checkbox';
  input.name = `place-filter-${kind}`;
  input.value = id;
  input.dataset.placeFilterKind = kind;
  input.dataset.placeFilterId = id;
  input.disabled = placeCount === 0;
  input.setAttribute('aria-label', `${name}. ${description}`);

  text.className = 'place-filters__option-text';
  nameElement.className = 'place-filters__option-name';
  nameElement.textContent = name;
  countElement.className = 'place-filters__option-count';
  countElement.textContent =
    placeCount === 0
      ? 'Sin lugares asociados'
      : placeCount === 1
        ? '1 lugar'
        : `${placeCount} lugares`;

  text.append(nameElement, countElement);
  label.append(input, text);

  return label;
}

export function mountPlaceFilters(
  root: ParentNode = document,
  options: PlaceFiltersOptions,
): PlaceFiltersController {
  const elements = resolveElements(root);
  const selectedCategoryIds = new Set<CampaignCategory['id']>();
  const selectedTagIds = new Set<TagId>();

  const categoryPlaceCounts = new Map(
    options.catalog.categories.map((category) => [
      category.id,
      options.catalog.places.filter(({ categoryId }) => categoryId === category.id).length,
    ]),
  );
  const tagPlaceCounts = new Map(
    options.catalog.tags.map((tag) => [
      tag.id,
      options.catalog.places.filter((place) =>
        getPublicPlaceFilterTagIds(options.catalog, place).includes(tag.id),
      ).length,
    ]),
  );

  elements.categories.replaceChildren(
    ...options.catalog.categories.map((category) =>
      createFilterOption(
        'category',
        category.id,
        category.name,
        category.description,
        categoryPlaceCounts.get(category.id) ?? 0,
      ),
    ),
  );
  elements.tags.replaceChildren(
    ...options.catalog.tags.map((tag) =>
      createFilterOption(
        'tag',
        tag.id,
        tag.name,
        tag.description,
        tagPlaceCounts.get(tag.id) ?? 0,
      ),
    ),
  );

  const getState = (): PublicPlaceFilterState => ({
    selectedCategoryIds: options.catalog.categories
      .filter(({ id }) => selectedCategoryIds.has(id))
      .map(({ id }) => id),
    selectedTagIds: options.catalog.tags
      .filter(({ id }) => selectedTagIds.has(id))
      .map(({ id }) => id),
  });

  const handleChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox') {
      return;
    }

    const kind = event.target.dataset.placeFilterKind;
    const id = event.target.dataset.placeFilterId;

    if (!id) {
      return;
    }

    const targetSet = kind === 'category' ? selectedCategoryIds : selectedTagIds;

    if (event.target.checked) {
      targetSet.add(id as CampaignCategory['id'] & TagId);
    } else {
      targetSet.delete(id as CampaignCategory['id'] & TagId);
    }

    options.onChange();
  };

  const clear = (): void => {
    selectedCategoryIds.clear();
    selectedTagIds.clear();
    elements.root
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((input) => {
        input.checked = false;
      });
    options.onChange();
  };

  const handleClear = (): void => {
    clear();
    elements.clearButton.focus();
  };

  elements.root.addEventListener('change', handleChange);
  elements.clearButton.addEventListener('click', handleClear);

  return {
    getState,
    clear,
    setMatchSummary(matchCount: number, activePlaceMatches: boolean | null): void {
      elements.root.dataset.matchCount = String(matchCount);
      elements.root.dataset.hasMatches = matchCount === 0 ? 'false' : 'true';

      const countMessage =
        matchCount === 0
          ? 'Ningún lugar coincide con la búsqueda y los filtros actuales.'
          : matchCount === 1
            ? '1 lugar coincide con la búsqueda y los filtros actuales.'
            : `${matchCount} lugares coinciden con la búsqueda y los filtros actuales.`;
      const activeMessage =
        activePlaceMatches === false
          ? ' El lugar activo no coincide, pero permanece disponible y se puede consultar.'
          : '';

      elements.status.textContent = `${countMessage}${activeMessage}`;
    },
    destroy(): void {
      elements.root.removeEventListener('change', handleChange);
      elements.clearButton.removeEventListener('click', handleClear);
      elements.categories.replaceChildren();
      elements.tags.replaceChildren();
    },
  };
}
