import { createFullEntityUrl } from './fullEntityUrl';
import type { FullEntityDetailModel } from '../data/fullEntityDetails';
import { createPlayerDispositionVisuals, getPinTypeVisual } from '../domain/pinVisualSystem';

export interface FullEntityDetailsController {
  show(details: FullEntityDetailModel, options?: { readonly focus?: boolean }): void;
  showUnavailable(options?: { readonly focus?: boolean }): void;
}

export interface FullEntityDetailsOptions {
  readonly loadPortrait?: (
    details: FullEntityDetailModel,
    signal: AbortSignal,
  ) => Promise<string | null>;
}

interface FullEntityDetailsElements {
  readonly title: HTMLHeadingElement;
  readonly type: HTMLElement;
  readonly body: HTMLElement;
  readonly status: HTMLElement;
  readonly mapLink: HTMLAnchorElement;
}

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required full entity details element: ${selector}`);
  }

  return element;
}

function ensureDescriptionMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');

  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.append(meta);
  }

  return meta;
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

function appendSection(parent: HTMLElement, title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'full-entity__section';
  appendTextElement(section, 'h2', 'full-entity__section-title', title);
  parent.append(section);
  return section;
}

function appendAliases(parent: HTMLElement, details: FullEntityDetailModel): void {
  if (details.aliases.length === 0) return;

  const section = appendSection(parent, 'Nombres adicionales');
  const list = document.createElement('ul');
  list.className = 'full-entity__aliases';
  details.aliases.forEach((alias) => appendTextElement(list, 'li', '', alias));
  section.append(list);
}

function appendCategory(parent: HTMLElement, details: FullEntityDetailModel): void {
  const section = appendSection(parent, 'Categoría');
  appendTextElement(section, 'p', 'full-entity__category-name', details.category.name);
  if (details.category.description) {
    appendTextElement(section, 'p', 'full-entity__muted', details.category.description);
  }
}

function appendTags(parent: HTMLElement, details: FullEntityDetailModel): void {
  const section = appendSection(parent, 'Etiquetas');

  if (details.tags.length === 0) {
    appendTextElement(section, 'p', 'full-entity__muted', 'Sin etiquetas públicas.');
    return;
  }

  const list = document.createElement('ul');
  list.className = 'full-entity__tags';

  details.tags.forEach((tag) => {
    const item = document.createElement('li');
    appendTextElement(item, 'strong', '', tag.name);
    if (tag.description) appendTextElement(item, 'span', '', tag.description);
    list.append(item);
  });

  section.append(list);
}

function appendDispositions(parent: HTMLElement, details: FullEntityDetailModel): void {
  const section = appendSection(parent, 'Disposición por jugador');
  const list = document.createElement('ul');
  list.className = 'full-entity__dispositions';

  createPlayerDispositionVisuals(details.dispositions).forEach((disposition) => {
    const item = document.createElement('li');
    const symbol = appendTextElement(
      item,
      'span',
      `pin-disposition ${disposition.className}`,
      disposition.symbol,
    );
    symbol.setAttribute('aria-hidden', 'true');
    appendTextElement(item, 'strong', '', disposition.playerName);
    appendTextElement(item, 'span', '', disposition.label);
    list.append(item);
  });

  section.append(list);
}

function appendNotes(parent: HTMLElement, details: FullEntityDetailModel): void {
  const section = appendSection(parent, 'Notas públicas');

  if (details.notes.length === 0) {
    appendTextElement(section, 'p', 'full-entity__muted', 'Sin notas públicas.');
    return;
  }

  details.notes.forEach((note) => {
    const article = document.createElement('article');
    article.className = 'full-entity__note';
    appendTextElement(article, 'h3', 'full-entity__note-title', note.title);
    appendTextElement(article, 'p', 'full-entity__note-body', note.body);

    if (note.tags.length > 0) {
      const tags = document.createElement('ul');
      tags.className = 'full-entity__note-tags';
      tags.setAttribute('aria-label', `Etiquetas de la nota ${note.title}`);
      note.tags.forEach((tag) => appendTextElement(tags, 'li', '', tag.name));
      article.append(tags);
    }

    section.append(article);
  });
}

function appendEntityLink(
  parent: HTMLElement,
  sourceUrl: URL,
  relation: FullEntityDetailModel['importantCharacters'][number],
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = createFullEntityUrl(sourceUrl, relation.slug).href;
  link.textContent = relation.name;
  parent.append(link);
  return link;
}

function appendRelations(
  parent: HTMLElement,
  details: FullEntityDetailModel,
  sourceUrl: URL,
): void {
  const relations =
    details.entityType === 'location' ? details.importantCharacters : details.relatedLocations;
  const section = appendSection(
    parent,
    details.entityType === 'location' ? 'Personajes importantes aquí' : 'Ubicaciones relacionadas',
  );

  if (relations.length === 0) {
    appendTextElement(section, 'p', 'full-entity__muted', 'Sin relaciones públicas disponibles.');
    return;
  }

  const list = document.createElement('ul');
  list.className = 'full-entity__relations';
  relations.forEach((relation) => {
    const item = document.createElement('li');
    appendEntityLink(item, sourceUrl, relation);
    const status = appendTextElement(
      item,
      'span',
      'full-entity__relation-status',
      relation.relationLabel,
    );
    status.dataset.relationStatus = relation.relationStatus;
    list.append(item);
  });
  section.append(list);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function appendHistory(parent: HTMLElement, details: FullEntityDetailModel, sourceUrl: URL): void {
  if (details.entityType !== 'character' || details.locationHistory.length === 0) return;

  const section = appendSection(parent, 'Historial público de localización');
  const list = document.createElement('ol');
  list.className = 'full-entity__history';

  details.locationHistory.forEach((entry) => {
    const item = document.createElement('li');
    const heading = appendTextElement(item, 'h3', 'full-entity__history-title', entry.eventLabel);
    const location = document.createElement('p');
    location.className = 'full-entity__history-location';

    if (entry.locationSlug) {
      const link = document.createElement('a');
      link.href = createFullEntityUrl(sourceUrl, entry.locationSlug).href;
      link.textContent = entry.locationName;
      location.append(link);
    } else {
      location.textContent = entry.locationName;
    }

    item.append(location);
    if (entry.summary) appendTextElement(item, 'p', '', entry.summary);

    if (entry.observedAt) {
      const time = document.createElement('time');
      time.dateTime = entry.observedAt;
      time.textContent = formatDate(entry.observedAt);
      heading.append(' · ', time);
    }

    list.append(item);
  });

  section.append(list);
}

function appendPortrait(
  elements: FullEntityDetailsElements,
  details: FullEntityDetailModel,
  url: string,
): void {
  if (elements.body.querySelector('[data-character-portrait]')) return;
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  figure.className = 'full-entity__portrait';
  figure.dataset.characterPortrait = '';
  image.className = 'full-entity__portrait-image';
  image.src = url;
  image.alt = `Retrato de ${details.name}`;
  image.width = 288;
  image.height = 288;
  image.decoding = 'async';
  image.setAttribute('data-testid', 'full-character-portrait');
  image.addEventListener('error', () => figure.remove(), { once: true });
  figure.append(image);
  elements.body.prepend(figure);
}

function renderDetails(elements: FullEntityDetailsElements, details: FullEntityDetailModel): void {
  const type = getPinTypeVisual(details.entityType);
  elements.body.replaceChildren();
  elements.type.replaceChildren();

  const shape = appendTextElement(
    elements.type,
    'span',
    `full-entity__type-shape full-entity__type-shape--${details.entityType}`,
    type.symbol,
  );
  shape.setAttribute('aria-hidden', 'true');
  appendTextElement(elements.type, 'span', '', type.label);

  elements.title.textContent = details.name;
  elements.status.hidden = true;
  elements.status.textContent = '';

  if (details.summary)
    appendTextElement(elements.body, 'p', 'full-entity__summary', details.summary);
  if (details.description)
    appendTextElement(elements.body, 'p', 'full-entity__description', details.description);
  appendAliases(elements.body, details);
  appendCategory(elements.body, details);
  appendTags(elements.body, details);
  appendDispositions(elements.body, details);
  appendNotes(elements.body, details);
  appendRelations(elements.body, details, new URL(window.location.href));
  appendHistory(elements.body, details, new URL(window.location.href));

  const updateSection = appendSection(elements.body, 'Actualización pública');
  const updateText = document.createElement('p');
  updateText.append('Proyección pública generada el ');
  const time = document.createElement('time');
  time.dateTime = details.publicUpdatedAt;
  time.textContent = formatDate(details.publicUpdatedAt);
  updateText.append(time, '.');
  updateSection.append(updateText);

  document.title = `${details.name} · El Atlas de los Nuevos Dioses`;
  ensureDescriptionMeta().content =
    details.summary ||
    `Ficha pública completa de ${details.name} en El Atlas de los Nuevos Dioses.`;
}

export function renderFullEntityDetailsShell(): string {
  return `
    <a class="skip-link" href="#full-entity-main">Saltar al contenido principal</a>
    <header class="site-header">
      <a class="brand" data-full-entity-map-link href="">
        <span class="brand__mark" aria-hidden="true">✦</span>
        <span>Castigo Divino</span>
      </a>
      <div class="site-header__badges" aria-label="Estado de la aplicación">
        <span class="release-badge">Beta 0.2</span>
        <span class="fan-badge">Contenido de fans no oficial</span>
      </div>
    </header>
    <main id="full-entity-main" class="full-entity" data-full-entity-page>
      <nav class="full-entity__navigation" aria-label="Navegación de la ficha">
        <a data-full-entity-map-link href="">← Volver al mapa</a>
      </nav>
      <article class="full-entity__card" aria-labelledby="full-entity-title">
        <p class="full-entity__type" data-full-entity-type>Ficha pública completa</p>
        <h1 id="full-entity-title" data-full-entity-title tabindex="-1">Cargando ficha completa…</h1>
        <p class="full-entity__status" data-full-entity-status role="status" aria-live="polite">
          Resolviendo la entidad desde la proyección pública segura…
        </p>
        <div class="full-entity__body" data-full-entity-body></div>
      </article>
    </main>
    <footer class="site-footer">
      <p>
        El Atlas de los Nuevos Dioses es contenido de fans no oficial permitido por la Política de
        contenido de fans. No está aprobado ni respaldado por Wizards. Parte de los materiales
        utilizados es propiedad de Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
    </footer>
  `;
}

export function mountFullEntityDetails(
  root: ParentNode,
  mapUrl: URL,
  options: FullEntityDetailsOptions = {},
): FullEntityDetailsController {
  const elements: FullEntityDetailsElements = {
    title: getRequiredElement(root, '[data-full-entity-title]'),
    type: getRequiredElement(root, '[data-full-entity-type]'),
    body: getRequiredElement(root, '[data-full-entity-body]'),
    status: getRequiredElement(root, '[data-full-entity-status]'),
    mapLink: getRequiredElement(root, '[data-full-entity-map-link]'),
  };
  let portraitAbort: AbortController | null = null;

  root.querySelectorAll<HTMLAnchorElement>('[data-full-entity-map-link]').forEach((link) => {
    link.href = mapUrl.href;
  });

  const focusTitle = (): void => {
    window.requestAnimationFrame(() => elements.title.focus({ preventScroll: true }));
  };

  return {
    show(details, showOptions = {}): void {
      portraitAbort?.abort();
      portraitAbort = null;
      renderDetails(elements, details);
      if (details.portraitPath && options.loadPortrait) {
        const request = new AbortController();
        portraitAbort = request;
        void options.loadPortrait(details, request.signal).then((url) => {
          if (!url || request.signal.aborted || elements.title.textContent !== details.name) return;
          appendPortrait(elements, details, url);
        });
      }
      if (showOptions.focus !== false) focusTitle();
    },
    showUnavailable(showOptions = {}): void {
      portraitAbort?.abort();
      portraitAbort = null;
      elements.type.textContent = 'Ficha pública completa';
      elements.title.textContent = 'Entidad no disponible';
      elements.body.replaceChildren();
      elements.status.hidden = false;
      elements.status.setAttribute('role', 'alert');
      elements.status.textContent =
        'No se puede mostrar esta entidad con la proyección pública disponible. Puede que no exista, no sea pública o los datos remotos no estén disponibles.';
      document.title = 'Entidad no disponible · El Atlas de los Nuevos Dioses';
      ensureDescriptionMeta().content =
        'La entidad solicitada no está disponible en la proyección pública del Atlas.';
      if (showOptions.focus !== false) focusTitle();
    },
  };
}
