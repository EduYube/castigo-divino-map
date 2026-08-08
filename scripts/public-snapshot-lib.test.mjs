import { expect, test } from 'vitest';

import { loadRemotePublicRows } from './public-snapshot-lib.mjs';

test('remote snapshot reads have an explicit abortable timeout', async () => {
  const pendingFetch = async (_input, init) =>
    await new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const handleAbort = () => reject(new DOMException('Aborted', 'AbortError'));

      if (signal?.aborted) {
        handleAbort();
      } else {
        signal?.addEventListener('abort', handleAbort, { once: true });
      }
    });

  await expect(
    loadRemotePublicRows({
      projectUrl: 'https://map028-test.supabase.co',
      publishableKey: 'sb_publishable_map028_test_key',
      fetchImplementation: pendingFetch,
      timeoutMs: 20,
    }),
  ).rejects.toThrow('Remote public catalog read timed out after 20 ms.');
});
