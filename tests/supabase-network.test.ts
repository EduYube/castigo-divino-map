import { describe, expect, it } from 'vitest';

import {
  BIND_ADDRESS,
  BIND_OPTION_NAME,
  NETWORK_DRIVER,
  isMissingNetworkError,
  validateNetworkInspection,
} from '../scripts/supabase-network.mjs';

function inspection(overrides: Record<string, unknown> = {}) {
  return JSON.stringify([
    {
      Driver: NETWORK_DRIVER,
      Options: {
        [BIND_OPTION_NAME]: BIND_ADDRESS,
      },
      ...overrides,
    },
  ]);
}

describe('Supabase Docker network validation', () => {
  it('accepts the expected bridge network bound to localhost', () => {
    expect(validateNetworkInspection(inspection())).toEqual({ ok: true });
  });

  it('rejects a pre-existing network with another driver', () => {
    expect(validateNetworkInspection(inspection({ Driver: 'host' }))).toEqual({
      ok: false,
      reason: 'Expected Docker network driver bridge, received host.',
    });
  });

  it('rejects a pre-existing network without the localhost binding option', () => {
    expect(validateNetworkInspection(inspection({ Options: {} }))).toEqual({
      ok: false,
      reason:
        'Expected com.docker.network.bridge.host_binding_ipv4=127.0.0.1, received undefined.',
    });
  });

  it('rejects a pre-existing network bound to all interfaces', () => {
    expect(
      validateNetworkInspection(
        inspection({
          Options: {
            [BIND_OPTION_NAME]: '0.0.0.0',
          },
        }),
      ),
    ).toEqual({
      ok: false,
      reason:
        'Expected com.docker.network.bridge.host_binding_ipv4=127.0.0.1, received 0.0.0.0.',
    });
  });

  it('rejects malformed inspection output and recognizes only missing-network errors', () => {
    expect(validateNetworkInspection('not-json')).toMatchObject({ ok: false });
    expect(
      isMissingNetworkError('Error response from daemon: network local not found'),
    ).toBe(true);
    expect(isMissingNetworkError('Cannot connect to the Docker daemon')).toBe(false);
  });
});
