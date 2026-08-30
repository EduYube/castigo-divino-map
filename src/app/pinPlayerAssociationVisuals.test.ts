import { describe, expect, it } from 'vitest';

import { createPlayerAssociationAccent } from './pinPlayerAssociationVisuals';

const skade = { playerId: 'player-skade', playerName: 'Skade', accentColor: '#c2410c' };
const ura = { playerId: 'player-ura', playerName: 'Ura', accentColor: '#1e3a8a' };
const veyra = { playerId: 'player-veyra', playerName: 'Veyra', accentColor: '#9d174d' };

describe('createPlayerAssociationAccent', () => {
  it('keeps an unassociated pin visually neutral', () => {
    expect(createPlayerAssociationAccent([])).toBe('transparent');
  });

  it('uses the persisted accent for one association', () => {
    expect(createPlayerAssociationAccent([skade])).toBe('#c2410c');
    expect(createPlayerAssociationAccent([ura])).toBe('#1e3a8a');
    expect(createPlayerAssociationAccent([veyra])).toBe('#9d174d');
  });

  it('keeps every player accent in a multi-association ring', () => {
    const accent = createPlayerAssociationAccent([skade, ura, veyra]);
    expect(accent).toContain('conic-gradient');
    expect(accent).toContain('#c2410c');
    expect(accent).toContain('#1e3a8a');
    expect(accent).toContain('#9d174d');
  });
});
