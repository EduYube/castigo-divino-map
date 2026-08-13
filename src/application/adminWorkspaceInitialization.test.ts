import { describe, expect, it, vi } from 'vitest';

import type { AdminCatalogRepository } from '../data-access/adminCatalog';
import type { AdminMapEntityRepository } from '../data-access/adminMapEntities';
import type { AdminMapEntityReferences } from '../domain/adminMapEntities';
import { AdminCatalogController } from './adminCatalogController';
import { AdminMapEntityController } from './adminMapEntityController';

const EMPTY_REFERENCES: AdminMapEntityReferences = {
  categories: [],
  tags: [],
  players: [],
};

function createEmptyCatalogRepository(): AdminCatalogRepository {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error('unused');
    }),
    update: vi.fn(async () => {
      throw new Error('unused');
    }),
    archive: vi.fn(async () => {
      throw new Error('unused');
    }),
    delete: vi.fn(async () => undefined),
    listEntityReferences: vi.fn(async () => []),
    listGeographicNameReferences: vi.fn(async () => []),
  };
}

function createEmptyEntityRepository(): AdminMapEntityRepository {
  return {
    list: vi.fn(async () => []),
    loadReferences: vi.fn(async () => EMPTY_REFERENCES),
    load: vi.fn(async () => {
      throw new Error('unused');
    }),
    uploadPortrait: vi.fn(async () => {
      throw new Error('unused');
    }),
    deletePortrait: vi.fn(async () => undefined),
    save: vi.fn(async () => {
      throw new Error('unused');
    }),
    delete: vi.fn(async () => undefined),
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('administrative workspace initialization', () => {
  it('keeps an empty catalog ready when access is emitted repeatedly with the same values', async () => {
    const repository = createEmptyCatalogRepository();
    const controller = new AdminCatalogController(repository);

    controller.setAccess(true, true);
    await settle();

    expect(controller.getState().phase).toBe('ready');
    expect(repository.list).toHaveBeenCalledTimes(1);

    controller.setAccess(true, true);
    await settle();

    expect(controller.getState().phase).toBe('ready');
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it('keeps empty entity references ready when access is emitted repeatedly with the same values', async () => {
    const repository = createEmptyEntityRepository();
    const controller = new AdminMapEntityController(repository);

    controller.setAccess(true, true);
    await settle();

    expect(controller.getState().phase).toBe('ready');
    expect(repository.list).toHaveBeenCalledTimes(1);
    expect(repository.loadReferences).toHaveBeenCalledTimes(1);

    controller.setAccess(true, true);
    await settle();

    expect(controller.getState().phase).toBe('ready');
    expect(repository.list).toHaveBeenCalledTimes(1);
    expect(repository.loadReferences).toHaveBeenCalledTimes(1);
  });
});
