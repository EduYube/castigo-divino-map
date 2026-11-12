import { describe, expect, test } from 'vitest';

import type { EntityId } from '../data/beta02-model';
import {
  createMapAnnouncementController,
  type MapAnnouncementOrigin,
} from './masterMapAnnouncement';

describe('QA-219: structured Master announcement revocation', () => {
  const name = 'Nombre compartido MAP219';
  const publicId: EntityId = 'entity-map219-public-collision';
  const masterId: EntityId = 'entity-map219-master-collision';
  const otherMasterId: EntityId = 'entity-map219-other-master';

  const publicOrigin: MapAnnouncementOrigin = {
    entityId: publicId,
    audience: 'public',
    source: 'pin-selection',
    sourceId: publicId,
  };
  const masterOrigin: MapAnnouncementOrigin = {
    entityId: masterId,
    audience: 'master',
    source: 'pin-selection',
    sourceId: masterId,
  };
  function setup() {
    const status = { textContent: '' };
    return { status, announcements: createMapAnnouncementController(status) };
  }

  test('sensitivity: byte-identical public/Master names preserve the public origin', () => {
    const { status, announcements } = setup();
    const publicAnnouncement = `${name}, personaje, seleccionado en el mapa.`;
    const masterAnnouncement = `${name}, personaje, seleccionado en el mapa.`;
    expect(publicAnnouncement).toBe(masterAnnouncement);
    announcements.write(publicAnnouncement, publicOrigin);
    announcements.clearRevoked(new Set([masterId]));
    expect(status.textContent).toBe(publicAnnouncement);
    expect(announcements.getOrigin()).toEqual(publicOrigin);
  });

  test('revoking the current Master ID removes its message and metadata', () => {
    const { status, announcements } = setup();
    announcements.write(`${name}, personaje. Contenido del Máster.`, masterOrigin);
    announcements.clearRevoked(new Set([masterId]));
    expect(status.textContent).toBe('');
    expect(announcements.getOrigin()).toBeNull();
  });

  test('revoking Master A leaves a different Master B announcement intact', () => {
    const { status, announcements } = setup();
    const other = { ...masterOrigin, entityId: otherMasterId };
    announcements.write(name, other);
    announcements.clearRevoked(new Set([masterId]));
    expect(status.textContent).toBe(name);
    expect(announcements.getOrigin()).toEqual(other);
  });

  test('public navigation without entity ID survives even same-name revocation', () => {
    const { status, announcements } = setup();
    const navigation: MapAnnouncementOrigin = {
      entityId: null,
      audience: 'public',
      source: 'local-navigation',
    };
    announcements.write('Mapa local de Neverwinter abierto.', navigation);
    announcements.clearRevoked(new Set([masterId]));
    expect(status.textContent).toBe('Mapa local de Neverwinter abierto.');
    expect(announcements.getOrigin()).toEqual(navigation);
  });

  test('Master to public replacement wins even if the text is identical', () => {
    const { status, announcements } = setup();
    announcements.write(name, masterOrigin);
    announcements.write(name, publicOrigin);
    announcements.clearRevoked(new Set([masterId]));
    expect(status.textContent).toBe(name);
    expect(announcements.getOrigin()).toEqual(publicOrigin);
  });

  test('public to Master replacement clears current Master, not restoring older text', () => {
    const { status, announcements } = setup();
    announcements.write(name, publicOrigin);
    announcements.write(name, masterOrigin);
    announcements.clearRevoked(new Set([masterId]));
    expect(status.textContent).toBe('');
    expect(announcements.getOrigin()).toBeNull();
  });

  test('old region removal cannot clear a newer public selection', () => {
    const { status, announcements } = setup();
    announcements.write(name, { ...masterOrigin, source: 'region', sourceId: 'region-master' });
    announcements.write(name, publicOrigin);
    announcements.clearSource('region-master');
    expect(status.textContent).toBe(name);
    expect(announcements.getOrigin()).toEqual(publicOrigin);
  });

  test('Master shutdown and explicit clearing purge all ephemeral metadata', () => {
    const { status, announcements } = setup();
    announcements.write(name, masterOrigin);
    announcements.clearPrivate();
    expect(status.textContent).toBe('');
    expect(announcements.getOrigin()).toBeNull();
    announcements.write(name, masterOrigin);
    announcements.write('', publicOrigin);
    expect(announcements.getOrigin()).toBeNull();
    announcements.write(name, masterOrigin);
    announcements.clear();
    expect(announcements.getOrigin()).toBeNull();
  });
});
