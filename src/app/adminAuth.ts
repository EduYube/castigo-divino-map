import type { AdminAuthController } from '../auth/adminAuthController';
import type { AdminAuthState } from '../auth/authState';
import type { BackendState } from '../data-access/publicCatalog';

export interface AdminAuthUiController {
  destroy(): void;
}

interface PublicDataStatusDetail {
  readonly backendState?: BackendState;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

function appendLabelledInput(
  form: HTMLFormElement,
  options: {
    readonly id: string;
    readonly label: string;
    readonly type: 'email' | 'password';
    readonly autocomplete: HTMLInputElement['autocomplete'];
  },
): HTMLInputElement {
  const field = createElement('div', 'admin-auth__field');
  const label = createElement('label', 'admin-auth__label');
  const input = createElement('input', 'admin-auth__input');

  label.htmlFor = options.id;
  label.textContent = options.label;
  input.id = options.id;
  input.name = options.id;
  input.type = options.type;
  input.autocomplete = options.autocomplete;
  input.required = true;
  input.spellcheck = false;

  if (options.type === 'email') {
    input.inputMode = 'email';
  }

  field.append(label, input);
  form.append(field);
  return input;
}

function isPublicDataStatusEvent(event: Event): event is CustomEvent<PublicDataStatusDetail> {
  return event instanceof CustomEvent && typeof event.detail === 'object' && event.detail !== null;
}

export function mountAdminAuth(
  root: ParentNode,
  controller: AdminAuthController,
): AdminAuthUiController {
  const header = root.querySelector<HTMLElement>('.site-header');

  if (!header) {
    throw new Error('Missing site header for administrative authentication.');
  }

  const entry = createElement('div', 'admin-auth-entry');
  const entryButton = createElement('button', 'admin-auth-entry__button');
  const notice = createElement('p', 'admin-auth-entry__notice');
  const dialog = createElement('dialog', 'admin-auth-dialog');
  const dialogHeader = createElement('div', 'admin-auth-dialog__header');
  const title = createElement('h2', 'admin-auth-dialog__title');
  const closeButton = createElement('button', 'admin-auth-dialog__close');
  const description = createElement('p', 'admin-auth-dialog__description');
  const form = createElement('form', 'admin-auth__form');
  const formStatus = createElement('p', 'admin-auth__status');
  const submitButton = createElement('button', 'admin-auth__submit');
  const adminShell = createElement('section', 'admin-auth__shell');
  const adminIdentity = createElement('p', 'admin-auth__identity');
  const adminSummary = createElement('p', 'admin-auth__summary');
  const backendGuard = createElement('p', 'admin-auth__backend-guard');
  const logoutButton = createElement('button', 'admin-auth__logout');
  const emailInput = appendLabelledInput(form, {
    id: 'admin-auth-email',
    label: 'Correo',
    type: 'email',
    autocomplete: 'username',
  });
  const passwordInput = appendLabelledInput(form, {
    id: 'admin-auth-password',
    label: 'Contraseña',
    type: 'password',
    autocomplete: 'current-password',
  });

  let currentState = controller.getState();
  let previousPhase = currentState.phase;
  let backendState: BackendState | 'checking' = 'checking';

  entryButton.type = 'button';
  entryButton.textContent = 'Administrar';
  entryButton.setAttribute('aria-haspopup', 'dialog');
  entryButton.setAttribute('aria-controls', 'admin-auth-dialog');

  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-atomic', 'true');

  dialog.id = 'admin-auth-dialog';
  dialog.setAttribute('aria-labelledby', 'admin-auth-title');
  dialog.setAttribute('aria-describedby', 'admin-auth-description');

  title.id = 'admin-auth-title';
  title.textContent = 'Acceso administrativo';
  closeButton.type = 'button';
  closeButton.className = 'admin-auth-dialog__close';
  closeButton.setAttribute('aria-label', 'Cerrar acceso administrativo');
  closeButton.textContent = '×';
  dialogHeader.append(title, closeButton);

  description.id = 'admin-auth-description';
  description.textContent =
    'El atlas público permanece disponible mientras se autentica la sesión administrativa.';

  form.noValidate = false;
  formStatus.id = 'admin-auth-status';
  formStatus.setAttribute('role', 'status');
  formStatus.setAttribute('aria-live', 'polite');
  formStatus.setAttribute('aria-atomic', 'true');
  form.setAttribute('aria-describedby', 'admin-auth-status');
  submitButton.type = 'submit';
  submitButton.textContent = 'Iniciar sesión';
  form.append(formStatus, submitButton);

  adminShell.hidden = true;
  adminShell.setAttribute('aria-labelledby', 'admin-auth-title');
  adminSummary.textContent =
    'Modo administrativo activo. La edición de contenido se implementará en las siguientes Issues.';
  backendGuard.setAttribute('role', 'status');
  backendGuard.setAttribute('aria-live', 'polite');
  logoutButton.type = 'button';
  logoutButton.textContent = 'Cerrar sesión';
  adminShell.append(adminIdentity, adminSummary, backendGuard, logoutButton);

  dialog.append(dialogHeader, description, form, adminShell);
  entry.append(entryButton, notice);
  header.append(entry);
  root.append(dialog);

  function renderBackendGuard(): void {
    if (backendState === 'connected') {
      backendGuard.dataset.adminMutations = 'guarded';
      backendGuard.textContent =
        'Servicio de datos conectado. Cualquier operación futura seguirá protegida por RLS.';
      return;
    }

    backendGuard.dataset.adminMutations = 'blocked';
    backendGuard.textContent =
      backendState === 'checking'
        ? 'Las operaciones administrativas permanecen bloqueadas hasta comprobar el servicio de datos.'
        : 'Las operaciones administrativas permanecen bloqueadas mientras el servicio público esté degradado o sin conexión.';
  }

  function renderState(state: AdminAuthState): void {
    const wasAuthorized = previousPhase === 'authorized';
    previousPhase = state.phase;
    currentState = state;
    const isPending =
      state.phase === 'restoring' ||
      state.phase === 'authenticating' ||
      state.phase === 'authorizing';
    const isAuthorized = state.phase === 'authorized';

    entry.dataset.authPhase = state.phase;
    entryButton.textContent = isAuthorized ? 'Administración' : 'Administrar';
    form.hidden = isAuthorized;
    adminShell.hidden = !isAuthorized;
    form.setAttribute('aria-busy', String(isPending));
    emailInput.disabled = isPending;
    passwordInput.disabled = isPending;
    submitButton.disabled = isPending;
    logoutButton.disabled = isPending;
    submitButton.textContent =
      state.phase === 'authenticating' ? 'Iniciando sesión…' : 'Iniciar sesión';

    if (isAuthorized) {
      adminIdentity.textContent = state.identity?.email
        ? `Sesión autorizada: ${state.identity.email}`
        : 'Sesión administrativa autorizada.';
      formStatus.textContent = '';
      notice.hidden = true;
      notice.textContent = '';
      renderBackendGuard();
      return;
    }

    adminIdentity.textContent = '';

    if (state.phase === 'restoring') {
      formStatus.textContent = 'Comprobando la sesión administrativa de esta pestaña…';
    } else if (state.phase === 'authenticating') {
      formStatus.textContent = 'Verificando credenciales…';
    } else if (state.phase === 'authorizing') {
      formStatus.textContent = 'Comprobando autorización administrativa…';
    } else if (state.issue) {
      formStatus.textContent = state.issue.message;
    } else {
      formStatus.textContent = 'Introduce las credenciales administrativas.';
    }

    if (wasAuthorized && (state.phase === 'expired' || state.phase === 'unauthorized')) {
      notice.textContent = state.issue?.message ?? 'Es necesario iniciar sesión de nuevo.';
      notice.hidden = false;
    } else if (state.phase !== 'expired' && state.phase !== 'unauthorized') {
      notice.hidden = true;
      notice.textContent = '';
    }
  }

  function openDialog(): void {
    if (!dialog.open) {
      dialog.showModal();
    }

    window.requestAnimationFrame(() => {
      if (currentState.phase === 'authorized') {
        logoutButton.focus();
      } else {
        emailInput.focus();
      }
    });
  }

  function closeDialog(): void {
    if (dialog.open) {
      dialog.close();
    }
  }

  const handleEntryClick = (): void => openDialog();
  const handleCloseClick = (): void => closeDialog();
  const handleDialogClose = (): void => entryButton.focus();
  const handleDialogCancel = (): void => {
    window.requestAnimationFrame(() => entryButton.focus());
  };
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    passwordInput.value = '';
    void controller.login(email, password);
  };
  const handleLogout = (): void => {
    passwordInput.value = '';
    void controller.logout().finally(() => {
      if (dialog.open) {
        emailInput.focus();
      }
    });
  };
  const handlePublicDataStatus = (event: Event): void => {
    if (!isPublicDataStatusEvent(event)) {
      return;
    }

    const nextState = event.detail.backendState;

    if (nextState === 'connected' || nextState === 'degraded' || nextState === 'offline') {
      backendState = nextState;
      renderBackendGuard();
    }
  };

  entryButton.addEventListener('click', handleEntryClick);
  closeButton.addEventListener('click', handleCloseClick);
  dialog.addEventListener('close', handleDialogClose);
  dialog.addEventListener('cancel', handleDialogCancel);
  form.addEventListener('submit', handleSubmit);
  logoutButton.addEventListener('click', handleLogout);
  window.addEventListener('atlas:public-data-status', handlePublicDataStatus);
  const unsubscribe = controller.subscribe(renderState);

  return {
    destroy(): void {
      unsubscribe();
      entryButton.removeEventListener('click', handleEntryClick);
      closeButton.removeEventListener('click', handleCloseClick);
      dialog.removeEventListener('close', handleDialogClose);
      dialog.removeEventListener('cancel', handleDialogCancel);
      form.removeEventListener('submit', handleSubmit);
      logoutButton.removeEventListener('click', handleLogout);
      window.removeEventListener('atlas:public-data-status', handlePublicDataStatus);
      passwordInput.value = '';
      if (dialog.open) {
        dialog.close();
      }
      dialog.remove();
      entry.remove();
    },
  };
}
