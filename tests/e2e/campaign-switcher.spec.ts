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
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000068';
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
    slug: 'un-aliento-menos',
    name: 'Un aliento menos',
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
  const name = suffix === 'b' ? 'Veyra' : 'Alpha Atalaya';

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
    case 'players':
      return campaignId === CAMPAIGN_B_ID
        ? [
            {
              id: 'player-veyra',
              slug: 'veyra',
              display_name: 'Veyra',
              name_language: 'en',
              accent_color: '#9d174d',
            },
          ]
        : [
            {
              id: 'player-skade',
              slug: 'skade',
              display_name: 'Skade',
              name_language: 'en',
              accent_color: '#c2410c',
            },
            {
              id: 'player-ura',
              slug: 'ura',
              display_name: 'Ura',
              name_language: 'en',
              accent_color: '#1e3a8a',
            },
          ];
    case 'map_entities':
      return campaignId === CAMPAIGN_B_ID
        ? [
            {
              id: entityId,
              slug: 'veyra',
              entity_type: 'character',
              visibility: 'pin',
              name,
              name_language: 'en',
              summary: 'Veyra pertenece únicamente a Un aliento menos.',
              description: 'Entidad de Veyra para aislamiento multicampaña.',
              portrait_path: null,
              x: 2400,
              y: 1400,
              category_id: categoryId,
            },
            {
              id: 'place-campaign-b-ally',
              slug: 'aliado-veyra',
              entity_type: 'location',
              visibility: 'pin',
              name: 'Aliado de Veyra',
              name_language: 'en',
              summary: 'Canario ally.',
              description: 'Canario ally.',
              portrait_path: null,
              x: 2850,
              y: 1650,
              category_id: categoryId,
            },
            {
              id: 'place-campaign-b-neutral',
              slug: 'neutral-veyra',
              entity_type: 'location',
              visibility: 'pin',
              name: 'Neutral de Veyra',
              name_language: 'en',
              summary: 'Canario neutral.',
              description: 'Canario neutral.',
              portrait_path: null,
              x: 3250,
              y: 1900,
              category_id: categoryId,
            },
          ]
        : [
            {
              id: entityId,
              slug: 'campaign-a-place',
              entity_type: 'location',
              visibility: 'pin',
              name,
              name_language: 'en',
              summary: 'Resumen exclusivo A',
              description: 'Descripción exclusiva A',
              portrait_path: null,
              x: 900,
              y: 700,
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
    case 'entity_player_dispositions':
      return campaignId === CAMPAIGN_B_ID
        ? [
            {
              entity_id: 'place-campaign-b-ally',
              player_id: 'player-veyra',
              disposition: 'ally',
            },
            {
              entity_id: 'place-campaign-b-neutral',
              player_id: 'player-veyra',
              disposition: 'neutral',
            },
          ]
        : [
            {
              entity_id: 'place-campaign-a',
              player_id: 'player-skade',
              disposition: 'ally',
            },
            {
              entity_id: 'place-campaign-a',
              player_id: 'player-ura',
              disposition: 'enemy',
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
  const categories = [
    {
      id: categoryId,
      slug: `campaign-${suffix}`,
      name: `Categoría ${suffix.toUpperCase()}`,
      description: `Categoría exclusiva de campaña ${suffix.toUpperCase()}`,
    },
  ];

  if (campaignId === CAMPAIGN_B_ID) {
    return {
      campaignId,
      categories,
      tags: [],
      players: [
        {
          id: 'player-veyra',
          slug: 'veyra',
          displayName: 'Veyra',
          nameLanguage: 'en',
        },
      ],
      entities: [
        {
          id: entityId,
          slug: 'veyra',
          entityType: 'character',
          visibility: 'pin',
          name: 'Veyra',
          nameLanguage: 'en',
          aliases: [
            {
              id: 'alias-campaign-b',
              entityId,
              language: 'en',
              value: 'Alias B',
            },
          ],
          summary: 'Veyra pertenece únicamente a Un aliento menos.',
          description: 'Entidad de Veyra para aislamiento multicampaña.',
          coordinates: { x: 2400, y: 1400 },
          categoryId,
          tagIds: [],
        },
        {
          id: 'place-campaign-b-ally' as CampaignEntityId,
          slug: 'aliado-veyra',
          entityType: 'location',
          visibility: 'pin',
          name: 'Aliado de Veyra',
          nameLanguage: 'en',
          aliases: [],
          summary: 'Canario ally.',
          description: 'Canario ally.',
          coordinates: { x: 2850, y: 1650 },
          categoryId,
          tagIds: [],
        },
        {
          id: 'place-campaign-b-neutral' as CampaignEntityId,
          slug: 'neutral-veyra',
          entityType: 'location',
          visibility: 'pin',
          name: 'Neutral de Veyra',
          nameLanguage: 'en',
          aliases: [],
          summary: 'Canario neutral.',
          description: 'Canario neutral.',
          coordinates: { x: 3250, y: 1900 },
          categoryId,
          tagIds: [],
        },
      ],
      dispositions: [
        {
          entityId: 'place-campaign-b-ally' as CampaignEntityId,
          playerId: 'player-veyra',
          disposition: 'ally',
        },
        {
          entityId: 'place-campaign-b-neutral' as CampaignEntityId,
          playerId: 'player-veyra',
          disposition: 'neutral',
        },
      ],
      associations: [],
      characterLocationRelations: [],
      notes: [],
      characterLocationEvents: [],
      geographicEntityLinks: [],
    };
  }

  return {
    campaignId,
    categories,
    tags: [],
    players: [
      {
        id: 'player-skade',
        slug: 'skade',
        displayName: 'Skade',
        nameLanguage: 'en',
      },
      {
        id: 'player-ura',
        slug: 'ura',
        displayName: 'Ura',
        nameLanguage: 'en',
      },
    ],
    entities: [
      {
        id: entityId,
        slug: 'campaign-a-place',
        entityType: 'location',
        visibility: 'pin',
        name: 'Alpha Atalaya',
        nameLanguage: 'en',
        aliases: [
          {
            id: 'alias-campaign-a',
            entityId,
            language: 'en',
            value: 'Alias A',
          },
        ],
        summary: 'Resumen exclusivo A',
        description: 'Descripción exclusiva A',
        coordinates: { x: 900, y: 700 },
        categoryId,
        tagIds: [],
      },
    ],
    dispositions: [
      {
        entityId,
        playerId: 'player-skade',
        disposition: 'ally',
      },
      {
        entityId,
        playerId: 'player-ura',
        disposition: 'enemy',
      },
    ],
    associations: [],
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
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue('un-aliento-menos');
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

  await selector.selectOption('un-aliento-menos');
  await expect(page).toHaveURL(/campaign=un-aliento-menos/);
  await expect(page).not.toHaveURL(/place=/);
  await expectCampaignB(page);
  await expect(page.getByTestId('place-details')).not.toContainText('Alpha Atalaya');

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Veyra');
  await expect(page.locator('[data-search-result-id="place-campaign-b"]')).toBeVisible();
  await expect(page.locator('[data-search-result-id="place-campaign-a"]')).toHaveCount(0);

  await page.goBack();
  await expectCampaignA(page);
  await page.goForward();
  await expectCampaignB(page);
});

test('MAP-068 roster isolation drives ally, neutral and self indicators per active campaign', async ({
  page,
}) => {
  await configureCampaignBackend(page);
  await page.goto('/?campaign=castigo-divino');

  const castigoPin = page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-a"]');
  await expect(castigoPin.locator('.pin-disposition')).toHaveCount(2);
  await expect(castigoPin.locator('.pin-disposition--ally')).toHaveCount(1);
  await expect(castigoPin.locator('.pin-disposition--enemy')).toHaveCount(1);
  await expect(castigoPin).toHaveAttribute('aria-label', /Skade: aliado/i);
  await expect(castigoPin).toHaveAttribute('aria-label', /Ura: enemigo/i);
  await expect(castigoPin).not.toHaveAttribute('aria-label', /Veyra:/i);

  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');

  const veyra = page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-b"]');
  const ally = page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-b-ally"]');
  const neutral = page.locator(
    '[data-testid="entity-pin"][data-entity-id="place-campaign-b-neutral"]',
  );

  await expect(veyra.locator('.pin-disposition')).toHaveCount(0);
  await expect(veyra.locator('.pin-visual__dispositions')).toHaveCount(0);
  await expect(veyra).not.toHaveAttribute('aria-label', /Relación con los personajes:/i);

  await expect(ally.locator('.pin-disposition')).toHaveCount(1);
  await expect(ally.locator('.pin-disposition--ally')).toHaveText('+');
  await expect(ally).toHaveAttribute('aria-label', /Veyra: aliado/i);

  await expect(neutral.locator('.pin-disposition')).toHaveCount(0);
  await expect(neutral.locator('.pin-visual__dispositions')).toHaveCount(0);
  await expect(neutral).not.toHaveAttribute('aria-label', /Veyra:\\s*neutral/i);
  await expect(neutral).not.toHaveAttribute('aria-label', /Skade:|Ura:/i);
});

test('a public request submitted from B displays and persists campaign B explicitly', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/');
  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
  await expectCampaignB(page);

  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    'Campaña destinataria:Un aliento menos',
  );
  await fillPublicRequest(page, 'B');
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    'Solicitud enviada a Un aliento menos',
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

  await selector.selectOption('un-aliento-menos');
  await expect(target).toContainText('Un aliento menos');
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

  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
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

  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
  await expect(page.locator('[data-public-pin-request-campaign-change]')).toBeVisible();
  await page.getByRole('button', { name: 'Mover borrador a Un aliento menos' }).click();

  await expect(page.locator('[data-public-pin-request-campaign-target]')).toContainText(
    'Un aliento menos',
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
  await page.goto('/?campaign=un-aliento-menos');
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  await fillPublicRequest(page, 'Completo B');

  await page.getByLabel('Campaña', { exact: true }).selectOption('castigo-divino');
  await page.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();
  await expect(page.locator('[data-public-pin-request-status]')).toContainText(
    'Antes de enviar, decide',
  );
  await expect(
    page.getByRole('button', { name: 'Conservar borrador en Un aliento menos' }),
  ).toBeFocused();
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
  await page.goto('/?campaign=un-aliento-menos');

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
  await expect(page).toHaveURL(/campaign=un-aliento-menos/);
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
    await selector.selectOption('un-aliento-menos');
    await expect(selector).toHaveValue('un-aliento-menos');
    await expect(
      page.locator('[data-testid="entity-pin"][data-entity-id="place-campaign-a"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="entity-pin"], [data-testid="coincident-pin"]'),
    ).not.toHaveCount(0);
    await expect(page.locator('[data-campaign-status]')).toContainText('Un aliento menos');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
}
