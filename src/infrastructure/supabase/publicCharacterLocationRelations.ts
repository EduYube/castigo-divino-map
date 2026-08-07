import type { PublicCharacterLocationRelation, PublicMapEntity } from '../../data/beta02-model';
import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import type { PublicCatalogTablePayloads } from './publicCatalogRows';

const ENTITY_ID_PATTERN = /^(?:entity|place)-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

export type PublicCatalogTablePayloadsWithCharacterLocations = PublicCatalogTablePayloads & {
  readonly characterLocationRelations: readonly Record<string, unknown>[];
};

function invalidResponse(message: string): never {
  throw new PublicDataRepositoryError('invalid-response', message, { source: 'supabase' });
}

function expectEntityId(value: unknown, path: string): PublicMapEntity['id'] {
  if (typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value)) {
    invalidResponse(`${path} no contiene un identificador de entidad público válido.`);
  }
  return value as PublicMapEntity['id'];
}

export function parseCharacterLocationRelation(
  row: Record<string, unknown>,
  index: number,
): PublicCharacterLocationRelation {
  const path = `character_location_relations[${index}]`;
  const allowed = new Set(['character_id', 'location_id', 'relation_status']);
  const unexpected = Object.keys(row).find((property) => !allowed.has(property));
  if (unexpected) {
    invalidResponse(`${path}.${unexpected} no forma parte de la proyección pública.`);
  }
  const relationStatus = row.relation_status;
  if (
    relationStatus !== 'present' &&
    relationStatus !== 'associated' &&
    relationStatus !== 'last-seen'
  ) {
    invalidResponse(`${path}.relation_status no contiene un estado público permitido.`);
  }
  return {
    characterId: expectEntityId(row.character_id, `${path}.character_id`),
    locationId: expectEntityId(row.location_id, `${path}.location_id`),
    relationStatus,
  };
}

export function relationSnapshotRows(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    invalidResponse('snapshot.characterLocationRelations debe ser una colección.');
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      invalidResponse(`snapshot.characterLocationRelations[${index}] debe ser un objeto.`);
    }
    const record = entry as Record<string, unknown>;
    const allowed = new Set(['characterId', 'locationId', 'relationStatus']);
    const unexpected = Object.keys(record).find((property) => !allowed.has(property));
    if (unexpected) {
      invalidResponse(
        `snapshot.characterLocationRelations[${index}].${unexpected} no forma parte de la proyección pública.`,
      );
    }
    return {
      character_id: record.characterId,
      location_id: record.locationId,
      relation_status: record.relationStatus,
    };
  });
}
