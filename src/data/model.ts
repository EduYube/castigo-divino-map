export type CategoryId = `category-${string}`;
export type PlaceId = `place-${string}`;
export type NoteId = `note-${string}`;
export type TagId = string;
export type Slug = string;

export interface CampaignCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface CampaignCategory {
  readonly id: CategoryId;
  readonly slug: Slug;
  readonly name: string;
  readonly description: string;
}

export interface CampaignTag {
  readonly id: TagId;
  readonly name: string;
  readonly description: string;
}

export interface CampaignPlace {
  readonly id: PlaceId;
  readonly slug: Slug;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly coordinates: CampaignCoordinate;
  readonly categoryId: CategoryId;
  readonly tagIds: readonly TagId[];
}

export interface PublicNote {
  readonly id: NoteId;
  readonly slug: Slug;
  readonly placeId: PlaceId;
  readonly title: string;
  readonly body: string;
  readonly tagIds: readonly TagId[];
}

export interface CampaignCatalog {
  readonly categories: readonly CampaignCategory[];
  readonly tags: readonly CampaignTag[];
  readonly places: readonly CampaignPlace[];
  readonly notes: readonly PublicNote[];
}
