import { describe, expect, it, vi } from 'vitest';

import {
  AdminCatalogRepositoryError,
  type AdminCatalogRepository,
} from '../data-access/adminCatalog';
import type {
  AdminCatalogDraft,
  AdminCatalogRecord,
  AdminCatalogResourceKind,
  AdminEntityReference,
  AdminGeographicNameReference,
} from '../domain/adminCatalog';
import { AdminCatalogController } from './adminCatalogController';

const category: AdminCatalogRecord = {
  kind: 'category',
  id: 'category-cities',
  slug: 'cities',
  name: 'Cities',
  description: '',
  publicationStatus: 'draft',
  publishedAt: null,
  updatedAt: '2026-08-07T10:00:00.000Z',
};

class FakeRepository implements AdminCatalogRepository {
  list = vi.fn<
    (
      kind: AdminCatalogResourceKind,
      options: { readonly signal: AbortSignal },
    ) => Promise<readonly AdminCatalogRecord[]>
  >(async () => [category]);
  create = vi.fn<
    (
      draft: AdminCatalogDraft,
      options: { readonly signal: AbortSignal },
    ) => Promise<AdminCatalogRecord>
  >(
    async (draft) =>
      ({
        ...category,
        ...draft,
        kind: 'category',
        updatedAt: '2026-08-07T10:01:00.000Z',
        publishedAt: null,
      }) as AdminCatalogRecord,
  );
  update = vi.fn<
    (
      original: AdminCatalogRecord,
      draft: AdminCatalogDraft,
      options: { readonly signal: AbortSignal },
    ) => Promise<AdminCatalogRecord>
  >(async (original, draft) => ({ ...original, ...draft }) as AdminCatalogRecord);
  archive = vi.fn<
    (
      record: AdminCatalogRecord,
      options: { readonly signal: AbortSignal },
    ) => Promise<AdminCatalogRecord>
  >(async (record) => ({ ...record, publicationStatus: 'archived' }));
  delete = vi.fn<
    (record: AdminCatalogRecord, options: { readonly signal: AbortSignal }) => Promise<void>
  >(async () => undefined);
  listEntityReferences = vi.fn<
    (options: { readonly signal: AbortSignal }) => Promise<readonly AdminEntityReference[]>
  >(async () => []);
  listGeographicNameReferences = vi.fn<
    (options: { readonly signal: AbortSignal }) => Promise<readonly AdminGeographicNameReference[]>
  >(async () => []);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AdminCatalogController', () => {
  it('blocks reads and mutations until both authorization and backend are ready', async () => {
    const repository = new FakeRepository();
    const controller = new AdminCatalogController(repository);

    controller.setAccess(true, false);
    await controller.reload();

    expect(repository.list).not.toHaveBeenCalled();
    expect(controller.getState().phase).toBe('blocked');
    expect(controller.getState().issue?.message).toContain('backend');
  });

  it('loads, searches and sorts the selected resource once access is ready', async () => {
    const repository = new FakeRepository();
    repository.list.mockResolvedValue([
      category,
      {
        ...category,
        id: 'category-villages',
        slug: 'villages',
        name: 'Villages',
      },
    ]);
    const controller = new AdminCatalogController(repository);

    controller.setAccess(true, true);
    await flush();
    expect(controller.getState().phase).toBe('ready');
    expect(controller.getState().records).toHaveLength(2);

    controller.setQuery('village');
    expect(controller.getState().visibleRecords.map((record) => record.id)).toEqual([
      'category-villages',
    ]);

    controller.setQuery('');
    controller.setSort('name', 'desc');
    expect(controller.getState().visibleRecords[0]?.id).toBe('category-villages');
  });

  it('invalidates authorization after a 401 administrative response', async () => {
    const repository = new FakeRepository();
    const onAuthorizationRejected = vi.fn();
    repository.list.mockRejectedValue(
      new AdminCatalogRepositoryError('session-expired', 'expired', { status: 401 }),
    );
    const controller = new AdminCatalogController(repository, { onAuthorizationRejected });

    controller.setAccess(true, true);
    await flush();

    expect(onAuthorizationRejected).toHaveBeenCalledWith(401);
    expect(controller.getState().issue?.code).toBe('session-expired');
  });

  it('drops stale overlapping loads when the selected resource changes', async () => {
    const repository = new FakeRepository();
    let resolveFirst: ((records: readonly AdminCatalogRecord[]) => void) | null = null;
    repository.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    repository.list.mockResolvedValueOnce([
      {
        kind: 'tag',
        id: 'safe-harbor',
        name: 'Safe harbor',
        description: '',
        publicationStatus: 'draft',
        publishedAt: null,
        updatedAt: '2026-08-07T10:02:00.000Z',
      },
    ]);
    const controller = new AdminCatalogController(repository);

    controller.setAccess(true, true);
    controller.selectResource('tag');
    await flush();
    expect(controller.getState().resourceKind).toBe('tag');
    expect(controller.getState().records[0]?.id).toBe('safe-harbor');

    resolveFirst?.([category]);
    await flush();
    expect(controller.getState().resourceKind).toBe('tag');
    expect(controller.getState().records[0]?.id).toBe('safe-harbor');
  });

  it('does not retry a failed mutation and exposes normalized conflict errors', async () => {
    const repository = new FakeRepository();
    repository.create.mockRejectedValue(new AdminCatalogRepositoryError('conflict', 'conflict'));
    const controller = new AdminCatalogController(repository);
    controller.setAccess(true, true);
    await flush();

    const saved = await controller.create({
      kind: 'category',
      id: 'category-new',
      slug: 'new',
      name: 'New',
      description: '',
      publicationStatus: 'draft',
    });

    expect(saved).toBe(false);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(controller.getState().issue?.code).toBe('conflict');
  });
});
