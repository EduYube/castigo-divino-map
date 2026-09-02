import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const PROJECT_URL = 'http://127.0.0.1:4173';
const PUBLISHABLE_KEY = 'sb_publishable_map063_test_key';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000063';
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';
const AUTH_STORAGE_KEY = 'castigo-divino-map:auth:v1';
const CREATED_AT = '2026-09-01T12:00:00.000Z';
const UPDATED_AT = '2026-09-01T12:30:00.000Z';

interface NoteRow {
  id: string;
  entity_id: string;
  title: string;
  body: string;
  sort_order: number;
  author_kind: 'master' | 'player';
  author_player_id: string | null;
  created_at: string;
  updated_at: string;
  last_modifier_kind: 'master' | 'player';
  last_modifier_player_id: string | null;
}

interface BackendState {
  online: boolean;
  admin: boolean;
  failNextMasterUpdate: boolean;
  rpcBodies: Array<{ name: string; body: Record<string, unknown>; authorization: string | null }>;
  notes: Map<string, NoteRow[]>;
}

const CAMPAIGNS = [
  {
    id: CAMPAIGN_A_ID,
    slug: 'castigo-divino',
    name: 'Castigo Divino',
    status: 'active',
    display_order: 0,
  },
  {
    id: CAMPAIGN_B_ID,
    slug: 'map063-b',
    name: 'MAP-063 B',
    status: 'active',
    display_order: 1,
  },
] as const;

const PLAYERS = {
  [CAMPAIGN_A_ID]: [
    {
      id: 'player-skade',
      slug: 'skade',
      display_name: 'Skade',
      name_language: 'en',
      accent_color: '#c2410c',
      display_order: 0,
    },
    {
      id: 'player-ura',
      slug: 'ura',
      display_name: 'Ura',
      name_language: 'en',
      accent_color: '#1e3a8a',
      display_order: 1,
    },
    {
      id: 'player-veyra',
      slug: 'veyra',
      display_name: 'Veyra',
      name_language: 'en',
      accent_color: '#9d174d',
      display_order: 2,
    },
  ],
  [CAMPAIGN_B_ID]: [
    {
      id: 'player-bryn',
      slug: 'bryn',
      display_name: 'Bryn',
      name_language: 'en',
      accent_color: '#1e3a8a',
      display_order: 0,
    },
  ],
} as const;

const ENTITIES = {
  [CAMPAIGN_A_ID]: [
    {
      id: 'place-map063-a',
      slug: 'map063-a',
      entity_type: 'location',
      visibility: 'pin',
      name: 'MAP-063 Lugar A',
      name_language: 'en',
      summary: 'Entidad pública para las notas de campaña A.',
      description: 'Descripción pública A.',
      portrait_path: null,
      x: 700,
      y: 700,
      category_id: 'category-map063-a',
    },
  ],
  [CAMPAIGN_B_ID]: [
    {
      id: 'place-map063-b',
      slug: 'map063-b',
      entity_type: 'location',
      visibility: 'pin',
      name: 'MAP-063 Lugar B',
      name_language: 'en',
      summary: 'Entidad pública para las notas de campaña B.',
      description: 'Descripción pública B.',
      portrait_path: null,
      x: 800,
      y: 800,
      category_id: 'category-map063-b',
    },
  ],
} as const;

function campaignFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function publicRows(table: string, campaignId: string): readonly Record<string, unknown>[] {
  switch (table) {
    case 'categories':
      return [
        {
          id: campaignId === CAMPAIGN_A_ID ? 'category-map063-a' : 'category-map063-b',
          slug: campaignId === CAMPAIGN_A_ID ? 'map063-a' : 'map063-b',
          name: campaignId === CAMPAIGN_A_ID ? 'Categoría A' : 'Categoría B',
          description: '',
        },
      ];
    case 'tags':
    case 'entity_aliases':
    case 'entity_tags':
    case 'entity_player_dispositions':
    case 'entity_player_associations':
    case 'character_location_relations':
    case 'public_note_tags':
    case 'geographic_names':
    case 'geographic_name_aliases':
    case 'character_location_events':
    case 'campaign_geographic_entity_links':
      return [];
    case 'players':
      return PLAYERS[campaignId as keyof typeof PLAYERS].map((player) => ({
        id: player.id,
        slug: player.slug,
        display_name: player.display_name,
        name_language: player.name_language,
        accent_color: player.accent_color,
      }));
    case 'map_entities':
      return ENTITIES[campaignId as keyof typeof ENTITIES];
    case 'public_notes':
      return campaignId === CAMPAIGN_A_ID
        ? [
            {
              id: 'note-map063-snapshot-a',
              slug: 'map063-snapshot-a',
              entity_id: 'place-map063-a',
              title: 'Nota histórica A',
              body: 'Visible también desde el snapshot.',
              sort_order: 0,
            },
          ]
        : [
            {
              id: 'note-map063-snapshot-b',
              slug: 'map063-snapshot-b',
              entity_id: 'place-map063-b',
              title: 'Nota histórica B',
              body: 'Solo pertenece a campaña B.',
              sort_order: 0,
            },
          ];
    default:
      return [];
  }
}

function jsonResponse(rows: unknown): {
  status: number;
  contentType: string;
  headers?: Record<string, string>;
  body: string;
} {
  if (Array.isArray(rows)) {
    const range = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
    return {
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': range },
      body: JSON.stringify(rows),
    };
  }
  return { status: 200, contentType: 'application/json', body: JSON.stringify(rows) };
}

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-map063-player-a',
    entity_id: 'place-map063-a',
    title: 'Apunte de Skade',
    body: 'Una nota pública de jugador.',
    sort_order: 1,
    author_kind: 'player',
    author_player_id: 'player-skade',
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    last_modifier_kind: 'player',
    last_modifier_player_id: 'player-skade',
    ...overrides,
  };
}

async function configureBackend(
  context: BrowserContext,
  options: { admin?: boolean; online?: boolean } = {},
): Promise<BackendState> {
  const state: BackendState = {
    online: options.online ?? true,
    admin: options.admin ?? false,
    failNextMasterUpdate: false,
    rpcBodies: [],
    notes: new Map([
      ['place-map063-a', [noteRow()]],
      [
        'place-map063-b',
        [
          noteRow({
            id: 'note-map063-player-b',
            entity_id: 'place-map063-b',
            title: 'Apunte de Bryn',
            body: 'Solo campaña B.',
            author_player_id: 'player-bryn',
            last_modifier_player_id: 'player-bryn',
          }),
        ],
      ],
    ]),
  };

  await context.addInitScript(
    ({ projectUrl, publishableKey, admin, authStorageKey, userId }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 300,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP063_PUBLIC_NOTES_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 300,
      };
      if (admin) {
        window.sessionStorage.setItem(
          authStorageKey,
          JSON.stringify({
            version: 1,
            accessToken: 'map063-admin-token',
            refreshToken: 'map063-refresh-token',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            userId,
            email: 'map063-admin@example.invalid',
          }),
        );
      }
    },
    {
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      admin: state.admin,
      authStorageKey: AUTH_STORAGE_KEY,
      userId: ADMIN_USER_ID,
    },
  );

  await context.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.split('/rest/v1/')[1] ?? '';

    if (path.startsWith('rpc/')) {
      const name = path.slice('rpc/'.length);
      const body = (request.postDataJSON?.() ?? {}) as Record<string, unknown>;
      const authorization = request.headers().authorization ?? null;
      state.rpcBodies.push({ name, body, authorization });

      if (!state.online && name !== 'current_user_is_admin') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      if (name === 'current_user_is_admin') {
        await route.fulfill(jsonResponse(state.admin));
        return;
      }
      if (
        !state.admin &&
        [
          'create_master_public_note',
          'update_master_public_note',
          'archive_master_public_note',
        ].includes(name)
      ) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
        return;
      }
      if (name === 'create_public_player_note') {
        const entityId = String(body.p_entity_id ?? '');
        const current = state.notes.get(entityId) ?? [];
        const created = noteRow({
          id: `note-map063-created-${current.length}`,
          entity_id: entityId,
          title: String(body.p_title ?? ''),
          body: String(body.p_body ?? ''),
          sort_order: current.length,
          author_player_id: String(body.p_player_id ?? ''),
          last_modifier_player_id: String(body.p_player_id ?? ''),
          created_at: UPDATED_AT,
          updated_at: UPDATED_AT,
        });
        state.notes.set(entityId, [...current, created]);
        await route.fulfill(jsonResponse([created]));
        return;
      }
      if (name === 'create_master_public_note') {
        const entityId = String(body.p_entity_id ?? '');
        const current = state.notes.get(entityId) ?? [];
        const created = noteRow({
          id: `note-map063-master-${current.length}`,
          entity_id: entityId,
          title: String(body.p_title ?? ''),
          body: String(body.p_body ?? ''),
          sort_order: current.length,
          author_kind: 'master',
          author_player_id: null,
          last_modifier_kind: 'master',
          last_modifier_player_id: null,
          created_at: UPDATED_AT,
          updated_at: UPDATED_AT,
        });
        state.notes.set(entityId, [...current, created]);
        await route.fulfill(jsonResponse([created]));
        return;
      }
      if (name === 'update_master_public_note') {
        if (state.failNextMasterUpdate) {
          state.failNextMasterUpdate = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          return;
        }
        const entityId = String(body.p_entity_id ?? '');
        const noteId = String(body.p_note_id ?? '');
        const current = state.notes.get(entityId) ?? [];
        const updated = current.find((note) => note.id === noteId);
        if (!updated) {
          await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
          return;
        }
        const replacement = {
          ...updated,
          title: String(body.p_title ?? ''),
          body: String(body.p_body ?? ''),
          updated_at: UPDATED_AT,
          last_modifier_kind: 'master' as const,
          last_modifier_player_id: null,
        };
        state.notes.set(
          entityId,
          current.map((note) => (note.id === noteId ? replacement : note)),
        );
        await route.fulfill(jsonResponse([replacement]));
        return;
      }
      if (name === 'archive_master_public_note') {
        const entityId = String(body.p_entity_id ?? '');
        const noteId = String(body.p_note_id ?? '');
        state.notes.set(
          entityId,
          (state.notes.get(entityId) ?? []).filter((note) => note.id !== noteId),
        );
        await route.fulfill(jsonResponse(true));
        return;
      }

      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }

    if (
      !state.online &&
      ['public_notes', 'players', 'map_entities'].includes(path) &&
      !request.headers().range
    ) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '[]' });
      return;
    }

    if (path === 'campaigns') {
      await route.fulfill(jsonResponse([...CAMPAIGNS]));
      return;
    }

    const select = url.searchParams.get('select') ?? '';
    if (path === 'map_entities' && select === 'campaign_id') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? '';
      const match = Object.entries(ENTITIES).find(([, rows]) => rows.some((row) => row.id === id));
      await route.fulfill(jsonResponse(match ? [{ campaign_id: match[0] }] : []));
      return;
    }
    if (path === 'players' && select === 'id,display_name,display_order') {
      const campaignId = campaignFromUrl(url) as keyof typeof PLAYERS;
      await route.fulfill(
        jsonResponse(
          PLAYERS[campaignId].map(({ id, display_name, display_order }) => ({
            id,
            display_name,
            display_order,
          })),
        ),
      );
      return;
    }
    if (path === 'public_notes' && select.includes('author_kind')) {
      const entityId = url.searchParams.get('entity_id')?.replace(/^eq\./, '') ?? '';
      await route.fulfill(jsonResponse(state.notes.get(entityId) ?? []));
      return;
    }

    const campaignId = campaignFromUrl(url);
    await route.fulfill(jsonResponse(publicRows(path, campaignId)));
  });

  return state;
}

async function openCampaignA(page: Page): Promise<void> {
  await page.goto('/?entity=map063-a&campaign=castigo-divino');
  await expect(page.getByRole('heading', { level: 1, name: 'MAP-063 Lugar A' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Notas públicas' })).toBeVisible();
}

test('visitor declares a campaign player and sees the persisted note immediately without moderation', async ({
  context,
  page,
}) => {
  const state = await configureBackend(context);
  await openCampaignA(page);

  const author = page.getByLabel('Autor declarado');
  await expect(author).toBeVisible();
  await expect(author.getByRole('option', { name: 'Skade' })).toHaveCount(1);
  await expect(author.getByRole('option', { name: 'Ura' })).toHaveCount(1);
  await expect(author.getByRole('option', { name: 'Veyra' })).toHaveCount(1);
  await expect(page.getByText(/autoría del jugador es declarada/i)).toBeVisible();

  await page.getByLabel('Título').fill('Hallazgo del jugador');
  await page
    .getByRole('textbox', { name: 'Nota', exact: true })
    .fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Publicar nota' }).click();
  await expect(page.getByText('Selecciona un personaje del roster.')).toBeVisible();
  await expect(author).toBeFocused();

  await author.selectOption('player-skade');
  await page.getByRole('button', { name: 'Publicar nota' }).click();

  const created = page.locator('[data-public-note-id="note-map063-created-1"]');
  await expect(
    created.getByRole('heading', { level: 3, name: 'Hallazgo del jugador' }),
  ).toBeVisible();
  await expect(created.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(created.locator('img')).toHaveCount(0);
  await expect(created).toContainText('Autor: Skade.');
  await expect(created).toContainText('Última modificación:');
  await expect(created).toContainText('Skade.');
  await expect(created.locator('time')).toHaveAttribute('datetime', UPDATED_AT);
  await expect(page.getByText(/no requiere aprobación previa/i)).toBeVisible();
  await expect(created.getByRole('button', { name: /editar/i })).toHaveCount(0);
  await expect(created.getByRole('button', { name: /retirar/i })).toHaveCount(0);

  const createCall = state.rpcBodies.find((call) => call.name === 'create_public_player_note');
  expect(createCall?.authorization).toBeNull();
  expect(createCall?.body).toEqual({
    p_entity_id: 'place-map063-a',
    p_player_id: 'player-skade',
    p_title: 'Hallazgo del jugador',
    p_body: '<img src=x onerror=alert(1)>',
  });
});

test('campaign B exposes only its roster and notes', async ({ context, page }) => {
  await configureBackend(context);
  await page.goto('/?entity=map063-b&campaign=map063-b');
  await expect(page.getByRole('heading', { level: 1, name: 'MAP-063 Lugar B' })).toBeVisible();

  const author = page.getByLabel('Autor declarado');
  await expect(author.getByRole('option', { name: 'Bryn' })).toHaveCount(1);
  await expect(author.getByRole('option', { name: 'Skade' })).toHaveCount(0);
  await expect(author.getByRole('option', { name: 'Ura' })).toHaveCount(0);
  await expect(author.getByRole('option', { name: 'Veyra' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Apunte de Bryn' })).toBeVisible();
  await expect(page.getByText('Apunte de Skade')).toHaveCount(0);
});

test('authorized Master creates, edits and retires notes while original player authorship is preserved', async ({
  context,
  page,
}) => {
  const state = await configureBackend(context, { admin: true });
  await openCampaignA(page);

  await expect(page.getByText('Autor: Máster', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Autor declarado')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar como Máster' })).toBeEnabled();

  await page.getByLabel('Título').fill('Nota del Máster');
  await page
    .getByRole('textbox', { name: 'Nota', exact: true })
    .fill('Creada desde una sesión administrativa autorizada.');
  await page.getByRole('button', { name: 'Publicar como Máster' }).click();
  const masterNote = page.getByRole('heading', { level: 3, name: 'Nota del Máster' });
  await expect(masterNote).toBeVisible();
  const masterArticle = masterNote.locator('..');
  await expect(masterArticle).toContainText('Autor: Máster.');

  const playerNote = page.locator('[data-public-note-id="note-map063-player-a"]');
  await playerNote.getByRole('button', { name: 'Editar nota Apunte de Skade' }).click();
  await playerNote.getByRole('button', { name: 'Cancelar' }).click();
  await expect(
    playerNote.getByRole('button', { name: 'Editar nota Apunte de Skade' }),
  ).toBeFocused();

  await playerNote.getByRole('button', { name: 'Editar nota Apunte de Skade' }).click();
  const editForm = playerNote.locator('form');
  await editForm.getByLabel('Título').fill('Apunte de Skade revisado');
  await editForm
    .getByRole('textbox', { name: 'Nota', exact: true })
    .fill('Revisado por el Máster.');
  await editForm.getByRole('button', { name: 'Guardar cambios' }).click();

  const edited = page.locator('[data-public-note-id="note-map063-player-a"]');
  await expect(
    edited.getByRole('heading', { level: 3, name: 'Apunte de Skade revisado' }),
  ).toBeVisible();
  await expect(edited).toContainText('Autor: Skade.');
  await expect(edited).toContainText('· Máster.');

  await edited.getByRole('button', { name: 'Retirar nota Apunte de Skade revisado' }).click();
  await edited.getByRole('button', { name: 'Cancelar' }).click();
  await expect(
    edited.getByRole('button', { name: 'Retirar nota Apunte de Skade revisado' }),
  ).toBeFocused();

  await edited.getByRole('button', { name: 'Retirar nota Apunte de Skade revisado' }).click();
  await page.getByRole('button', { name: 'Confirmar retirada' }).click();
  await expect(page.locator('[data-public-note-id="note-map063-player-a"]')).toHaveCount(0);
  await expect(page.getByText(/conservada como archivada/i)).toBeVisible();

  const adminCalls = state.rpcBodies.filter((call) =>
    [
      'create_master_public_note',
      'update_master_public_note',
      'archive_master_public_note',
    ].includes(call.name),
  );
  expect(adminCalls).toHaveLength(3);
  for (const call of adminCalls) {
    expect(call.authorization).toBe('Bearer map063-admin-token');
    expect(call.body).not.toHaveProperty('author_kind');
    expect(call.body).not.toHaveProperty('author_player_id');
    expect(call.body).not.toHaveProperty('campaign_id');
    expect(call.body).not.toHaveProperty('publication_status');
  }
});

test('recoverable Master edit failure preserves the draft and allows retry', async ({
  context,
  page,
}) => {
  const state = await configureBackend(context, { admin: true });
  await openCampaignA(page);

  const playerNote = page.locator('[data-public-note-id="note-map063-player-a"]');
  await playerNote.getByRole('button', { name: 'Editar nota Apunte de Skade' }).click();
  const editForm = playerNote.locator('form');
  const title = editForm.getByLabel('Título');
  const body = editForm.getByRole('textbox', { name: 'Nota', exact: true });
  const save = editForm.getByRole('button', { name: 'Guardar cambios' });

  await title.fill('Apunte recuperable');
  await body.fill('Este borrador debe sobrevivir a un fallo transitorio.');
  state.failNextMasterUpdate = true;
  await save.click();

  await expect(editForm.getByText(/texto se conserva para reintentarlo/i)).toBeVisible();
  await expect(title).toHaveValue('Apunte recuperable');
  await expect(body).toHaveValue('Este borrador debe sobrevivir a un fallo transitorio.');
  await expect(editForm).not.toHaveAttribute('aria-busy', 'true');
  await expect(save).toBeEnabled();

  await save.click();
  await expect(page.getByRole('heading', { level: 3, name: 'Apunte recuperable' })).toBeVisible();
});

test('stale Master authorization fails closed until the session is revalidated', async ({
  context,
  page,
}) => {
  const state = await configureBackend(context, { admin: true });
  await openCampaignA(page);

  await expect(page.getByText('Autor: Máster', { exact: true })).toBeVisible();
  state.admin = false;
  await page.getByLabel('Título').fill('No debe publicarse');
  await page.getByRole('textbox', { name: 'Nota', exact: true }).fill('Sesión revocada.');
  await page.getByRole('button', { name: 'Publicar como Máster' }).click();

  await expect(page.getByText(/sesión del Máster ya no está autorizada/i)).toBeVisible();
  await expect(page.getByText('Autor: Máster', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Autor: sesión sin verificar', { exact: true })).toBeVisible();
  await expect(page.locator('[data-public-note-admin-actions]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publicar nota' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reintentar conexión' })).toBeVisible();
  await expect(page.getByLabel('Título')).toHaveValue('No debe publicarse');
  await expect(page.getByRole('textbox', { name: 'Nota', exact: true })).toHaveValue(
    'Sesión revocada.',
  );

  state.admin = true;
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();
  await expect(page.getByText('Autor: Máster', { exact: true })).toBeVisible();
  await expect(page.getByText('Autor: sesión sin verificar', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publicar como Máster' })).toBeEnabled();
  await expect(page.locator('[data-public-note-admin-actions]')).toHaveCount(1);
});

test('degraded mode keeps snapshot notes and draft text, then recovers locally without reload', async ({
  context,
  page,
}) => {
  const state = await configureBackend(context, { online: false });
  await openCampaignA(page);

  await expect(page.getByRole('heading', { level: 3, name: 'Nota histórica A' })).toBeVisible();
  await expect(page.getByText(/no se puede guardar mientras Supabase no responda/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar nota' })).toBeDisabled();

  await page.getByLabel('Título').fill('Borrador conservado');
  await page
    .getByRole('textbox', { name: 'Nota', exact: true })
    .fill('Este texto debe sobrevivir a la recuperación.');
  state.online = true;
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();

  await expect(page.getByLabel('Título')).toHaveValue('Borrador conservado');
  await expect(page.getByRole('textbox', { name: 'Nota', exact: true })).toHaveValue(
    'Este texto debe sobrevivir a la recuperación.',
  );
  await expect(page.getByLabel('Autor declarado')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Publicar nota' })).toBeEnabled();
  await expect(page.getByRole('heading', { level: 1, name: 'MAP-063 Lugar A' })).toBeVisible();
});

test('note form and metadata reflow at 320, 390 and 430 px with forced colors and reduced motion', async ({
  context,
  page,
}) => {
  await configureBackend(context);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await openCampaignA(page);
    await expect(page.getByLabel('Autor declarado')).toBeVisible();
    await expect(page.getByLabel('Título')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nota', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar nota' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const ids = await page
      .locator('[id]')
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
  }

  // 320 CSS px also exercises the WCAG-style reflow pressure of a 640 px viewport at 200% zoom.
  await page.getByLabel('Título').focus();
  await expect(page.getByLabel('Título')).toBeFocused();
});
