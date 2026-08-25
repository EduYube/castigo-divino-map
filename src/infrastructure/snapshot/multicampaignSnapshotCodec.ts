import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import type {
  PublicCampaignCatalogV3,
  PublicCampaignGeographicEntityLinkV3,
  PublicCampaignV3,
  PublicGlobalGeographicNameV3,
} from '../../data/beta03-model';
import {
  PublicDataRepositoryError,
  createSha256Checksum,
  type PublicCatalogEnvelope,
} from '../../data-access/publicCatalog';
import { parsePublicCatalogSnapshotV2 } from '../supabase/publicCatalogCodec';

const INITIAL_CAMPAIGN_SLUG = 'castigo-divino';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;

function invalid(message: string, cause?: unknown): never {
  throw new PublicDataRepositoryError('invalid-snapshot', message, {
    source: 'snapshot',
    cause,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    invalid(`${path} debe ser un objeto.`);
  }

  return value;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    invalid(`${path} debe ser una colección.`);
  }

  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`${path} debe ser texto no vacío.`);
  }

  return value;
}

function integer(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(`${path} debe ser un entero no negativo.`);
  }

  return value as number;
}

function assertAllowed(
  value: Record<string, unknown>,
  allowedProperties: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedProperties);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));

  if (unexpected) {
    invalid(`${path}.${unexpected} no forma parte del snapshot v3.`);
  }
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      invalid(`${path} contiene la identidad duplicada “${value}”.`);
    }

    seen.add(value);
  }
}

function parseCampaign(value: unknown, index: number): PublicCampaignV3 {
  const path = `snapshot.campaigns[${index}]`;
  const item = record(value, path);
  assertAllowed(item, ['id', 'slug', 'name', 'status', 'displayOrder'], path);
  const id = string(item.id, `${path}.id`);

  if (!UUID_PATTERN.test(id)) {
    invalid(`${path}.id debe ser un UUID estable.`);
  }

  const slug = string(item.slug, `${path}.slug`);
  const name = string(item.name, `${path}.name`);

  if (item.status !== 'active') {
    invalid(`${path}.status debe ser “active” en la proyección pública.`);
  }

  return {
    id,
    slug,
    name,
    status: 'active',
    displayOrder: integer(item.displayOrder, `${path}.displayOrder`),
  };
}

function parseLink(
  value: unknown,
  index: number,
  campaignId: string,
): PublicCampaignGeographicEntityLinkV3 {
  const path = `snapshot.campaignCatalogs[${campaignId}].geographicEntityLinks[${index}]`;
  const item = record(value, path);
  assertAllowed(item, ['campaignId', 'geographicNameId', 'entityId'], path);
  const linkCampaignId = string(item.campaignId, `${path}.campaignId`);

  if (linkCampaignId !== campaignId) {
    invalid(`${path}.campaignId no coincide con el catálogo contenedor.`);
  }

  return {
    campaignId: linkCampaignId,
    geographicNameId: string(item.geographicNameId, `${path}.geographicNameId`),
    entityId: string(item.entityId, `${path}.entityId`),
  };
}

function parseCampaignCatalog(value: unknown, index: number): PublicCampaignCatalogV3 {
  const path = `snapshot.campaignCatalogs[${index}]`;
  const item = record(value, path);
  assertAllowed(
    item,
    [
      'campaignId',
      'categories',
      'tags',
      'players',
      'entities',
      'dispositions',
      'characterLocationRelations',
      'notes',
      'characterLocationEvents',
      'geographicEntityLinks',
    ],
    path,
  );
  const campaignId = string(item.campaignId, `${path}.campaignId`);

  return {
    campaignId,
    categories: array(item.categories, `${path}.categories`) as PublicCampaignCatalogV3['categories'],
    tags: array(item.tags, `${path}.tags`) as PublicCampaignCatalogV3['tags'],
    players: array(item.players, `${path}.players`) as PublicCampaignCatalogV3['players'],
    entities: array(item.entities, `${path}.entities`) as PublicCampaignCatalogV3['entities'],
    dispositions: array(
      item.dispositions,
      `${path}.dispositions`,
    ) as PublicCampaignCatalogV3['dispositions'],
    characterLocationRelations: array(
      item.characterLocationRelations,
      `${path}.characterLocationRelations`,
    ) as PublicCampaignCatalogV3['characterLocationRelations'],
    notes: array(item.notes, `${path}.notes`) as PublicCampaignCatalogV3['notes'],
    characterLocationEvents: array(
      item.characterLocationEvents,
      `${path}.characterLocationEvents`,
    ) as PublicCampaignCatalogV3['characterLocationEvents'],
    geographicEntityLinks: array(
      item.geographicEntityLinks,
      `${path}.geographicEntityLinks`,
    ).map((link, linkIndex) => parseLink(link, linkIndex, campaignId)),
  };
}

function geographicWithCampaignLink(
  geographicNames: readonly PublicGlobalGeographicNameV3[],
  links: readonly PublicCampaignGeographicEntityLinkV3[],
): PublicCatalogSnapshotV2['geographicNames'] {
  const entityByGeographicName = new Map(
    links.map((link) => [link.geographicNameId, link.entityId] as const),
  );

  return geographicNames.map((name) => ({
    ...name,
    entityId: (entityByGeographicName.get(name.id) ??
      null) as PublicCatalogSnapshotV2['geographicNames'][number]['entityId'],
  }));
}

async function validatedV2Projection(
  catalog: PublicCampaignCatalogV3,
  geographicNames: readonly PublicGlobalGeographicNameV3[],
  generatedAt: string,
  sourceRevision: string,
  now: () => number,
): Promise<PublicCatalogSnapshotV2> {
  const content = {
    schemaVersion: 2 as const,
    categories: catalog.categories,
    tags: catalog.tags,
    players: catalog.players,
    entities: catalog.entities,
    dispositions: catalog.dispositions,
    characterLocationRelations: catalog.characterLocationRelations,
    notes: catalog.notes,
    geographicNames: geographicWithCampaignLink(geographicNames, catalog.geographicEntityLinks),
    characterLocationEvents: catalog.characterLocationEvents,
  };
  const projectedChecksum = await createSha256Checksum(content);
  const parsed = await parsePublicCatalogSnapshotV2(
    {
      ...content,
      generatedAt,
      sourceRevision,
      checksum: projectedChecksum,
    },
    now,
  );

  if (parsed.data.contract !== 'beta02') {
    invalid('La proyección de compatibilidad v3 no produjo un catálogo Beta 0.2.');
  }

  return parsed.data.catalog;
}

function validateLinks(
  catalog: PublicCampaignCatalogV3,
  geographicNames: readonly PublicGlobalGeographicNameV3[],
): void {
  const geographicIds = new Set(geographicNames.map(({ id }) => id));
  const entitiesById = new Map(catalog.entities.map((entity) => [entity.id, entity] as const));
  unique(
    catalog.geographicEntityLinks.map(({ geographicNameId }) => geographicNameId),
    `campaignCatalogs.${catalog.campaignId}.geographicEntityLinks.geographicNameId`,
  );

  for (const link of catalog.geographicEntityLinks) {
    if (!geographicIds.has(link.geographicNameId as never)) {
      invalid(`El vínculo geográfico “${link.geographicNameId}” apunta a un nombre global ausente.`);
    }

    const entity = entitiesById.get(link.entityId as never);

    if (!entity || entity.entityType !== 'location') {
      invalid(
        `El vínculo geográfico “${link.geographicNameId}” no apunta a una ubicación pública de su campaña.`,
      );
    }
  }
}

export async function parsePublicCatalogSnapshotV3(
  value: unknown,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  const snapshotRecord = record(value, 'snapshot');
  assertAllowed(
    snapshotRecord,
    [
      'schemaVersion',
      'generatedAt',
      'sourceRevision',
      'checksum',
      'campaigns',
      'campaignCatalogs',
      'geographicNames',
    ],
    'snapshot',
  );

  if (snapshotRecord.schemaVersion !== 3) {
    throw new PublicDataRepositoryError(
      'unsupported-schema',
      'El snapshot público no usa el contrato multicampaña v3.',
      { source: 'snapshot', recoverable: false },
    );
  }

  const generatedAt = string(snapshotRecord.generatedAt, 'snapshot.generatedAt');

  if (!Number.isFinite(Date.parse(generatedAt))) {
    invalid('snapshot.generatedAt no contiene una fecha válida.');
  }

  const sourceRevision = string(snapshotRecord.sourceRevision, 'snapshot.sourceRevision');
  const checksum = string(snapshotRecord.checksum, 'snapshot.checksum');

  if (!CHECKSUM_PATTERN.test(sourceRevision) || !CHECKSUM_PATTERN.test(checksum)) {
    invalid('snapshot.sourceRevision/checksum deben contener SHA-256 válidos.');
  }

  const campaigns = array(snapshotRecord.campaigns, 'snapshot.campaigns').map(parseCampaign);
  const campaignCatalogs = array(snapshotRecord.campaignCatalogs, 'snapshot.campaignCatalogs').map(
    parseCampaignCatalog,
  );
  const geographicNames = array(snapshotRecord.geographicNames, 'snapshot.geographicNames').map(
    (name) => record(name, 'snapshot.geographicNames[]') as unknown as PublicGlobalGeographicNameV3,
  );

  if (campaigns.length === 0) {
    invalid('El snapshot v3 debe contener al menos una campaña pública.');
  }

  unique(
    campaigns.map(({ id }) => id),
    'campaigns.id',
  );
  unique(
    campaigns.map(({ slug }) => slug),
    'campaigns.slug',
  );
  unique(
    campaignCatalogs.map(({ campaignId }) => campaignId),
    'campaignCatalogs.campaignId',
  );
  unique(
    geographicNames.map(({ id }) => id),
    'geographicNames.id',
  );

  const campaignIds = new Set(campaigns.map(({ id }) => id));

  if (
    campaignCatalogs.length !== campaigns.length ||
    campaignCatalogs.some(({ campaignId }) => !campaignIds.has(campaignId))
  ) {
    invalid('Cada campaña pública debe tener exactamente un catálogo v3 asociado.');
  }

  const content = {
    schemaVersion: 3 as const,
    campaigns,
    campaignCatalogs,
    geographicNames,
  };
  const calculatedChecksum = await createSha256Checksum(content);

  if (calculatedChecksum !== checksum || sourceRevision !== calculatedChecksum) {
    throw new PublicDataRepositoryError(
      'checksum-mismatch',
      'El snapshot multicampaña no coincide con su checksum/sourceRevision.',
      { source: 'snapshot' },
    );
  }

  const catalogsByCampaign = new Map(
    campaignCatalogs.map((catalog) => [catalog.campaignId, catalog] as const),
  );

  // Validate every campaign, not only the v1.0 compatibility projection.
  for (const campaign of campaigns) {
    const catalog = catalogsByCampaign.get(campaign.id);

    if (!catalog) {
      invalid(`La campaña “${campaign.id}” no tiene catálogo.`);
    }

    validateLinks(catalog, geographicNames);
    await validatedV2Projection(catalog, geographicNames, generatedAt, sourceRevision, now);
  }

  const selectedCampaign = [...campaigns].sort(
    (left, right) =>
      Number(left.slug !== INITIAL_CAMPAIGN_SLUG) - Number(right.slug !== INITIAL_CAMPAIGN_SLUG) ||
      left.displayOrder - right.displayOrder ||
      left.id.localeCompare(right.id),
  )[0];

  if (!selectedCampaign) {
    invalid('No se pudo resolver la campaña pública inicial.');
  }

  const selectedCatalog = catalogsByCampaign.get(selectedCampaign.id);

  if (!selectedCatalog) {
    invalid('No se pudo resolver el catálogo de la campaña pública inicial.');
  }

  const projectedCatalog = await validatedV2Projection(
    selectedCatalog,
    geographicNames,
    generatedAt,
    sourceRevision,
    now,
  );

  return {
    data: { contract: 'beta02', catalog: projectedCatalog },
    source: 'session-cache',
    metadata: {
      contract: 'beta02',
      schemaVersion: 3,
      generatedAt,
      loadedAt: new Date(now()).toISOString(),
      sourceRevision,
      checksum,
      stale: false,
    },
  };
}
