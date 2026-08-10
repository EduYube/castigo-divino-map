import type {
  CategoryId,
  EntityId,
  PlayerId,
  PublicCatalogSnapshotV2,
  PublicCharacterLocationRelation,
  PublicEntityPlayerDisposition,
  PublicMapEntity,
  TagId,
} from './beta02-model';
import type { AuthorizedMasterCatalog } from '../data-access/masterCatalog';

export interface AuthorizedMasterCatalogView {
  /**
   * Ephemeral in-memory projection used only while Modo Máster is ON. Although it
   * reuses the public presentation shape, it is never persisted, cached, bundled or
   * passed to the snapshot generator.
   */
  readonly catalog: PublicCatalogSnapshotV2;
  readonly masterEntityIds: ReadonlySet<EntityId>;
}

function toEntityId(value: string): EntityId {
  if (!/^(?:entity|place)-/.test(value)) {
    throw new Error('El catálogo Máster contiene un ID de entidad no válido.');
  }
  return value as EntityId;
}

function toCategoryId(value: string): CategoryId {
  if (!value.startsWith('category-')) {
    throw new Error('El catálogo Máster contiene una categoría no válida.');
  }
  return value as CategoryId;
}

function toPlayerId(value: string): PlayerId {
  if (!value.startsWith('player-')) {
    throw new Error('El catálogo Máster contiene un jugador no válido.');
  }
  return value as PlayerId;
}

function requirePublishedCategory(
  publicCatalog: PublicCatalogSnapshotV2,
  categoryId: CategoryId,
): void {
  if (!publicCatalog.categories.some(({ id }) => id === categoryId)) {
    throw new Error('Una entidad Máster publicada referencia una categoría no pública.');
  }
}

function requirePublishedTag(publicCatalog: PublicCatalogSnapshotV2, tagId: TagId): void {
  if (!publicCatalog.tags.some(({ id }) => id === tagId)) {
    throw new Error('Una entidad Máster publicada referencia una etiqueta no pública.');
  }
}

function buildMasterEntities(
  publicCatalog: PublicCatalogSnapshotV2,
  masterCatalog: AuthorizedMasterCatalog,
): readonly PublicMapEntity[] {
  return masterCatalog.entities.map((entity) => {
    const id = toEntityId(entity.id);
    const categoryId = toCategoryId(entity.categoryId);
    requirePublishedCategory(publicCatalog, categoryId);
    const aliases = masterCatalog.aliases
      .filter(({ entityId }) => entityId === entity.id)
      .map((alias) => ({
        id: alias.id,
        entityId: id,
        language: 'en' as const,
        value: alias.value,
      }));
    const tagIds = masterCatalog.entityTags
      .filter(({ entityId }) => entityId === entity.id)
      .map(({ tagId }) => {
        requirePublishedTag(publicCatalog, tagId);
        return tagId;
      });

    return {
      id,
      slug: entity.slug,
      entityType: entity.entityType,
      visibility: entity.visibility,
      name: entity.name,
      nameLanguage: 'en',
      aliases,
      summary: entity.summary,
      description: entity.description,
      coordinates: { x: entity.x, y: entity.y },
      categoryId,
      tagIds,
    };
  });
}

function buildMasterDispositions(
  masterCatalog: AuthorizedMasterCatalog,
  masterEntityIds: ReadonlySet<EntityId>,
): readonly PublicEntityPlayerDisposition[] {
  return masterCatalog.dispositions.map((relation) => {
    const entityId = toEntityId(relation.entityId);
    if (!masterEntityIds.has(entityId)) {
      throw new Error('Una disposición privada referencia una entidad fuera del catálogo Máster.');
    }
    return {
      entityId,
      playerId: toPlayerId(relation.playerId),
      disposition: relation.disposition,
    };
  });
}

function buildAuthorizedRelations(
  publicCatalog: PublicCatalogSnapshotV2,
  masterCatalog: AuthorizedMasterCatalog,
  masterEntityIds: ReadonlySet<EntityId>,
): readonly PublicCharacterLocationRelation[] {
  const knownPublicIds = new Set(publicCatalog.entities.map(({ id }) => id));
  const relations = masterCatalog.relations.map((relation) => {
    const characterId = toEntityId(relation.characterId);
    const locationId = toEntityId(relation.locationId);
    if (
      (!masterEntityIds.has(characterId) && !knownPublicIds.has(characterId)) ||
      (!masterEntityIds.has(locationId) && !knownPublicIds.has(locationId))
    ) {
      throw new Error('Una relación Máster referencia una entidad no disponible en memoria.');
    }
    return {
      characterId,
      locationId,
      relationStatus: relation.relationStatus,
    };
  });

  const seen = new Set<string>();
  return [...publicCatalog.characterLocationRelations, ...relations].filter((relation) => {
    const key = `${relation.characterId}\u0000${relation.locationId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createAuthorizedMasterCatalogView(
  publicCatalog: PublicCatalogSnapshotV2,
  masterCatalog: AuthorizedMasterCatalog,
): AuthorizedMasterCatalogView {
  const masterEntities = buildMasterEntities(publicCatalog, masterCatalog);
  const masterEntityIds = new Set(masterEntities.map(({ id }) => id));
  const duplicate = masterEntities.find((entity) =>
    publicCatalog.entities.some(({ id }) => id === entity.id),
  );
  if (duplicate) {
    throw new Error('Una entidad Máster también apareció en el catálogo público. RLS debe fallar cerrado.');
  }

  return {
    masterEntityIds,
    catalog: {
      ...publicCatalog,
      entities: [...publicCatalog.entities, ...masterEntities],
      dispositions: [
        ...publicCatalog.dispositions,
        ...buildMasterDispositions(masterCatalog, masterEntityIds),
      ],
      characterLocationRelations: buildAuthorizedRelations(
        publicCatalog,
        masterCatalog,
        masterEntityIds,
      ),
    },
  };
}
