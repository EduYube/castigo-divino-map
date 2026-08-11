import type { CompactPinDetailModel } from '../data/compactPinDetails';
import { createPlayerDispositionVisuals, getPinTypeVisual } from '../domain/pinVisualSystem';

export interface CompactPinDetailsController {
  show(details: CompactPinDetailModel, options?: CompactPinDetailsShowOptions): void;
  hide(): void;
  destroy(): void;
}

export interface CompactPinDetailsShowOptions {
  readonly focus?: boolean;
}

export interface CompactPinDetailsOptions {
  readonly onClose: () => void;
  readonly createFullDetailsUrl: (details: CompactPinDetailModel) => string | null;
  readonly loadPortrait?: (
    details: CompactPinDetailModel,
    signal: AbortSignal,
  ) => Promise<string | null>;
}

interface CompactPinDetailsElements {
  readonly workspace: HTMLElement;
  readonly panel: HTMLElement;
  readonly content: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  readonly returnButton: HTMLButtonElement;
}

const MOBILE_SHEET_MEDIA_QUERY = '(max-width: 48rem)';

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required compact pin details element: ${selector}`);
  }

  return element;
}

function createReturnButton(closeButton: HTMLButtonElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'place-details__return';
  button.dataset.placeDetailsReturn = '';
  button.textContent = 'Volver al pin';
  button.setAttribute('aria-label', 'Volver al pin seleccionado');
  closeButton.before(button);
  return button;
}

function resolveElements(root: ParentNode): CompactPinDetailsElements {
  const closeButton = getRequiredElement<HTMLButtonElement>(root, '[data-place-details-close]');

  return {
    workspace: getRequiredElement(root, '[data-map-workspace]'),
    panel: getRequiredElement(root, '[data-place-details]'),
    content: getRequiredElement(root, '[data-place-details-content]'),
    closeButton,
    returnButton: createReturnButton(closeButton),
  };
}

function isMobileSheet(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_SHEET_MEDIA_QUERY).matches
  );
}

function restoreViewportPosition(scrollX: number, scrollY: number): void {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;

  root.style.scrollBehavior = 'auto';
  window.scrollTo(scrollX, scrollY);
  root.style.scrollBehavior = previousScrollBehavior;
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

function appendType(parent: HTMLElement, details: CompactPinDetailModel): void {
  const type = getPinTypeVisual(details.entityType);
  const row = document.createElement('p');
  const shape = document.createElement('span');
  const label = document.createElement('span');

  row.className = 'compact-details__type';
  shape.className = `compact-details__type-shape compact-details__type-shape--${details.entityType}`;
  shape.setAttribute('aria-hidden', 'true');
  shape.textContent = type.symbol;
  label.textContent = type.label;
  row.append(shape, label);
  parent.append(row);
}

function appendCategory(parent: HTMLElement, details: CompactPinDetailModel): void {
  const row = document.createElement('p');
  const label = document.createElement('span');
  const value = document.createElement('span');

  row.className = 'compact-details__category';
  label.className = 'compact-details__meta-label';
  label.textContent = 'Categoría';
  value.className = 'compact-details__category-value';
  value.textContent = details.category.name;
  row.append(label, value);
  parent.append(row);
}

function appendDispositions(parent: HTMLElement, details: CompactPinDetailModel): void {
  const section = document.createElement('section');
  const heading = appendTextElement(
    section,
    'h4',
    'compact-details__section-title',
    'Disposición por jugador',
  );
  const list = document.createElement('ul');

  heading.id = 'compact-details-dispositions-title';
  section.setAttribute('aria-labelledby', heading.id);
  list.className = 'compact-details__dispositions';

  for (const disposition of createPlayerDispositionVisuals(details.dispositions)) {
    const item = document.createElement('li');
    const symbol = document.createElement('span');
    const player = document.createElement('span');
    const state = document.createElement('span');

    item.className = 'compact-details__disposition';
    symbol.className = `pin-disposition ${disposition.className}`;
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = disposition.symbol;
    player.className = 'compact-details__disposition-player';
    player.textContent = disposition.playerName;
    state.className = 'compact-details__disposition-state';
    state.textContent = disposition.label;
    item.append(symbol, player, state);
    list.append(item);
  }

  section.append(list);
  parent.append(section);
}

function appendTags(parent: HTMLElement, details: CompactPinDetailModel): void {
  const section = document.createElement('section');
  const heading = appendTextElement(section, 'h4', 'compact-details__section-title', 'Etiquetas');

  heading.id = 'compact-details-tags-title';
  section.setAttribute('aria-labelledby', heading.id);

  if (details.tags.length === 0) {
    appendTextElement(section, 'p', 'compact-details__empty', 'Sin etiquetas públicas.');
    parent.append(section);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'compact-details__tags';
  details.tags.forEach((tag) => appendTextElement(list, 'li', 'compact-details__tag', tag.name));
  section.append(list);
  parent.append(section);
}

function appendImportantCharacters(parent: HTMLElement, details: CompactPinDetailModel): void {
  if (details.entityType !== 'location' || details.importantCharacters.length === 0) {
    return;
  }

  const section = document.createElement('section');
  const heading = appendTextElement(
    section,
    'h4',
    'compact-details__section-title',
    'Personajes importantes aquí',
  );
  const list = document.createElement('ul');

  heading.id = 'compact-details-important-characters-title';
  section.setAttribute('aria-labelledby', heading.id);
  list.className = 'compact-details__important-characters';

  details.importantCharacters.forEach((character) => {
    const item = document.createElement('li');
    const name = appendTextElement(item, 'span', 'compact-details__character-name', character.name);
    const status = appendTextElement(
      item,
      'span',
      'compact-details__relation-status',
      character.relationLabel,
    );

    name.dataset.entityId = character.id;
    status.dataset.relationStatus = character.relationStatus;
    list.append(item);
  });

  section.append(list);
  parent.append(section);
}

function appendFullDetailsAction(
  parent: HTMLElement,
  details: CompactPinDetailModel,
  url: string | null,
): void {
  const section = document.createElement('section');
  const note = document.createElement('p');

  section.className = 'compact-details__full-boundary';
  note.className = 'compact-details__future-note';
  note.id = 'compact-details-full-note';

  if (url) {
    const link = document.createElement('a');
    link.className = 'compact-details__full-action';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Abrir ficha completa';
    link.setAttribute('aria-label', `Abrir ficha completa de ${details.name} en una pestaña nueva`);
    link.setAttribute('aria-describedby', note.id);
    note.textContent = 'Se abrirá en una pestaña nueva para conservar el estado actual del mapa.';
    section.append(link, note);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'compact-details__full-action';
    button.textContent = 'Abrir ficha completa';
    button.disabled = true;
    button.setAttribute('aria-describedby', note.id);
    note.textContent = 'Esta entidad no dispone de una ficha completa pública en Beta 0.2.';
    section.append(button, note);
  }

  parent.append(section);
}

function appendPortrait(content: HTMLElement, details: CompactPinDetailModel, url: string): void {
  const title = content.querySelector<HTMLElement>('#place-details-title');
  if (!title || content.querySelector('[data-character-portrait]')) return;

  const figure = document.createElement('figure');
  const image = document.createElement('img');
  figure.className = 'compact-details__portrait';
  figure.dataset.characterPortrait = '';
  image.className = 'compact-details__portrait-image';
  image.src = url;
  image.alt = `Retrato de ${details.name}`;
  image.width = 112;
  image.height = 112;
  image.decoding = 'async';
  image.setAttribute('data-testid', 'compact-character-portrait');
  image.addEventListener('error', () => figure.remove(), { once: true });
  figure.append(image);
  title.before(figure);
}

function createDetailsSignature(details: CompactPinDetailModel): string {
  return JSON.stringify({
    id: details.id,
    name: details.name,
    portraitPath: details.portraitPath,
    category: details.category,
    tags: details.tags,
    dispositions: details.dispositions,
    importantCharacters: details.importantCharacters,
    entitySlug: details.entitySlug,
  });
}

function renderDetails(
  content: HTMLElement,
  details: CompactPinDetailModel,
  fullDetailsUrl: string | null,
): HTMLElement {
  content.replaceChildren();
  appendType(content, details);

  const title = appendTextElement(
    content,
    'h3',
    'place-details__title compact-details__title',
    details.name,
  );
  title.id = 'place-details-title';
  title.tabIndex = -1;

  appendCategory(content, details);
  appendDispositions(content, details);
  appendTags(content, details);
  appendImportantCharacters(content, details);
  appendFullDetailsAction(content, details, fullDetailsUrl);
  return title;
}

export function mountCompactPinDetails(
  root: ParentNode = document,
  options: CompactPinDetailsOptions,
): CompactPinDetailsController {
  const elements = resolveElements(root);
  let portraitAbort: AbortController | null = null;
  const closePreservingViewport = (): void => {
    const preserveViewport = isMobileSheet();
    const scrollX = preserveViewport ? window.scrollX : 0;
    const scrollY = preserveViewport ? window.scrollY : 0;

    options.onClose();

    if (!preserveViewport) {
      return;
    }

    restoreViewportPosition(scrollX, scrollY);
    window.requestAnimationFrame(() => restoreViewportPosition(scrollX, scrollY));
  };
  const handleClose = (): void => closePreservingViewport();
  const handleReturnToPin = (): void => {
    const marker = elements.workspace.querySelector<HTMLElement>(
      '.campaign-marker-icon[aria-pressed="true"]',
    );

    if (!marker) {
      return;
    }

    const preserveViewport = isMobileSheet();
    const scrollX = preserveViewport ? window.scrollX : 0;
    const scrollY = preserveViewport ? window.scrollY : 0;

    marker.focus({ preventScroll: preserveViewport });

    if (preserveViewport) {
      restoreViewportPosition(scrollX, scrollY);
      window.requestAnimationFrame(() => restoreViewportPosition(scrollX, scrollY));
    }
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || elements.panel.hidden || !isMobileSheet()) {
      return;
    }

    event.preventDefault();
    closePreservingViewport();
  };

  elements.closeButton.addEventListener('click', handleClose);
  elements.returnButton.addEventListener('click', handleReturnToPin);
  elements.workspace.addEventListener('keydown', handleKeyDown);

  return {
    show(details, showOptions = {}): void {
      const existingTitle = elements.content.querySelector<HTMLElement>('#place-details-title');
      const detailsSignature = createDetailsSignature(details);
      const canReuseContent =
        !elements.panel.hidden &&
        elements.panel.dataset.activePinId === details.id &&
        elements.panel.dataset.detailsSignature === detailsSignature &&
        existingTitle !== null;
      const title = canReuseContent
        ? existingTitle
        : renderDetails(elements.content, details, options.createFullDetailsUrl(details));

      elements.panel.hidden = false;
      elements.panel.dataset.activePinId = details.id;
      elements.panel.dataset.entityType = details.entityType;
      elements.panel.dataset.detailSource = details.source;
      elements.panel.dataset.detailsSignature = detailsSignature;
      if (details.legacyPlaceId) elements.panel.dataset.activePlaceId = details.legacyPlaceId;
      else delete elements.panel.dataset.activePlaceId;
      if (details.entityId) elements.panel.dataset.entityId = details.entityId;
      else delete elements.panel.dataset.entityId;
      elements.workspace.dataset.detailsOpen = 'true';
      elements.closeButton.setAttribute('aria-label', `Cerrar la ficha de ${details.name}`);
      elements.closeButton.setAttribute('aria-keyshortcuts', 'Escape');
      elements.returnButton.setAttribute('aria-label', `Volver al pin de ${details.name}`);

      if (!canReuseContent) {
        elements.panel.scrollTop = 0;
        portraitAbort?.abort();
        portraitAbort = null;
        if (details.portraitPath && options.loadPortrait) {
          const request = new AbortController();
          portraitAbort = request;
          void options.loadPortrait(details, request.signal).then((url) => {
            if (
              !url ||
              request.signal.aborted ||
              elements.panel.hidden ||
              elements.panel.dataset.activePinId !== details.id
            ) {
              return;
            }
            appendPortrait(elements.content, details, url);
          });
        }
      }

      if (showOptions.focus !== false) {
        title.focus({ preventScroll: isMobileSheet() });
      }
    },
    hide(): void {
      portraitAbort?.abort();
      portraitAbort = null;
      const preserveViewport = isMobileSheet();
      const scrollX = preserveViewport ? window.scrollX : 0;
      const scrollY = preserveViewport ? window.scrollY : 0;

      elements.panel.hidden = true;
      delete elements.panel.dataset.activePinId;
      delete elements.panel.dataset.activePlaceId;
      delete elements.panel.dataset.entityId;
      delete elements.panel.dataset.entityType;
      delete elements.panel.dataset.detailSource;
      delete elements.panel.dataset.detailsSignature;
      delete elements.workspace.dataset.detailsOpen;
      elements.closeButton.setAttribute('aria-label', 'Cerrar la ficha compacta');
      elements.closeButton.removeAttribute('aria-keyshortcuts');
      elements.returnButton.setAttribute('aria-label', 'Volver al pin seleccionado');
      elements.content.replaceChildren();

      if (preserveViewport) {
        void elements.workspace.offsetHeight;
        restoreViewportPosition(scrollX, scrollY);
      }
    },
    destroy(): void {
      portraitAbort?.abort();
      portraitAbort = null;
      elements.closeButton.removeEventListener('click', handleClose);
      elements.returnButton.removeEventListener('click', handleReturnToPin);
      elements.workspace.removeEventListener('keydown', handleKeyDown);
      elements.returnButton.remove();
    },
  };
}
