import type {
  EntityType,
  PublicMapEntity,
  PublicSpatialMapEntity,
  SpatialEntityType,
} from '../data/beta02-model';

const SPATIAL_ENTITY_TYPES: ReadonlySet<EntityType> = new Set([
  'character',
  'location',
  'mission',
  'hazard',
]);

export function isSpatialEntityType(entityType: EntityType): entityType is SpatialEntityType {
  return SPATIAL_ENTITY_TYPES.has(entityType);
}

export function isSpatialMapEntity(entity: PublicMapEntity): entity is PublicSpatialMapEntity {
  return isSpatialEntityType(entity.entityType);
}

export function getEntityTypeLabel(entityType: EntityType): string {
  switch (entityType) {
    case 'character':
      return 'Personaje';
    case 'location':
      return 'Emplazamiento';
    case 'mission':
      return 'Misión';
    case 'hazard':
      return 'Peligro';
    case 'organization':
      return 'Organización';
  }
}
