export type AuthFailureCode =
  | 'configuration-missing'
  | 'configuration-invalid'
  | 'session-absent'
  | 'invalid-credentials'
  | 'session-expired'
  | 'refresh-failed'
  | 'network-unavailable'
  | 'request-timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'storage-unavailable'
  | 'invalid-response'
  | 'logout-failed'
  | 'unexpected';

export interface AuthIdentity {
  readonly userId: string;
  readonly email: string | null;
  readonly expiresAt: number | null;
}

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

export type AuthGatewayEventType =
  | 'initial-session'
  | 'signed-in'
  | 'signed-out'
  | 'token-refreshed'
  | 'user-updated'
  | 'refresh-failed';

export interface AuthGatewayEvent {
  readonly type: AuthGatewayEventType;
  readonly identity: AuthIdentity | null;
}

export type AuthGatewayListener = (event: AuthGatewayEvent) => void;

export interface AuthGateway {
  signIn(credentials: AuthCredentials): Promise<AuthIdentity>;
  restoreSession(): Promise<AuthIdentity | null>;
  refreshSession(): Promise<AuthIdentity>;
  signOut(): Promise<void>;
  onAuthStateChange(listener: AuthGatewayListener): () => void;
  dispose(): void;
}

export interface AdminAuthorizationGateway {
  isCurrentUserAdmin(): Promise<boolean>;
}

export class AuthGatewayError extends Error {
  readonly code: AuthFailureCode;
  readonly status: number | null;

  constructor(code: AuthFailureCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'AuthGatewayError';
    this.code = code;
    this.status = status;
  }
}
