import { expect, test, type Page, type Route } from '@playwright/test';

import { createSha256Checksum } from '../../src/data-access/publicCatalog';
import type {
  PublicCampaignCatalogV3,
  PublicCampaignV3,
  PublicCatalogSnapshotV3,
} from '../../src/data/beta03-model';

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

interface PublicRequestBody {
  readonly p_campaign_id?: unknown;
  readonly [key: string]: unknown;
}

interface CampaignBackend {
  setRemoteAvailable(value: boolean): void;
  getPublicRequests(): readonly PublicRequestBody[];
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
  const entityId = `place-campaign-${suffix}`;
  const categoryId = `category-campaign-${suffix}`;
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
  const publicRequests: PublicRequestBody[] = [];
  const snapshot = await makeSnapshot();

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

    if (resource === 'rpc/submit_public_request_v2') {
      publicRequests.push(JSON.parse(request.postData() ?? '{}') as PublicRequestBody);
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

test('a public request submitted from B is persisted explicitly with campaign B', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/');
  await page.getByLabel('Campaña', { exact: true }).selectOption('campaign-b');
  await expectCampaignB(page);

  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await page.getByLabel('Nombre o apodo').fill('Visitante E2E');
  await page.getByLabel('Nombre propuesto del pin').fill('Petición de campaña B');
  await page.getByLabel('Tipo de pin').selectOption('location');
  await page.getByRole('button', { name: 'Usar el centro visible' }).click();
  await page.getByLabel('Descripción').fill('Solicitud vinculada exclusivamente a la campaña B.');
  await page.getByLabel('Motivo de la solicitud').fill('Verificar el aislamiento multicampaña.');
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(
    page.getByText('Solicitud enviada para revisión. No se publicará automáticamente en el mapa.'),
  ).toContainText('Solicitud enviada');
  await expect.poll(() => backend.getPublicRequests().length).toBe(1);
  expect(backend.getPublicRequests()[0]?.p_campaign_id).toBe(CAMPAIGN_B_ID);
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

for (const width of [320, 430]) {
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
  });
}
