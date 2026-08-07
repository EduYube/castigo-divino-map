import { AuthGatewayError, type AuthFailureCode, type AuthIdentity } from './authGateway';

export type AdminAuthPhase =
  | 'anonymous'
  | 'restoring'
  | 'authenticating'
  | 'authorizing'
  | 'unauthorized'
  | 'authorized'
  | 'expired'
  | 'error';

export interface PublicAuthIssue {
  readonly code: AuthFailureCode;
  readonly message: string;
}

export interface AdminAuthState {
  readonly phase: AdminAuthPhase;
  readonly identity: AuthIdentity | null;
  readonly issue: PublicAuthIssue | null;
  readonly operationId: number;
}

export const INITIAL_ADMIN_AUTH_STATE: AdminAuthState = {
  phase: 'anonymous',
  identity: null,
  issue: null,
  operationId: 0,
};

const PUBLIC_MESSAGES: Record<AuthFailureCode, string> = {
  'configuration-missing': 'El acceso administrativo no está configurado en este entorno.',
  'configuration-invalid':
    'El acceso administrativo no está disponible por una configuración no válida.',
  'session-absent': 'No hay una sesión administrativa activa.',
  'invalid-credentials': 'No se pudo iniciar sesión. Revisa las credenciales e inténtalo de nuevo.',
  'session-expired': 'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
  'refresh-failed': 'La sesión administrativa ya no es válida. Inicia sesión de nuevo.',
  'network-unavailable':
    'No se pudo contactar con el servicio de autenticación. El atlas público sigue disponible.',
  'request-timeout':
    'El servicio de autenticación tardó demasiado en responder. El atlas público sigue disponible.',
  unauthorized: 'La cuenta autenticada no tiene acceso administrativo.',
  forbidden: 'La sesión no dispone de autorización administrativa.',
  'storage-unavailable':
    'No se pudo conservar la sesión de forma segura en esta pestaña. Inicia sesión de nuevo.',
  'invalid-response': 'El servicio de autenticación devolvió una respuesta no válida.',
  'logout-failed': 'La sesión local se cerró, pero no se pudo completar el cierre remoto.',
  unexpected: 'No se pudo completar la autenticación. Inténtalo de nuevo.',
};

export function toPublicAuthIssue(error: unknown): PublicAuthIssue {
  const normalized =
    error instanceof AuthGatewayError
      ? error
      : new AuthGatewayError('unexpected', 'Unexpected authentication failure.');

  return {
    code: normalized.code,
    message: PUBLIC_MESSAGES[normalized.code],
  };
}

export function canUseAdministrativeMode(state: AdminAuthState): boolean {
  return state.phase === 'authorized';
}
