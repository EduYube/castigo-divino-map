export const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053' as const;

export type CampaignStatus = 'active' | 'archived';
export type PlayerPublicationStatus = 'draft' | 'published' | 'archived';

export interface AdminCampaignRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly displayOrder: number;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminPlayerRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly publicationStatus: PlayerPublicationStatus;
  readonly displayOrder: number;
  readonly accentColor: string;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminCampaignDraft {
  readonly name: string;
  readonly slug: string;
  readonly displayOrder: number;
}

export interface AdminPlayerDraft {
  readonly displayName: string;
  readonly displayOrder: number;
  readonly accentColor: string;
}

export interface CampaignRosterValidation {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export function normalizeAccentColor(value: string): string {
  return value.trim().toLowerCase();
}

export function isNormalizedAccentColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

function srgbComponent(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function accentContrastOnWhite(value: string): number {
  const normalized = normalizeAccentColor(value);
  if (!HEX_COLOR_PATTERN.test(normalized)) return 0;

  const red = srgbComponent(Number.parseInt(normalized.slice(1, 3), 16));
  const green = srgbComponent(Number.parseInt(normalized.slice(3, 5), 16));
  const blue = srgbComponent(Number.parseInt(normalized.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05);
}

export function validateCampaignDraft(draft: AdminCampaignDraft): CampaignRosterValidation {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  const slug = draft.slug.trim();

  if (name.length < 1 || name.length > 120) {
    errors.name = 'El nombre debe tener entre 1 y 120 caracteres.';
  }
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) {
    errors.slug = 'Usa minúsculas, números y guiones, sin espacios.';
  }
  if (!Number.isSafeInteger(draft.displayOrder) || draft.displayOrder < 0) {
    errors.displayOrder = 'El orden debe ser un entero igual o mayor que 0.';
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}

export function validatePlayerDraft(draft: AdminPlayerDraft): CampaignRosterValidation {
  const errors: Record<string, string> = {};
  const name = draft.displayName.trim();
  const color = normalizeAccentColor(draft.accentColor);

  if (name.length < 1 || name.length > 120) {
    errors.displayName = 'El nombre visible debe tener entre 1 y 120 caracteres.';
  }
  if (!HEX_COLOR_PATTERN.test(color)) {
    errors.accentColor = 'Introduce un color hexadecimal de seis dígitos, por ejemplo #1e3a8a.';
  } else if (accentContrastOnWhite(color) < 3) {
    errors.accentColor = 'El acento necesita al menos contraste 3:1 sobre blanco.';
  }
  if (!Number.isSafeInteger(draft.displayOrder) || draft.displayOrder < 0) {
    errors.displayOrder = 'El orden debe ser un entero igual o mayor que 0.';
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}

export function isInitialCampaign(campaign: Pick<AdminCampaignRecord, 'id'>): boolean {
  return campaign.id === INITIAL_CAMPAIGN_ID;
}
