import type { FullEntityDetailModel } from '../data/fullEntityDetails';
import type { PlayerId } from '../data/beta02-model';
import {
  PUBLIC_NOTE_BODY_MAX_LENGTH,
  PUBLIC_NOTE_TITLE_MAX_LENGTH,
  validatePublicNoteDraft,
  type PublicNoteWriteRecord,
} from '../domain/publicNotes';
import { SupabaseAdminAuthAdapter } from '../infrastructure/supabase/adminAuthAdapter';
import { AUTH_SESSION_STORAGE_KEY } from '../infrastructure/supabase/authSessionStorage';
import {
  PublicNoteRepositoryError,
  SupabasePublicNoteRepository,
} from '../infrastructure/supabase/publicNoteRepository';
import {
  SupabasePublicNoteRosterRepository,
  type PublicNoteRosterPlayer,
} from '../infrastructure/supabase/publicNoteRosterRepository';

interface PublicNotesTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly timeoutMs?: number;
}

declare global {
  interface Window {
    __MAP063_PUBLIC_NOTES_TEST_CONFIG__?: PublicNotesTestConfig;
  }
}

type AuthorMode = 'visitor' | 'master' | 'unverified';

interface PublicNotesElements {
  readonly section: HTMLElement;
  readonly heading: HTMLHeadingElement;
  readonly list: HTMLElement;
  readonly form: HTMLFormElement;
  readonly authorField: HTMLElement;
  readonly authorSelect: HTMLSelectElement;
  readonly authorError: HTMLElement;
  readonly titleInput: HTMLInputElement;
  readonly titleError: HTMLElement;
  readonly bodyInput: HTMLTextAreaElement;
  readonly bodyError: HTMLElement;
  readonly submit: HTMLButtonElement;
  readonly retry: HTMLButtonElement;
  readonly status: HTMLElement;
}

function appendText<K extends keyof HTMLElementTagNameMap>(
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function findLegacyNotesSection(root: ParentNode): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>('.full-entity__section')).find(
      (section) => section.querySelector('h2')?.textContent === 'Notas públicas',
    ) ?? null
  );
}

function resolveConfiguration(): {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly timeoutMs: number | undefined;
} {
  const testConfig = import.meta.env.DEV ? window.__MAP063_PUBLIC_NOTES_TEST_CONFIG__ : undefined;
  return {
    projectUrl: testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey:
      testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    timeoutMs: testConfig?.timeoutMs,
  };
}

function createElements(root: ParentNode): PublicNotesElements {
  const legacy = findLegacyNotesSection(root);
  const section = document.createElement('section');
  section.className = 'full-entity__section public-notes';
  section.dataset.publicNotesSection = '';
  const heading = appendText(section, 'h2', 'full-entity__section-title', 'Notas públicas');
  heading.tabIndex = -1;

  const list = document.createElement('div');
  list.className = 'public-notes__list';
  list.dataset.publicNoteList = '';
  section.append(list);

  const form = document.createElement('form');
  form.className = 'public-notes__form';
  form.dataset.publicNoteForm = '';
  form.noValidate = true;
  form.setAttribute('aria-labelledby', 'public-note-form-title');
  const formTitle = appendText(form, 'h3', 'public-notes__form-title', 'Añadir nota pública');
  formTitle.id = 'public-note-form-title';

  const authorField = document.createElement('div');
  authorField.className = 'public-notes__field';
  const authorLabel = document.createElement('label');
  authorLabel.htmlFor = 'public-note-author';
  authorLabel.textContent = 'Autor declarado';
  const authorSelect = document.createElement('select');
  authorSelect.id = 'public-note-author';
  authorSelect.name = 'author';
  authorSelect.required = true;
  authorSelect.setAttribute('aria-describedby', 'public-note-author-help public-note-author-error');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona tu personaje';
  authorSelect.append(placeholder);
  const authorHelp = appendText(
    authorField,
    'p',
    'public-notes__help',
    'La autoría del jugador es declarada: no existe login de jugadores en esta versión.',
  );
  authorHelp.id = 'public-note-author-help';
  const authorError = appendText(authorField, 'p', 'public-notes__error', '');
  authorError.id = 'public-note-author-error';
  authorField.prepend(authorLabel, authorSelect);
  form.append(authorField);

  const titleField = document.createElement('div');
  titleField.className = 'public-notes__field';
  const titleLabel = document.createElement('label');
  titleLabel.htmlFor = 'public-note-title';
  titleLabel.textContent = 'Título';
  const titleInput = document.createElement('input');
  titleInput.id = 'public-note-title';
  titleInput.name = 'title';
  titleInput.type = 'text';
  titleInput.required = true;
  titleInput.maxLength = PUBLIC_NOTE_TITLE_MAX_LENGTH;
  titleInput.autocomplete = 'off';
  titleInput.setAttribute('aria-describedby', 'public-note-title-error');
  const titleError = appendText(titleField, 'p', 'public-notes__error', '');
  titleError.id = 'public-note-title-error';
  titleField.prepend(titleLabel, titleInput);
  form.append(titleField);

  const bodyField = document.createElement('div');
  bodyField.className = 'public-notes__field';
  const bodyLabel = document.createElement('label');
  bodyLabel.htmlFor = 'public-note-body';
  bodyLabel.textContent = 'Nota';
  const bodyInput = document.createElement('textarea');
  bodyInput.id = 'public-note-body';
  bodyInput.name = 'body';
  bodyInput.required = true;
  bodyInput.maxLength = PUBLIC_NOTE_BODY_MAX_LENGTH;
  bodyInput.rows = 6;
  bodyInput.setAttribute('aria-describedby', 'public-note-body-error');
  const bodyError = appendText(bodyField, 'p', 'public-notes__error', '');
  bodyError.id = 'public-note-body-error';
  bodyField.prepend(bodyLabel, bodyInput);
  form.append(bodyField);

  const actions = document.createElement('div');
  actions.className = 'public-notes__form-actions';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Publicar nota';
  submit.dataset.publicNoteSubmit = '';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reintentar conexión';
  retry.hidden = true;
  retry.dataset.publicNoteRetry = '';
  actions.append(submit, retry);
  form.append(actions);

  const status = appendText(form, 'p', 'public-notes__status', '');
  status.dataset.publicNoteStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.tabIndex = -1;
  section.append(form);

  if (legacy) legacy.replaceWith(section);
  else {
    const body = root.querySelector<HTMLElement>('[data-full-entity-body]');
    body?.append(section);
  }

  return {
    section,
    heading,
    list,
    form,
    authorField,
    authorSelect,
    authorError,
    titleInput,
    titleError,
    bodyInput,
    bodyError,
    submit,
    retry,
    status,
  };
}

function isAuthorizationFailure(error: unknown): boolean {
  return (
    error instanceof PublicNoteRepositoryError &&
    (error.code === 'unauthorized' || error.code === 'forbidden')
  );
}

function describeRepositoryError(error: unknown): string {
  if (!(error instanceof PublicNoteRepositoryError)) {
    return 'No se pudo completar la operación con las notas públicas.';
  }
  switch (error.code) {
    case 'rate-limited':
      return 'Se han publicado demasiadas notas en poco tiempo. Conservamos tu texto; inténtalo más tarde.';
    case 'unauthorized':
    case 'forbidden':
      return 'La sesión del Máster ya no está autorizada. No se ha guardado ningún cambio.';
    case 'invalid-input':
      return 'La nota fue rechazada por el servidor. Revisa autor, título y contenido.';
    default:
      return 'No se pudo contactar correctamente con Supabase. Tu texto se conserva para reintentarlo.';
  }
}

function setFieldError(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  error: HTMLElement,
  message: string,
): void {
  error.textContent = message;
  if (message) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
}

export interface PublicNotesController {
  destroy(): void;
}

export function mountPublicNotes(
  root: ParentNode,
  details: FullEntityDetailModel,
): PublicNotesController {
  const elements = createElements(root);
  const configuration = resolveConfiguration();
  let noteRepository: SupabasePublicNoteRepository | null = null;
  let rosterRepository: SupabasePublicNoteRosterRepository | null = null;
  let authAdapter: SupabaseAdminAuthAdapter | null = null;
  let roster: readonly PublicNoteRosterPlayer[] = [];
  let notes: readonly PublicNoteWriteRecord[] = [];
  let mode: AuthorMode = 'unverified';
  let liveAvailable = false;
  let saving = false;
  let destroyed = false;
  let request: AbortController | null = null;
  const fallbackById = new Map(details.notes.map((note) => [note.id, note] as const));

  const playerName = (playerId: PlayerId | null): string =>
    playerId
      ? (roster.find((player) => player.id === playerId)?.displayName ?? 'Jugador no disponible')
      : 'Máster';

  const announce = (message: string, error = false): void => {
    elements.status.textContent = message;
    elements.status.classList.toggle('public-notes__status--error', error);
    elements.status.setAttribute('aria-live', error ? 'assertive' : 'polite');
  };

  const renderFallback = (): void => {
    elements.list.replaceChildren();
    if (details.notes.length === 0) {
      appendText(
        elements.list,
        'p',
        'full-entity__muted',
        'Sin notas públicas en el snapshot disponible.',
      );
      return;
    }
    for (const note of details.notes) {
      const article = document.createElement('article');
      article.className = 'full-entity__note public-note';
      const heading = appendText(article, 'h3', 'full-entity__note-title', note.title);
      heading.tabIndex = -1;
      appendText(article, 'p', 'full-entity__note-body', note.body);
      appendText(
        article,
        'p',
        'public-note__meta',
        'Autoría y última modificación no disponibles mientras se usa el snapshot sin conexión.',
      );
      if (note.tags.length > 0) {
        const tags = document.createElement('ul');
        tags.className = 'full-entity__note-tags';
        tags.setAttribute('aria-label', `Etiquetas de la nota ${note.title}`);
        for (const tag of note.tags) appendText(tags, 'li', '', tag.name);
        article.append(tags);
      }
      elements.list.append(article);
    }
  };

  const focusNote = (noteId: string): void => {
    window.requestAnimationFrame(() => {
      elements.list
        .querySelector<HTMLElement>(`[data-public-note-id="${CSS.escape(noteId)}"] h3`)
        ?.focus({ preventScroll: true });
    });
  };

  const focusAdminAction = (noteId: string, action: 'edit' | 'archive'): void => {
    window.requestAnimationFrame(() => {
      elements.list
        .querySelector<HTMLButtonElement>(
          `[data-public-note-id="${CSS.escape(noteId)}"] [data-public-note-action="${action}"]`,
        )
        ?.focus({ preventScroll: true });
    });
  };

  const renderEditForm = (record: PublicNoteWriteRecord): void => {
    const article = elements.list.querySelector<HTMLElement>(
      `[data-public-note-id="${CSS.escape(record.id)}"]`,
    );
    if (!article || mode !== 'master' || !noteRepository) return;
    article.querySelector('[data-public-note-admin-actions]')?.remove();
    const form = document.createElement('form');
    form.className = 'public-notes__edit-form';
    form.noValidate = true;
    const unique = record.id.replace(/[^a-zA-Z0-9_-]/g, '-');
    const titleId = `public-note-edit-title-${unique}`;
    const bodyId = `public-note-edit-body-${unique}`;
    const titleLabel = document.createElement('label');
    titleLabel.htmlFor = titleId;
    titleLabel.textContent = 'Título';
    const title = document.createElement('input');
    title.id = titleId;
    title.value = record.title;
    title.maxLength = PUBLIC_NOTE_TITLE_MAX_LENGTH;
    title.required = true;
    const bodyLabel = document.createElement('label');
    bodyLabel.htmlFor = bodyId;
    bodyLabel.textContent = 'Nota';
    const body = document.createElement('textarea');
    body.id = bodyId;
    body.value = record.body;
    body.maxLength = PUBLIC_NOTE_BODY_MAX_LENGTH;
    body.required = true;
    body.rows = 5;
    const error = appendText(form, 'p', 'public-notes__error', '');
    error.setAttribute('aria-live', 'assertive');
    error.tabIndex = -1;
    const actions = document.createElement('div');
    actions.className = 'public-notes__form-actions';
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Guardar cambios';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancelar';
    actions.append(save, cancel);
    form.prepend(titleLabel, title, bodyLabel, body);
    form.append(actions);
    article.append(form);
    title.focus();
    cancel.addEventListener('click', () => {
      renderList();
      focusAdminAction(record.id, 'edit');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (saving || !noteRepository) return;
      const validation = validatePublicNoteDraft({ title: title.value, body: body.value });
      if (!validation.valid) {
        error.textContent = validation.message;
        (validation.field === 'title' ? title : body).focus();
        return;
      }
      saving = true;
      save.disabled = true;
      form.setAttribute('aria-busy', 'true');
      void noteRepository
        .updateMaster(details.id, record.id, validation)
        .then((updated) => {
          notes = notes.map((candidate) => (candidate.id === updated.id ? updated : candidate));
          announce('Nota actualizada. La autoría original se ha conservado.');
          renderList();
          focusNote(updated.id);
        })
        .catch((errorValue) => {
          if (isAuthorizationFailure(errorValue)) {
            mode = 'unverified';
            authAdapter?.dispose();
            authAdapter = null;
            updateAuthorControls();
            setFormAvailable(false);
            renderList();
            announce(describeRepositoryError(errorValue), true);
            elements.status.focus({ preventScroll: true });
            return;
          }
          error.textContent = describeRepositoryError(errorValue);
          error.focus({ preventScroll: true });
        })
        .finally(() => {
          saving = false;
        });
    });
  };

  const renderArchiveConfirmation = (record: PublicNoteWriteRecord): void => {
    const article = elements.list.querySelector<HTMLElement>(
      `[data-public-note-id="${CSS.escape(record.id)}"]`,
    );
    if (!article || mode !== 'master' || !noteRepository) return;
    article.querySelector('[data-public-note-admin-actions]')?.remove();
    const confirmation = document.createElement('div');
    confirmation.className = 'public-notes__archive-confirmation';
    confirmation.dataset.publicNoteAdminActions = '';
    appendText(
      confirmation,
      'p',
      '',
      '¿Retirar esta nota de la ficha pública? Se conservará archivada.',
    );
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = 'Confirmar retirada';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancelar';
    confirmation.append(confirm, cancel);
    article.append(confirmation);
    confirm.focus();
    cancel.addEventListener('click', () => {
      renderList();
      focusAdminAction(record.id, 'archive');
    });
    confirm.addEventListener('click', () => {
      if (saving || !noteRepository) return;
      saving = true;
      confirm.disabled = true;
      void noteRepository
        .archiveMaster(details.id, record.id)
        .then(() => {
          notes = notes.filter((candidate) => candidate.id !== record.id);
          announce('Nota retirada de la ficha pública y conservada como archivada.');
          renderList();
          elements.heading.focus({ preventScroll: true });
        })
        .catch((errorValue) => {
          if (isAuthorizationFailure(errorValue)) {
            mode = 'unverified';
            authAdapter?.dispose();
            authAdapter = null;
            updateAuthorControls();
            setFormAvailable(false);
          }
          announce(describeRepositoryError(errorValue), true);
          elements.status.focus({ preventScroll: true });
          renderList();
        })
        .finally(() => {
          saving = false;
        });
    });
  };

  function renderList(): void {
    elements.list.replaceChildren();
    if (notes.length === 0) {
      appendText(elements.list, 'p', 'full-entity__muted', 'Sin notas públicas.');
      return;
    }
    for (const record of [...notes].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    )) {
      const article = document.createElement('article');
      article.className = 'full-entity__note public-note';
      article.dataset.publicNoteId = record.id;
      const heading = appendText(article, 'h3', 'full-entity__note-title', record.title);
      heading.tabIndex = -1;
      appendText(article, 'p', 'full-entity__note-body', record.body);
      const author = playerName(record.authorPlayerId);
      const modifier = playerName(record.lastModifierPlayerId);
      const meta = document.createElement('p');
      meta.className = 'public-note__meta';
      const updated = document.createElement('time');
      updated.dateTime = record.updatedAt;
      updated.textContent = formatDate(record.updatedAt);
      meta.append(`Autor: ${author}. Última modificación: `, updated, ` · ${modifier}.`);
      article.append(meta);
      const fallback = fallbackById.get(record.id as FullEntityDetailModel['notes'][number]['id']);
      if (fallback && fallback.tags.length > 0) {
        const tags = document.createElement('ul');
        tags.className = 'full-entity__note-tags';
        tags.setAttribute('aria-label', `Etiquetas de la nota ${record.title}`);
        for (const tag of fallback.tags) appendText(tags, 'li', '', tag.name);
        article.append(tags);
      }
      if (mode === 'master') {
        const actions = document.createElement('div');
        actions.className = 'public-notes__note-actions';
        actions.dataset.publicNoteAdminActions = '';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Editar';
        edit.dataset.publicNoteAction = 'edit';
        edit.setAttribute('aria-label', `Editar nota ${record.title}`);
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.textContent = 'Retirar';
        archive.dataset.publicNoteAction = 'archive';
        archive.setAttribute('aria-label', `Retirar nota ${record.title}`);
        edit.addEventListener('click', () => renderEditForm(record));
        archive.addEventListener('click', () => renderArchiveConfirmation(record));
        actions.append(edit, archive);
        article.append(actions);
      }
      elements.list.append(article);
    }
  }

  const updateAuthorControls = (): void => {
    const authorLabel = elements.authorField.querySelector<HTMLLabelElement>(
      'label[for="public-note-author"]',
    );
    const authorHelp = elements.authorField.querySelector<HTMLElement>('#public-note-author-help');
    const existingMasterAuthor = elements.authorField.querySelector<HTMLElement>(
      '[data-public-note-master-author]',
    );
    const existingUnverifiedAuthor = elements.authorField.querySelector<HTMLElement>(
      '[data-public-note-unverified-author]',
    );

    if (mode === 'master') {
      existingUnverifiedAuthor?.remove();
      authorLabel?.setAttribute('hidden', '');
      elements.authorSelect.hidden = true;
      authorHelp?.setAttribute('hidden', '');
      elements.authorError.hidden = true;
      const masterAuthor =
        existingMasterAuthor ??
        appendText(elements.authorField, 'p', 'public-notes__master-author', 'Autor: Máster');
      masterAuthor.dataset.publicNoteMasterAuthor = '';
      masterAuthor.hidden = false;
      elements.submit.textContent = 'Publicar como Máster';
      return;
    }

    if (mode === 'unverified') {
      authorLabel?.setAttribute('hidden', '');
      elements.authorSelect.hidden = true;
      authorHelp?.setAttribute('hidden', '');
      elements.authorError.hidden = true;
      existingMasterAuthor?.remove();
      const unverifiedAuthor =
        existingUnverifiedAuthor ??
        appendText(
          elements.authorField,
          'p',
          'public-notes__master-author',
          'Autor: sesión sin verificar',
        );
      unverifiedAuthor.dataset.publicNoteUnverifiedAuthor = '';
      unverifiedAuthor.hidden = false;
      elements.submit.textContent = 'Publicar nota';
      return;
    }

    authorLabel?.removeAttribute('hidden');
    elements.authorSelect.hidden = false;
    authorHelp?.removeAttribute('hidden');
    elements.authorError.hidden = false;
    existingMasterAuthor?.remove();
    existingUnverifiedAuthor?.remove();
    elements.authorSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona tu personaje';
    elements.authorSelect.append(placeholder);
    for (const player of roster) {
      const option = document.createElement('option');
      option.value = player.id;
      option.textContent = player.displayName;
      elements.authorSelect.append(option);
    }
    elements.submit.textContent = 'Publicar nota';
  };

  const setFormAvailable = (available: boolean): void => {
    liveAvailable = available;
    const hasEligibleAuthor = mode === 'master' || (mode === 'visitor' && roster.length > 0);
    elements.submit.disabled = !available || mode === 'unverified' || !hasEligibleAuthor;
    elements.retry.hidden = available;
    elements.form.classList.toggle('public-notes__form--offline', !available);
  };

  const hasStoredAdminSession = (): boolean => {
    try {
      return window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  };

  const resolveAuthorMode = async (): Promise<AuthorMode> => {
    authAdapter?.dispose();
    authAdapter = null;
    if (!hasStoredAdminSession()) return 'visitor';
    try {
      authAdapter = new SupabaseAdminAuthAdapter({
        projectUrl: configuration.projectUrl,
        publishableKey: configuration.publishableKey,
        timeoutMs: configuration.timeoutMs,
        allowLocalProject: import.meta.env.DEV,
      });
      const identity = await authAdapter.restoreSession();
      if (!identity) return 'visitor';
      return (await authAdapter.isCurrentUserAdmin()) ? 'master' : 'visitor';
    } catch {
      return 'unverified';
    }
  };

  const initialize = async (focusOnRecovery: boolean): Promise<void> => {
    request?.abort();
    request = new AbortController();
    announce('Cargando notas y autores disponibles…');
    elements.retry.disabled = true;
    try {
      noteRepository = new SupabasePublicNoteRepository({
        projectUrl: configuration.projectUrl,
        publishableKey: configuration.publishableKey,
        timeoutMs: configuration.timeoutMs,
        allowLocalProject: import.meta.env.DEV,
      });
      rosterRepository = new SupabasePublicNoteRosterRepository({
        projectUrl: configuration.projectUrl,
        publishableKey: configuration.publishableKey,
        timeoutMs: configuration.timeoutMs,
      });
      const [loadedNotes, loadedRoster, resolvedMode] = await Promise.all([
        noteRepository.list(details.id, request.signal),
        rosterRepository.load(details.id, request.signal),
        resolveAuthorMode(),
      ]);
      if (destroyed || request.signal.aborted) return;
      notes = loadedNotes;
      roster = loadedRoster;
      mode = resolvedMode;
      updateAuthorControls();
      renderList();
      if (mode === 'unverified') {
        setFormAvailable(false);
        announce(
          'No se pudo verificar de forma segura la sesión administrativa. Reintenta la conexión.',
          true,
        );
      } else {
        setFormAvailable(true);
        announce(
          mode === 'master'
            ? 'Sesión de Máster verificada. Puedes crear, editar y retirar notas.'
            : roster.length > 0
              ? 'Puedes publicar una nota eligiendo un personaje del roster activo.'
              : 'Esta campaña no tiene personajes jugadores activos disponibles para declarar autoría.',
        );
      }
      if (focusOnRecovery) elements.status.focus({ preventScroll: true });
    } catch {
      if (destroyed || request.signal.aborted) return;
      setFormAvailable(false);
      renderFallback();
      announce(
        'Las notas del snapshot siguen disponibles, pero no se puede guardar mientras Supabase no responda. El texto del formulario se conservará.',
        true,
      );
      if (focusOnRecovery) elements.status.focus({ preventScroll: true });
    } finally {
      elements.retry.disabled = false;
    }
  };

  const validateAuthor = (): PlayerId | null => {
    if (mode === 'master') return null;
    const selected = elements.authorSelect.value;
    const player = roster.find((candidate) => candidate.id === selected);
    if (!player) {
      setFieldError(
        elements.authorSelect,
        elements.authorError,
        'Selecciona un personaje del roster.',
      );
      elements.authorSelect.focus();
      return null;
    }
    setFieldError(elements.authorSelect, elements.authorError, '');
    return player.id;
  };

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (saving || !liveAvailable || mode === 'unverified' || !noteRepository) {
      if (!liveAvailable) announce('No se puede guardar sin conexión a Supabase.', true);
      return;
    }
    const playerId = validateAuthor();
    if (mode === 'visitor' && playerId === null) return;
    const validation = validatePublicNoteDraft({
      title: elements.titleInput.value,
      body: elements.bodyInput.value,
    });
    setFieldError(elements.titleInput, elements.titleError, '');
    setFieldError(elements.bodyInput, elements.bodyError, '');
    if (!validation.valid) {
      const control = validation.field === 'title' ? elements.titleInput : elements.bodyInput;
      const error = validation.field === 'title' ? elements.titleError : elements.bodyError;
      setFieldError(control, error, validation.message);
      control.focus();
      return;
    }
    saving = true;
    elements.submit.disabled = true;
    elements.form.setAttribute('aria-busy', 'true');
    announce('Publicando la nota…');
    const operation =
      mode === 'master'
        ? noteRepository.createMaster(details.id, validation)
        : noteRepository.createPlayer(details.id, { ...validation, playerId: playerId! });
    void operation
      .then((created) => {
        notes = [...notes, created];
        elements.titleInput.value = '';
        elements.bodyInput.value = '';
        renderList();
        announce('Nota publicada y visible inmediatamente; no requiere aprobación previa.');
        focusNote(created.id);
      })
      .catch((error) => {
        if (isAuthorizationFailure(error)) {
          mode = 'unverified';
          authAdapter?.dispose();
          authAdapter = null;
          updateAuthorControls();
          setFormAvailable(false);
          renderList();
        }
        announce(describeRepositoryError(error), true);
        elements.status.focus({ preventScroll: true });
      })
      .finally(() => {
        saving = false;
        elements.form.removeAttribute('aria-busy');
        elements.submit.disabled =
          !liveAvailable || mode === 'unverified' || (mode === 'visitor' && roster.length === 0);
      });
  });

  elements.retry.addEventListener('click', () => void initialize(true));
  renderFallback();
  setFormAvailable(false);
  void initialize(false);

  return {
    destroy(): void {
      destroyed = true;
      request?.abort();
      authAdapter?.dispose();
    },
  };
}
