import { describe, expect, it } from 'vitest';
import {
  filterAndSortAdminPublicRequests,
  type AdminPublicRequestRecord,
} from './adminPublicRequests';

function request(
  id: string,
  requestStatus: AdminPublicRequestRecord['requestStatus'],
  createdAt: string,
): AdminPublicRequestRecord {
  return {
    id,
    senderName: `Sender ${id}`,
    proposedName: `Request ${id}`,
    entityType: 'location',
    x: 100,
    y: 200,
    description: 'Description',
    reason: 'Reason',
    requestStatus,
    moderatorUserId: null,
    moderationNote: null,
    convertedEntityId: null,
    moderatedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('filterAndSortAdminPublicRequests', () => {
  const records = [
    request('b', 'converted', '2026-08-08T10:00:00.000Z'),
    request('a', 'pending', '2026-08-08T10:00:00.000Z'),
    request('c', 'pending', '2026-08-08T11:00:00.000Z'),
  ];

  it('filters by moderation state and shows newest first', () => {
    expect(filterAndSortAdminPublicRequests(records, 'pending', 'newest').map(({ id }) => id)).toEqual([
      'c',
      'a',
    ]);
  });

  it('can show all requests oldest first with a stable id tie-breaker', () => {
    expect(filterAndSortAdminPublicRequests(records, 'all', 'oldest').map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
