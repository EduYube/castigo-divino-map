export type EntityId = `entity-${string}` | `place-${string}`;
export type PlayerId = `player-${string}`;
export type CategoryId = `category-${string}`;
export type NoteId = `note-${string}`;
export type GeographicNameId = `geo-${string}`;
export type CharacterLocationEventId =
  | `location-event-${string}`
  | `relation-${string}`;
export type TagId = string;
export type Slug = string;
export type LanguageCode = 'en';

export type EntityType = 'character' | 'location';
export type MapVisibility = 'pin' | 'search_only';
export type PlayerDisposition = 'ally' | 'enemy' | 'neutral';
export type CharacterLocationEventType = 'sighting' | 'departure';

export interface PublicCoordinate {
  readonly x: number;
  readonly y: number;
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
}

export interface PublicMapEntity {
  readonly id: EntityId;
  readonly slug: Slug;
  readonly entityType: EntityType;
  readonly visibility: MapVisibility;
  readonly name: string;
  readonly nameLanguage: LanguageCode;
  readonly aliases: readonly PublicEntityAlias[];
  readonly summary: string;
  readonly description: string;
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
  readonly language: LanguageCode;
  readonly value: string;
}

export interface PublicGeographicName {
  readonly id: GeographicNameId;
  readonly slug: Slug;
  readonly name: string;
  readonly language: LanguageCode;
  readonly aliases: readonly PublicGeographicNameAlias[];
  readonly coordinates: PublicCoordinate;
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

export interface PublicCharacterLocationEvent {
  readonly id: CharacterLocationEventId;
  readonly characterId: EntityId;
  readonly eventType: CharacterLocationEventType;
  readonly location: CharacterEventLocation;
  readonly summary: string;
  readonly language: LanguageCode;
  readonly observedAt: string | null;
  readonly relatedSightingId: CharacterLocationEventId | null;
}

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
  readonly notes: readonly PublicNote[];
  readonly geographicNames: readonly PublicGeographicName[];
  readonly characterLocationEvents: readonly PublicCharacterLocationEvent[];
}
