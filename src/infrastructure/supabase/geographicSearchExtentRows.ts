import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import type {
  PublicGeographicName,
  PublicGeographicNameAlias,
  PublicSearchExtent,
} from '../../data/beta02-model';
import { parseGeographicName } from './publicCatalogRows';

const MAX_X = 3600;
const MAX_Y = 2329;
const EXTENT_COLUMNS = ['search_min_x', 'search_max_x', 'search_min_y', 'search_max_y'] as const;

function invalidResponse(message: string): never {
  throw new PublicDataRepositoryError('invalid-response', message, { source: 'supabase' });
}

function finiteBound(value: unknown, path: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    invalidResponse(`${path} debe ser un número finito entre 0 y ${maximum}.`);
  }

  return value;
}

function parseSearchExtent(
  row: Record<string, unknown>,
  path: string,
  coordinates: PublicGeographicName['coordinates'],
): PublicSearchExtent | null {
  const raw = EXTENT_COLUMNS.map((column) => row[column]);
  const nullCount = raw.filter((value) => value === null).length;

  if (nullCount === EXTENT_COLUMNS.length) return null;
  if (nullCount !== 0) {
    invalidResponse(`${path} debe proporcionar los cuatro bounds de búsqueda o ninguno.`);
  }

  const extent: PublicSearchExtent = {
    minX: finiteBound(row.search_min_x, `${path}.search_min_x`, MAX_X),
    maxX: finiteBound(row.search_max_x, `${path}.search_max_x`, MAX_X),
    minY: finiteBound(row.search_min_y, `${path}.search_min_y`, MAX_Y),
    maxY: finiteBound(row.search_max_y, `${path}.search_max_y`, MAX_Y),
  };

  if (extent.minX >= extent.maxX) {
    invalidResponse(`${path} requiere search_min_x < search_max_x.`);
  }
  if (extent.minY >= extent.maxY) {
    invalidResponse(`${path} requiere search_min_y < search_max_y.`);
  }
  if (
    coordinates.x < extent.minX ||
    coordinates.x > extent.maxX ||
    coordinates.y < extent.minY ||
    coordinates.y > extent.maxY
  ) {
    invalidResponse(`${path} debe contener la coordenada canónica del nombre geográfico.`);
  }

  return extent;
}

export function parseGeographicNameWithExtent(
  row: Record<string, unknown>,
  index: number,
  aliasesByName: ReadonlyMap<PublicGeographicName['id'], readonly PublicGeographicNameAlias[]>,
): PublicGeographicName {
  const path = `geographic_names[${index}]`;
  const baseRow = { ...row };
  for (const column of EXTENT_COLUMNS) delete baseRow[column];

  const base = parseGeographicName(baseRow, index, aliasesByName);
  return {
    ...base,
    searchExtent: parseSearchExtent(row, path, base.coordinates),
  };
}
