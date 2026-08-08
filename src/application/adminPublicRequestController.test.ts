import { describe, expect, it, vi } from 'vitest';
import {
  AdminPublicRequestRepositoryError,
  type AdminPublicRequestRepository,
} from '../data-access/adminPublicRequests';
import type {
  AdminPublicRequestModerationResult,
  AdminPublicRequestRecord,
} from '../domain/adminPublicRequests';
import { AdminPublicRequestController } from './adminPublicRequestController';

const PENDING: AdminPublicRequestRecord = {
  id: '10000000-0000-4000-8000-000000000271',
  senderName: 'Visitor',
  proposedName: 'Requested Place',
  entityType: 'location',
  x: 1200,
  y: 900,
  description: 'Description',
  reason: 'Reason',
  requestStatus: 'pending',
  moderatorUserId: null,
  moderationNote: null,
  convertedEntityId: null,
  moderatedAt: null,
  createdAt: '2026-08-08T10:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z',
};

function processed(
  status: 'rejected' | 'converted',
  draftEntityId: string | null,
): AdminPublicRequestModerationResult {
  return {
    request: {
      ...PENDING,
      requestStatus: status,
      moderationNote: 'Reviewed',
      moderatorUserId: '00000000-0000-4000-8000-000000000001',
      moderatedAt: '2026-08-08T11:00:00.000Z',
      convertedEntityId: draftEntityId,
      updatedAt: '2026-08-08T11:00:00.000Z',
    },
    draftEntityId,
  };
}

class FakeRepository implements AdminPublicRequestRepository {
  listResult: readonly AdminPublicRequestRecord[] = [PENDING];
  rejectResult = processed('rejected', null);
  convertResult = processed('converted', 'entity-request-1000');
  convertPromise: Promise<AdminPublicRequestModerationResult> | null = null;
  readonly reject = vi.fn(async () => this.rejectResult);
  readonly convert = vi.fn(async () => {
    if (this.convertPromise) return this.convertPromise;
    return this.convertResult;
  });

  async list(): Promise<readonly AdminPublicRequestRecord[]> {
    return this.listResult;
  }
}

async function readyController(
  repository: AdminPublicRequestRepository,
  onAuthorizationRejected?: (status: 401 | 403) => void,
): Promise<AdminPublicRequestController> {
  const controller = new AdminPublicRequestController(repository, { onAuthorizationRejected });
  controller.setAccess(true, true);
  await controller.reload();
  return controller;
}

describe('AdminPublicRequestController', () => {
  it('replaces a pending request with the audited rejected result', async () => {
    const repository = new FakeRepository();
    const controller = await readyController(repository);

    await expect(controller.reject(PENDING, 'Reviewed')).resolves.toBe(true);
    expect(repository.reject).toHaveBeenCalledOnce();
    expect(controller.getState().records[0]?.requestStatus).toBe('rejected');
    expect(controller.getState().phase).toBe('ready');
  });

  it('prevents a second client action while one moderation request is in flight', async () => {
    const repository = new FakeRepository();
    let resolveConversion!: (result: AdminPublicRequestModerationResult) => void;
    repository.convertPromise = new Promise((resolve) => {
      resolveConversion = resolve;
    });
    const controller = await readyController(repository);

    const first = controller.convert(PENDING, '');
    expect(controller.getState().phase).toBe('mutating');
    await expect(controller.reject(PENDING, '')).resolves.toBe(false);
    expect(repository.reject).not.toHaveBeenCalled();

    resolveConversion(repository.convertResult);
    await expect(first).resolves.toEqual(repository.convertResult);
    expect(repository.convert).toHaveBeenCalledOnce();
  });

  it('invalidates administrative access when the backend reports an expired session', async () => {
    const onAuthorizationRejected = vi.fn();
    const repository: AdminPublicRequestRepository = {
      async list() {
        throw new AdminPublicRequestRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado.',
          { status: 401 },
        );
      },
      async reject() {
        throw new Error('not used');
      },
      async convert() {
        throw new Error('not used');
      },
    };
    const controller = new AdminPublicRequestController(repository, { onAuthorizationRejected });

    controller.setAccess(true, true);
    await controller.reload();

    expect(onAuthorizationRejected).toHaveBeenCalledWith(401);
    expect(controller.getState().phase).toBe('blocked');
  });
});
