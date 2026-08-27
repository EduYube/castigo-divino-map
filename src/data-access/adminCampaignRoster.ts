import type {
  AdminCampaignDraft,
  AdminCampaignRecord,
  AdminPlayerDraft,
  AdminPlayerRecord,
  CampaignStatus,
} from '../domain/adminCampaignRoster';

export type AdminCampaignRosterErrorCode =
  | 'validation'
  | 'conflict'
  | 'operation-prohibited'
  | 'session-expired'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'invalid-response'
  | 'stale-write'
  | 'unexpected';

export interface AdminCampaignRosterIssue {
  readonly code: AdminCampaignRosterErrorCode;
  readonly message: string;
  readonly field: string | null;
  readonly status: number | null;
}

export class AdminCampaignRosterRepositoryError extends Error {
  readonly code: AdminCampaignRosterErrorCode;
  readonly field: string | null;
  readonly status: number | null;

  constructor(
    code: AdminCampaignRosterErrorCode,
    message: string,
    options: {
      readonly field?: string | null;
      readonly status?: number | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AdminCampaignRosterRepositoryError';
    this.code = code;
    this.field = options.field ?? null;
    this.status = options.status ?? null;
  }
}

export function toAdminCampaignRosterIssue(error: unknown): AdminCampaignRosterIssue {
  if (error instanceof AdminCampaignRosterRepositoryError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      status: error.status,
    };
  }

  return {
    code: 'unexpected',
    message: 'No se pudo completar la operación sobre campañas o roster.',
    field: null,
    status: null,
  };
}

export interface AdminCampaignRosterRepository {
  listCampaigns(options: { readonly signal: AbortSignal }): Promise<readonly AdminCampaignRecord[]>;
  createCampaign(
    draft: AdminCampaignDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCampaignRecord>;
  updateCampaign(
    original: AdminCampaignRecord,
    draft: AdminCampaignDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCampaignRecord>;
  setCampaignStatus(
    original: AdminCampaignRecord,
    status: CampaignStatus,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCampaignRecord>;
  listPlayers(
    campaignId: string,
    options: { readonly signal: AbortSignal },
  ): Promise<readonly AdminPlayerRecord[]>;
  createPlayer(
    campaignId: string,
    draft: AdminPlayerDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPlayerRecord>;
  updatePlayer(
    campaignId: string,
    original: AdminPlayerRecord,
    draft: AdminPlayerDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPlayerRecord>;
  setPlayerArchived(
    campaignId: string,
    original: AdminPlayerRecord,
    archived: boolean,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminPlayerRecord>;
}
