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
    uploadPortrait: vi.fn(async () => 'portraits/123e4567-e89b-42d3-a456-426614174000.webp'),
    deletePortrait: vi.fn(async () => undefined),
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
  it('requests fail-closed public revocation before a public entity is saved as master', async () => {
    const publicDetail: AdminMapEntityDetail = {
      ...detail,
      record: {
        ...record,
        audience: 'public',
        publicationStatus: 'published',
        publishedAt: '2026-08-07T10:00:00.000Z',
      },
    };
    let resolveSave!: (value: AdminMapEntityDetail) => void;
    const pendingSave = new Promise<AdminMapEntityDetail>((resolve) => {
      resolveSave = resolve;
    });
    const save = vi.fn<AdminMapEntityRepository['save']>(() => pendingSave);
    const onPublicAudienceRevocationRequested = vi.fn();
    const controller = new AdminMapEntityController(
      repository({ load: vi.fn(async () => publicDetail), save }),
      { onPublicAudienceRevocationRequested },
    );
    await authorize(controller);
    await controller.openEditor(record.id);

    const request = controller.save({
      ...draft,
      audience: 'master',
      publicationStatus: 'draft',
    });

    expect(onPublicAudienceRevocationRequested).toHaveBeenCalledWith(record.id);
    expect(save).toHaveBeenCalledTimes(1);
    resolveSave({
      ...publicDetail,
      record: {
        ...publicDetail.record,
        audience: 'master',
        publicationStatus: 'draft',
        updatedAt: '2026-08-11T20:30:00.000Z',
      },
    });
    await expect(request).resolves.toBe(true);
  });

  it('creates a character with a portrait through the same entity save', async () => {
    const nextPath = 'portraits/123e4567-e89b-42d3-a456-426614174010.webp';
    const uploadPortrait = vi.fn(async () => nextPath);
    const createdDraft: AdminMapEntityDraft = {
      ...draft,
      id: 'entity-new-character',
      slug: 'new-character',
      name: 'New Character',
      x: 111,
      y: 222,
      publicationStatus: 'published',
    };
    const save = vi.fn<AdminMapEntityRepository['save']>(async (original, nextDraft) => {
      expect(original).toBeNull();
      return {
        ...detail,
        record: {
          ...record,
          id: nextDraft.id,
          slug: nextDraft.slug,
          name: nextDraft.name,
          x: nextDraft.x,
          y: nextDraft.y,
          portraitPath: nextDraft.portraitPath ?? null,
          publicationStatus: nextDraft.publicationStatus,
          publishedAt: '2026-08-11T15:00:00.000Z',
          updatedAt: '2026-08-11T15:00:00.000Z',
        },
      };
    });
    const controller = new AdminMapEntityController(repository({ uploadPortrait, save }));
    await authorize(controller);
    controller.openCreate();

    const file = new File(
      [new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
      'portrait.webp',
      {
        type: 'image/webp',
      },
    );
    await expect(controller.save(createdDraft, { kind: 'replace', file })).resolves.toBe(true);

    expect(uploadPortrait).toHaveBeenCalledWith(file, expect.any(Object));
    expect(save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        id: createdDraft.id,
        slug: createdDraft.slug,
        x: 111,
        y: 222,
        portraitPath: nextPath,
      }),
      expect.any(Object),
    );
    expect(controller.getState().records.at(-1)).toMatchObject({
      id: createdDraft.id,
      slug: createdDraft.slug,
      portraitPath: nextPath,
    });
  });

  it('replaces a portrait and coordinates without changing entity identity', async () => {
    const original: AdminMapEntityDetail = {
      ...detail,
      record: {
        ...record,
        portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174001.webp',
      },
    };
    const nextPath = 'portraits/123e4567-e89b-42d3-a456-426614174002.webp';
    const uploadPortrait = vi.fn(async () => nextPath);
    const deletePortrait = vi.fn(async () => undefined);
    const save = vi.fn<AdminMapEntityRepository['save']>(async (_original, nextDraft) => ({
      ...original,
      record: {
        ...original.record,
        x: nextDraft.x,
        y: nextDraft.y,
        portraitPath: nextDraft.portraitPath ?? null,
        updatedAt: '2026-08-11T15:00:00.000Z',
      },
    }));
    const repo = repository({
      load: vi.fn(async () => original),
      uploadPortrait,
      deletePortrait,
      save,
    });
    const controller = new AdminMapEntityController(repo);
    await authorize(controller);
    await controller.openEditor(record.id);

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'portrait.jpg', {
      type: 'image/jpeg',
    });
    await expect(
      controller.save({ ...draft, x: 321, y: 654 }, { kind: 'replace', file }),
    ).resolves.toBe(true);

    expect(save).toHaveBeenCalledWith(
      original,
      expect.objectContaining({
        id: record.id,
        slug: record.slug,
        x: 321,
        y: 654,
        portraitPath: nextPath,
      }),
      expect.any(Object),
    );
    expect(controller.getState().editorDetail?.record).toMatchObject({
      id: record.id,
      slug: record.slug,
      x: 321,
      y: 654,
      portraitPath: nextPath,
    });
    expect(deletePortrait).toHaveBeenCalledWith(original.record.portraitPath, expect.any(Object));
  });

  it('removes a portrait only after the entity save succeeds', async () => {
    const original: AdminMapEntityDetail = {
      ...detail,
      record: {
        ...record,
        portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174003.webp',
      },
    };
    const deletePortrait = vi.fn(async () => undefined);
    const save = vi.fn<AdminMapEntityRepository['save']>(async (_original, nextDraft) => ({
      ...original,
      record: { ...original.record, portraitPath: nextDraft.portraitPath ?? null },
    }));
    const controller = new AdminMapEntityController(
      repository({ load: vi.fn(async () => original), save, deletePortrait }),
    );
    await authorize(controller);
    await controller.openEditor(record.id);

    await expect(controller.save(draft, { kind: 'remove' })).resolves.toBe(true);
    expect(save).toHaveBeenCalledWith(
      original,
      expect.objectContaining({ portraitPath: null }),
      expect.any(Object),
    );
    expect(deletePortrait).toHaveBeenCalledWith(original.record.portraitPath, expect.any(Object));
  });

  it('compensates a newly uploaded portrait when an optimistic save loses a race', async () => {
    const uploadedPath = 'portraits/123e4567-e89b-42d3-a456-426614174004.webp';
    const deletePortrait = vi.fn(async () => undefined);
    const save = vi.fn<AdminMapEntityRepository['save']>(async () => {
      throw new AdminMapEntityRepositoryError('stale-write', 'stale');
    });
    const controller = new AdminMapEntityController(
      repository({
        uploadPortrait: vi.fn(async () => uploadedPath),
        deletePortrait,
        save,
      }),
    );
    await authorize(controller);
    await controller.openEditor(record.id);

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'portrait.jpg', {
      type: 'image/jpeg',
    });
    await expect(controller.save(draft, { kind: 'replace', file })).resolves.toBe(false);
    expect(deletePortrait).toHaveBeenCalledWith(uploadedPath, expect.any(Object));
    expect(controller.getState().editorDetail?.record.id).toBe(record.id);
  });
});
