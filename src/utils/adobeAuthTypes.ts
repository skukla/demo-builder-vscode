import { AdobeOrg, AdobeProject, AdobeWorkspace } from './adobeAuthManager';
import { AdobeAuthError } from './adobeAuthErrors';

export enum AuthState {
    UNAUTHENTICATED = 'UNAUTHENTICATED',
    AUTHENTICATED_NO_ORG = 'AUTHENTICATED_NO_ORG',
    AUTHENTICATED_WITH_ORG = 'AUTHENTICATED_WITH_ORG',
    TOKEN_EXPIRING_SOON = 'TOKEN_EXPIRING_SOON',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    AUTH_ERROR = 'AUTH_ERROR'
}

export interface AuthContext {
    state: AuthState;
    token?: {
        valid: boolean;
        expiresIn: number;  // minutes
    };
    org?: AdobeOrg;
    project?: AdobeProject;
    workspace?: AdobeWorkspace;
    error?: AdobeAuthError;
}

export interface AuthRequirements {
    needsToken: boolean;
    needsOrg: boolean;
    needsProject: boolean;
    needsWorkspace: boolean;
}

