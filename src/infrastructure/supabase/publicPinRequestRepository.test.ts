import { describe, expect, test } from 'vitest';

import { PublicPinRequestRepositoryError } from '../../data-access/publicPinRequest';
import type { ValidatedPublicPinRequest } from '../../domain/publicPinRequest';
import { SupabasePublicPinRequestRepository } from './publicPinRequestRepository';

const PROJECT_URL = 'https://map026-test.supabase.co';
const LOCAL_PROJECT_URL = 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = 'sb_publishable_map026_test_key';
const LEGACY_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const LEGACY_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature';

const REQUEST: ValidatedPublicPinRequest = {
  senderName: 'Edu',
  proposedName: 'Torre del Alba',
  entityType: 'location',
  x: 1800,
  y: 1164.5,
  description: 'Un lugar descubierto durante la sesión.',
  reason: 'Sería útil para recordar el viaje.',
  honeypot: '',
};

describe('SupabasePublicPinRequestRepository', () => {
  test('posts only the closed RPC payload with the publishable key', async () => {
    let capturedRequest: Request | null = null;
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input, init) => {
        capturedRequest = new Request(input, init);
        return new Response('true', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await repository.submit(REQUEST, new AbortController().signal);

    expect(capturedRequest).not.toBeNull();
    if (!capturedRequest) return;
    expect(capturedRequest.method).toBe('POST');
    expect(new URL(capturedRequest.url).pathname).toBe('/rest/v1/rpc/submit_public_request');
    expect(capturedRequest.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    expect(capturedRequest.headers.has('authorization')).toBe(false);
    expect(await capturedRequest.json()).toEqual({
      p_sender_name: 'Edu',
      p_proposed_name: 'Torre del Alba',
      p_entity_type: 'location',
      p_x: 1800,
      p_y: 1164.5,
      p_description: 'Un lugar descubierto durante la sesión.',
      p_reason: 'Sería útil para recordar el viaje.',
      p_honeypot: '',
    });
  });

  test('accepts the legacy anon key only for the local stack', async () => {
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: LOCAL_PROJECT_URL,
      publishableKey: LEGACY_ANON_KEY,
      allowLocalProject: true,
      fetchImplementation: async () => new Response('true'),
    });

    await expect(repository.submit(REQUEST, new AbortController().signal)).resolves.toBeUndefined();
  });

  test.each([
    { projectUrl: LOCAL_PROJECT_URL, publishableKey: LEGACY_ANON_KEY, allowLocalProject: false },
    {
      projectUrl: LOCAL_PROJECT_URL,
      publishableKey: LEGACY_SERVICE_ROLE_KEY,
      allowLocalProject: true,
    },
    {
      projectUrl: 'https://example.com',
      publishableKey: PUBLISHABLE_KEY,
      allowLocalProject: false,
    },
  ])('rejects unsafe public configuration %#', (options) => {
    expect(
      () =>
        new SupabasePublicPinRequestRepository({
          ...options,
          fetchImplementation: async () => new Response('true'),
        }),
    ).toThrow(PublicPinRequestRepositoryError);
  });

  test.each([
    [429, 'rate-limited'],
    [400, 'rejected'],
    [503, 'server'],
  ] as const)('normalizes HTTP %s as %s', async (status, kind) => {
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => new Response('{}', { status }),
    });

    await expect(repository.submit(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      kind,
      status,
    });
  });

  test('normalizes fetch failures without leaking request content', async () => {
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => {
        throw new TypeError('offline');
      },
    });

    await expect(repository.submit(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      kind: 'network',
      status: null,
    });
  });

  test('requires the RPC to return the minimal boolean confirmation', async () => {
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => new Response('{"id":"must-not-be-returned"}'),
    });

    await expect(repository.submit(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });
});
