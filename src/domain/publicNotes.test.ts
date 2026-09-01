import { describe, expect, it } from 'vitest';
import {
  PUBLIC_NOTE_BODY_MAX_LENGTH,
  PUBLIC_NOTE_TITLE_MAX_LENGTH,
  validatePublicNoteDraft,
} from './publicNotes';

describe('validatePublicNoteDraft', () => {
  it('trims valid title and body without interpreting markup', () => {
    expect(
      validatePublicNoteDraft({
        title: '  Rumor público  ',
        body: '  <script>alert(1)</script>  ',
      }),
    ).toEqual({
      valid: true,
      title: 'Rumor público',
      body: '<script>alert(1)</script>',
    });
  });

  it('requires a title before submission', () => {
    expect(validatePublicNoteDraft({ title: '   ', body: 'Contenido' })).toEqual({
      valid: false,
      field: 'title',
      message: 'Escribe un título para la nota.',
    });
  });

  it('requires a body before submission', () => {
    expect(validatePublicNoteDraft({ title: 'Título', body: '\n  ' })).toEqual({
      valid: false,
      field: 'body',
      message: 'Escribe el contenido de la nota.',
    });
  });

  it('enforces the same title and body limits as the backend contract', () => {
    expect(
      validatePublicNoteDraft({
        title: 'x'.repeat(PUBLIC_NOTE_TITLE_MAX_LENGTH + 1),
        body: 'Contenido',
      }),
    ).toMatchObject({ valid: false, field: 'title' });

    expect(
      validatePublicNoteDraft({
        title: 'Título',
        body: 'x'.repeat(PUBLIC_NOTE_BODY_MAX_LENGTH + 1),
      }),
    ).toMatchObject({ valid: false, field: 'body' });
  });
});
