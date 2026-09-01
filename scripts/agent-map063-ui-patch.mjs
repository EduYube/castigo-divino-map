import fs from 'node:fs';

const path = 'src/app/publicNotes.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`  const updateAuthorControls = (): void => {
    if (mode === 'master') {
      elements.authorField.replaceChildren();
      const label = appendText(
        elements.authorField,
        'p',
        'public-notes__master-author',
        'Autor: Máster',
      );
      label.dataset.publicNoteMasterAuthor = '';
      elements.submit.textContent = 'Publicar como Máster';
      return;
    }
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
    elements.submit.disabled = !available || mode === 'unverified';
    elements.retry.hidden = available;
    elements.form.classList.toggle('public-notes__form--offline', !available);
  };`,
`  const updateAuthorControls = (): void => {
    const authorLabel = elements.authorField.querySelector<HTMLLabelElement>(
      'label[for="public-note-author"]',
    );
    const authorHelp = elements.authorField.querySelector<HTMLElement>('#public-note-author-help');
    const existingMasterAuthor = elements.authorField.querySelector<HTMLElement>(
      '[data-public-note-master-author]',
    );

    if (mode === 'master') {
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

    authorLabel?.removeAttribute('hidden');
    elements.authorSelect.hidden = false;
    authorHelp?.removeAttribute('hidden');
    elements.authorError.hidden = false;
    existingMasterAuthor?.remove();
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
  };`,
'author controls',
);

replaceOnce(
`  const resolveAuthorMode = async (): Promise<AuthorMode> => {
    if (!hasStoredAdminSession()) return 'visitor';
    try {`,
`  const resolveAuthorMode = async (): Promise<AuthorMode> => {
    authAdapter?.dispose();
    authAdapter = null;
    if (!hasStoredAdminSession()) return 'visitor';
    try {`,
'auth adapter retry disposal',
);

replaceOnce(
`        announce(
          mode === 'master'
            ? 'Sesión de Máster verificada. Puedes crear, editar y retirar notas.'
            : 'Puedes publicar una nota eligiendo un personaje del roster activo.',
        );`,
`        announce(
          mode === 'master'
            ? 'Sesión de Máster verificada. Puedes crear, editar y retirar notas.'
            : roster.length > 0
              ? 'Puedes publicar una nota eligiendo un personaje del roster activo.'
              : 'Esta campaña no tiene personajes jugadores activos disponibles para declarar autoría.',
        );`,
'empty roster status',
);

replaceOnce(
`        elements.submit.disabled = !liveAvailable || mode === 'unverified';`,
`        elements.submit.disabled =
          !liveAvailable ||
          mode === 'unverified' ||
          (mode === 'visitor' && roster.length === 0);`,
'post-submit availability',
);

fs.writeFileSync(path, source);
