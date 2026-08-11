import { describe, expect, it } from 'vitest';

import {
  CHARACTER_PORTRAIT_MAX_BYTES,
  CharacterPortraitValidationError,
  validateCharacterPortraitFile,
} from './characterPortrait';

function file(bytes: number[], type: string, name = 'portrait.bin'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('validateCharacterPortraitFile', () => {
  it('accepts JPEG, PNG and WebP by magic bytes instead of trusting the filename', async () => {
    await expect(
      validateCharacterPortraitFile(file([0xff, 0xd8, 0xff, 0xdb], 'image/jpeg')),
    ).resolves.toMatchObject({ extension: 'jpg' });
    await expect(
      validateCharacterPortraitFile(
        file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'),
      ),
    ).resolves.toMatchObject({ extension: 'png' });
    await expect(
      validateCharacterPortraitFile(
        file([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'image/webp'),
      ),
    ).resolves.toMatchObject({ extension: 'webp' });
  });

  it('rejects MIME spoofing and active/vector formats', async () => {
    await expect(
      validateCharacterPortraitFile(file([0x89, 0x50, 0x4e, 0x47], 'image/jpeg')),
    ).rejects.toBeInstanceOf(CharacterPortraitValidationError);
    await expect(
      validateCharacterPortraitFile(file([0x3c, 0x73, 0x76, 0x67], 'image/svg+xml')),
    ).rejects.toBeInstanceOf(CharacterPortraitValidationError);
  });

  it('rejects empty and oversized files', async () => {
    await expect(
      validateCharacterPortraitFile(new File([], 'empty.jpg', { type: 'image/jpeg' })),
    ).rejects.toBeInstanceOf(CharacterPortraitValidationError);
    const oversized = new File([new Uint8Array(CHARACTER_PORTRAIT_MAX_BYTES + 1)], 'large.jpg', {
      type: 'image/jpeg',
    });
    await expect(validateCharacterPortraitFile(oversized)).rejects.toBeInstanceOf(
      CharacterPortraitValidationError,
    );
  });
});
