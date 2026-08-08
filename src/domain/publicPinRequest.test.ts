import { describe, expect, test } from 'vitest';

import {
  PUBLIC_PIN_REQUEST_LIMITS,
  buildPublicPinRequestRpcPayload,
  validatePublicPinRequest,
  type PublicPinRequestDraft,
} from './publicPinRequest';

function validDraft(overrides: Partial<PublicPinRequestDraft> = {}): PublicPinRequestDraft {
  return {
    senderName: '  Edu  ',
    proposedName: '  Torre del Alba  ',
    entityType: 'location',
    x: 1800,
    y: 1164.5,
    description: '  Un lugar descubierto durante la sesión.  ',
    reason: '  Sería útil para recordar el viaje.  ',
    honeypot: '',
    ...overrides,
  };
}

describe('public pin request domain', () => {
  test('normalizes a valid request and builds only the approved RPC payload', () => {
    const result = validatePublicPinRequest(validDraft());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({
      senderName: 'Edu',
      proposedName: 'Torre del Alba',
      entityType: 'location',
      x: 1800,
      y: 1164.5,
      description: 'Un lugar descubierto durante la sesión.',
      reason: 'Sería útil para recordar el viaje.',
      honeypot: '',
    });
    expect(buildPublicPinRequestRpcPayload(result.value)).toEqual({
      p_sender_name: 'Edu',
      p_proposed_name: 'Torre del Alba',
      p_entity_type: 'location',
      p_x: 1800,
      p_y: 1164.5,
      p_description: 'Un lugar descubierto durante la sesión.',
      p_reason: 'Sería útil para recordar el viaje.',
      p_honeypot: '',
    });
  });

  test.each([
    ['senderName', { senderName: '   ' }],
    ['proposedName', { proposedName: '' }],
    ['description', { description: '\n\t ' }],
    ['reason', { reason: ' ' }],
  ] as const)('rejects an empty %s', (field, overrides) => {
    const result = validatePublicPinRequest(validDraft(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[field]).toBeDefined();
  });

  test('rejects values beyond every public database length boundary', () => {
    const result = validatePublicPinRequest(
      validDraft({
        senderName: 'a'.repeat(PUBLIC_PIN_REQUEST_LIMITS.senderName + 1),
        proposedName: 'b'.repeat(PUBLIC_PIN_REQUEST_LIMITS.proposedName + 1),
        description: 'c'.repeat(PUBLIC_PIN_REQUEST_LIMITS.description + 1),
        reason: 'd'.repeat(PUBLIC_PIN_REQUEST_LIMITS.reason + 1),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      'description',
      'proposedName',
      'reason',
      'senderName',
    ]);
  });

  test.each(['enemy', 'unknown', 'custom', ''])(
    'rejects a non-controlled pin type: %s',
    (entityType) => {
      const result = validatePublicPinRequest(validDraft({ entityType }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.entityType).toBe('Elige un tipo de pin permitido.');
    },
  );

  test.each([
    { x: -0.01, y: 100 },
    { x: 3600.01, y: 100 },
    { x: 100, y: -0.01 },
    { x: 100, y: 2329.01 },
    { x: Number.NaN, y: 100 },
    { x: 100, y: Number.POSITIVE_INFINITY },
    { x: null, y: 100 },
  ])('rejects invalid canonical coordinates %#', (coordinates) => {
    const result = validatePublicPinRequest(validDraft(coordinates));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.position).toBeDefined();
  });

  test('keeps HTML-like content as text while rejecting unsafe control characters', () => {
    const htmlLike = validatePublicPinRequest(
      validDraft({ description: '<script>alert("texto")</script>' }),
    );
    const controlCharacter = validatePublicPinRequest(
      validDraft({ reason: `motivo${String.fromCharCode(0)}oculto` }),
    );

    expect(htmlLike.ok).toBe(true);
    if (htmlLike.ok) {
      expect(htmlLike.value.description).toBe('<script>alert("texto")</script>');
    }
    expect(controlCharacter.ok).toBe(false);
    if (!controlCharacter.ok) {
      expect(controlCharacter.errors.reason).toContain('caracteres de control');
    }
  });
});
