import {
  AUTH_SESSION_STORAGE_KEY,
  BrowserAuthSessionStorage,
} from '../infrastructure/supabase/authSessionStorage';

const SESSION_VERSION = 1;
const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;

interface StoredAuthSessionV1 {
  readonly version: 1;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly userId: string;
  readonly email: string | null;
}

interface AuthCallbackSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly userId: string;
  readonly email: string | null;
  readonly type: string | null;
}

interface PasswordAuthPayload {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_at?: unknown;
  readonly expires_in?: unknown;
  readonly user?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return globalThis.atob(padded);
}

function decodeAccessTokenClaims(accessToken: string): {
  readonly userId: string;
  readonly email: string | null;
  readonly expiresAt: number | null;
} | null {
  const payloadPart = accessToken.split('.')[1];

  if (!payloadPart) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadPart)) as unknown;

    if (!isRecord(payload) || typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      expiresAt:
        typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null,
    };
  } catch {
    return null;
  }
}

function parsePositiveNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseAdminAuthEmailCallback(
  url: URL,
  nowMs = Date.now(),
): AuthCallbackSession | null {
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return null;
  }

  const claims = decodeAccessTokenClaims(accessToken);

  if (!claims) {
    return null;
  }

  const explicitExpiresAt = parsePositiveNumber(params.get('expires_at'));
  const expiresIn = parsePositiveNumber(params.get('expires_in'));
  const expiresAt =
    explicitExpiresAt ??
    claims.expiresAt ??
    (expiresIn ? Math.floor(nowMs / 1000) + expiresIn : null);

  if (!expiresAt) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    userId: claims.userId,
    email: claims.email,
    type: params.get('type'),
  };
}

function toStoredSession(session: AuthCallbackSession): StoredAuthSessionV1 {
  return {
    version: SESSION_VERSION,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    userId: session.userId,
    email: session.email,
  };
}

function scrubAuthFragment(url: URL): void {
  const cleanUrl = new URL(url);
  cleanUrl.hash = '';
  window.history.replaceState(window.history.state, '', cleanUrl);
}

function resolveConfiguration(): {
  readonly projectUrl: string;
  readonly publishableKey: string;
} | null {
  const projectUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

  if (
    !HOSTED_PROJECT_URL_PATTERN.test(projectUrl) ||
    !PUBLISHABLE_KEY_PATTERN.test(publishableKey)
  ) {
    return null;
  }

  return { projectUrl, publishableKey };
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

function appendPasswordField(
  form: HTMLFormElement,
  id: string,
  labelText: string,
): HTMLInputElement {
  const field = createElement('div', 'admin-auth__field');
  const label = createElement('label', 'admin-auth__label');
  const input = createElement('input', 'admin-auth__input');

  label.htmlFor = id;
  label.textContent = labelText;
  input.id = id;
  input.name = id;
  input.type = 'password';
  input.autocomplete = 'new-password';
  input.required = true;
  input.spellcheck = false;
  field.append(label, input);
  form.append(field);
  return input;
}

function parsePasswordSessionPayload(
  payload: PasswordAuthPayload,
  nowMs = Date.now(),
): StoredAuthSessionV1 | null {
  if (!isRecord(payload.user)) {
    return null;
  }

  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;
  const userId = payload.user.id;
  const email = payload.user.email;
  const expiresAtValue = payload.expires_at;
  const expiresInValue = payload.expires_in;
  const expiresAt =
    typeof expiresAtValue === 'number' && Number.isFinite(expiresAtValue)
      ? expiresAtValue
      : typeof expiresInValue === 'number' && Number.isFinite(expiresInValue)
        ? Math.floor(nowMs / 1000) + expiresInValue
        : null;

  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof refreshToken !== 'string' ||
    !refreshToken ||
    typeof userId !== 'string' ||
    !userId ||
    expiresAt === null ||
    expiresAt <= 0 ||
    (email !== undefined && email !== null && typeof email !== 'string')
  ) {
    return null;
  }

  return {
    version: SESSION_VERSION,
    accessToken,
    refreshToken,
    expiresAt,
    userId,
    email: typeof email === 'string' ? email : null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mountRecoveryDialog(
  root: ParentNode,
  session: AuthCallbackSession,
  configuration: { readonly projectUrl: string; readonly publishableKey: string },
): void {
  const dialog = createElement('dialog', 'admin-auth-dialog');
  const dialogHeader = createElement('div', 'admin-auth-dialog__header');
  const title = createElement('h2', 'admin-auth-dialog__title');
  const closeButton = createElement('button', 'admin-auth-dialog__close');
  const description = createElement('p', 'admin-auth-dialog__description');
  const form = createElement('form', 'admin-auth__form');
  const status = createElement('p', 'admin-auth__status');
  const submitButton = createElement('button', 'admin-auth__submit');
  const passwordInput = appendPasswordField(
    form,
    'admin-recovery-password',
    'Nueva contraseña',
  );
  const confirmationInput = appendPasswordField(
    form,
    'admin-recovery-password-confirmation',
    'Repite la contraseña',
  );

  title.textContent = 'Establecer contraseña administrativa';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Cerrar recuperación de contraseña');
  closeButton.textContent = '×';
  dialogHeader.append(title, closeButton);

  description.textContent =
    'El enlace de recuperación ya ha verificado tu identidad. Define ahora una contraseña para futuros accesos administrativos.';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  submitButton.type = 'submit';
  submitButton.textContent = 'Guardar contraseña';
  form.append(status, submitButton);
  dialog.append(dialogHeader, description, form);
  root.append(dialog);

  const close = (): void => {
    if (dialog.open) {
      dialog.close();
    }
    dialog.remove();
  };

  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const password = passwordInput.value;
    const confirmation = confirmationInput.value;

    if (password !== confirmation) {
      status.textContent = 'Las contraseñas no coinciden.';
      confirmationInput.focus();
      return;
    }

    if (!session.email) {
      status.textContent = 'El enlace de recuperación no contiene un correo válido.';
      return;
    }

    passwordInput.disabled = true;
    confirmationInput.disabled = true;
    submitButton.disabled = true;
    status.textContent = 'Guardando la nueva contraseña…';

    void (async () => {
      try {
        const updateResponse = await fetch(`${configuration.projectUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: configuration.publishableKey,
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        });

        if (!updateResponse.ok) {
          status.textContent =
            'Supabase no pudo actualizar la contraseña. Solicita un enlace de recuperación nuevo e inténtalo de nuevo.';
          return;
        }

        const loginResponse = await fetch(
          `${configuration.projectUrl}/auth/v1/token?grant_type=password`,
          {
            method: 'POST',
            headers: {
              apikey: configuration.publishableKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: session.email, password }),
          },
        );
        const loginPayload = (await readJson(loginResponse)) as PasswordAuthPayload;
        const freshSession = loginResponse.ok
          ? parsePasswordSessionPayload(loginPayload)
          : null;

        if (!freshSession) {
          status.textContent =
            'La contraseña se actualizó, pero no se pudo abrir una sesión nueva. Recarga la página e inicia sesión con la nueva contraseña.';
          return;
        }

        new BrowserAuthSessionStorage().setItem(
          AUTH_SESSION_STORAGE_KEY,
          JSON.stringify(freshSession),
        );
        passwordInput.value = '';
        confirmationInput.value = '';
        window.location.reload();
      } catch {
        status.textContent =
          'No se pudo completar la recuperación por un problema de red. Solicita un enlace nuevo antes de reintentarlo.';
      } finally {
        passwordInput.value = '';
        confirmationInput.value = '';
        passwordInput.disabled = false;
        confirmationInput.disabled = false;
        submitButton.disabled = false;
      }
    })();
  });

  dialog.showModal();
  window.requestAnimationFrame(() => passwordInput.focus());
}

export function mountAdminAuthEmailCallback(root: ParentNode): void {
  const url = new URL(window.location.href);
  const callback = parseAdminAuthEmailCallback(url);

  if (!callback) {
    return;
  }

  scrubAuthFragment(url);
  const configuration = resolveConfiguration();

  if (!configuration) {
    return;
  }

  if (callback.type === 'recovery') {
    mountRecoveryDialog(root, callback, configuration);
    return;
  }

  new BrowserAuthSessionStorage().setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(toStoredSession(callback)),
  );
}
