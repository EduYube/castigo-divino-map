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
  setCatalogAvailable(value: boolean): void;
  setBindingAvailable(value: boolean): void;
  releaseCatalog(): void;
  getBindingRequestCount(): number;
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
    geographicNames: [
      {
        id: 'geo-neverwinter' as const,
        slug: 'neverwinter',
        name: 'Neverwinter',
        language: 'en' as const,
        aliases: [],
        coordinates: { x: 1433, y: 1853 },
        recommendedZoom: 0.75,
      },
    ],
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
  options: {
    readonly remoteAvailable?: boolean;
    readonly bindingAvailable?: boolean;
    readonly holdCatalogUntilReleased?: boolean;
  } = {},
): Promise<CampaignBackend> {
  let remoteAvailable = options.remoteAvailable !== false;
  let catalogAvailable = true;
  let bindingAvailable = options.bindingAvailable !== false;
  let bindingRequests = 0;
  let releasePendingCatalog: (() => void) | null = null;
  const catalogGate = options.holdCatalogUntilReleased
    ? new Promise<void>((resolve) => {
        releasePendingCatalog = resolve;
      })
    : null;
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

    if (resource === 'campaign_geographic_map_context_links') bindingRequests += 1;
    // Hold real catalog requests independently of binding requests, so the
    // direct link is inspected while the first remote authority check is pending.
    if (catalogGate && resource !== 'campaign_geographic_map_context_links') {
      await catalogGate;
    }
    if (
      !remoteAvailable ||
      (resource === 'campaign_geographic_map_context_links' ? !bindingAvailable : !catalogAvailable)
    ) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    const table = resource.split('?')[0] ?? '';
    const rows =
      table === 'campaigns'
        ? CAMPAIGN_ROWS
        : table === 'geographic_names'
          ? [
              {
                id: 'geo-neverwinter',
                slug: 'neverwinter',
                name: 'Neverwinter',
                language: 'en',
                x: 1433,
                y: 1853,
                recommended_zoom: 0.75,
                entity_id: null,
                search_min_x: null,
                search_max_x: null,
                search_min_y: null,
                search_max_y: null,
              },
            ]
          : table === 'geographic_name_aliases'
            ? []
            : table === 'campaign_geographic_map_context_links'
              ? campaignIdFromUrl(url) === CAMPAIGN_B_ID
                ? [
                    {
                      campaign_id: CAMPAIGN_B_ID,
                      geographic_name_id: 'geo-neverwinter',
                      map_context_id: 'map-neverwinter',
                      map_contexts: {
                        id: 'map-neverwinter',
                        slug: 'neverwinter',
                        name: 'Neverwinter',
                        width: 2048,
                        height: 1582,
                        parent_id: null,
                        image_uri: null,
                        publication_status: 'published',
                      },
                    },
                  ]
                : []
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
    setCatalogAvailable(value): void {
      catalogAvailable = value;
    },
    setBindingAvailable(value): void {
      bindingAvailable = value;
    },
    releaseCatalog(): void {
      releasePendingCatalog?.();
    },
    getBindingRequestCount: () => bindingRequests,
    getPublicRequests: () => publicRequests,
  };
}

async function selectNeverwinter(page: Page): Promise<void> {
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Neverwinter');
  await page.locator('[data-search-result-id="geo-neverwinter"]').click();
}

test('MAP-077: campaign-gated entrance, neutral surface and browser history', async ({ page }) => {
  await configureCampaignBackend(page);
  await page.goto('/?campaign=castigo-divino');
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue('castigo-divino');
  await selectNeverwinter(page);
  await expect(page.locator('[data-local-map-entry]')).toBeHidden();

  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
  await selectNeverwinter(page);
  await expect(page.getByRole('button', { name: 'Entrar en Neverwinter' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar en Neverwinter' }).click();
  await expect(page).toHaveURL(/map=neverwinter/);
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta cartográfica' })).toContainText(
    'Neverwinter',
  );
  await expect(page.locator('[data-local-map-status]')).toBeVisible();
  await expect(page.locator('[data-local-map-status]')).toContainText(
    'Cartografía pendiente de publicación',
  );
  await expect(page.locator('[data-map-canvas]')).toBeHidden();

  await page.goBack();
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await page.goForward();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();

  await page.getByRole('button', { name: 'Mapa general' }).click();
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  expect(new URL(page.url()).searchParams.has('map')).toBe(false);
});

test('MAP-077 R3: initial fallback preserves deep link until remote check completes', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page, { holdCatalogUntilReleased: true });
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  await expect(page).toHaveURL(/map=neverwinter/);
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  expect(backend.getBindingRequestCount()).toBe(0);

  // A successful first remote refresh authorizes the binding. Until then,
  // do not clear the URL or display local cartography.
  backend.releaseCatalog();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(page).toHaveURL(/map=neverwinter/);
  expect(backend.getBindingRequestCount()).toBe(1);

  await page.reload();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(page).toHaveURL(/map=neverwinter/);
});

test('MAP-077: direct link and refresh restore the map without an entry action', async ({
  page,
}) => {
  await configureCampaignBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await page.getByLabel('Campaña', { exact: true }).selectOption('castigo-divino');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  expect(new URL(page.url()).searchParams.has('map')).toBe(false);
});

test('MAP-077: invalid and cross-campaign map slugs fall back to world', async ({ page }) => {
  await configureCampaignBackend(page);
  await page.goto('/?campaign=castigo-divino&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page).not.toHaveURL(/map=neverwinter/);
  await page.goto('/?campaign=un-aliento-menos&map=foo');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page).not.toHaveURL(/map=foo/);
});

test('MAP-077: degraded snapshot never invents a local context', async ({ page }) => {
  await configureCampaignBackend(page, { remoteAvailable: false });
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page).not.toHaveURL(/map=neverwinter/);
});

for (const width of [320, 390, 430, 1280]) {
  test(`MAP-077: responsive local map at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await configureCampaignBackend(page);
    await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
    await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mapa general' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test('MAP-077: keyboard and offline transition', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await configureCampaignBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  const returnButton = page.getByRole('button', { name: 'Mapa general' });

  await returnButton.focus();
  await expect(returnButton).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await page.goBack();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();

  await returnButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await page.goBack();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();

  await page.evaluate(() => {
    const event = new CustomEvent('atlas:public-data-status', {
      detail: { backendState: 'offline' },
    });
    window.dispatchEvent(event);
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  expect(new URL(page.url()).searchParams.has('map')).toBe(false);
});

test('MAP-077 R2: degraded catalog blocks healthy binding endpoint across campaign changes', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  const initialBindingRequests = backend.getBindingRequestCount();

  // Partial outage: the catalog is unavailable, but the binding REST endpoint remains healthy.
  backend.setCatalogAvailable(false);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'degraded' } }),
    );
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await page.getByLabel('Campaña', { exact: true }).selectOption('castigo-divino');
  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
  await selectNeverwinter(page);
  await expect(page.locator('[data-local-map-entry]')).toBeHidden();

  // Simulate Back to an earlier valid local-map deep link while still degraded.
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('map', 'neverwinter');
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page).not.toHaveURL(/map=neverwinter/);
  expect(backend.getBindingRequestCount()).toBe(initialBindingRequests);

  backend.setCatalogAvailable(true);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(page.getByRole('button', { name: 'Entrar en Neverwinter' })).toBeVisible();
  expect(backend.getBindingRequestCount()).toBe(initialBindingRequests + 1);
});

test('MAP-077 R2: a transient binding-only 503 retries on connected refresh, not on every event', async ({
  page,
}) => {
  const backend = await configureCampaignBackend(page, { bindingAvailable: false });
  const failedBinding = page.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/campaign_geographic_map_context_links') &&
      response.status() === 503,
  );
  await page.goto('/?campaign=un-aliento-menos');
  await failedBinding;
  await selectNeverwinter(page);
  await expect(page.locator('[data-local-map-entry]')).toBeHidden();

  backend.setBindingAvailable(true);
  // Two refresh notifications also cover a connected event racing the settled 503.
  for (let i = 0; i < 2; i += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
      );
    });
    await expect
      .poll(() => backend.getBindingRequestCount(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(2);
  }
  await expect(page.getByRole('button', { name: 'Entrar en Neverwinter' })).toBeVisible();
  expect(backend.getBindingRequestCount()).toBe(2);

  // Healthy refreshes do not create new requests after a successful binding read.
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  expect(backend.getBindingRequestCount()).toBe(2);
});

/**
 * MAP-079: browser-only synthetic fixtures. These are not narrative records and
 * never create a canonical Neverwinter placement in the database.
 */
async function configureMap079SyntheticLocalBackend(page: Page): Promise<void> {
  const localEntities: readonly Record<string, unknown>[] = [
    {
      id: 'entity-map079-synthetic',
      slug: 'map079-synthetic',
      entity_type: 'character',
      lifecycle_status: null,
      visibility: 'pin',
      name: 'MAP079 Synthetic Only',
      name_language: 'en',
      summary: 'Only on the synthetic local surface.',
      description: 'Canonical synthetic details.',
      portrait_path: null,
      x: null,
      y: null,
      geometry: null,
      category_id: 'category-campaign-b',
      world_map_enabled: false,
      publication_status: 'published',
      audience: 'public',
    },
    {
      id: 'entity-map079-search-only',
      slug: 'map079-search-only',
      entity_type: 'character',
      lifecycle_status: null,
      visibility: 'search_only',
      name: 'MAP079 Hidden Search Target',
      name_language: 'en',
      summary: 'Local-only content selected from search.',
      description: 'MAP079 Search Only Canonical Details.',
      portrait_path: null,
      x: null,
      y: null,
      geometry: null,
      category_id: 'category-campaign-b',
      world_map_enabled: false,
      publication_status: 'published',
      audience: 'public',
    },
    ...['A', 'B'].map((suffix) => ({
      id: 'entity-map079-overlap-' + suffix.toLowerCase(),
      slug: 'map079-overlap-' + suffix.toLowerCase(),
      entity_type: 'character',
      lifecycle_status: null,
      visibility: 'pin',
      name: 'MAP079 Overlap ' + suffix,
      name_language: 'en',
      summary: 'Overlapping synthetic local point.',
      description: 'MAP079 Overlap Canonical Details.',
      portrait_path: null,
      x: null,
      y: null,
      geometry: null,
      category_id: 'category-campaign-b',
      world_map_enabled: false,
      publication_status: 'published',
      audience: 'public',
    })),
    {
      id: 'place-map079-synthetic-region',
      slug: 'map079-synthetic-region',
      entity_type: 'location',
      lifecycle_status: null,
      visibility: 'pin',
      name: 'MAP079 Synthetic Region',
      name_language: 'en',
      summary: 'Synthetic polygon.',
      description: 'Polygon canonical metadata.',
      portrait_path: null,
      x: null,
      y: null,
      geometry: null,
      category_id: 'category-campaign-b',
      world_map_enabled: false,
      publication_status: 'published',
      audience: 'public',
    },
  ];
  const placements: readonly Record<string, unknown>[] = [
    {
      campaign_id: CAMPAIGN_B_ID,
      map_context_id: 'map-neverwinter',
      entity_id: 'place-campaign-b-ally',
      x: 150,
      y: 140,
      geometry: { kind: 'point', coordinates: { x: 150, y: 140 } },
      publication_status: 'published',
    },
    {
      campaign_id: CAMPAIGN_B_ID,
      map_context_id: 'map-neverwinter',
      entity_id: 'entity-map079-synthetic',
      x: 220,
      y: 210,
      geometry: { kind: 'point', coordinates: { x: 220, y: 210 } },
      publication_status: 'published',
    },
    {
      campaign_id: CAMPAIGN_B_ID,
      map_context_id: 'map-neverwinter',
      entity_id: 'entity-map079-search-only',
      x: 260,
      y: 270,
      geometry: { kind: 'point', coordinates: { x: 260, y: 270 } },
      publication_status: 'published',
    },
    {
      campaign_id: CAMPAIGN_B_ID,
      map_context_id: 'map-map079-secondary',
      entity_id: 'entity-map079-search-only',
      x: 60,
      y: 70,
      geometry: { kind: 'point', coordinates: { x: 60, y: 70 } },
      publication_status: 'published',
    },
    ...['a', 'b'].map((suffix) => ({
      campaign_id: CAMPAIGN_B_ID,
      map_context_id: 'map-neverwinter',
      entity_id: 'entity-map079-overlap-' + suffix,
      x: 330,
      y: 260,
      geometry: { kind: 'point', coordinates: { x: 330, y: 260 } },
      publication_status: 'published',
    })),
    {
      campaign_id: CAMPAIGN_B_ID,
      map_context_id: 'map-neverwinter',
      entity_id: 'place-map079-synthetic-region',
      x: 375,
      y: 375,
      geometry: {
        kind: 'polygon',
        vertices: [
          { x: 330, y: 330 },
          { x: 420, y: 330 },
          { x: 420, y: 420 },
          { x: 330, y: 420 },
        ],
      },
      publication_status: 'published',
    },
  ];
  await page.route('**/rest/v1/campaign_geographic_map_context_links*', async (route) => {
    const url = new URL(route.request().url());
    const projection = url.searchParams.get('select') ?? '';
    if (!projection.includes('map_contexts!inner')) {
      await route.fallback();
      return;
    }
    const navigationProjection = projection.includes('parent_id');
    const rows =
      campaignIdFromUrl(url) === CAMPAIGN_B_ID
        ? [
            {
              campaign_id: CAMPAIGN_B_ID,
              geographic_name_id: 'geo-neverwinter',
              map_context_id: 'map-neverwinter',
              map_contexts: {
                id: 'map-neverwinter',
                slug: 'neverwinter',
                name: 'Neverwinter',
                width: 2048,
                height: 1582,
                publication_status: 'published',
                ...(navigationProjection ? { parent_id: null, image_uri: null } : {}),
              },
            },
            {
              campaign_id: CAMPAIGN_B_ID,
              geographic_name_id: 'geo-map079-secondary',
              map_context_id: 'map-map079-secondary',
              map_contexts: {
                id: 'map-map079-secondary',
                slug: 'map079-secondary',
                name: 'MAP079 Secondary Map',
                width: 500,
                height: 500,
                publication_status: 'published',
                ...(navigationProjection ? { parent_id: null, image_uri: null } : {}),
              },
            },
          ]
        : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });
  await page.route('**/rest/v1/tags*', async (route) => {
    const rows =
      campaignIdFromUrl(new URL(route.request().url())) === CAMPAIGN_B_ID
        ? [{ id: 'tag-map079', name: 'MAP079 Unique Tag', description: 'Synthetic public tag.' }]
        : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });
  await page.route('**/rest/v1/entity_tags*', async (route) => {
    const rows =
      campaignIdFromUrl(new URL(route.request().url())) === CAMPAIGN_B_ID
        ? [{ entity_id: 'entity-map079-search-only', tag_id: 'tag-map079' }]
        : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });
  await page.route('**/rest/v1/map_entities*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('world_map_enabled') !== 'eq.false') {
      await route.fallback();
      return;
    }
    const rows = campaignIdFromUrl(url) === CAMPAIGN_B_ID ? localEntities : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });
  await page.route('**/rest/v1/entity_map_placements*', async (route) => {
    const rows =
      campaignIdFromUrl(new URL(route.request().url())) === CAMPAIGN_B_ID ? placements : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });
}

test('MAP-079: synthetic local-only search, distinct world/local geometry and canonical details', async ({
  page,
}) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  await expect(
    page.locator('[data-map-canvas] [data-entity-id="entity-map079-synthetic"]'),
  ).toHaveCount(0);

  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill('MAP079 Synthetic Only');
  const result = page.locator('[data-search-result-id="entity-map079-synthetic"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText('Mapa local: Neverwinter');
  await expect(result).toHaveCount(1);
  await result.click();

  await expect(page).toHaveURL(/map=neverwinter/);
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  const localOnlyPin = page.locator(
    '[data-local-map-canvas] [data-entity-id="entity-map079-synthetic"]',
  );
  await expect(localOnlyPin).toBeVisible();
  await expect(localOnlyPin).toHaveAttribute('data-marker-lat', '210');
  await expect(localOnlyPin).toHaveAttribute('data-marker-lng', '220');
  const sharedWorldEntity = page.locator(
    '[data-local-map-canvas] [data-entity-id="place-campaign-b-ally"]',
  );
  await expect(sharedWorldEntity).toHaveAttribute('data-marker-lat', '140');
  await expect(sharedWorldEntity).toHaveAttribute('data-marker-lng', '150');
  await expect(
    page.locator('[data-local-map-canvas] [data-region-id="place-map079-synthetic-region"]'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Mapa general' }).click();
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(
    page.locator('[data-map-canvas] [data-entity-id="entity-map079-synthetic"]'),
  ).toHaveCount(0);
  await page.goto('/?campaign=un-aliento-menos&entity=map079-synthetic');
  await expect(page.locator('[data-full-entity-title]')).toHaveText('MAP079 Synthetic Only');
  await expect(page.locator('[data-full-entity-body]')).toContainText(
    'Canonical synthetic details.',
  );
});

test('MAP-079 R1: search_only selection in two local contexts', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill('MAP079 Hidden Search Target');
  const result = page.locator('[data-search-result-id="entity-map079-search-only"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText('Neverwinter');
  await expect(result).toContainText('MAP079 Secondary Map');
  await result.click();
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();

  await page.locator('[data-local-context-slug="neverwinter"]').click();
  await expect(page).toHaveURL(/map=neverwinter/);
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(
    page.locator('[data-local-map-canvas] [data-entity-id="entity-map079-search-only"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-place-details]')).toContainText('MAP079 Hidden Search Target');

  // Selecting the same result while already in context must still open details.
  await result.click();
  await expect(page.locator('[data-place-details]')).toContainText('MAP079 Hidden Search Target');

  await page.locator('[data-local-context-slug="map079-secondary"]').click();
  await expect(page).toHaveURL(/map=map079-secondary/);
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(page.locator('[data-place-details]')).toContainText('MAP079 Hidden Search Target');
  await expect(
    page.locator('[data-local-map-canvas] [data-entity-id="entity-map079-search-only"]'),
  ).toHaveCount(0);
});

test('MAP-079 R1: keyboard access for simple and grouped local pins', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  const local = page.locator('[data-local-map-canvas]');
  await expect(local).toBeVisible();

  const simple = local.locator('[data-entity-id="entity-map079-synthetic"]');
  await expect(simple).toBeVisible();
  await simple.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-place-details]')).toContainText('MAP079 Synthetic Only');
  await simple.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-place-details]')).toContainText('MAP079 Synthetic Only');

  const grouped = local.getByRole('button', { name: /2 entidades agrupadas/ });
  await expect(grouped).toBeVisible();
  await grouped.focus();
  await page.keyboard.press('Enter');
  const choices = page.locator('.local-map-pin-choices button');
  await expect(choices).toHaveCount(2);
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(choices).toHaveCount(0);
  await expect(grouped).toBeFocused();

  await grouped.focus();
  await page.keyboard.press('Space');
  await expect(choices).toHaveCount(2);
  await choices.getByText('MAP079 Overlap B').click();
  await expect(page.locator('[data-place-details]')).toContainText('MAP079 Overlap B');
});

test('MAP-079 R2: return and close restore local pin focus', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  const local = page.locator('[data-local-map-canvas]');
  const pin = local.locator('[data-entity-id="entity-map079-synthetic"]');
  await expect(pin).toBeVisible();
  await pin.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-place-details]')).toBeVisible();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-place-details-return]').click();
  await expect(pin).toBeFocused();
  await page.locator('[data-place-details-close]').click();
  await expect(page.locator('[data-place-details]')).toBeHidden();
  await expect(pin).toBeFocused();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');

  const grouped = local.getByRole('button', { name: /2 entidades agrupadas/ });
  await grouped.focus();
  await page.keyboard.press('Space');
  await page.locator('.local-map-pin-choices button').last().click();
  await expect(grouped).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-place-details-return]').click();
  await expect(grouped).toBeFocused();
  await page.locator('[data-place-details-close]').click();
  await expect(grouped).toBeFocused();
});

test('MAP-079 R2: search_only returns focus to local map', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  if (!(await search.isVisible())) await page.locator('[data-place-search-toggle]').click();
  await search.fill('MAP079 Hidden Search Target');
  await page.locator('[data-search-result-id="entity-map079-search-only"]').click();
  await expect(page.locator('[data-place-details]')).toBeVisible();
  const local = page.locator('[data-local-map-canvas]');
  await expect(page.locator('[data-place-details-return]')).toHaveText('Volver al mapa local');
  await page.locator('[data-place-details-return]').click();
  await expect(local).toBeFocused();
  await page.locator('[data-place-details-close]').click();
  await expect(page.locator('[data-place-details]')).toBeHidden();
  await expect(local).toBeFocused();
  await expect(local.locator('[data-entity-id="entity-map079-search-only"]')).toHaveCount(0);
});

test('MAP-079 R2: layer removal invalidates local popup choices', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  // This is a closed <details> by default: expose the real checkbox before
  // opening the coincident selector so the popup stays open during revocation.
  await page.locator('[data-map-layers-summary]').click();
  await expect(page.locator('[data-map-layer="character"]')).toBeVisible();
  const grouped = page.locator('[data-local-map-canvas]').getByRole('button', {
    name: /2 entidades agrupadas/,
  });
  await expect(grouped).toBeVisible();
  await grouped.focus();
  await page.keyboard.press('Enter');
  const choices = page.locator('.local-map-pin-choices button');
  await expect(choices).toHaveCount(2);
  const stale = await choices.first().elementHandle();
  await page.locator('[data-map-layer="character"]').uncheck();
  await expect(choices).toHaveCount(0);
  await expect(grouped).toHaveCount(0);
  // Even a retained JS reference to a detached choice cannot activate a
  // removed entity or open its stale card.
  await stale?.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('[data-place-details]')).toBeHidden();
  await page.locator('[data-map-layer="character"]').check();
  await expect(grouped).toBeVisible();
});

test('MAP-079 R2: degraded revokes open overlapping choices and controls', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  const grouped = page.locator('[data-local-map-canvas]').getByRole('button', {
    name: /2 entidades agrupadas/,
  });
  await grouped.focus();
  await page.keyboard.press('Space');
  const choices = page.locator('.local-map-pin-choices button');
  await expect(choices).toHaveCount(2);
  const stale = await choices.last().elementHandle();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'degraded' } }),
    );
  });
  await expect(choices).toHaveCount(0);
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await stale?.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('[data-place-details]')).toBeHidden();
});

test('MAP-079 R1: public local tag search is deduplicated', async ({ page }) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill('MAP079 Unique Tag');
  const result = page.locator('[data-search-result-id="entity-map079-search-only"]');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Coincidencia por etiqueta pública');
  await expect(result).toContainText('Mapa local:');
});

test('MAP-079: campaign switch and degraded status purge synthetic local-only results', async ({
  page,
}) => {
  await configureCampaignBackend(page);
  await configureMap079SyntheticLocalBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?campaign=un-aliento-menos');
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  if (!(await search.isVisible())) await page.locator('[data-place-search-toggle]').click();
  await expect(search).toBeVisible();
  await search.fill('MAP079 Synthetic Only');
  await expect(page.locator('[data-search-result-id="entity-map079-synthetic"]')).toBeVisible();
  await page.locator('[data-search-result-id="entity-map079-synthetic"]').click();
  await expect(
    page.locator('[data-local-map-canvas] [data-entity-id="entity-map079-synthetic"]'),
  ).toBeVisible();

  await page.getByLabel('Campaña', { exact: true }).selectOption('castigo-divino');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page).not.toHaveURL(/map=neverwinter/);
  await expect(page.locator('[data-search-result-id="entity-map079-synthetic"]')).toHaveCount(0);

  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
  await expect(page.locator('[data-search-result-id="entity-map079-synthetic"]')).toBeVisible();
  await page.locator('[data-search-result-id="entity-map079-synthetic"]').click();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'degraded' } }),
    );
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  await expect(page.locator('[data-search-result-id="entity-map079-synthetic"]')).toHaveCount(0);
});
