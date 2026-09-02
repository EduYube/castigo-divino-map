import type {
  EntityId,
  PublicCatalogSnapshotV2,
  PublicCoordinate,
  PublicMapEntity,
  PublicSearchExtent,
} from './beta02-model';
import type { CampaignCatalog, CampaignPlace, PlaceId } from './model';
import { normalizeSearchTerm } from './validate';

export type PlaceSearchMatchKind = 'name' | 'alias' | 'note-title';
export type PlaceSearchMatchRank = 0 | 1 | 2;

export interface PlaceSearchResult {
  readonly placeId: PlaceId;
  readonly placeName: string;
  readonly matchKind: PlaceSearchMatchKind;
  readonly matchedText: string;
  readonly matchRank: PlaceSearchMatchRank;
}

export type AtlasSearchResultType =
  | 'geographic'
  | 'character'
  | 'location'
  | 'mission'
  | 'hazard';

export interface AtlasSearchResult {
  readonly id: string;
  readonly type: AtlasSearchResultType;
  readonly name: string;
  readonly matchKind: PlaceSearchMatchKind;
  readonly matchedText: string;
  readonly matchRank: PlaceSearchMatchRank;
  readonly coordinates: PublicCoordinate;
  readonly searchExtent: PublicSearchExtent | null;
  readonly recommendedZoom: number | null;
  readonly legacyPlaceId: PlaceId | null;
  readonly linkedEntityId: EntityId | null;
}

interface SearchCandidate {
  readonly matchKind: PlaceSearchMatchKind;
  readonly matchedText: string;
  readonly normalizedText: string;
  readonly sourceRank: number;
  readonly sourceIndex: number;
}

interface RankedAtlasSearchResult extends AtlasSearchResult {
  readonly sourceRank: number;
  readonly typeRank: number;
  readonly stableIndex: number;
}

function getMatchRank(
  normalizedText: string,
  normalizedQuery: string,
): PlaceSearchMatchRank | undefined {
  if (normalizedText === normalizedQuery) return 0;
  if (normalizedText.startsWith(normalizedQuery)) return 1;
  if (normalizedText.includes(normalizedQuery)) return 2;
  return undefined;
}

function compareCandidates(
  left: SearchCandidate & { readonly matchRank: PlaceSearchMatchRank },
  right: SearchCandidate & { readonly matchRank: PlaceSearchMatchRank },
): number {
  return (
    left.matchRank - right.matchRank ||
    left.sourceRank - right.sourceRank ||
    left.sourceIndex - right.sourceIndex
  );
}

function createCandidate(
  matchKind: PlaceSearchMatchKind,
  matchedText: string,
  sourceRank: number,
  sourceIndex: number,
): SearchCandidate {
  return {
    matchKind,
    matchedText,
    normalizedText: normalizeSearchTerm(matchedText),
    sourceRank,
    sourceIndex,
  };
}

function findBestCandidate(
  candidates: readonly SearchCandidate[],
  normalizedQuery: string,
): (SearchCandidate & { readonly matchRank: PlaceSearchMatchRank }) | undefined {
  return candidates
    .map((candidate) => {
      const matchRank = getMatchRank(candidate.normalizedText, normalizedQuery);
      return matchRank === undefined ? undefined : { ...candidate, matchRank };
    })
    .filter(
      (
        candidate,
      ): candidate is SearchCandidate & {
        readonly matchRank: PlaceSearchMatchRank;
      } => Boolean(candidate),
    )
    .sort(compareCandidates)[0];
}

function findLegacyPlaceForEntity(
  catalog: CampaignCatalog,
  entity: PublicMapEntity,
): CampaignPlace | undefined {
  if (entity.entityType !== 'location') return undefined;
  return catalog.places.find((place) => place.id === entity.id || place.slug === entity.slug);
}

function legacyPlaceCandidates(catalog: CampaignCatalog, place: CampaignPlace): SearchCandidate[] {
  return [
    createCandidate('name', place.name, 0, 0),
    ...place.aliases.map((alias, aliasIndex) => createCandidate('alias', alias, 1, aliasIndex)),
    ...catalog.notes
      .filter((note) => note.placeId === place.id)
      .map((note, noteIndex) => createCandidate('note-title', note.title, 2, noteIndex)),
  ];
}

function entityCandidates(
  catalog: CampaignCatalog,
  entity: PublicMapEntity,
  legacyPlace: CampaignPlace | undefined,
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [
    createCandidate('name', entity.name, 0, 0),
    ...entity.aliases.map((alias, aliasIndex) =>
      createCandidate('alias', alias.value, 1, aliasIndex),
    ),
  ];

  if (!legacyPlace) return candidates;

  if (normalizeSearchTerm(legacyPlace.name) !== normalizeSearchTerm(entity.name)) {
    candidates.push(createCandidate('alias', legacyPlace.name, 1, candidates.length));
  }

  legacyPlace.aliases.forEach((alias) => {
    candidates.push(createCandidate('alias', alias, 1, candidates.length));
  });
  catalog.notes
    .filter((note) => note.placeId === legacyPlace.id)
    .forEach((note, noteIndex) => {
      candidates.push(createCandidate('note-title', note.title, 2, noteIndex));
    });

  return candidates;
}

function resultTypeRank(type: AtlasSearchResultType): number {
  switch (type) {
    case 'geographic':
      return 0;
    case 'location':
      return 1;
    case 'character':
      return 2;
    case 'mission':
      return 3;
    case 'hazard':
      return 4;
  }
}

function toAtlasSearchResult(result: RankedAtlasSearchResult): AtlasSearchResult {
  return {
    id: result.id,
    type: result.type,
    name: result.name,
    matchKind: result.matchKind,
    matchedText: result.matchedText,
    matchRank: result.matchRank,
    coordinates: result.coordinates,
    searchExtent: result.searchExtent,
    recommendedZoom: result.recommendedZoom,
    legacyPlaceId: result.legacyPlaceId,
    linkedEntityId: result.linkedEntityId,
  };
}

export function normalizePlaceSearchQuery(value: string): string {
  return normalizeSearchTerm(value);
}

export function searchPublicPlaces(
  catalog: CampaignCatalog,
  query: string,
): readonly PlaceSearchResult[] {
  const normalizedQuery = normalizePlaceSearchQuery(query);
  if (!normalizedQuery) return [];

  return catalog.places
    .map((place, catalogIndex) => {
      const bestMatch = findBestCandidate(legacyPlaceCandidates(catalog, place), normalizedQuery);
      if (!bestMatch) return undefined;
      return {
        catalogIndex,
        result: {
          placeId: place.id,
          placeName: place.name,
          matchKind: bestMatch.matchKind,
          matchedText: bestMatch.matchedText,
          matchRank: bestMatch.matchRank,
        } satisfies PlaceSearchResult,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        readonly catalogIndex: number;
        readonly result: PlaceSearchResult;
      } => Boolean(entry),
    )
    .sort(
      (left, right) =>
        left.result.matchRank - right.result.matchRank || left.catalogIndex - right.catalogIndex,
    )
    .map(({ result }) => result);
}

export function searchPublicAtlas(
  catalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
  query: string,
): readonly AtlasSearchResult[] {
  const normalizedQuery = normalizePlaceSearchQuery(query);
  if (!normalizedQuery) return [];

  const results: RankedAtlasSearchResult[] = [];
  const representedLegacyPlaces = new Set<PlaceId>();
  let stableIndex = 0;

  beta02Catalog?.geographicNames.forEach((geographicName) => {
    const candidates = [
      createCandidate('name', geographicName.name, 0, 0),
      ...geographicName.aliases.map((alias, aliasIndex) =>
        createCandidate('alias', alias.value, 1, aliasIndex),
      ),
    ];
    const bestMatch = findBestCandidate(candidates, normalizedQuery);

    if (!bestMatch) {
      stableIndex += 1;
      return;
    }

    const linkedEntity = geographicName.entityId
      ? beta02Catalog.entities.find((entity) => entity.id === geographicName.entityId)
      : undefined;
    const legacyPlace = linkedEntity ? findLegacyPlaceForEntity(catalog, linkedEntity) : undefined;

    results.push({
      id: geographicName.id,
      type: 'geographic',
      name: geographicName.name,
      matchKind: bestMatch.matchKind,
      matchedText: bestMatch.matchedText,
      matchRank: bestMatch.matchRank,
      coordinates: geographicName.coordinates,
      searchExtent: geographicName.searchExtent ?? null,
      recommendedZoom: geographicName.recommendedZoom,
      legacyPlaceId: legacyPlace?.id ?? null,
      linkedEntityId: geographicName.entityId,
      sourceRank: bestMatch.sourceRank,
      typeRank: resultTypeRank('geographic'),
      stableIndex: stableIndex++,
    });
  });

  beta02Catalog?.entities.forEach((entity) => {
    const legacyPlace = findLegacyPlaceForEntity(catalog, entity);
    if (legacyPlace) representedLegacyPlaces.add(legacyPlace.id);

    const bestMatch = findBestCandidate(
      entityCandidates(catalog, entity, legacyPlace),
      normalizedQuery,
    );
    if (!bestMatch) {
      stableIndex += 1;
      return;
    }

    results.push({
      id: entity.id,
      type: entity.entityType,
      name: entity.name,
      matchKind: bestMatch.matchKind,
      matchedText: bestMatch.matchedText,
      matchRank: bestMatch.matchRank,
      coordinates: entity.coordinates,
      searchExtent: null,
      recommendedZoom: null,
      legacyPlaceId: legacyPlace?.id ?? null,
      linkedEntityId: entity.id,
      sourceRank: bestMatch.sourceRank,
      typeRank: resultTypeRank(entity.entityType),
      stableIndex: stableIndex++,
    });
  });

  catalog.places.forEach((place) => {
    if (representedLegacyPlaces.has(place.id)) return;

    const bestMatch = findBestCandidate(legacyPlaceCandidates(catalog, place), normalizedQuery);
    if (!bestMatch) {
      stableIndex += 1;
      return;
    }

    results.push({
      id: place.id,
      type: 'location',
      name: place.name,
      matchKind: bestMatch.matchKind,
      matchedText: bestMatch.matchedText,
      matchRank: bestMatch.matchRank,
      coordinates: place.coordinates,
      searchExtent: null,
      recommendedZoom: null,
      legacyPlaceId: place.id,
      linkedEntityId: null,
      sourceRank: bestMatch.sourceRank,
      typeRank: resultTypeRank('location'),
      stableIndex: stableIndex++,
    });
  });

  return results
    .sort(
      (left, right) =>
        left.matchRank - right.matchRank ||
        left.sourceRank - right.sourceRank ||
        left.typeRank - right.typeRank ||
        left.stableIndex - right.stableIndex ||
        left.id.localeCompare(right.id),
    )
    .map(toAtlasSearchResult);
}
