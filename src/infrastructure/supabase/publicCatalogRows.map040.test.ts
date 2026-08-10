import { describe, expect, it } from 'vitest';

import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import { parseGeographicAlias } from './publicCatalogRows';

describe('MAP-040 geographic alias language codec', () => {
  it('accepts Spanish only for geographic aliases', () => {
    expect(
      parseGeographicAlias(
        {
          id: 'geo-alias-waterdeep-es',
          geographic_name_id: 'geo-waterdeep',
          language: 'es',
          value: 'Aguas Profundas',
        },
        0,
      ),
    ).toEqual({
      id: 'geo-alias-waterdeep-es',
      geographicNameId: 'geo-waterdeep',
      language: 'es',
      value: 'Aguas Profundas',
    });
  });

  it('keeps English aliases compatible and rejects unsupported languages', () => {
    expect(
      parseGeographicAlias(
        {
          id: 'geo-alias-waterdeep-city-of-splendors',
          geographic_name_id: 'geo-waterdeep',
          language: 'en',
          value: 'City of Splendors',
        },
        0,
      ).language,
    ).toBe('en');

    expect(() =>
      parseGeographicAlias(
        {
          id: 'geo-alias-waterdeep-fr',
          geographic_name_id: 'geo-waterdeep',
          language: 'fr',
          value: 'Eaux Profondes',
        },
        0,
      ),
    ).toThrow(PublicDataRepositoryError);
  });
});
