import { expect, test, type Page, type Route } from '@playwright/test';

import { createSha256Checksum } from '../../src/data-access/publicCatalog';
import type {
  PublicCampaignCatalogV3,
  PublicCampaignV3,
  PublicCatalogSnapshotV3,
} from '../../src/data/beta03-model';

type CampaignEntityId = PublicCampaignCatalogV3['entities'][number]['id'];
type CampaignCategoryId = PublicCampaignCatalogV3['categories'][number]['id'];

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const PUBLISHABLE_KEY = 'sb_publishable_map055_campaign_key';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

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

const CAMPAIGN_ROWS = CAMPAIGNS.map((campaign) => ({
  id: campaign.id,
  slug: campaign.slug,
  name: campaign.name,
  status: campaign.status,
  display_order: campaign.displayOrder,
}));

interface PublicRequestCapture {
  readonly campaignId: string;
  readonly body: Readonly<Record<string, unknown>>;
}

interface CampaignBackend {
  setRemoteAvailable(value: boolean): void;
  getPublicRequests(): readonly PublicRequestCapture[];
}

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function campaignIdFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function rowsFor(table: string, campaignId: string): readonly Record<string, unknown>[] {
  const suffix = campaignId === CAMPAIGN_B_ID ? 'b' : 'a';
  const entityId = `place-campaign-${suffix}`;
  const categoryId = `category-campaign-${suffix}`;
  const name = suffix === 'b' ? 'Beta Bastión' : 'Alpha Atalaya';

  switch (table) {
    case 'categories':
      return [
        {
          id: categoryId,
          slug: `campaign-${suffix}`,
          name: `Categoría ${suffix.toUpperCase()}`,
          description: `Categoría exclusiva de campaña ${suffix.toUpperCase()}`,
        },
      ];
    case 'map_entities':
      return [
        {
          id: entityId,
          slug: `campaign-${suffix}-place`,
          entity_type: 'location',
          visibility: 'pin',
          name,
          name_language: 'en',
          summary: `Resumen exclusivo ${suffix.toUpperCase()}`,
          description: `Descripción exclusiva ${suffix.toUpperCase()}`,
          portrait_path: null,
          x: suffix === 'b' ? 2400 : 900,
          y: suffix === 'b' ? 1400 : 700,
          category_id: categoryId,
        },
      ];
    case 'entity_aliases':
      return [
        {
          id: `alias-campaign-${suffix}`,
          entity_id: entityId,
          language: 'en',
          value: `Alias ${suffix.toUpperCase()}`,
        },
      ];
    default:
      return [];
  }
}

function snapshotCatalog(campaignId: string): PublicCampaignCatalogV3 {
  const suffix = campaignId === CAMPAIGN_B_ID ? 'b' : 'a';
  const entityId = `place-campaign-${suffix}` as CampaignEntityId;
  const categoryId = `category-campaign-${suffix}` as CampaignCategoryId;
  return {
    campaignId,
    categories: [
      {
        id: categoryId,
        slug: `campaign-${suffix}`,
        name: `Categoría ${suffix.toUpperCase()}`,
        description: `Categoría exclusiva de campaña ${suffix.toUpperCase()}`,
      },
    ],
    tags: [],
    players: [],
    entities: [
      {
        id: entityId,
        slug: `campaign-${suffix}-place`,
        entityType: 'location',
        visibility: 'pin',
        name: suffix === 'b' ? 'Beta Bastión' : 'Alpha Atalaya',
        nameLanguage: 'en',
        aliases: [
          {
            id: `alias-campaign-${suffix}`,
            entityId,
            language: 'en',
            value: `Alias ${suffix.toUpperCase()}`,
          },
        ],
        summary: `Resumen exclusivo ${suffix.toUpperCase()}`,
        description: `Descripción exclusiva ${suffix.toUpperCase()}`,
        coordinates: { x: suffix === 'b' ? 2400 : 900, y: suffix === 'b' ? 1400 : 700 },
        categoryId,
        tagIds: [],
      },
    ],
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
    campaignCatalogs: [snapshotCatalog(CAMPAIGN_A_ID), snapshotCatalog(CAMPAIGN_B_ID)],
    geographicNames: [],
  };
  const checksum = await createSha256Checksum(content);
  return {
    ...content,
    generatedAt: '2026-08-27T12:00:00.000Z',
    sourceRevision: checksum,
    checksum,
  };
}

async function configureCampaignBackend(
  page: Page,
  options: { readonly remoteAvailable?: boolean } = {},
): Promise<CampaignBackend> {
  let remoteAvailable = options.remoteAvailable !== false;
  const publicRequests: PublicRequestCapture[] = [];
  const submissionBindings = new Map<string, string>();
  const snapshot = await makeSnapshot();
  let bindingSequence = 0;

  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 500,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP026_PUBLIC_REQUEST_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        cooldownMs: 0,
      };
    },
    { projectUrl: LOCAL_SUPABASE_URL, publishableKey: PUBLISHABLE_KEY },
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

  await page.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';

    if (resource === 'rpc/begin_public_request_submission') {
      if (!remoteAvailable) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const campaign = CAMPAIGNS.find((candidate) => candidate.id === body.p_campaign_id);
      if (!campaign) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
        return;
      }
      const submissionToken = `map055-bound-${bindingSequence++}-${campaign.id}`;
      submissionBindings.set(submissionToken, campaign.id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          campaign_id: campaign.id,
          campaign_slug: campaign.slug,
          campaign_name: campaign.name,
          submission_token: submissionToken,
          expires_at: '2026-08-29T01:15:00.000Z',
        }),
      });
      return;
    }

    if (resource === 'rpc/submit_public_request_v3') {
      if (!remoteAvailable) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const submissionToken =
        typeof body.p_submission_token === 'string' ? body.p_submission_token : '';
      const campaignId = submissionBindings.get(submissionToken);
      if (!campaignId) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
        return;
      }
      submissionBindings.delete(submissionToken);
      publicRequests.push({ campaignId, body });
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (!remoteAvailable) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    const table = resource.split('?')[0] ?? '';
    const rows =
      table === 'campaigns'
        ? CAMPAIGN_ROWS
        : table === 'geographic_names' || table === 'geographic_name_aliases'
          ? []
          : rowsFor(table, campaignIdFromUrl(url));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });

  return {
    setRemoteAvailable(value): void {
      remoteAvailable = value;
    },
    getPublicRequests: () => publicRequests,
  };
}

async function expectCampaignA(page: Page): Promise<void> {
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue('castigo-divino');
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-a"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-b"]'),
  ).toHaveCount(0);
}

async function expectCampaignB(page: Page): Promise<void> {
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue('campaign-b');
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-a"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-b"]'),
  ).toHaveCount(1);
}

async function fillPublicRequest(page: Page, prefix: string): Promise<void> {
  await page.getByLabel('Nombre o apodo').fill(`${prefix} visitante`);
  await page.getByLabel('Nombre propuesto del pin').fill(`${prefix} propuesta`);
  await page.getByLabel('Tipo de pin').selectOption('location');
  await page.getByRole('button', { name: 'Usar el centro visible' }).click();
  await page.getByLabel('Descripción').fill(`${prefix} descripción`);
  await page.getByLabel('Motivo de la solicitud').fill(`${prefix} motivo`);
}

test('A/B selection isolates map, search and details while URL Back/Forward remains canonical', async ({
  page,
}) => {
  await configureCampaignBackend(page);
  await page.goto('/?campaign=not-a-campaign');

  const selector = page.getByLabel('Campaña', { exact: true });
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(page.locator('[data-campaign-status]')).toContainText('Castigo Divino');
  await expect(page).toHaveURL(/campaign=castigo-divino/);
  await expectCampaignA(page);

  await page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-a"]').click();
  await expect(page.getByTestId('place-details')).toContainText('Alpha Atalaya');

  await selector.selectOption('campaign-b');
  await expect(page).toHaveURL(/campaign=campaign-b/);
  await expect(page).not.toHaveURL(/place=/);
  await expectCampaignB(page);
  await expect(page.getByTestId('place-details')).not.toContainText('Alpha Atalaya');

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Beta Bastión');
  await expect(page.locator('[data-search-result-id="place-campaign-b"]')).toBeVisible();
  await expect(page.locator('[data-search-result-id="place-campaign-a"]')).toHaveCount(0);

  await page.goBack();
  await expectCampaignA(page);
  await page.goForward();
  await expectCampaignB(page);
});

test('a public request submitted from B displays and persists campaign B explicitly', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/');
  await page.getByLabel('Campaña', { exact: true }).selectOption('campaign-b');
  await expectCampaignB(page);

  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    'Campaña destinataria:Campaña B',
  );
  await fillPublicRequest(page, 'B');
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    'Solicitud enviada a Campaña B',
  );
  await expect.poll(() => backend.getPublicRequests().length).toBe(1);
  expect(backend.getPublicRequests()[0]?.campaignId).toBe(CAMPAIGN_B_ID);
  expect(backend.getPublicRequests()[0]?.body).not.toHaveProperty('p_campaign_id');
});

test('an empty open form follows A to B and B to A without a confirmation prompt', async ({
  page,
}) => {
  await configureCampaignBackend(page);
  await page.goto('/?campaign=castigo-divino');
  await page.getByRole('button', { name: 'Proponer un pin' }).click();

  const target = page.locator('[data-public-pin-request-campaign-target]');
  const prompt = page.locator('[data-public-pin-request-campaign-change]');
  const selector = page.getByLabel('Campaña', { exact: true });
  await expect(target).toContainText('Castigo Divino');

  await selector.selectOption('campaign-b');
  await expect(target).toContainText('Campaña B');
  await expect(prompt).toBeHidden();

  await selector.selectOption('castigo-divino');
  await expect(target).toContainText('Castigo Divino');
  await expect(prompt).toBeHidden();
});

test('a partial A draft keeps A when the global selector moves to B and cancel is explicit', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/?campaign=castigo-divino');
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await page.getByLabel('Nombre o apodo').fill('Borrador parcial A');

  await page.getByLabel('Campaña', { exact: true }).selectOption('campaign-b');
  const prompt = page.locator('[data-public-pin-request-campaign-change]');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('sigue destinado a Castigo Divino');
  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    'Castigo Divino',
  );
  await expect(prompt).not.toHaveAttribute('role', 'dialog');
  await expect(page.getByLabel('Nombre o apodo')).toHaveValue('Borrador parcial A');

  await page.getByRole('button', { name: 'Conservar borrador en Castigo Divino' }).click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    'Borrador conservado en Castigo Divino',
  );

  await page.getByLabel('Nombre propuesto del pin').fill('A permanece A');
  await page.getByLabel('Tipo de pin').selectOption('location');
  await page.getByRole('button', { name: 'Usar el centro visible' }).click();
  await page.getByLabel('Descripción').fill('Conservar destino original');
  await page.getByLabel('Motivo de la solicitud').fill('Cancelar el retarget');
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    'Solicitud enviada a Castigo Divino',
  );
  await expect.poll(() => backend.getPublicRequests().length).toBe(1);
  expect(backend.getPublicRequests()[0]?.campaignId).toBe(CAMPAIGN_A_ID);
  expect(backend.getPublicRequests()[0]?.body).not.toHaveProperty('p_campaign_id');
});

test('a complete A draft can explicitly move to B without losing fields or position', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/?campaign=castigo-divino');
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await fillPublicRequest(page, 'Completo A');
  const position = await page.locator('[data-public-pin-request-position]').textContent();

  await page.getByLabel('Campaña', { exact: true }).selectOption('campaign-b');
  await expect(page.locator('[data-public-pin-request-campaign-change]')).toBeVisible();
  await page.getByRole('button', { name: 'Mover borrador a Campaña B' }).click();

  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    'Campaña B',
  );
  await expect(page.getByLabel('Nombre o apodo')).toHaveValue('Completo A visitante');
  await expect(page.getByLabel('Nombre propuesto del pin')).toHaveValue('Completo A propuesta');
  await expect(page.getByLabel('Descripción')).toHaveValue('Completo A descripción');
  await expect(page.locator('[data-public-pin-request-position]')).toHaveText(position ?? '');

  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();
  await expect.poll(() => backend.getPublicRequests().length).toBe(1);
  expect(backend.getPublicRequests()[0]?.campaignId).toBe(CAMPAIGN_B_ID);
  expect(backend.getPublicRequests()[0]?.body).not.toHaveProperty('p_campaign_id');
});

test('a B draft switching back to A cannot submit until keep-or-move is resolved', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/?campaign=campaign-b');
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await fillPublicRequest(page, 'Completo B');

  await page.getByLabel('Campaña', { exact: true }).selectOption('castigo-divino');
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();
  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    'Antes de enviar, decide',
  );
  await expect(page.getByRole('button', { name: 'Conservar borrador en Campaña B' })).toBeFocused();
  expect(backend.getPublicRequests()).toHaveLength(0);

  await page.getByRole('button', { name: 'Mover borrador a Castigo Divino' }).click();
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();
  await expect.poll(() => backend.getPublicRequests().length).toBe(1);
  expect(backend.getPublicRequests()[0]?.campaignId).toBe(CAMPAIGN_A_ID);
  expect(backend.getPublicRequests()[0]?.body).not.toHaveProperty('p_campaign_id');
});

test('degraded schema v3 keeps B selected and backend recovery does not reset it to A', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page, { remoteAvailable: false });
  await page.goto('/?campaign=campaign-b');

  await expectCampaignB(page);
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'degraded',
  );

  backend.setRemoteAvailable(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() => page.locator('[data-backend-status]').getAttribute('data-backend-state'))
    .toBe('connected');
  await expectCampaignB(page);
  await expect(page).toHaveURL(/campaign=campaign-b/);
});

for (const width of [320, 390, 430, 768, 1280]) {
  test(`campaign selector remains keyboard-visible at ${width}px and forced colors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await configureCampaignBackend(page);
    await page.goto('/');

    const selector = page.getByLabel('Campaña', { exact: true });
    await expect(selector).toBeVisible();
    await selector.focus();
    await expect(selector).toBeFocused();
    await selector.selectOption('campaign-b');
    await expectCampaignB(page);
    await expect(page.locator('[data-campaign-status]')).toContainText('Campaña B');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
}
