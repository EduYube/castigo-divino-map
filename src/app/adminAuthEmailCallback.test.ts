import { describe, expect, test } from 'vitest';

import { parseAdminAuthEmailCallback } from './adminAuthEmailCallback';

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createAccessToken(payload: Record<string, unknown>): string {
  return `${encodeBase64Url('{}')}.${encodeBase64Url(JSON.stringify(payload))}.signature`;
}

describe('parseAdminAuthEmailCallback', () => {
  test('parses an implicit recovery callback without exposing credentials outside the returned session', () => {
    const accessToken = createAccessToken({
      sub: 'fc24e545-7352-4770-8288-7a382b29317f',
      email: 'admin@example.test',
      exp: 1_786_272_000,
    });
    const url = new URL('https://example.test/castigo-divino-map/');
    url.hash = new URLSearchParams({
      access_token: accessToken,
      refresh_token: 'refresh-token',
      expires_in: '3600',
      type: 'recovery',
      token_type: 'bearer',
    }).toString();

    expect(parseAdminAuthEmailCallback(url, 1_786_268_400_000)).toEqual({
      accessToken,
      refreshToken: 'refresh-token',
      expiresAt: 1_786_272_000,
      userId: 'fc24e545-7352-4770-8288-7a382b29317f',
      email: 'admin@example.test',
      type: 'recovery',
    });
  });

  test('uses expires_in when the callback token has no exp claim', () => {
    const accessToken = createAccessToken({ sub: 'user-id', email: null });
    const url = new URL('https://example.test/');
    url.hash = new URLSearchParams({
      access_token: accessToken,
      refresh_token: 'refresh-token',
      expires_in: '120',
      type: 'magiclink',
    }).toString();

    expect(parseAdminAuthEmailCallback(url, 1_000_000)).toMatchObject({
      expiresAt: 1_120,
      userId: 'user-id',
      type: 'magiclink',
    });
  });

  test('ignores ordinary fragments and incomplete auth callbacks', () => {
    expect(parseAdminAuthEmailCallback(new URL('https://example.test/#map'))).toBeNull();
    expect(
      parseAdminAuthEmailCallback(
        new URL('https://example.test/#access_token=token-without-refresh-token'),
      ),
    ).toBeNull();
  });
});
