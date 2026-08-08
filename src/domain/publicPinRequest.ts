export const PUBLIC_PIN_REQUEST_ENTITY_TYPES = ['character', 'location'] as const;

export type PublicPinRequestEntityType = (typeof PUBLIC_PIN_REQUEST_ENTITY_TYPES)[number];

export const PUBLIC_PIN_REQUEST_LIMITS = {
  senderName: 80,
  proposedName: 160,
  description: 2000,
  reason: 1000,
} as const;

export type PublicPinRequestField =
  | 'senderName'
  | 'proposedName'
  | 'entityType'
  | 'position'
  | 'description'
  | 'reason';

export interface PublicPinRequestDraft {
  readonly senderName: string;
  readonly proposedName: string;
  readonly entityType: string;
  readonly x: number | null;
  readonly y: number | null;
  readonly description: string;
  readonly reason: string;
  readonly honeypot: string;
}

export interface ValidatedPublicPinRequest {
  readonly senderName: string;
  readonly proposedName: string;
  readonly entityType: PublicPinRequestEntityType;
  readonly x: number;
  readonly y: number;
  readonly description: string;
  readonly reason: string;
  readonly honeypot: string;
}

export type PublicPinRequestValidationResult =
  | { readonly ok: true; readonly value: ValidatedPublicPinRequest }
  | {
      readonly ok: false;
      readonly errors: Partial<Record<PublicPinRequestField, string>>;
    };

export interface PublicPinRequestRpcPayload {
  readonly p_sender_name: string;
  readonly p_proposed_name: string;
  readonly p_entity_type: PublicPinRequestEntityType;
  readonly p_x: number;
  readonly p_y: number;
  readonly p_description: string;
  readonly p_reason: string;
  readonly p_honeypot: string;
}

const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function countCodePoints(value: string): number {
  return Array.from(value).length;
}

function validateText(
  value: string,
  label: string,
  maximumLength: number,
): { readonly normalized: string; readonly error?: string } {
  const normalized = normalizeText(value);

  if (countCodePoints(normalized) === 0) {
    return { normalized, error: `${label} es obligatorio.` };
  }

  if (countCodePoints(normalized) > maximumLength) {
    return {
      normalized,
      error: `${label} no puede superar ${maximumLength} caracteres.`,
    };
  }

  if (UNSAFE_CONTROL_CHARACTERS.test(normalized)) {
    return { normalized, error: `${label} contiene caracteres de control no permitidos.` };
  }

  return { normalized };
}

export function isPublicPinRequestEntityType(
  value: string,
): value is PublicPinRequestEntityType {
  return PUBLIC_PIN_REQUEST_ENTITY_TYPES.some((entityType) => entityType === value);
}

export function validatePublicPinRequest(
  draft: PublicPinRequestDraft,
): PublicPinRequestValidationResult {
  const senderName = validateText(
    draft.senderName,
    'El nombre o apodo',
    PUBLIC_PIN_REQUEST_LIMITS.senderName,
  );
  const proposedName = validateText(
    draft.proposedName,
    'El nombre propuesto',
    PUBLIC_PIN_REQUEST_LIMITS.proposedName,
  );
  const description = validateText(
    draft.description,
    'La descripción',
    PUBLIC_PIN_REQUEST_LIMITS.description,
  );
  const reason = validateText(draft.reason, 'El motivo', PUBLIC_PIN_REQUEST_LIMITS.reason);
  const errors: Partial<Record<PublicPinRequestField, string>> = {};

  if (senderName.error) errors.senderName = senderName.error;
  if (proposedName.error) errors.proposedName = proposedName.error;
  if (description.error) errors.description = description.error;
  if (reason.error) errors.reason = reason.error;

  if (!isPublicPinRequestEntityType(draft.entityType)) {
    errors.entityType = 'Elige un tipo de pin permitido.';
  }

  if (
    draft.x === null ||
    draft.y === null ||
    !Number.isFinite(draft.x) ||
    !Number.isFinite(draft.y) ||
    draft.x < 0 ||
    draft.x > 3600 ||
    draft.y < 0 ||
    draft.y > 2329
  ) {
    errors.position = 'Selecciona una posición válida dentro del mapa.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (!isPublicPinRequestEntityType(draft.entityType) || draft.x === null || draft.y === null) {
    return { ok: false, errors: { position: 'Selecciona una posición válida dentro del mapa.' } };
  }

  return {
    ok: true,
    value: {
      senderName: senderName.normalized,
      proposedName: proposedName.normalized,
      entityType: draft.entityType,
      x: draft.x,
      y: draft.y,
      description: description.normalized,
      reason: reason.normalized,
      honeypot: normalizeText(draft.honeypot),
    },
  };
}

export function buildPublicPinRequestRpcPayload(
  request: ValidatedPublicPinRequest,
): PublicPinRequestRpcPayload {
  return {
    p_sender_name: request.senderName,
    p_proposed_name: request.proposedName,
    p_entity_type: request.entityType,
    p_x: request.x,
    p_y: request.y,
    p_description: request.description,
    p_reason: request.reason,
    p_honeypot: request.honeypot,
  };
}
