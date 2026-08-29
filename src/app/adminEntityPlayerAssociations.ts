import { adminCampaignContext } from '../application/adminCampaignContext';
import { AUTH_SESSION_STORAGE_KEY } from '../infrastructure/supabase/authSessionStorage';
import '../styles/admin-entity-player-associations.css';

interface AssociationPlayerRow {
  readonly id: string;
  readonly displayName: string;
  readonly accentColor: string;
}

interface AdminSessionPayload {
  readonly accessToken: string;
}

const inheritedFetch = globalThis.fetch.bind(globalThis);
let activeAbort: AbortController | null = null;
let scheduled = false;
let currentSelection: {
  readonly idInput: HTMLInputElement;
  readonly checkboxes: readonly HTMLInputElement[];
} | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectUrl(): string | null {
  const value = import.meta.env.VITE_SUPABASE_URL?.trim();
  return value ? value.replace(/\/$/, '') : null;
}

function publishableKey(): string | null {
  const value = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return value || null;
}

function readAdminSession(): AdminSessionPayload | null {
  try {
    const serialized = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized) as unknown;
    if (!isRecord(parsed) || typeof parsed.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    return { accessToken: parsed.accessToken };
  } catch {
    return null;
  }
}

function adminHeaders(): Headers | null {
  const session = readAdminSession();
  const key = publishableKey();
  if (!session || !key) return null;

  return new Headers({
    Accept: 'application/json',
    apikey: key,
    Authorization: `Bearer ${session.accessToken}`,
  });
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return new URL(input.href);
    if (input instanceof Request) return new URL(input.url);
    return new URL(input, window.location.href);
  } catch {
    return null;
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function selectedPlayerIds(): readonly string[] {
  if (!currentSelection) return [];
  return currentSelection.checkboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
}

function unavailableAssociationSaveResponse(): Response {
  return new Response(
    JSON.stringify({
      code: 'MAP058_ASSOCIATIONS_UNAVAILABLE',
      message:
        'Las asociaciones con jugadores no están disponibles todavía. Recarga el editor antes de guardar.',
    }),
    {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

async function associationAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = requestUrl(input);
  if (
    url?.pathname.endsWith('/rest/v1/rpc/admin_save_map_entity_v3') &&
    requestMethod(input, init) === 'POST' &&
    typeof init?.body === 'string'
  ) {
    try {
      const body = JSON.parse(init.body) as unknown;
      if (isRecord(body) && typeof body.p_id === 'string') {
        const currentEntityId = currentSelection?.idInput.value.trim() ?? '';
        if (currentSelection && currentEntityId === body.p_id) {
          return inheritedFetch(input, {
            ...init,
            body: JSON.stringify({
              ...body,
              p_player_association_ids: [...selectedPlayerIds()],
            }),
          });
        }
        if (body.p_expected_updated_at != null) {
          return unavailableAssociationSaveResponse();
        }
      }
    } catch {
      // The repository owns malformed-body handling. Leave unrelated requests unchanged.
    }
  }

  return inheritedFetch(input, init);
}

globalThis.fetch = associationAwareFetch;

function parsePlayers(payload: unknown): readonly AssociationPlayerRow[] {
  if (!Array.isArray(payload)) throw new Error('La plantilla de jugadores no es válida.');

  return payload.map((value) => {
    if (!isRecord(value)) throw new Error('La plantilla de jugadores no es válida.');
    const id = value.id;
    const displayName = value.display_name;
    const accentColor = value.accent_color;
    if (
      typeof id !== 'string' ||
      typeof displayName !== 'string' ||
      typeof accentColor !== 'string' ||
      !/^#[0-9a-f]{6}$/.test(accentColor)
    ) {
      throw new Error('La plantilla de jugadores no es válida.');
    }
    return { id, displayName, accentColor };
  });
}

function parseSelectedPlayerIds(payload: unknown): ReadonlySet<string> {
  if (!Array.isArray(payload)) throw new Error('Las asociaciones guardadas no son válidas.');
  const ids = payload.map((value) => {
    if (!isRecord(value) || typeof value.player_id !== 'string') {
      throw new Error('Las asociaciones guardadas no son válidas.');
    }
    return value.player_id;
  });
  return new Set(ids);
}

async function readJson(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'No se pudo cargar la asociación con jugadores.';
    throw new Error(message);
  }
  return payload;
}

async function loadAssociationState(
  entityId: string,
  signal: AbortSignal,
): Promise<{
  readonly players: readonly AssociationPlayerRow[];
  readonly selected: ReadonlySet<string>;
}> {
  const baseUrl = projectUrl();
  const headers = adminHeaders();
  if (!baseUrl || !headers) throw new Error('La sesión administrativa no está disponible.');

  const playersUrl = new URL(`${baseUrl}/rest/v1/players`);
  playersUrl.searchParams.set('select', 'id,display_name,accent_color,publication_status');
  playersUrl.searchParams.set('publication_status', 'neq.archived');
  playersUrl.searchParams.set('order', 'display_order.asc,display_name.asc,id.asc');

  const playersPromise = inheritedFetch(playersUrl, { method: 'GET', headers, signal }).then(
    readJson,
  );

  if (!entityId || entityId === 'entity-' || entityId === 'place-') {
    return { players: parsePlayers(await playersPromise), selected: new Set() };
  }

  const associationsUrl = new URL(`${baseUrl}/rest/v1/entity_player_associations`);
  associationsUrl.searchParams.set('select', 'player_id');
  associationsUrl.searchParams.set('entity_id', `eq.${entityId}`);
  associationsUrl.searchParams.set('order', 'player_id.asc');

  const [playersPayload, associationsPayload] = await Promise.all([
    playersPromise,
    inheritedFetch(associationsUrl, { method: 'GET', headers, signal }).then(readJson),
  ]);

  return {
    players: parsePlayers(playersPayload),
    selected: parseSelectedPlayerIds(associationsPayload),
  };
}

function createAssociationFieldset(): {
  readonly fieldset: HTMLFieldSetElement;
  readonly list: HTMLUListElement;
  readonly status: HTMLParagraphElement;
} {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  const help = document.createElement('p');
  const list = document.createElement('ul');
  const status = document.createElement('p');

  fieldset.className = 'admin-map-entity__fieldset admin-map-entity__associations';
  fieldset.dataset.playerAssociations = '';
  legend.className = 'admin-map-entity__legend';
  legend.textContent = 'Relacionado con';
  help.className = 'admin-map-entity__help';
  help.id = 'admin-map-entity-associations-help';
  help.textContent =
    'Asociación narrativa independiente de Aliado, Neutral o Enemigo. Puedes seleccionar cero, uno o varios personajes activos de esta campaña.';
  list.className = 'admin-map-entity__association-list';
  list.setAttribute('aria-describedby', help.id);
  status.className = 'admin-map-entity__association-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Cargando personajes de la campaña…';
  fieldset.append(legend, help, list, status);
  return { fieldset, list, status };
}

function renderPlayers(
  list: HTMLUListElement,
  status: HTMLParagraphElement,
  players: readonly AssociationPlayerRow[],
  selected: ReadonlySet<string>,
  idInput: HTMLInputElement,
): void {
  const checkboxes: HTMLInputElement[] = [];
  list.replaceChildren();

  for (const player of players) {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    const accent = document.createElement('span');
    const name = document.createElement('span');

    label.className = 'admin-map-entity__association-option';
    checkbox.type = 'checkbox';
    checkbox.value = player.id;
    checkbox.checked = selected.has(player.id);
    checkbox.dataset.playerAssociationId = player.id;
    checkbox.setAttribute('data-testid', `admin-player-association-${player.id}`);
    accent.className = 'admin-map-entity__association-accent';
    accent.style.setProperty('--player-association-accent', player.accentColor);
    accent.setAttribute('aria-hidden', 'true');
    name.textContent = player.displayName;
    label.append(checkbox, accent, name);
    item.append(label);
    list.append(item);
    checkboxes.push(checkbox);
  }

  currentSelection = { idInput, checkboxes };
  status.textContent =
    players.length === 0
      ? 'No hay personajes jugadores activos en esta campaña.'
      : 'Selecciona los personajes narrativamente relacionados. El color es solo un apoyo visual.';
}

async function enhanceVisibleEditor(): Promise<void> {
  const editor = document.querySelector<HTMLElement>('.admin-map-entity__editor:not([hidden])');
  if (!editor || editor.querySelector('[data-player-associations]')) return;

  const idInput = editor.querySelector<HTMLInputElement>('#admin-map-entity-field-id');
  const fields = editor.querySelector<HTMLElement>('.admin-map-entity__fields');
  if (!idInput || !fields) return;

  const { fieldset, list, status } = createAssociationFieldset();
  const dispositions = fields.querySelector('.admin-map-entity__dispositions');
  if (dispositions) fields.insertBefore(fieldset, dispositions);
  else fields.append(fieldset);

  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;
  currentSelection = null;

  try {
    const state = await loadAssociationState(idInput.value.trim(), abort.signal);
    if (abort.signal.aborted || !fieldset.isConnected) return;
    renderPlayers(list, status, state.players, state.selected, idInput);
  } catch (error) {
    if (abort.signal.aborted || !fieldset.isConnected) return;
    status.setAttribute('role', 'alert');
    status.textContent =
      error instanceof Error ? error.message : 'No se pudo cargar la asociación con jugadores.';
  }
}

function scheduleEnhancement(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    void enhanceVisibleEditor();
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = (): void => {
    const observer = new MutationObserver(scheduleEnhancement);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    adminCampaignContext.subscribe(() => {
      activeAbort?.abort();
      currentSelection = null;
      document.querySelector('[data-player-associations]')?.remove();
      scheduleEnhancement();
    });
    scheduleEnhancement();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
