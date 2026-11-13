import { expect, test, type Page, type Request } from '@playwright/test';

import { expectPublishedRemoteConnected, waitForFirstRemoteCheck } from './remote-health';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

function isPublishedPages(): boolean {
  return Boolean(process.env.PAGES_URL);
}

type Qa226NetworkEvent = {
  readonly ms: number;
  readonly phase: 'request' | 'response' | 'failure';
  readonly url: string;
  readonly status?: number;
  readonly error?: string;
};

const diagnostics = new WeakMap<
  Page,
  { readonly started: number; readonly events: Qa226NetworkEvent[] }
>();

function safePublicRestPath(rawUrl: string): string | null {
  const url = new URL(rawUrl);
  if (!url.pathname.startsWith('/rest/v1/')) return null;
  // Exclude all query parameters and headers, including API keys and tokens.
  return `${url.origin}${url.pathname}`;
}

test.beforeEach(async ({ page }) => {
  const started = Date.now();
  const events: Qa226NetworkEvent[] = [];
  const startedRequests = new WeakMap<Request, number>();
  diagnostics.set(page, { started, events });

  page.on('request', (request) => {
    const url = safePublicRestPath(request.url());
    if (!url) return;
    startedRequests.set(request, Date.now());
    events.push({ ms: Date.now() - started, phase: 'request', url });
  });
  page.on('response', (response) => {
    const request = response.request();
    const url = safePublicRestPath(response.url());
    if (!url) return;
    const startedAt = startedRequests.get(request);
    events.push({
      ms: Date.now() - started,
      phase: 'response',
      url,
      status: response.status(),
      ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
    } as Qa226NetworkEvent);
  });
  page.on('requestfailed', (request) => {
    const url = safePublicRestPath(request.url());
    if (!url) return;
    const failure = request.failure()?.errorText ?? '';
    events.push({
      ms: Date.now() - started,
      phase: 'failure',
      url,
      error: failure.match(/net::ERR_[A-Z_]+|aborted|timeout/i)?.[0] ?? 'other',
    });
  });

  await page.addInitScript(() => {
    const timeline: Record<string, unknown>[] = [];
    (window as Window & { __QA226_TIMELINE__?: Record<string, unknown>[] }).__QA226_TIMELINE__ =
      timeline;

    const start = Date.now();
    window.addEventListener('atlas:public-data-status', (event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      timeline.push({
        ms: Date.now() - start,
        kind: 'public-data-status',
        backendState: detail.backendState,
        availability: detail.availability,
        source: detail.source,
        remoteSource: detail.remoteSource,
        reason: detail.reason,
        checkedAt: detail.checkedAt,
      });
    });
    let previous = '';
    const observer = new MutationObserver(() => {
      const badge = document.querySelector<HTMLElement>('[data-backend-status]');
      if (!badge) return;
      const snapshot = {
        state: badge.dataset.backendState ?? 'missing',
        reason: badge.dataset.backendReason ?? 'none',
        attempt: badge.dataset.backendAttempt ?? '0',
        source: badge.dataset.dataSource ?? 'none',
        remoteSource: badge.dataset.remoteSource ?? 'none',
        ariaBusy: badge.getAttribute('aria-busy'),
      };
      const key = JSON.stringify(snapshot);
      if (key === previous) return;
      previous = key;
      timeline.push({ ms: Date.now() - start, kind: 'badge', ...snapshot });
    });
    observer.observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        'data-backend-state',
        'data-backend-reason',
        'data-backend-attempt',
        'data-data-source',
        'data-remote-source',
        'aria-busy',
      ],
    });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const recorded = diagnostics.get(page);
  if (!recorded) return;
  const browser = await page
    .evaluate(
      () =>
        (window as Window & { __QA226_TIMELINE__?: Record<string, unknown>[] })
          .__QA226_TIMELINE__ ?? [],
    )
    .catch(() => []);
  const summary = { network: recorded.events, backendTimeline: browser };
  if (process.env.QA226_DIAGNOSTICS === '1' || testInfo.status !== testInfo.expectedStatus) {
    console.log(`[QA226] ${JSON.stringify(summary)}`);
    await testInfo.attach('qa226-connectivity-timeline.json', {
      body: JSON.stringify(summary, null, 2),
      contentType: 'application/json',
    });
  }
});

test('publishes the MAP-021 Waterdeep geographic search contract', async ({ page }) => {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  if (!isPublishedPages()) {
    await page.route('**/rest/v1/**', async (route) => {
      await route.abort('connectionrefused');
    });
  }

  const response = await page.goto('?q=Waterdeep');
  expect(response?.ok()).toBe(true);

  const result = page.getByRole('button', {
    name: /Waterdeep.*Lugar geográfico.*Coincidencia por nombre principal/i,
  });
  await expect(result).toBeVisible();
  await result.click();

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');

  // FUNCTIONAL AVAILABILITY above is independent of the remote backend.
  // HEALTH below waits for refresh(), not the provisional attempt=0 fallback.
  // A terminal degraded/configuration failure still FAILS the published smoke.
  if (isPublishedPages()) {
    await expectPublishedRemoteConnected(page);
  } else {
    const result = await waitForFirstRemoteCheck(page);
    expect(
      result.state === 'connected' ||
        (result.state === 'degraded' &&
          (result.reason === 'configuration-missing' || result.reason === 'network-unavailable')),
      `Local Pages expected a usable, explicitly settled fallback: ${JSON.stringify(result)}`,
    ).toBe(true);
  }
});
