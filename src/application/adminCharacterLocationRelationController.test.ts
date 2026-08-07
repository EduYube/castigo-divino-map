import { describe, expect, test, vi } from 'vitest';

import type { AdminCharacterLocationRelationRepository } from '../data-access/adminCharacterLocationRelations';
import type {
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
} from '../domain/characterLocationRelations';
import { AdminCharacterLocationRelationController } from './adminCharacterLocationRelationController';

const references: AdminCharacterLocationRelationReferences = {
  characters: [
    {
      id: 'entity-character',
      name: 'Character',
      entityType: 'character',
      publicationStatus: 'published',
    },
  ],
  locations: [
    {
      id: 'entity-location',
      name: 'Location',
      entityType: 'location',
      publicationStatus: 'published',
    },
  ],
};

const record: AdminCharacterLocationRelationRecord = {
  characterId: 'entity-character',
  locationId: 'entity-location',
  relationStatus: 'present',
  publicationStatus: 'published',
  publishedAt: '2026-08-07T00:00:00Z',
  archivedAt: null,
  updatedAt: '2026-08-07T00:00:00Z',
};

function repository(
  overrides: Partial<AdminCharacterLocationRelationRepository> = {},
): AdminCharacterLocationRelationRepository {
  return {
    list: vi.fn(async () => []),
    loadReferences: vi.fn(async () => references),
    create: vi.fn(async (draft) => ({
      ...record,
      ...draft,
      publishedAt: draft.publicationStatus === 'published' ? record.publishedAt : null,
      archivedAt: null,
    })),
    update: vi.fn(async (_original, draft) => ({
      ...record,
      ...draft,
      archivedAt: draft.publicationStatus === 'archived' ? '2026-08-07T01:00:00Z' : null,
    })),
    ...overrides,
  };
}

describe('AdminCharacterLocationRelationController', () => {
  test('loads records only after admin access and backend availability are both true', async () => {
    const repo = repository();
    const controller = new AdminCharacterLocationRelationController(repo);
    controller.setAccess(true, true);
    await controller.reload();
    expect(repo.list).toHaveBeenCalled();
    expect(repo.loadReferences).toHaveBeenCalled();
    expect(controller.getState().phase).toBe('ready');
  });

  test('creates a valid relation and rejects a duplicate before calling the repository again', async () => {
    const repo = repository();
    const controller = new AdminCharacterLocationRelationController(repo);
    controller.setAccess(true, true);
    await controller.reload();
    const draft = {
      characterId: 'entity-character',
      locationId: 'entity-location',
      relationStatus: 'associated' as const,
      publicationStatus: 'draft' as const,
    };
    expect(await controller.save(draft, null)).toBe(true);
    expect(await controller.save(draft, null)).toBe(false);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(controller.getState().issue?.code).toBe('validation');
  });

  test('retires a relation by archiving it instead of deleting it', async () => {
    const repo = repository({ list: vi.fn(async () => [record]) });
    const controller = new AdminCharacterLocationRelationController(repo);
    controller.setAccess(true, true);
    await controller.reload();
    expect(await controller.retire(record)).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(
      record,
      expect.objectContaining({ publicationStatus: 'archived' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
