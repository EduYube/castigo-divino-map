import { toLeafletSimpleCoordinate, type LeafletSimpleCoordinate } from './coordinates';
import type {
  CampaignCatalog,
  CampaignCategory,
  CampaignPlace,
  CampaignTag,
  PlaceId,
  PublicNote,
} from './model';

export interface PlaceMarkerModel {
  readonly id: PlaceId;
  readonly name: string;
  readonly categoryId: CampaignCategory['id'];
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly categoryIndex: number;
  readonly coordinate: LeafletSimpleCoordinate;
}

export interface PublicNoteDetailModel {
  readonly id: PublicNote['id'];
  readonly title: string;
  readonly body: string;
  readonly tags: readonly CampaignTag[];
}

export interface PlaceDetailModel {
  readonly id: PlaceId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly category: CampaignCategory;
  readonly tags: readonly CampaignTag[];
  readonly notes: readonly PublicNoteDetailModel[];
}

function resolveCategory(
  catalog: CampaignCatalog,
  place: CampaignPlace,
): CampaignCategory {
  const category = catalog.categories.find(({ id }) => id === place.categoryId);

  if (!category) {
    throw new Error(`Missing category "${place.categoryId}" for place "${place.id}".`);
  }

  return category;
}

function resolveTags(
  catalog: CampaignCatalog,
  tagIds: readonly string[],
): readonly CampaignTag[] {
  return tagIds.map((tagId) => {
    const tag = catalog.tags.find(({ id }) => id === tagId);

    if (!tag) {
      throw new Error(`Missing tag "${tagId}" in the public campaign catalog.`);
    }

    return tag;
  });
}

export function getPublicNotesForPlace(
  catalog: CampaignCatalog,
  placeId: PlaceId,
): readonly PublicNote[] {
  return catalog.notes.filter((note) => note.placeId === placeId);
}

export function createPlaceMarkerModels(
  catalog: CampaignCatalog,
): readonly PlaceMarkerModel[] {
  return catalog.places.map((place) => {
    const category = resolveCategory(catalog, place);
    const categoryIndex = catalog.categories.findIndex(({ id }) => id === category.id);

    return {
      id: place.id,
      name: place.name,
      categoryId: category.id,
      categoryName: category.name,
      categorySlug: category.slug,
      categoryIndex,
      coordinate: toLeafletSimpleCoordinate(place.coordinates),
    };
  });
}

export function buildPlaceDetailModel(
  catalog: CampaignCatalog,
  placeId: PlaceId,
): PlaceDetailModel | undefined {
  const place = catalog.places.find(({ id }) => id === placeId);

  if (!place) {
    return undefined;
  }

  return {
    id: place.id,
    name: place.name,
    aliases: place.aliases,
    category: resolveCategory(catalog, place),
    tags: resolveTags(catalog, place.tagIds),
    notes: getPublicNotesForPlace(catalog, place.id).map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      tags: resolveTags(catalog, note.tagIds),
    })),
  };
}
