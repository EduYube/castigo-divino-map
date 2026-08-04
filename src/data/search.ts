import type { CampaignCatalog, PlaceId } from './model';
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

interface SearchCandidate {
  readonly matchKind: PlaceSearchMatchKind;
  readonly matchedText: string;
  readonly normalizedText: string;
  readonly sourceRank: number;
  readonly sourceIndex: number;
}

function getMatchRank(
  normalizedText: string,
  normalizedQuery: string,
): PlaceSearchMatchRank | undefined {
  if (normalizedText === normalizedQuery) {
    return 0;
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return 1;
  }

  if (normalizedText.includes(normalizedQuery)) {
    return 2;
  }

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

export function normalizePlaceSearchQuery(value: string): string {
  return normalizeSearchTerm(value);
}

export function searchPublicPlaces(
  catalog: CampaignCatalog,
  query: string,
): readonly PlaceSearchResult[] {
  const normalizedQuery = normalizePlaceSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  return catalog.places
    .map((place, catalogIndex) => {
      const candidates: SearchCandidate[] = [
        {
          matchKind: 'name',
          matchedText: place.name,
          normalizedText: normalizeSearchTerm(place.name),
          sourceRank: 0,
          sourceIndex: 0,
        },
        ...place.aliases.map((alias, aliasIndex) => ({
          matchKind: 'alias' as const,
          matchedText: alias,
          normalizedText: normalizeSearchTerm(alias),
          sourceRank: 1,
          sourceIndex: aliasIndex,
        })),
        ...catalog.notes
          .filter((note) => note.placeId === place.id)
          .map((note, noteIndex) => ({
            matchKind: 'note-title' as const,
            matchedText: note.title,
            normalizedText: normalizeSearchTerm(note.title),
            sourceRank: 2,
            sourceIndex: noteIndex,
          })),
      ];
      const bestMatch = candidates
        .map((candidate) => {
          const matchRank = getMatchRank(candidate.normalizedText, normalizedQuery);

          return matchRank === undefined ? undefined : { ...candidate, matchRank };
        })
        .filter(
          (
            candidate,
          ): candidate is SearchCandidate & { readonly matchRank: PlaceSearchMatchRank } =>
            Boolean(candidate),
        )
        .sort(compareCandidates)[0];

      if (!bestMatch) {
        return undefined;
      }

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
