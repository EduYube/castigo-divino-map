import { describe, expect, test } from 'vitest';

import { isMasterOnlyMapAnnouncement } from './masterMapAnnouncement';

describe('Master map announcement revocation', () => {
  const masterNames = new Set(['MAP080 LOCAL MASTER SECRET']);

  test('recognizes the synchronous Leaflet marker selection announcement', () => {
    const announcement = 'MAP080 LOCAL MASTER SECRET, personaje, seleccionado en el mapa.';
    expect(isMasterOnlyMapAnnouncement(announcement, masterNames)).toBe(true);
  });

  test('recognizes deferred private detail and search-focus announcements', () => {
    const privateAnnouncements = [
      'MAP080 LOCAL MASTER SECRET, personaje, seleccionado en el mapa. Ficha compacta abierta. Contenido del Máster.',
      'Mapa centrado en MAP080 LOCAL MASTER SECRET, personaje, contenido del Máster; posición resaltada.',
    ];
    for (const announcement of privateAnnouncements) {
      expect(isMasterOnlyMapAnnouncement(announcement, masterNames)).toBe(true);
    }
  });

  test('never clears unrelated public announcements during Master revocation', () => {
    const publicAnnouncements = [
      'Mapa centrado en Neverwinter, lugar geográfico; posición resaltada.',
      'Veyra, personaje, seleccionado en el mapa.',
      '',
    ];
    for (const announcement of publicAnnouncements) {
      expect(isMasterOnlyMapAnnouncement(announcement, masterNames)).toBe(false);
    }
  });

  test('does not clear a partial public-name match', () => {
    const publicAnnouncement = 'Neverwinter MASTER SECRET, lugar público.';
    expect(isMasterOnlyMapAnnouncement(publicAnnouncement, masterNames)).toBe(false);
  });
});
