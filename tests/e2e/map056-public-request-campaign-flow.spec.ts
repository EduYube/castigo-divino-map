import { expect, test, type Page, type Route } from '@playwright/test';

import { createSha256Checksum } from '../../src/data-access/publicCatalog';
import type {
  PublicCampaignCatalogV3,
  PublicCampaignV3,
  PublicCatalogSnapshotV3,
} from '../../src/data/beta03-model';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const PUBLISHABLE_KEY = 'sb_publishable_map056_campaign_key';
const ACCESS_TOKEN = 'map056_admin_access_token';
const REFRESH_TOKEN = 'map056_admin_refresh_token';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const ARCHIVED_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000056';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type PublicationStatus = 'draft' | 'published' | 'archived';

type Scenario = {
  readonly campaignId: string;
  readonly slug: string;
  readonly name: string;
  readonly categoryId: PublicCampaignCatalogV3['categories'][number]['id'];
  readonly requestId: string;
  readonly otherSlug: string;
};

interface RequestRow extends Record<string, unknown> {
  id: string;
  campaign_id: string;
  sender_name: string;
  proposed_name: string;
  entity_type: 'location';
  x: number;
  y: number;
  description: string;
  reason: string;
  request_status: 'pending' | 'converted';
  moderator_user_id: string | null;
  moderation_note: string | null;
  converted_entity_id: string | null;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CategoryRow extends Record<string, unknown> {
  id: PublicCampaignCatalogV3['categories'][number]['id'];
  campaign_id: string;
  slug: string;
  name: string;
  description: string;
  publication_status: PublicationStatus;
  published_at: string | null;
  updated_at: string;
}

interface EntityRow extends Record<string, unknown> {
  id: string;
  campaign_id: string;
  slug: string;
  entity_type: 'location';
  visibility: 'pin';
  audience: 'public' | 'master';
  portrait_path: null;
  name: string;
  summary: string;
  description: string;
  x: number;
  y: number;
  category_id: string | null;
  publication_status: PublicationStatus;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface BackendControl {
  requests(): readonly RequestRow[];
  entities(): readonly EntityRow[];
}

const SCENARIOS: readonly Scenario[] = [
  {
    campaignId: CAMPAIGN_A_ID,
    slug: 'castigo-divino',
    name: 'Castigo Divino',
    categoryId: 'category-map056-a',
    requestId: '56000000-0000-4000-8000-0000000000a1',
    otherSlug: 'campaign-b',
  },
  {
    campaignId: CAMPAIGN_B_ID,
    slug: 'campaign-b',
    name: 'Campaña B',
    categoryId: 'category-map056-b',
    requestId: '56000000-0000-4000-8000-0000000000b1',
    otherSlug: 'castigo-divino',
  },
];

const CAMPAIGNS: readonly PublicCampaignV3[] = [
  {
    id: CAMPAIGN_A_ID,
    slug: 'castigo-divino',
    name: 'Castigo Divino',
    status: 'active',
    displayOrder: 0,
  },
  {
    id: CAMPAIGN_B_ID,
    slug: 'campaign-b',
    name: 'Campaña B',
    status: 'active',
    displayOrder: 1,
  },
];

const CATEGORIES: readonly CategoryRow[] = SCENARIOS.map((scenario, index) => ({
  id: scenario.categoryId,
  campaign_id: scenario.campaignId,
  slug: `map056-${index === 0 ? 'a' : 'b'}`,
  name: `MAP-056 ${scenario.name}`,
  description: `Published category for ${scenario.name}`,
  publication_status: 'published',
  published_at: '2026-08-28T12:00:00.000Z',
  updated_at: '2026-08-28T12:00:00.000Z',
}));

function rangeResponse(rows: readonly Record<string, unknown>[]): {
  readonly headers: Record<string, string>;
  readonly body: string;
} {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
    },
    body: JSON.stringify(rows),
  };
}

function campaignIdFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function publicCampaignCatalog(scenario: Scenario): PublicCampaignCatalogV3 {
  const category = CATEGORIES.find(({ campaign_id }) => campaign_id === scenario.campaignId);
  if (!category) throw new Error(`Missing category for ${scenario.name}`);
  return {
    campaignId: scenario.campaignId,
    categories: [
      {
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
      },
    ],
    tags: [],
    players: [],
    entities: [],
    dispositions: [],
    characterLocationRelations: [],
    notes: [],
    characterLocationEvents: [],
    geographicEntityLinks: [],
  };
}

async function makeSnapshot(): Promise<PublicCatalogSnapshotV3> {
  const content = {
    schemaVersion: 3 as const,
    campaigns: CAMPAIGNS,
    campaignCatalogs: SCENARIOS.map(publicCampaignCatalog),
    geographicNames: [],
  };
  const checksum = await createSha256Checksum(content);
  return {
    ...content,
    generatedAt: '2026-08-28T12:00:00.000Z',
    sourceRevision: checksum,
    checksum,
  };
}

function detailFor(entity: EntityRow): Record<string, unknown> {
  return {
    record: entity,
    tag_links: [],
    dispositions: [],
    relations_revision: `revision-${entity.id}`,
    delete_blockers: {
      aliases: 0,
      tags: 0,
      geographic_names: 0,
      notes: 0,
      location_events: 0,
      requests: 1,
    },
  };
}

async function configureBackend(page: Page): Promise<BackendControl> {
  const requests: RequestRow[] = [];
  const entities: EntityRow[] = [];
  const submissionBindings = new Map<string, string>();
  const snapshot = await makeSnapshot();
  let timestampSequence = 0;
  let bindingSequence = 0;

  const timestamp = (): string =>
    `2026-08-28T13:00:${String(timestampSequence++).padStart(2, '0')}.000Z`;
  const issueSubmissionToken = (campaignId: string): string => {
    const nonce = String(bindingSequence++).padStart(12, '0');
    return `${campaignId}.1788052500.56000000-0000-4000-8000-${nonce}.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
  };

  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
        retryDelaysMs: [0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
      };
      window.__MAP026_PUBLIC_REQUEST_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        cooldownMs: 0,
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/data/public-catalog.snapshot.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(snapshot),
    });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000056',
          email: 'admin-map056@example.invalid',
        },
      }),
    });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const requestInfo = route.request();
    const url = new URL(requestInfo.url());
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';
    const authorization = requestInfo.headers()['authorization'] ?? '';
    const admin = authorization === `Bearer ${ACCESS_TOKEN}`;

    if (resource === 'rpc/begin_public_request_submission') {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const campaignId = typeof body.p_campaign_id === 'string' ? body.p_campaign_id : '';
      const scenario = SCENARIOS.find((candidate) => candidate.campaignId === campaignId);
      if (!scenario || Object.keys(body).some((key) => key !== 'p_campaign_id')) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: '22023', message: 'invalid campaign' }),
        });
        return;
      }
      const submissionToken = issueSubmissionToken(scenario.campaignId);
      submissionBindings.set(submissionToken, scenario.campaignId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          campaign_id: scenario.campaignId,
          campaign_slug: scenario.slug,
          campaign_name: scenario.name,
          submission_token: submissionToken,
          expires_at: '2026-08-29T01:15:00.000Z',
        }),
      });
      return;
    }

    if (resource === 'rpc/submit_public_request_v3') {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const submissionToken =
        typeof body.p_submission_token === 'string' ? body.p_submission_token : '';
      const campaignId = submissionBindings.get(submissionToken) ?? '';
      const scenario = SCENARIOS.find((candidate) => candidate.campaignId === campaignId);
      const acceptedKeys = new Set([
        'p_submission_token',
        'p_sender_name',
        'p_proposed_name',
        'p_entity_type',
        'p_x',
        'p_y',
        'p_description',
        'p_reason',
        'p_honeypot',
      ]);
      const hasUnexpectedInput = Object.keys(body).some((key) => !acceptedKeys.has(key));
      if (!scenario || hasUnexpectedInput) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '22023',
            message: 'invalid public request submission token',
          }),
        });
        return;
      }
      submissionBindings.delete(submissionToken);
      const createdAt = timestamp();
      requests.push({
        id: scenario.requestId,
        campaign_id: scenario.campaignId,
        sender_name: String(body.p_sender_name),
        proposed_name: String(body.p_proposed_name),
        entity_type: 'location',
        x: Number(body.p_x),
        y: Number(body.p_y),
        description: String(body.p_description),
        reason: String(body.p_reason),
        request_status: 'pending',
        moderator_user_id: null,
        moderation_note: null,
        converted_entity_id: null,
        moderated_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (resource === 'rpc/submit_public_request' || resource === 'rpc/submit_public_request_v2') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }

    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_moderate_public_request_v2')) {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const campaignId = String(body.p_campaign_id ?? '');
      const requestId = String(body.p_request_id ?? '');
      const request = requests.find(
        (candidate) => candidate.id === requestId && candidate.campaign_id === campaignId,
      );
      if (!request || request.request_status !== 'pending') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'request scope mismatch' }),
        });
        return;
      }
      const moderatedAt = timestamp();
      const draftId = `entity-request-${request.id.replaceAll('-', '')}`;
      request.request_status = 'converted';
      request.moderator_user_id = '00000000-0000-4000-8000-000000000056';
      request.moderation_note =
        typeof body.p_moderation_note === 'string' ? body.p_moderation_note.trim() || null : null;
      request.converted_entity_id = draftId;
      request.moderated_at = moderatedAt;
      request.updated_at = moderatedAt;
      entities.push({
        id: draftId,
        campaign_id: request.campaign_id,
        slug: `request-${request.id.replaceAll('-', '')}`,
        entity_type: 'location',
        visibility: 'pin',
        audience: 'public',
        portrait_path: null,
        name: request.proposed_name,
        summary: '',
        description: request.description,
        x: request.x,
        y: request.y,
        category_id: null,
        publication_status: 'draft',
        published_at: null,
        archived_at: null,
        updated_at: moderatedAt,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ request, draft_entity_id: draftId }),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v4')) {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const entity = entities.find(
        (candidate) =>
          candidate.id === body.p_entity_id && candidate.campaign_id === body.p_campaign_id,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entity ? detailFor(entity) : null),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_save_map_entity_v4')) {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const entity = entities.find(
        (candidate) => candidate.id === body.p_id && candidate.campaign_id === body.p_campaign_id,
      );
      if (!entity) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      const updatedAt = timestamp();
      entity.slug = String(body.p_slug);
      entity.name = String(body.p_name);
      entity.summary = String(body.p_summary);
      entity.description = String(body.p_description);
      entity.x = Number(body.p_x);
      entity.y = Number(body.p_y);
      entity.category_id = body.p_category_id == null ? null : String(body.p_category_id);
      entity.publication_status = body.p_publication_status as PublicationStatus;
      entity.published_at =
        entity.published_at ?? (entity.publication_status === 'published' ? updatedAt : null);
      entity.archived_at = entity.publication_status === 'archived' ? updatedAt : null;
      entity.updated_at = updatedAt;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(entity)),
      });
      return;
    }

    const table = resource.split('?')[0] ?? '';
    const campaignId = campaignIdFromUrl(url);

    if (!admin && requestInfo.method() === 'GET') {
      const rows: Record<string, unknown>[] =
        table === 'campaigns'
          ? CAMPAIGNS.map((campaign) => ({
              id: campaign.id,
              slug: campaign.slug,
              name: campaign.name,
              status: campaign.status,
              display_order: campaign.displayOrder,
            }))
          : table === 'categories'
            ? CATEGORIES.filter((category) => category.campaign_id === campaignId).map(
                ({ id, slug, name, description }) => ({ id, slug, name, description }),
              )
            : table === 'map_entities'
              ? entities
                  .filter(
                    (entity) =>
                      entity.campaign_id === campaignId &&
                      entity.publication_status === 'published' &&
                      entity.audience === 'public',
                  )
                  .map((entity) => ({
                    id: entity.id,
                    slug: entity.slug,
                    entity_type: entity.entity_type,
                    visibility: entity.visibility,
                    name: entity.name,
                    name_language: 'en',
                    summary: entity.summary,
                    description: entity.description,
                    portrait_path: entity.portrait_path,
                    x: entity.x,
                    y: entity.y,
                    category_id: entity.category_id,
                  }))
              : [];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    if (!admin) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }

    if (requestInfo.method() === 'GET') {
      const rows: Record<string, unknown>[] =
        table === 'campaigns'
          ? [
              ...CAMPAIGNS.map((campaign) => ({
                id: campaign.id,
                slug: campaign.slug,
                name: campaign.name,
                status: campaign.status,
                display_order: campaign.displayOrder,
                archived_at: null,
                updated_at: '2026-08-28T12:00:00.000Z',
              })),
              {
                id: ARCHIVED_CAMPAIGN_ID,
                slug: 'archived-map056',
                name: 'Archivada MAP-056',
                status: 'archived',
                display_order: 99,
                archived_at: '2026-08-28T12:00:00.000Z',
                updated_at: '2026-08-28T12:00:00.000Z',
              },
            ]
          : table === 'players'
            ? []
            : table === 'categories'
              ? CATEGORIES.filter((category) => category.campaign_id === campaignId)
              : table === 'tags'
                ? []
                : table === 'map_entities'
                  ? entities.filter((entity) => entity.campaign_id === campaignId)
                  : table === 'public_requests'
                    ? requests.filter((request) => request.campaign_id === campaignId)
                    : [];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  return {
    requests: () => requests,
    entities: () => entities,
  };
}

async function login(page: Page): Promise<void> {
  await expect(page.locator('.backend-status')).toHaveAttribute('data-backend-state', 'connected');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin-map056@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText(/Modo administrativo activo\./)).toBeVisible();
  await expect(page.getByLabel('Campaña administrativa')).toBeVisible();
}

async function submitPublicRequest(page: Page, scenario: Scenario): Promise<void> {
  await page.goto(`/?campaign=${scenario.slug}`);
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue(scenario.slug);
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    scenario.name,
  );
  await page.getByLabel('Nombre o apodo').fill(`Visitante ${scenario.name}`);
  await page.getByLabel('Nombre propuesto del pin').fill(`Pin MAP-056 ${scenario.name}`);
  await page.getByLabel('Tipo de pin').selectOption('location');
  await page.getByRole('button', { name: 'Usar el centro visible' }).click();
  await page.getByLabel('Descripción').fill(`Descripción MAP-056 ${scenario.name}`);
  await page.getByLabel('Motivo de la solicitud').fill(`Motivo MAP-056 ${scenario.name}`);
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();
  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    `Solicitud enviada a ${scenario.name}`,
  );
}

for (const scenario of SCENARIOS) {
  test(`request → moderation → publication remains isolated in ${scenario.name}`, async ({
    page,
  }) => {
    const backend = await configureBackend(page);
    await submitPublicRequest(page, scenario);

    await expect.poll(() => backend.requests().length).toBe(1);
    expect(backend.requests()[0]).toMatchObject({
      id: scenario.requestId,
      campaign_id: scenario.campaignId,
      request_status: 'pending',
    });

    await login(page);
    await page.getByLabel('Campaña administrativa').selectOption(scenario.campaignId);
    await expect(page.getByRole('heading', { name: `Pin MAP-056 ${scenario.name}` })).toBeVisible();
    await expect(
      page
        .getByRole('heading', { name: `Pin MAP-056 ${scenario.name}` })
        .locator('..')
        .getByText(scenario.name, { exact: true }),
    ).toBeVisible();

    const card = page.getByRole('heading', { name: `Pin MAP-056 ${scenario.name}` }).locator('..');
    await card.getByRole('button', { name: 'Convertir en borrador' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Crear borrador' }).click();

    const draftId = `entity-request-${scenario.requestId.replaceAll('-', '')}`;
    await expect(
      page.getByRole('heading', { name: `Editar Pin MAP-056 ${scenario.name}` }),
    ).toBeVisible();
    expect(backend.requests()[0]).toMatchObject({
      campaign_id: scenario.campaignId,
      request_status: 'converted',
      converted_entity_id: draftId,
    });
    expect(backend.entities()[0]).toMatchObject({
      id: draftId,
      campaign_id: scenario.campaignId,
      audience: 'public',
      publication_status: 'draft',
      category_id: null,
    });

    await page.getByLabel('Categoría', { exact: true }).selectOption(scenario.categoryId);
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Entidad publicada correctamente.')).toBeVisible();
    expect(backend.entities()[0]).toMatchObject({
      id: draftId,
      campaign_id: scenario.campaignId,
      audience: 'public',
      publication_status: 'published',
      category_id: scenario.categoryId,
    });

    await page.evaluate(() => window.sessionStorage.clear());
    await page.goto(`/?campaign=${scenario.slug}`);
    await expect(
      page.locator(`[data-testid="entity-pin"][data-entity-id="${draftId}"]`),
    ).toHaveCount(1);

    await page.getByLabel('Campaña', { exact: true }).selectOption(scenario.otherSlug);
    await expect(
      page.locator(`[data-testid="entity-pin"][data-entity-id="${draftId}"]`),
    ).toHaveCount(0);
  });
}

test('manipulated public campaign payloads fail closed', async ({ page }) => {
  const backend = await configureBackend(page);
  await page.goto('/?campaign=castigo-divino');
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue('castigo-divino');
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    'Castigo Divino',
  );

  const results = await page.evaluate(
    async ({ projectUrl, publishableKey, campaignA, campaignB, archivedCampaign }) => {
      const headers = {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
      };
      const base = {
        p_sender_name: 'Manipulated visitor',
        p_proposed_name: 'Manipulated request',
        p_entity_type: 'location',
        p_x: 1000,
        p_y: 1000,
        p_description: 'Manipulated description',
        p_reason: 'Manipulated reason',
        p_honeypot: '',
      };
      const begin = async (
        campaignId: string,
      ): Promise<{ readonly status: number; readonly token: string }> => {
        const response = await fetch(`${projectUrl}/rest/v1/rpc/begin_public_request_submission`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_campaign_id: campaignId }),
        });
        const body = response.ok
          ? ((await response.json()) as { submission_token?: unknown })
          : null;
        return {
          status: response.status,
          token: typeof body?.submission_token === 'string' ? body.submission_token : '',
        };
      };
      const submit = async (
        token: string,
        extra: Record<string, unknown> = {},
      ): Promise<number> => {
        const response = await fetch(`${projectUrl}/rest/v1/rpc/submit_public_request_v3`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_submission_token: token, ...base, ...extra }),
        });
        return response.status;
      };
      const legacy = async (name: string, body: Record<string, unknown>): Promise<number> => {
        const response = await fetch(`${projectUrl}/rest/v1/rpc/${name}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        return response.status;
      };

      const bindingForForgery = await begin(campaignA);
      const bindingForExtraField = await begin(campaignA);
      const archived = await begin(archivedCampaign);
      const forgedToken = bindingForForgery.token.replace(campaignA, campaignB);

      return {
        archived: archived.status,
        forgedAtoB: await submit(forgedToken),
        extraCampaignId: await submit(bindingForExtraField.token, { p_campaign_id: campaignB }),
        legacyV2: await legacy('submit_public_request_v2', {
          ...base,
          p_campaign_id: campaignB,
        }),
        legacyV1: await legacy('submit_public_request', base),
      };
    },
    {
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      campaignA: CAMPAIGN_A_ID,
      campaignB: CAMPAIGN_B_ID,
      archivedCampaign: ARCHIVED_CAMPAIGN_ID,
    },
  );

  expect(results).toEqual({
    archived: 400,
    forgedAtoB: 400,
    extraCampaignId: 400,
    legacyV2: 404,
    legacyV1: 404,
  });
  expect(backend.requests()).toHaveLength(0);
});
