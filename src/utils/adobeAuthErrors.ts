export enum AuthErrorCode {
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    TOKEN_INVALID = 'TOKEN_INVALID',
    NO_ORG = 'NO_ORG',
    NO_PROJECT = 'NO_PROJECT',
    NO_WORKSPACE = 'NO_WORKSPACE',
    API_ERROR = 'API_ERROR',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    NETWORK_ERROR = 'NETWORK_ERROR'
}

export class AdobeAuthError extends Error {
    constructor(
        message: string,
        public code: AuthErrorCode,
        public requiresReauth: boolean,
        public userMessage: string,
        public actionText?: string
    ) {
        super(message);
        this.name = 'AdobeAuthError';
    }
    
    static tokenExpired(expiresIn: number): AdobeAuthError {
        return new AdobeAuthError(
            `Token expired ${Math.abs(expiresIn)} minutes ago`,
            AuthErrorCode.TOKEN_EXPIRED,
            true,
            'Your Adobe session has expired',
            'Sign In'
        );
    }
    
    static noOrganization(): AdobeAuthError {
        return new AdobeAuthError(
            'No organization selected',
            AuthErrorCode.NO_ORG,
            false,
            'Please select an organization to continue',
            'Select Organization'
        );
    }
    
    static noProject(): AdobeAuthError {
        return new AdobeAuthError(
            'No project selected',
            AuthErrorCode.NO_PROJECT,
            false,
            'Please select a project to continue',
            'Select Project'
        );
    }
    
    static noWorkspace(): AdobeAuthError {
        return new AdobeAuthError(
            'No workspace selected',
            AuthErrorCode.NO_WORKSPACE,
            false,
            'Please select a workspace to continue',
            'Select Workspace'
        );
    }
    
    static permissionDenied(details?: string): AdobeAuthError {
        return new AdobeAuthError(
            details || 'Permission denied',
            AuthErrorCode.PERMISSION_DENIED,
            false,
            'You don\'t have permission to perform this action',
            'Contact Administrator'
        );
    }
    
    static apiError(details: string): AdobeAuthError {
        return new AdobeAuthError(
            details,
            AuthErrorCode.API_ERROR,
            false,
            'An error occurred while communicating with Adobe services',
            'Try Again'
        );
    }
}

