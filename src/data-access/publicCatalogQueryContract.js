export const INITIAL_PUBLIC_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
export const PUBLIC_CATALOG_PAGE_SIZE = 1000;

export const PUBLIC_CATALOG_TABLE_QUERIES = {
  categories: {
    name: 'categories',
    select: 'id,slug,name,description',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
  },
  tags: {
    name: 'tags',
    select: 'id,name,description',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
  },
  players: {
    name: 'players',
    select: 'id,slug,display_name,name_language,accent_color',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
  },
  entities: {
    name: 'map_entities',
    select:
      'id,slug,entity_type,lifecycle_status,visibility,name,name_language,summary,description,portrait_path,x,y,geometry,category_id',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
  },
  entityAliases: {
    name: 'entity_aliases',
    select: 'id,entity_id,language,value',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
  },
  entityTags: {
    name: 'entity_tags',
    select: 'entity_id,tag_id',
    order: 'entity_id.asc,tag_id.asc',
    published: true,
    campaignScoped: true,
  },
  dispositions: {
    name: 'entity_player_dispositions',
    select: 'entity_id,player_id,disposition',
    order: 'entity_id.asc,player_id.asc',
    published: false,
    campaignScoped: true,
  },
  associations: {
    name: 'entity_player_associations',
    select: 'entity_id,player_id',
    order: 'entity_id.asc,player_id.asc',
    published: false,
    campaignScoped: true,
  },
  characterLocationRelations: {
    name: 'character_location_relations',
    select: 'character_id,location_id,relation_status',
    order: 'location_id.asc,character_id.asc',
    published: false,
    campaignScoped: true,
  },
  notes: {
    name: 'public_notes',
    select: 'id,slug,entity_id,title,body,sort_order',
    order: 'entity_id.asc,sort_order.asc,id.asc',
    published: true,
    campaignScoped: true,
  },
  noteTags: {
    name: 'public_note_tags',
    select: 'note_id,tag_id',
    order: 'note_id.asc,tag_id.asc',
    published: true,
    campaignScoped: true,
  },
  geographicNames: {
    name: 'geographic_names',
    select:
      'id,slug,name,language,x,y,recommended_zoom,entity_id,search_min_x,search_max_x,search_min_y,search_max_y',
    order: 'id.asc',
    published: true,
    campaignScoped: false,
  },
  geographicAliases: {
    name: 'geographic_name_aliases',
    select: 'id,geographic_name_id,language,value',
    order: 'id.asc',
    published: true,
    campaignScoped: false,
  },
  locationEvents: {
    name: 'character_location_events',
    select:
      'id,character_id,event_type,location_entity_id,geographic_name_id,x,y,location_label,summary,language,observed_at,related_sighting_id',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
  },
  geographicEntityLinks: {
    name: 'campaign_geographic_entity_links',
    select: 'campaign_id,geographic_name_id,entity_id',
    order: 'geographic_name_id.asc',
    published: false,
    campaignScoped: true,
  },
};

export const PUBLIC_CAMPAIGNS_QUERY = {
  name: 'campaigns',
  select: 'id,slug,name,status,display_order',
  order: 'display_order.asc,id.asc',
  published: false,
  campaignScoped: false,
};

export class PublicCatalogReadError extends Error {
  constructor(kind, message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PublicCatalogReadError';
    this.kind = kind;
    this.status = options.status ?? null;
  }
}

function partialResponse(message) {
  throw new PublicCatalogReadError('partial-response', message);
}

export function parsePublicCatalogContentRange(value, table) {
  if (!value) {
    partialResponse(`Supabase no confirmó el tamaño total de ${table}.`);
  }

  const emptyMatch = /^\*\/(\d+)$/.exec(value);

  if (emptyMatch) {
    const total = Number(emptyMatch[1]);

    if (total !== 0) {
      partialResponse(`Supabase devolvió un rango vacío incoherente para ${table}.`);
    }

    return { start: null, end: null, total };
  }

  const rangeMatch = /^(\d+)-(\d+)\/(\d+)$/.exec(value);

  if (!rangeMatch) {
    partialResponse(`Supabase devolvió un Content-Range no verificable para ${table}.`);
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  const total = Number(rangeMatch[3]);

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total)) {
    partialResponse(`Supabase devolvió un Content-Range inválido para ${table}.`);
  }

  if (start < 0 || end < start || total <= end) {
    partialResponse(`Supabase devolvió un Content-Range incoherente para ${table}.`);
  }

  return { start, end, total };
}

function expectRecordRows(value, table) {
  if (!Array.isArray(value)) {
    throw new PublicCatalogReadError(
      'invalid-response',
      `La respuesta de ${table} debe ser una colección.`,
    );
  }

  return value.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new PublicCatalogReadError(
        'invalid-response',
        `${table}[${index}] debe ser un objeto.`,
      );
    }

    return row;
  });
}

export function projectCampaignGeographicEntityLinks(
  geographicNames,
  links,
  campaignId = INITIAL_PUBLIC_CAMPAIGN_ID,
) {
  const geographicRows = expectRecordRows(geographicNames, 'geographic_names');
  const linkRows = expectRecordRows(links, 'campaign_geographic_entity_links');
  const entityByGeographicName = new Map();

  for (const [index, link] of linkRows.entries()) {
    if (
      link.campaign_id !== campaignId ||
      typeof link.geographic_name_id !== 'string' ||
      typeof link.entity_id !== 'string'
    ) {
      throw new PublicCatalogReadError(
        'invalid-response',
        `campaign_geographic_entity_links[${index}] no respeta la proyección de campaña.`,
      );
    }

    if (entityByGeographicName.has(link.geographic_name_id)) {
      throw new PublicCatalogReadError(
        'invalid-response',
        `campaign_geographic_entity_links contiene un vínculo geográfico duplicado ` +
          `para ${campaignId}.`,
      );
    }

    entityByGeographicName.set(link.geographic_name_id, link.entity_id);
  }

  return geographicRows.map((row) => ({
    ...row,
    entity_id: entityByGeographicName.get(row.id) ?? null,
  }));
}

export async function fetchCompletePublicCatalogTable(options) {
  const rows = [];
  let expectedTotal = null;
  let offset = 0;
  const pageSize = options.pageSize ?? PUBLIC_CATALOG_PAGE_SIZE;
  const campaignId = options.campaignId ?? INITIAL_PUBLIC_CAMPAIGN_ID;

  do {
    const url = new URL(`${options.projectUrl.replace(/\/$/, '')}/rest/v1/${options.query.name}`);
    url.searchParams.set('select', options.query.select);
    url.searchParams.set('order', options.query.order);

    if (options.query.published) {
      url.searchParams.set('publication_status', 'eq.published');
    }
    if (options.query.campaignScoped) {
      url.searchParams.set('campaign_id', `eq.${campaignId}`);
    }

    let response;

    try {
      response = await options.fetchImplementation(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: options.publishableKey,
          Prefer: 'count=exact',
          Range: `${offset}-${offset + pageSize - 1}`,
          'Range-Unit': 'items',
        },
        cache: 'no-store',
        signal: options.signal,
      });
    } catch (error) {
      throw new PublicCatalogReadError(
        options.signal.aborted ? 'request-aborted' : 'network-unavailable',
        options.signal.aborted
          ? 'La consulta pública de Supabase se canceló.'
          : 'No se pudo contactar con Supabase.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new PublicCatalogReadError(
        response.status === 429 ? 'rate-limited' : 'http-error',
        `Supabase rechazó la consulta pública de ${options.query.name} (${response.status}).`,
        { status: response.status },
      );
    }

    let pageRows;

    try {
      pageRows = expectRecordRows(await response.json(), options.query.name);
    } catch (error) {
      if (error instanceof PublicCatalogReadError) {
        throw error;
      }

      throw new PublicCatalogReadError(
        'invalid-response',
        `Supabase devolvió JSON inválido para ${options.query.name}.`,
        { cause: error },
      );
    }

    const contentRange = parsePublicCatalogContentRange(
      response.headers.get('content-range'),
      options.query.name,
    );

    if (expectedTotal === null) {
      expectedTotal = contentRange.total;
    } else if (contentRange.total !== expectedTotal) {
      partialResponse(`El total de ${options.query.name} cambió durante la lectura paginada.`);
    }

    if (expectedTotal === 0) {
      if (pageRows.length !== 0 || contentRange.start !== null || contentRange.end !== null) {
        partialResponse(`Supabase devolvió filas inesperadas para ${options.query.name}.`);
      }

      return [];
    }

    if (
      pageRows.length === 0 ||
      contentRange.start !== offset ||
      contentRange.end !== offset + pageRows.length - 1
    ) {
      partialResponse(
        `Supabase devolvió una página incompleta o desalineada para ${options.query.name}.`,
      );
    }

    rows.push(...pageRows);
    offset += pageRows.length;

    if (offset > expectedTotal) {
      partialResponse(`Supabase devolvió más filas de las declaradas para ${options.query.name}.`);
    }
  } while (expectedTotal === null || offset < expectedTotal);

  if (rows.length !== expectedTotal) {
    partialResponse(`No se recibió la colección completa de ${options.query.name}.`);
  }

  return rows;
}
