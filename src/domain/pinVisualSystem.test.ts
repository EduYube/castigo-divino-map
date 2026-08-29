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

  it('degrades incomplete relation data without inventing Neutral or technical copy', () => {
    expect(getPinDispositionVisual(null)).toMatchObject({
      disposition: 'unknown',
      symbol: '?',
      label: 'Relación sin configurar',
    });
    expect(getPinDispositionVisual(undefined).label).not.toBe('Neutral');
    expect(createPlayerDispositionVisuals([])).toEqual([]);
  });

  it('keeps player perspectives explicit in accessible disposition text', () => {
    expect(
      describePlayerDispositions([
        { playerId: 'player-a', playerName: 'A', disposition: 'ally' },
        { playerId: 'player-b', playerName: 'B', disposition: 'enemy' },
      ]),
    ).toBe('A: aliado; B: enemigo');
  });

  it('describes incomplete data explicitly instead of coercing it to neutral', () => {
    expect(
      describePlayerDispositions([
        { playerId: 'player-skade', playerName: 'Skade', disposition: undefined },
      ]),
    ).toBe('Skade: relación sin configurar');
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
