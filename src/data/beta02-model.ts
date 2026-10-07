export type EntityId = `entity-${string}` | `place-${string}`;
export type PlayerId = `player-${string}`;
export type CategoryId = `category-${string}`;
export type NoteId = `note-${string}`;
export type GeographicNameId = `geo-${string}`;
export type CharacterLocationEventId = `location-event-${string}` | `relation-${string}`;
export type TagId = string;
export type Slug = string;
export type LanguageCode = 'en';
export type GeographicNameAliasLanguageCode = LanguageCode | 'es';

export type EntityType = 'character' | 'location' | 'mission' | 'hazard';
export type EntityLifecycleStatus = 'active' | 'completed' | 'failed' | 'resolved';
export type MapVisibility = 'pin' | 'search_only';
export type PlayerDisposition = 'ally' | 'enemy' | 'neutral';
export type CharacterLocationEventType = 'sighting' | 'departure';
export type CharacterLocationRelationStatus = 'present' | 'associated' | 'last-seen';

export interface PublicCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface PublicPointGeometry {
  readonly kind: 'point';
  readonly coordinates: PublicCoordinate;
}

export interface PublicPolygonGeometry {
  readonly kind: 'polygon';
  readonly vertices: readonly PublicCoordinate[];
}

export type PublicMapGeometry = PublicPointGeometry | PublicPolygonGeometry;

export interface PublicSearchExtent {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface PublicCategory {
  readonly id: CategoryId;
  readonly slug: Slug;
  readonly name: string;
  readonly description: string;
}

export interface PublicTag {
  readonly id: TagId;
  readonly name: string;
  readonly description: string;
}

export interface PublicPlayer {
  readonly id: PlayerId;
  readonly slug: Slug;
  readonly displayName: string;
  readonly nameLanguage: LanguageCode;
  /** MAP-054 persisted roster accent. Historic Beta 0.2 snapshots may omit it. */
  readonly accentColor?: string;
}

export interface PublicMapEntity {
  readonly id: EntityId;
  readonly slug: Slug;
  readonly entityType: EntityType;
  /** MAP-064 functional lifecycle; null/absent for character/location legacy snapshots. */
  readonly lifecycleStatus?: EntityLifecycleStatus | null;
  readonly visibility: MapVisibility;
  readonly name: string;
  readonly nameLanguage: LanguageCode;
  readonly aliases: readonly PublicEntityAlias[];
  readonly summary: string;
  readonly description: string;
  /** MAP-045 stable private Storage reference; absent/null means no portrait. */
  readonly portraitPath?: string | null;
  /**
   * Historical snapshots before MAP-060 omit geometry and are interpreted as the
   * point at `coordinates`. New snapshots persist this canonical point/polygon.
   */
  readonly geometry?: PublicMapGeometry;
  /** Deterministic representative point; derived from geometry for polygons. */
  readonly coordinates: PublicCoordinate;
  readonly categoryId: CategoryId;
  readonly tagIds: readonly TagId[];
}

export interface PublicEntityAlias {
  readonly id: string;
  readonly entityId: EntityId;
  readonly language: LanguageCode;
  readonly value: string;
}

export interface PublicEntityPlayerDisposition {
  readonly entityId: EntityId;
  readonly playerId: PlayerId;
  readonly disposition: PlayerDisposition;
}

/** MAP-058 narrative association. Deliberately independent from disposition. */
export interface PublicEntityPlayerAssociation {
  readonly entityId: EntityId;
  readonly playerId: PlayerId;
}

export interface PublicCharacterLocationRelation {
  readonly characterId: EntityId;
  readonly locationId: EntityId;
  readonly relationStatus: CharacterLocationRelationStatus;
}

export interface PublicNote {
  readonly id: NoteId;
  readonly slug: Slug;
  readonly entityId: EntityId;
  readonly title: string;
  readonly body: string;
  readonly sortOrder: number;
  readonly tagIds: readonly TagId[];
}

export interface PublicGeographicNameAlias {
  readonly id: string;
  readonly geographicNameId: GeographicNameId;
  readonly language: GeographicNameAliasLanguageCode;
  readonly value: string;
}

export interface PublicGeographicName {
  readonly id: GeographicNameId;
  readonly slug: Slug;
  readonly name: string;
  readonly language: LanguageCode;
  readonly aliases: readonly PublicGeographicNameAlias[];
  readonly coordinates: PublicCoordinate;
  readonly searchExtent?: PublicSearchExtent | null;
  readonly recommendedZoom: number | null;
  readonly entityId: EntityId | null;
}

interface CharacterEventLocationBase {
  readonly locationLabel: string | null;
}

export type CharacterEventLocation =
  | (CharacterEventLocationBase & {
      readonly locationEntityId: EntityId;
      readonly geographicNameId: GeographicNameId | null;
      readonly coordinates: PublicCoordinate | null;
    })
  | (CharacterEventLocationBase & {
      readonly locationEntityId: EntityId | null;
      readonly geographicNameId: GeographicNameId;
      readonly coordinates: PublicCoordinate | null;
    })
  | (CharacterEventLocationBase & {
      readonly locationEntityId: EntityId | null;
      readonly geographicNameId: GeographicNameId | null;
      readonly coordinates: PublicCoordinate;
    });

interface PublicCharacterLocationEventBase {
  readonly id: CharacterLocationEventId;
  readonly characterId: EntityId;
  readonly location: CharacterEventLocation;
  readonly summary: string;
  readonly language: LanguageCode;
  readonly observedAt: string | null;
}

export type PublicCharacterLocationEvent =
  | (PublicCharacterLocationEventBase & {
      readonly eventType: 'sighting';
      readonly relatedSightingId: null;
    })
  | (PublicCharacterLocationEventBase & {
      readonly eventType: 'departure';
      readonly relatedSightingId: CharacterLocationEventId | null;
    });

export interface PublicCatalogSnapshotV2 {
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly categories: readonly PublicCategory[];
  readonly tags: readonly PublicTag[];
  readonly players: readonly PublicPlayer[];
  readonly entities: readonly PublicMapEntity[];
  readonly dispositions: readonly PublicEntityPlayerDisposition[];
  /** Historic Beta 0.2 snapshots predate MAP-058 and may omit associations. */
  readonly associations?: readonly PublicEntityPlayerAssociation[];
  readonly characterLocationRelations: readonly PublicCharacterLocationRelation[];
  readonly notes: readonly PublicNote[];
  readonly geographicNames: readonly PublicGeographicName[];
  readonly characterLocationEvents: readonly PublicCharacterLocationEvent[];
}
