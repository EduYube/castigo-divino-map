import { describe, expect, test } from 'vitest';

import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import { SupabasePublicCatalogRepository } from './publicCatalogRepository';

const PROJECT_URL = 'https://map016-test.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_map016_test_key';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SupabasePublicCatalogRepository', () => {
  test('loads the complete public projection using only the apikey header', async () => {
    const requests: Request[] = [];
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse([]);
      },
      now: () => Date.parse('2026-08-06T00:00:00.000Z'),
    });

    const result = await repository.load({ signal: new AbortController().signal });

    expect(result.source).toBe('supabase');
    expect(result.data.contract).toBe('beta02');
    expect(requests).toHaveLength(12);
    requests.forEach((request) => {
      expect(request.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
      expect(request.headers.has('authorization')).toBe(false);
    });
  });

  test('uses an explicit published filter for every editorial table', async () => {
    const urls: URL[] = [];
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        urls.push(new URL(String(input)));
        return jsonResponse([]);
      },
    });

    await repository.load({ signal: new AbortController().signal });

    const dispositionUrl = urls.find((url) => url.pathname.endsWith('/entity_player_dispositions'));
    expect(dispositionUrl?.searchParams.has('publication_status')).toBe(false);
    urls
      .filter((url) => url !== dispositionUrl)
      .forEach((url) => expect(url.searchParams.get('publication_status')).toBe('eq.published'));
  });

  test('normalizes an HTTP failure without exposing the response body', async () => {
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => new Response('sensitive body', { status: 503 }),
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject<
      Partial<PublicDataRepositoryError>
    >({
      code: 'http-error',
      status: 503,
    });
  });

  test('rejects malformed public rows before they enter application state', async () => {
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        const url = new URL(String(input));

        if (url.pathname.endsWith('/categories')) {
          return jsonResponse([
            {
              id: 'draft-category-without-prefix',
              slug: 'invalid',
              name: 'Invalid',
              description: 'Invalid',
            },
          ]);
        }

        return jsonResponse([]);
      },
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject<
      Partial<PublicDataRepositoryError>
    >({ code: 'invalid-response' });
  });
});
