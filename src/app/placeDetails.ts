import type { PlaceDetailModel, PublicNoteDetailModel } from '../data/placeDetails';

export interface PlaceDetailsController {
  show(details: PlaceDetailModel): void;
  hide(): void;
  destroy(): void;
}

export interface PlaceDetailsOptions {
  readonly onClose: () => void;
}

interface PlaceDetailsElements {
  readonly workspace: HTMLElement;
  readonly panel: HTMLElement;
  readonly content: HTMLElement;
  readonly closeButton: HTMLButtonElement;
}

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required place details element: ${selector}`);
  }

  return element;
}

function resolveElements(root: ParentNode): PlaceDetailsElements {
  return {
    workspace: getRequiredElement(root, '[data-map-workspace]'),
    panel: getRequiredElement(root, '[data-place-details]'),
    content: getRequiredElement(root, '[data-place-details-content]'),
    closeButton: getRequiredElement<HTMLButtonElement>(root, '[data-place-details-close]'),
  };
}

function appendTextElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  element.className = className;
  element.textContent = text;
  parent.append(element);

  return element;
}

function appendAliases(parent: HTMLElement, aliases: readonly string[]): void {
  if (aliases.length === 0) {
    return;
  }

  const section = document.createElement('section');
  const heading = appendTextElement(section, 'h4', 'place-details__section-title', 'Alias públicos');
  const list = document.createElement('ul');

  heading.id = 'place-details-aliases-title';
  section.setAttribute('aria-labelledby', heading.id);
  list.className = 'place-details__aliases';

  aliases.forEach((alias) => {
    appendTextElement(list, 'li', '', alias);
  });

  section.append(list);
  parent.append(section);
}

function appendTags(parent: HTMLElement, details: PlaceDetailModel): void {
  const section = document.createElement('section');
  const heading = appendTextElement(section, 'h4', 'place-details__section-title', 'Etiquetas');
  const list = document.createElement('ul');

  heading.id = 'place-details-tags-title';
  section.setAttribute('aria-labelledby', heading.id);
  list.className = 'place-details__tags';

  details.tags.forEach((tag) => {
    const item = appendTextElement(list, 'li', 'place-details__tag', tag.name);

    item.title = tag.description;
  });

  section.append(list);
  parent.append(section);
}

function appendNote(parent: HTMLElement, note: PublicNoteDetailModel, index: number): void {
  const article = document.createElement('article');
  const heading = appendTextElement(article, 'h5', 'place-details__note-title', note.title);

  heading.id = `place-details-note-${index}`;
  article.className = 'place-details__note';
  article.setAttribute('aria-labelledby', heading.id);
  appendTextElement(article, 'p', 'place-details__note-body', note.body);
  parent.append(article);
}

function appendNotes(parent: HTMLElement, details: PlaceDetailModel): void {
  const section = document.createElement('section');
  const heading = appendTextElement(
    section,
    'h4',
    'place-details__section-title',
    'Notas públicas',
  );

  heading.id = 'place-details-notes-title';
  section.className = 'place-details__notes';
  section.setAttribute('aria-labelledby', heading.id);

  if (details.notes.length === 0) {
    appendTextElement(section, 'p', 'place-details__empty', 'No hay notas públicas asociadas.');
  } else {
    details.notes.forEach((note, index) => appendNote(section, note, index));
  }

  parent.append(section);
}

function renderDetails(content: HTMLElement, details: PlaceDetailModel): HTMLElement {
  content.replaceChildren();

  appendTextElement(content, 'p', 'eyebrow', details.category.name);

  const title = appendTextElement(content, 'h3', 'place-details__title', details.name);

  title.id = 'place-details-title';
  title.tabIndex = -1;

  appendTextElement(
    content,
    'p',
    'place-details__category-description',
    details.category.description,
  );
  appendAliases(content, details.aliases);
  appendTags(content, details);
  appendNotes(content, details);

  return title;
}

export function mountPlaceDetails(
  root: ParentNode = document,
  options: PlaceDetailsOptions,
): PlaceDetailsController {
  const elements = resolveElements(root);
  const handleClose = (): void => options.onClose();

  elements.closeButton.addEventListener('click', handleClose);

  return {
    show(details: PlaceDetailModel): void {
      const title = renderDetails(elements.content, details);

      elements.panel.hidden = false;
      elements.panel.dataset.activePlaceId = details.id;
      elements.workspace.dataset.detailsOpen = 'true';
      title.focus({ preventScroll: false });
    },
    hide(): void {
      elements.panel.hidden = true;
      delete elements.panel.dataset.activePlaceId;
      delete elements.workspace.dataset.detailsOpen;
      elements.content.replaceChildren();
    },
    destroy(): void {
      elements.closeButton.removeEventListener('click', handleClose);
    },
  };
}
