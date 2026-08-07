import { describe, expect, it } from 'vitest';

import {
  createPlayerDispositionVisuals,
  describePlayerDispositions,
  getPinDispositionVisual,
  getPinTypeVisual,
  groupPinsByCoordinate,
} from './pinVisualSystem';

describe('pin visual system', () => {
  it('maps entity types to distinct shape and text contracts', () => {
    expect(getPinTypeVisual('character')).toMatchObject({
      label: 'Personaje',
      symbol: '●',
      className: 'pin-visual--character',
    });
    expect(getPinTypeVisual('location')).toMatchObject({
      label: 'Emplazamiento',
      symbol: '◆',
      className: 'pin-visual--location',
    });
  });

  it.each([
    ['ally', '+', 'Aliado', 'pin-disposition--ally'],
    ['enemy', '−', 'Enemigo', 'pin-disposition--enemy'],
    ['neutral', '•', 'Neutral', 'pin-disposition--neutral'],
  ] as const)('maps %s without relying on color alone', (value, symbol, label, className) => {
    expect(getPinDispositionVisual(value)).toMatchObject({ symbol, label, className });
  });

  it('uses unknown only as a visual fallback for absent disposition data', () => {
    expect(getPinDispositionVisual(null)).toMatchObject({
      disposition: 'unknown',
      symbol: '?',
      label: 'Sin disposición disponible',
    });
    expect(createPlayerDispositionVisuals([])).toHaveLength(1);
  });

  it('keeps player perspectives explicit in accessible disposition text', () => {
    expect(
      describePlayerDispositions([
        { playerId: 'player-a', playerName: 'A', disposition: 'ally' },
        { playerId: 'player-b', playerName: 'B', disposition: 'enemy' },
      ]),
    ).toBe('A: aliado; B: enemigo');
  });

  it('groups coincident pins without mutating canonical coordinates', () => {
    const pins = [
      { id: 'a', coordinate: [100, 200] as const },
      { id: 'b', coordinate: [100, 200] as const },
      { id: 'c', coordinate: [101, 200] as const },
    ];

    const groups = groupPinsByCoordinate(pins);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([['a', 'b'], ['c']]);
    expect(pins[0]?.coordinate).toEqual([100, 200]);
  });
});
