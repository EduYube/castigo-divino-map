import type { PublicCatalogEnvelope } from '../../data-access/publicCatalog';
import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import { parsePublicCatalogSnapshotV2 } from '../supabase/publicCatalogRepository';

const SESSION_CACHE_KEY = 'castigo-divino-map:public-catalog:v2';

export interface PublicCatalogSessionCache {
  read(): Promise<PublicCatalogEnvelope | null>;
  write(envelope: PublicCatalogEnvelope): Promise<void>;
  clear(): void;
}

export class BrowserPublicCatalogSessionCache implements PublicCatalogSessionCache {
  readonly #storage: Storage;
  readonly #now: () => number;

  constructor(storage: Storage = window.sessionStorage, now: () => number = Date.now) {
    this.#storage = storage;
    this.#now = now;
  }

  async read(): Promise<PublicCatalogEnvelope | null> {
    let serialized: string | null;

    try {
      serialized = this.#storage.getItem(SESSION_CACHE_KEY);
    } catch (error) {
      throw new PublicDataRepositoryError(
        'cache-unavailable',
        'No se pudo leer la caché pública de la sesión.',
        { source: 'cache', cause: error },
      );
    }

    if (!serialized) {
      return null;
    }

    try {
      const parsed = await parsePublicCatalogSnapshotV2(JSON.parse(serialized), this.#now);

      return {
        ...parsed,
        source: 'session-cache',
      };
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  async write(envelope: PublicCatalogEnvelope): Promise<void> {
    if (envelope.data.contract !== 'beta02') {
      return;
    }

    try {
      this.#storage.setItem(SESSION_CACHE_KEY, JSON.stringify(envelope.data.catalog));
    } catch (error) {
      throw new PublicDataRepositoryError(
        'cache-unavailable',
        'No se pudo guardar la caché pública de la sesión.',
        { source: 'cache', cause: error },
      );
    }
  }

  clear(): void {
    try {
      this.#storage.removeItem(SESSION_CACHE_KEY);
    } catch {
      // La caché es best-effort; el contenido validado en memoria permanece disponible.
    }
  }
}
