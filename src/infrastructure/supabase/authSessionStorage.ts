import { AuthGatewayError } from '../../auth/authGateway';

export const AUTH_SESSION_STORAGE_KEY = 'castigo-divino-map:auth:v1';
const STORAGE_PROBE_KEY = `${AUTH_SESSION_STORAGE_KEY}:probe`;

export class BrowserAuthSessionStorage {
  readonly #storage: Storage;

  constructor(storage: Storage = window.sessionStorage) {
    this.#storage = storage;
  }

  assertAvailable(): void {
    try {
      this.#storage.setItem(STORAGE_PROBE_KEY, '1');
      this.#storage.removeItem(STORAGE_PROBE_KEY);
    } catch {
      throw new AuthGatewayError(
        'storage-unavailable',
        'Session storage is not available for administrative authentication.',
      );
    }
  }

  getItem(key: string): string | null {
    try {
      return this.#storage.getItem(key);
    } catch {
      throw new AuthGatewayError(
        'storage-unavailable',
        'Administrative authentication storage could not be read.',
      );
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.#storage.setItem(key, value);
    } catch {
      throw new AuthGatewayError(
        'storage-unavailable',
        'Administrative authentication storage could not be written.',
      );
    }
  }

  removeItem(key: string): void {
    try {
      this.#storage.removeItem(key);
    } catch {
      throw new AuthGatewayError(
        'storage-unavailable',
        'Administrative authentication storage could not be cleared.',
      );
    }
  }
}
