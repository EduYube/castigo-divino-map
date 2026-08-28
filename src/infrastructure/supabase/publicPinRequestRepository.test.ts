import { describe, expect, test } from 'vitest';

import { PublicPinRequestRepositoryError } from '../../data-access/publicPinRequest';
import type { ValidatedPublicPinRequest } from '../../domain/publicPinRequest';
import { SupabasePublicPinRequestRepository } from './publicPinRequestRepository';

const PROJECT_URL = 'https://map026-test.supabase.co';
const LOCAL_PROJECT_URL = 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = 'sb_publishable_map026_test_key';
const LEGACY_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const LEGACY_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000054';
const SUBMISSION_TOKEN =
  '00000000-0000-4000-8000-000000000054.1788048000.56000000-0000-4000-8000-000000000001.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

function bindingBody(campaignId = CAMPAIGN_ID): string {
  return JSON.stringify({
    campaign_id: campaignId,
    campaign_slug: 'campaign-b',
    campaign_name: 'Campaña B',
    submission_token: SUBMISSION_TOKEN,
    expires_at: '2026-08-29T01:15:00.000Z',
  });
}

const successfulFetch: typeof fetch = async (input) => {
  const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
  return pathname.endsWith('/begin_public_request_submission')
    ? new Response(bindingBody(), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

describe('SupabasePublicPinRequestRepository', () => {
  test('binds the selected campaign before posting a campaign-free submission payload', async () => {
    const capturedRequests: Request[] = [];
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input, init) => {
        const request = new Request(input, init);
        capturedRequests.push(request);
        return request.url.endsWith('/begin_public_request_submission')
          ? new Response(bindingBody(), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response('true', {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
      },
    });

    await repository.submit(REQUEST, CAMPAIGN_ID, new AbortController().signal);

    expect(capturedRequests).toHaveLength(2);
    const bindingRequest = capturedRequests[0];
    const submissionRequest = capturedRequests[1];
    expect(bindingRequest).toBeDefined();
    expect(submissionRequest).toBeDefined();
    if (!bindingRequest || !submissionRequest) return;

    expect(bindingRequest.method).toBe('POST');
    expect(new URL(bindingRequest.url).pathname).toBe(
      '/rest/v1/rpc/begin_public_request_submission',
    );
    expect(bindingRequest.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    expect(bindingRequest.headers.has('authorization')).toBe(false);
    expect(await bindingRequest.json()).toEqual({ p_campaign_id: CAMPAIGN_ID });

    expect(submissionRequest.method).toBe('POST');
    expect(new URL(submissionRequest.url).pathname).toBe('/rest/v1/rpc/submit_public_request_v3');
    expect(submissionRequest.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    expect(submissionRequest.headers.has('authorization')).toBe(false);
    expect(await submissionRequest.json()).toEqual({
      p_submission_token: SUBMISSION_TOKEN,
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

  test('rejects a malformed campaign id before making a network request', async () => {
    let requests = 0;
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => {
        requests += 1;
        return new Response('true');
      },
    });

    await expect(
      repository.submit(REQUEST, 'not-a-campaign', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'configuration' });
    expect(requests).toBe(0);
  });

  test('rejects a backend binding for a different campaign before submitting content', async () => {
    let requests = 0;
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => {
        requests += 1;
        return new Response(bindingBody('00000000-0000-4000-8000-000000000053'), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await expect(
      repository.submit(REQUEST, CAMPAIGN_ID, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'invalid-response' });
    expect(requests).toBe(1);
  });

  test('accepts the legacy anon key only for the local stack', async () => {
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: LOCAL_PROJECT_URL,
      publishableKey: LEGACY_ANON_KEY,
      allowLocalProject: true,
      fetchImplementation: successfulFetch,
    });

    await expect(
      repository.submit(REQUEST, CAMPAIGN_ID, new AbortController().signal),
    ).resolves.toBeUndefined();
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
          fetchImplementation: successfulFetch,
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

    await expect(
      repository.submit(REQUEST, CAMPAIGN_ID, new AbortController().signal),
    ).rejects.toMatchObject({
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

    await expect(
      repository.submit(REQUEST, CAMPAIGN_ID, new AbortController().signal),
    ).rejects.toMatchObject({
      kind: 'network',
      status: null,
    });
  });

  test('requires the submission RPC to return the minimal boolean confirmation', async () => {
    const repository = new SupabasePublicPinRequestRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
        return pathname.endsWith('/begin_public_request_submission')
          ? new Response(bindingBody(), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response('{"id":"must-not-be-returned"}', {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
      },
    });

    await expect(
      repository.submit(REQUEST, CAMPAIGN_ID, new AbortController().signal),
    ).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });
});
