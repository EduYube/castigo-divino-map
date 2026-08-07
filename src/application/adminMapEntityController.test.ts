import { describe, expect, it, vi } from 'vitest';

import {
  AdminMapEntityRepositoryError,
  type AdminMapEntityRepository,
} from '../data-access/adminMapEntities';
import type {
  AdminMapEntityDetail,
  AdminMapEntityDraft,
  AdminMapEntityRecord,
  AdminMapEntityReferences,
} from '../domain/adminMapEntities';
import { AdminMapEntityController } from './adminMapEntityController';

const record: AdminMapEntityRecord = {
  id: 'entity-map019',
  slug: 'map019',
  entityType: 'character',
  visibility: 'pin',
  name: 'MAP-019',
  summary: '',
  description: '',
  x: 10,
  y: 20,
  categoryId: 'category-people',
  publicationStatus: 'draft',
  publishedAt: null,
  archivedAt: null,
  updatedAt: '2026-08-07T12:00:00.000Z',
};

const references: AdminMapEntityReferences = {
  categories: [{ id: 'category-people', name: 'People', publicationStatus: 'published' }],
  tags: [],
  players: [{ id: 'player-one', displayName: 'One', publicationStatus: 'published' }],
};

const detail: AdminMapEntityDetail = {
  record,
  tagLinks: [],
  dispositions: [
    {
      playerId: 'player-one',
      displayName: 'One',
      disposition: 'neutral',
      updatedAt: record.updatedAt,
    },
  ],
  relationsRevision: 'revision',
  deleteBlockers: {
    aliases: 0,
    tags: 0,
    geographicNames: 0,
    notes: 0,
    locationEvents: 0,
    requests: 0,
  },
};

const draft: AdminMapEntityDraft = {
  id: record.id,
  slug: record.slug,
  entityType: record.entityType,
  visibility: record.visibility,
  name: record.name,
  summary: '',
  description: '',
  x: 10,
  y: 20,
  categoryId: record.categoryId,
  tagIds: [],
  dispositions: [{ playerId: 'player-one', disposition: 'neutral' }],
  publicationStatus: 'draft',
};

function repository(overrides: Partial<AdminMapEntityRepository> = {}): AdminMapEntityRepository {
  return {
    list: vi.fn(async () => [record]),
    loadReferences: vi.fn(async () => references),
    load: vi.fn(async () => detail),
    save: vi.fn(async () => detail),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function authorize(controller: AdminMapEntityController): Promise<void> {
  controller.setAccess(true, true);
  await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'));
}

describe('AdminMapEntityController', () => {
  it('requires authorization and public-backend connectivity', async () => {
    const repo = repository();
    const controller = new AdminMapEntityController(repo);
    controller.setAccess(true, false);
    expect(controller.getState().phase).toBe('blocked');
    expect(repo.list).not.toHaveBeenCalled();

    await authorize(controller);
    expect(repo.list).toHaveBeenCalledTimes(1);
  });

  it('rejects a second submit while one mutation is active', async () => {
    let resolveSave!: (value: AdminMapEntityDetail) => void;
    const pendingSave = new Promise<AdminMapEntityDetail>((resolve) => {
      resolveSave = resolve;
    });
    const save = vi.fn<AdminMapEntityRepository['save']>(() => pendingSave);
    const controller = new AdminMapEntityController(repository({ save }));
    await authorize(controller);
    await controller.openEditor(record.id);

    const first = controller.save(draft);
    expect(controller.getState().phase).toBe('mutating');
    await expect(controller.save(draft)).resolves.toBe(false);
    expect(save).toHaveBeenCalledTimes(1);

    resolveSave(detail);
    await expect(first).resolves.toBe(true);
  });

  it('discards a pending editor result after the editor closes', async () => {
    let resolveLoad!: (value: AdminMapEntityDetail) => void;
    const pendingLoad = new Promise<AdminMapEntityDetail>((resolve) => {
      resolveLoad = resolve;
    });
    const load = vi.fn<AdminMapEntityRepository['load']>(() => pendingLoad);
    const controller = new AdminMapEntityController(repository({ load }));
    await authorize(controller);

    const request = controller.openEditor(record.id);
    controller.closeEditor();
    resolveLoad(detail);
    await request;

    expect(controller.getState().editorDetail).toBeNull();
  });

  it('invalidates admin authorization after a protected 401 without retrying', async () => {
    const onAuthorizationRejected = vi.fn();
    const save = vi.fn<AdminMapEntityRepository['save']>(async () => {
      throw new AdminMapEntityRepositoryError('session-expired', 'expired', { status: 401 });
    });
    const controller = new AdminMapEntityController(repository({ save }), {
      onAuthorizationRejected,
    });
    await authorize(controller);
    await controller.openEditor(record.id);

    await expect(controller.save(draft)).resolves.toBe(false);
    expect(onAuthorizationRejected).toHaveBeenCalledWith(401);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
