import { expect, type Page } from '@playwright/test';

export interface FirstRemoteCheck {
  readonly state: string;
  readonly reason: string;
  readonly attempt: number;
  readonly source: string;
  readonly remoteSource: string;
  readonly ariaBusy: string | null;
}

// A complete remote acquisition can span three 5-second timeouts and jittered
// 2s/5s backoffs (~23.4s worst case). This is scoped to the published health
// contract; it does not change Playwright's global expect/test timeouts.
const FIRST_REMOTE_CHECK_TIMEOUT_MS = 30_000;

/**
 * Wait for the FIRST REMOTE CHECK to settle, not for the fallback to mount.
 *
 * Pages currently displays the initial bundled snapshot as
 * degraded/network-unavailable with attempt=0 before any remote conclusion.
 * The attempt counter is only >0 after refresh() publishes its final result.
 * This remains compatible with the existing published runtime and with a UI
 * that presents 'checking' during bootstrap.
 */
export async function waitForFirstRemoteCheck(page: Page): Promise<FirstRemoteCheck> {
  const handle = await page.waitForFunction(
    () => {
      const badge = document.querySelector<HTMLElement>('[data-backend-status]');
      if (!badge) return null;

      const state = badge.dataset.backendState ?? 'missing';
      const reason = badge.dataset.backendReason ?? 'none';
      const attempt = Number(badge.dataset.backendAttempt ?? '0');
      const completedAttempt = Number.isSafeInteger(attempt) && attempt > 0;
      const configurationFailure =
        state === 'degraded' &&
        (reason === 'configuration-missing' || reason === 'configuration-invalid');

      if (!completedAttempt && !configurationFailure && state !== 'offline') return null;

      return {
        state,
        reason,
        attempt,
        source: badge.dataset.dataSource ?? 'none',
        remoteSource: badge.dataset.remoteSource ?? 'none',
        ariaBusy: badge.getAttribute('aria-busy'),
      };
    },
    undefined,
    { timeout: FIRST_REMOTE_CHECK_TIMEOUT_MS },
  );
  return (await handle.jsonValue()) as FirstRemoteCheck;
}

/** A remote outage/configuration failure is a published health failure,
 * even when the public snapshot remains fully functional. */
export async function expectPublishedRemoteConnected(page: Page): Promise<void> {
  const result = await waitForFirstRemoteCheck(page);
  expect(
    result,
    `Published remote check finished without connected: ${JSON.stringify(result)}`,
  ).toMatchObject({
    state: 'connected',
    reason: 'none',
    ariaBusy: 'false',
  });
  expect(result.attempt).toBeGreaterThanOrEqual(1);
}
