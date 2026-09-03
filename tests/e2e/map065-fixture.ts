import type { Page, Route } from '@playwright/test';

export const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

export const MAP065_IDS = {
  character: 'entity-map065-character',
  location: 'entity-map065-location',
  region: 'entity-map065-region',
  mission: 'entity-map065-mission',
  hazard: 'entity-map065-hazard',
  clusterCharacter: 'entity-map065-cluster-character',
  clusterMission: 'entity-map065-cluster-mission',
} as const;

export const MAP065_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  campaigns: [
    { id: CAMPAIGN_ID, slug: 'castigo-divino', name: 'Castigo Divino', status: 'active', display_order: 0 },
  ],
  categories: [
    { id: 'category-map065-character', slug: 'map065-character', name: 'Personajes MAP065', description: '' },
    { id: 'category-map065-location', slug: 'map065-location', name: 'Emplazamientos MAP065', description: '' },
    { id: 'category-map065-region', slug: 'map065-region', name: 'Regiones MAP065', description: '' },
    { id: 'category-map065-mission', slug: 'map065-mission', name: 'Misiones MAP065', description: '' },
    { id: 'category-map065-hazard', slug: 'map065-hazard', name: 'Peligros MAP065', description: '' },
  ],
  tags: [{ id: 'map065-mission-only', name: 'Misión exclusiva MAP065', description: '' }],
  players: [],
  map_entities: [
    {
      id: MAP065_IDS.character, slug: 'map065-character', entity_type: 'character', lifecycle_status: null,
      visibility: 'pin', name: 'Personaje MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 500, y: 400 } }, x: 500, y: 400,
      category_id: 'category-map065-character',
    },
    {
      id: MAP065_IDS.location, slug: 'map065-location', entity_type: 'location', lifecycle_status: null,
      visibility: 'pin', name: 'Emplazamiento MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 900, y: 700 } }, x: 900, y: 700,
      category_id: 'category-map065-location',
    },
    {
      id: MAP065_IDS.region, slug: 'map065-region', entity_type: 'location', lifecycle_status: null,
      visibility: 'pin', name: 'Región MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'polygon', vertices: [{ x: 1250, y: 650 }, { x: 1650, y: 650 }, { x: 1650, y: 1050 }, { x: 1250, y: 1050 }] },
      x: 1450, y: 850, category_id: 'category-map065-region',
    },
    {
      id: MAP065_IDS.mission, slug: 'map065-mission', entity_type: 'mission', lifecycle_status: 'completed',
      visibility: 'pin', name: 'Misión completada MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 2050, y: 800 } }, x: 2050, y: 800,
      category_id: 'category-map065-mission',
    },
    {
      id: MAP065_IDS.hazard, slug: 'map065-hazard', entity_type: 'hazard', lifecycle_status: 'resolved',
      visibility: 'pin', name: 'Peligro resuelto MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 2500, y: 1100 } }, x: 2500, y: 1100,
      category_id: 'category-map065-hazard',
    },
    {
      id: MAP065_IDS.clusterCharacter, slug: 'map065-cluster-character', entity_type: 'character', lifecycle_status: null,
      visibility: 'pin', name: 'Personaje agrupado MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 3000, y: 1500 } }, x: 3000, y: 1500,
      category_id: 'category-map065-character',
    },
    {
      id: MAP065_IDS.clusterMission, slug: 'map065-cluster-mission', entity_type: 'mission', lifecycle_status: 'active',
      visibility: 'pin', name: 'Misión agrupada MAP065', name_language: 'en', summary: '', description: '', portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 3000, y: 1500 } }, x: 3000, y: 1500,
      category_id: 'category-map065-mission',
    },
  ],
  entity_aliases: [],
  entity_tags: [{ entity_id: MAP065_IDS.mission, tag_id: 'map065-mission-only' }],
  entity_player_dispositions: [],
  entity_player_associations: [],
  character_location_relations: [],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
  campaign_geographic_entity_links: [],
};

export type Map065BackendMode = 'success' | 'offline';

export async function configureMap065Backend(page: Page, initialMode: Map065BackendMode = 'success') {
  let mode = initialMode;
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map065_layers',
      timeoutMs: 200,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route('**/rest/v1/**', async (route: Route) => {
    if (mode === 'offline') {
      await route.abort('connectionrefused');
      return;
    }
    const table = /\/rest\/v1\/([^?]+)/.exec(route.request().url())?.[1] ?? '';
    const rows = MAP065_ROWS[table] ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });
  return { setMode(nextMode: Map065BackendMode) { mode = nextMode; } };
}

export async function openMap065(page: Page, url = '/') {
  await page.goto(url);
  await page.getByTestId('map-shell').waitFor();
}

export function map065Layer(page: Page, name: string) {
  return page.locator('[data-map-layers]').getByRole('checkbox', { name });
}

export function map065Pin(page: Page, id: string) {
  return page.locator(`[data-testid="entity-pin"][data-pin-id="${id}"]`);
}

export async function openMap065Layers(page: Page) {
  const details = page.locator('[data-map-layers]');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator('summary').click();
  }
}
