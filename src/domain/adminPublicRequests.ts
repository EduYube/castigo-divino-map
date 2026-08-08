export type AdminPublicRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'converted'
  | 'archived';

export type AdminPublicRequestEntityType = 'character' | 'location';
export type AdminPublicRequestSort = 'newest' | 'oldest';
export type AdminPublicRequestFilter = 'all' | AdminPublicRequestStatus;

export interface AdminPublicRequestRecord {
  readonly id: string;
  readonly senderName: string;
  readonly proposedName: string;
  readonly entityType: AdminPublicRequestEntityType;
  readonly x: number;
  readonly y: number;
  readonly description: string;
  readonly reason: string;
  readonly requestStatus: AdminPublicRequestStatus;
  readonly moderatorUserId: string | null;
  readonly moderationNote: string | null;
  readonly convertedEntityId: string | null;
  readonly moderatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminPublicRequestModerationResult {
  readonly request: AdminPublicRequestRecord;
  readonly draftEntityId: string | null;
}

export function filterAndSortAdminPublicRequests(
  records: readonly AdminPublicRequestRecord[],
  filter: AdminPublicRequestFilter,
  sort: AdminPublicRequestSort,
): readonly AdminPublicRequestRecord[] {
  const filtered =
    filter === 'all' ? records : records.filter((record) => record.requestStatus === filter);

  return [...filtered].sort((left, right) => {
    const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
    const chronological = byCreatedAt || left.id.localeCompare(right.id);
    return sort === 'oldest' ? chronological : -chronological;
  });
}
