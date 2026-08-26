import { describe, expect, it } from 'vitest';

import {
  accentContrastOnWhite,
  normalizeAccentColor,
  validateCampaignDraft,
  validatePlayerDraft,
} from './adminCampaignRoster';

describe('MAP-054 campaign roster domain', () => {
  it('normalizes and accepts the three initial campaign accents with readable contrast', () => {
    const colors = ['#c2410c', '#1e3a8a', '#9d174d'];
    for (const color of colors) {
      expect(accentContrastOnWhite(color)).toBeGreaterThanOrEqual(3);
      expect(
        validatePlayerDraft({ displayName: 'Jugador', displayOrder: 0, accentColor: color }).valid,
      ).toBe(true);
    }
    expect(normalizeAccentColor('  #1E3A8A ')).toBe('#1e3a8a');
  });

  it('rejects colors that are malformed or too light on the administrative white surface', () => {
    expect(
      validatePlayerDraft({ displayName: 'Jugador', displayOrder: 0, accentColor: 'navy' })
        .fieldErrors.accentColor,
    ).toBeTruthy();
    expect(
      validatePlayerDraft({ displayName: 'Jugador', displayOrder: 0, accentColor: '#ffffff' })
        .fieldErrors.accentColor,
    ).toContain('3:1');
  });

  it('validates stable campaign slug and non-negative ordering', () => {
    expect(
      validateCampaignDraft({ name: 'Campaña B', slug: 'campana-b', displayOrder: 1 }).valid,
    ).toBe(true);
    expect(
      validateCampaignDraft({ name: 'Campaña B', slug: 'Campaña B', displayOrder: -1 }).valid,
    ).toBe(false);
  });

  it('never relies on color alone because display name remains required', () => {
    const result = validatePlayerDraft({ displayName: '   ', displayOrder: 0, accentColor: '#1e3a8a' });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.displayName).toBeTruthy();
  });
});
