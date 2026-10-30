import type { PublicCatalogEnvelope } from '../../data-access/publicCatalog';
import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import { parsePublicCatalogSnapshotV3 } from './multicampaignSnapshotCodec';
import { parsePublicCatalogSnapshotV4 } from './multimapSnapshotCodec';
import { parsePublicCatalogSnapshotV2 } from '../supabase/publicCatalogRepository';

const SESSION_CACHE_KEY_V4 = 'castigo-divino-map:public-catalog:v4';
const SESSION_CACHE_KEY_V3 = 'castigo-divino-map:public-catalog:v3';
const SESSION_CACHE_KEY_V2 = 'castigo-divino-map:public-catalog:v2';

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
    let serializedV4: string | null;
    let serializedV3: string | null;
    let serializedV2: string | null;
    try {
      serializedV4 = this.#storage.getItem(SESSION_CACHE_KEY_V4);
      serializedV3 = this.#storage.getItem(SESSION_CACHE_KEY_V3);
      serializedV2 = this.#storage.getItem(SESSION_CACHE_KEY_V2);
    } catch (error) {
      throw new PublicDataRepositoryError(
        'cache-unavailable',
        'No se pudo leer la caché pública de la sesión.',
        { source: 'cache', cause: error },
      );
    }
    if (!serializedV4 && !serializedV3 && !serializedV2) return null;

    try {
      const parsed = serializedV4
        ? await parsePublicCatalogSnapshotV4(JSON.parse(serializedV4), this.#now)
        : serializedV3
          ? await parsePublicCatalogSnapshotV3(JSON.parse(serializedV3), this.#now)
          : await parsePublicCatalogSnapshotV2(JSON.parse(serializedV2!), this.#now);
      return { ...parsed, source: 'session-cache' };
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  async write(envelope: PublicCatalogEnvelope): Promise<void> {
    if (!['beta02','beta03','beta04'].includes(envelope.data.contract)) return;
    const key = envelope.data.contract === 'beta04' ? SESSION_CACHE_KEY_V4 :
      envelope.data.contract === 'beta03' ? SESSION_CACHE_KEY_V3 : SESSION_CACHE_KEY_V2;
    try {
      this.#storage.setItem(key, JSON.stringify(envelope.data.catalog));
      if (envelope.data.contract === 'beta04') {
        this.#storage.removeItem(SESSION_CACHE_KEY_V3);
        this.#storage.removeItem(SESSION_CACHE_KEY_V2);
      } else if (envelope.data.contract === 'beta03') this.#storage.removeItem(SESSION_CACHE_KEY_V2);
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
      this.#storage.removeItem(SESSION_CACHE_KEY_V4);
      this.#storage.removeItem(SESSION_CACHE_KEY_V3);
      this.#storage.removeItem(SESSION_CACHE_KEY_V2);
    } catch {
      // La caché es best-effort; el contenido validado en memoria permanece disponible.
    }
  }
}
