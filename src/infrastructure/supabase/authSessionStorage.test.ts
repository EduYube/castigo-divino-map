import { describe, expect, test } from 'vitest';

import { AuthGatewayError } from '../../auth/authGateway';
import { BrowserAuthSessionStorage } from './authSessionStorage';

class ThrowingStorage implements Storage {
  readonly length = 0;

  clear(): void {
    throw new Error('storage unavailable');
  }

  getItem(): string | null {
    throw new Error('storage unavailable');
  }

  key(): string | null {
    return null;
  }

  removeItem(): void {
    throw new Error('storage unavailable');
  }

  setItem(): void {
    throw new Error('storage unavailable');
  }
}

function expectStorageError(callback: () => unknown): void {
  try {
    callback();
    throw new Error('expected storage operation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthGatewayError);
    expect(error).toMatchObject({ code: 'storage-unavailable' });
    expect(String(error)).not.toContain('storage unavailable');
  }
}

describe('BrowserAuthSessionStorage', () => {
  test('normalizes storage availability failures without preserving browser detail', () => {
    const storage = new BrowserAuthSessionStorage(new ThrowingStorage());

    expectStorageError(() => storage.assertAvailable());
    expectStorageError(() => storage.getItem('auth'));
    expectStorageError(() => storage.setItem('auth', 'value'));
    expectStorageError(() => storage.removeItem('auth'));
  });
});
