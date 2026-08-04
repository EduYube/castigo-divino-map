import { describe, expect, it } from 'vitest';

import { campaignCatalog } from './catalog';
import {
  buildPlaceDetailModel,
  createPlaceMarkerModels,
  getPublicNotesForPlace,
} from './placeDetails';

describe('public place presentation models', () => {
  it('creates one marker model per place using the shared coordinate conversion', () => {
    const markers = createPlaceMarkerModels(campaignCatalog);

    expect(markers).toHaveLength(campaignCatalog.places.length);
    expect(markers[0]).toMatchObject({
      id: 'place-demo-harbor',
      categoryName: 'Asentamiento',
      coordinate: [820, 1080.5],
    });
    expect(markers[1]).toMatchObject({
      id: 'place-demo-pass',
      categoryName: 'Lugar destacado',
      coordinate: [1240.25, 2240],
    });
  });

  it('resolves the category, tags, aliases and public notes for a place', () => {
    const details = buildPlaceDetailModel(campaignCatalog, 'place-demo-harbor');

    expect(details).toMatchObject({
      name: 'Puerto de demostración',
      aliases: ['Puerto de ejemplo'],
      category: { name: 'Asentamiento' },
      tags: [
        { name: 'Costero' },
        { name: 'Dato de demostración' },
        { name: 'Ruta comercial' },
      ],
      notes: [
        {
          title: 'Información pública de demostración',
          body: expect.stringContaining('puerto ficticio'),
        },
      ],
    });
  });

  it('obtains every public note by placeId without a redundant inverse relation', () => {
    expect(getPublicNotesForPlace(campaignCatalog, 'place-demo-pass')).toEqual([
      campaignCatalog.notes[1],
    ]);
  });

  it('returns undefined for an unknown place', () => {
    expect(buildPlaceDetailModel(campaignCatalog, 'place-unknown')).toBeUndefined();
  });
});
