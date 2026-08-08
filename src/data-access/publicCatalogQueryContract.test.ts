import { describe, expect, test } from 'vitest';

import {
  fetchCompletePublicCatalogTable,
  PublicCatalogReadError,
  type PublicCatalogTableQuery,
} from './publicCatalogQueryContract.js';

const PROJECT_URL = 'https://map028-test.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_map028_test_key';
const QUERY: PublicCatalogTableQuery = {
  name: 'categories',
  select: 'id,slug,name,description',
  order: 'id.asc',
  published: true,
};

function response(rows: readonly Record<string, unknown>[], contentRange: string): Response {
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': contentRange,
    },
  });
}

function requestRangeStart(input: RequestInfo | URL, init?: RequestInit): number {
  const request = new Request(input, init);
  const match = /^(\d+)-(\d+)$/.exec(request.headers.get('range') ?? '');

  if (!match) {
    throw new Error('Expected a Range header.');
  }

  return Number(match[1]);
}

function expectPartialResponse(error: unknown): boolean {
  return error instanceof PublicCatalogReadError && error.kind === 'partial-response';
}

describe('shared public catalog pagination contract', () => {
  test('loads a complete multi-page collection using aligned ranges', async () => {
    const allRows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const ranges: string[] = [];

    const rows = await fetchCompletePublicCatalogTable({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      query: QUERY,
      pageSize: 2,
      signal: new AbortController().signal,
      fetchImplementation: async (input, init) => {
        const start = requestRangeStart(input, init);
        const pageRows = allRows.slice(start, start + 2);
        ranges.push(new Request(input, init).headers.get('range') ?? '');
        return response(pageRows, `${start}-${start + pageRows.length - 1}/${allRows.length}`);
      },
    });

    expect(rows).toEqual(allRows);
    expect(ranges).toEqual(['0-1', '2-3']);
  });

  test('rejects a shifted range even when the body length is plausible', async () => {
    await expect(
      fetchCompletePublicCatalogTable({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        query: QUERY,
        signal: new AbortController().signal,
        fetchImplementation: async () => response([{ id: 'a' }], '1-1/2'),
      }),
    ).rejects.toSatisfy(expectPartialResponse);
  });

  test('rejects a short page body relative to the advertised range', async () => {
    await expect(
      fetchCompletePublicCatalogTable({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        query: QUERY,
        signal: new AbortController().signal,
        fetchImplementation: async () => response([{ id: 'a' }], '0-1/2'),
      }),
    ).rejects.toSatisfy(expectPartialResponse);
  });

  test('rejects a total that changes between pages', async () => {
    await expect(
      fetchCompletePublicCatalogTable({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        query: QUERY,
        pageSize: 2,
        signal: new AbortController().signal,
        fetchImplementation: async (input, init) => {
          const start = requestRangeStart(input, init);
          return start === 0
            ? response([{ id: 'a' }, { id: 'b' }], '0-1/3')
            : response([{ id: 'c' }], '2-2/4');
        },
      }),
    ).rejects.toSatisfy(expectPartialResponse);
  });

  test('rejects an empty page before the declared collection is complete', async () => {
    await expect(
      fetchCompletePublicCatalogTable({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        query: QUERY,
        signal: new AbortController().signal,
        fetchImplementation: async () => response([], '*/3'),
      }),
    ).rejects.toSatisfy(expectPartialResponse);
  });

  test('fails closed when the collection cannot reach its advertised final total', async () => {
    let requestCount = 0;

    await expect(
      fetchCompletePublicCatalogTable({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        query: QUERY,
        pageSize: 2,
        signal: new AbortController().signal,
        fetchImplementation: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return response([{ id: 'a' }, { id: 'b' }], '0-1/3');
          }
          throw new TypeError('connection ended before the final row');
        },
      }),
    ).rejects.toMatchObject({ kind: 'network-unavailable' });
  });

  test('honors AbortSignal so callers can impose their own timeout', async () => {
    const controller = new AbortController();
    const promise = fetchCompletePublicCatalogTable({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      query: QUERY,
      signal: controller.signal,
      fetchImplementation: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const handleAbort = (): void => reject(new DOMException('Aborted', 'AbortError'));

          if (signal?.aborted) {
            handleAbort();
          } else {
            signal?.addEventListener('abort', handleAbort, { once: true });
          }
        }),
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ kind: 'request-aborted' });
  });
});
