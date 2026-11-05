import { describe, expect, test } from 'vitest';

import { isMasterOnlyMapAnnouncement } from './masterMapAnnouncement';

describe('Master map announcement revocation', () => {
  const masterNames = new Set(['MAP080 LOCAL MASTER SECRET']);

  test('recognizes the synchronous Leaflet marker selection announcement', () => {
    expect(
      isMasterOnlyMapAnnouncement(
        'MAP080 LOCAL MASTER SECRET, personaje, seleccionado en el mapa.',
        masterNames,
      ),
    ).toBe(true);
  });

  test('recognizes deferred private detail and search-focus announcements', () => {
    expect(
      isMasterOnlyMapAnnouncement(
        'MAP080 LOCAL MASTER SECRET, personaje, seleccionado en el mapa. Ficha compacta abierta. Contenido del Máster.',
        masterNames,
      ),
    ).toBe(true);
    expect(
      isMasterOnlyMapAnnouncement(
        'Mapa centrado en MAP080 LOCAL MASTER SECRET, personaje, contenido del Máster; posición resaltada.',
        masterNames,
      ),
    ).toBe(true);
  });

  test('never clears unrelated public announcements during Master revocation', () => {
    expect(
      isMasterOnlyMapAnnouncement(
        'Mapa centrado en Neverwinter, lugar geográfico; posición resaltada.',
        masterNames,
      ),
    ).toBe(false);
    expect(
      isMasterOnlyMapAnnouncement(
        'Veyra, personaje, seleccionado en el mapa.',
        masterNames,
      ),
    ).toBe(false);
    expect(isMasterOnlyMapAnnouncement('', masterNames)).toBe(false);
  });

  test('does not clear a partial public-name match', () => {
    const publicAnnouncement = 'Neverwinter MASTER SECRET, lugar público.';
    expect(isMasterOnlyMapAnnouncement(publicAnnouncement, masterNames)).toBe(false);
  });
});
