export const CHARACTER_PORTRAIT_MAX_BYTES = 4 * 1024 * 1024;
export const CHARACTER_PORTRAIT_ACCEPT = 'image/jpeg,image/png,image/webp';

export type CharacterPortraitMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type CharacterPortraitExtension = 'jpg' | 'png' | 'webp';

export interface ValidatedCharacterPortrait {
  readonly file: File;
  readonly mimeType: CharacterPortraitMimeType;
  readonly extension: CharacterPortraitExtension;
}

export class CharacterPortraitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterPortraitValidationError';
  }
}

function detectedMimeType(bytes: Uint8Array): CharacterPortraitMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function extensionFor(mimeType: CharacterPortraitMimeType): CharacterPortraitExtension {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}

export async function validateCharacterPortraitFile(
  file: File,
): Promise<ValidatedCharacterPortrait> {
  if (file.size <= 0 || file.size > CHARACTER_PORTRAIT_MAX_BYTES) {
    throw new CharacterPortraitValidationError('El retrato debe pesar como máximo 4 MiB.');
  }

  const declared = file.type.toLocaleLowerCase('en');
  if (declared !== 'image/jpeg' && declared !== 'image/png' && declared !== 'image/webp') {
    throw new CharacterPortraitValidationError('Solo se admiten retratos JPEG, PNG o WebP.');
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectedMimeType(bytes);
  if (!detected || detected !== declared) {
    throw new CharacterPortraitValidationError(
      'El contenido del retrato no coincide con su formato declarado.',
    );
  }

  return { file, mimeType: detected, extension: extensionFor(detected) };
}
