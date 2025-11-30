/**
 * Shared test utilities for useAuthStatus hook tests
 */

import { WizardState } from '@/types/webview';
import { ErrorCode } from '@/types/errorCodes';
import '@testing-library/jest-dom';

// Mock WebviewClient
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn());
export const mockRequestAuth = jest.fn();
export const mockReady = jest.fn().mockResolvedValue(undefined);

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
        requestAuth: (...args: any[]) => mockRequestAuth(...args),
        ready: (...args: any[]) => mockReady(...args),
    },
}));

// Base state for tests
export const baseAdobeAuth = {
    isAuthenticated: false,
    isChecking: false,
    email: undefined,
    error: undefined,
    requiresOrgSelection: false,
    orgLacksAccess: false,
    tokenExpiresIn: undefined,
    tokenExpiringSoon: false,
};

export const authenticatedAdobeAuth = {
    isAuthenticated: true,
    isChecking: false,
    email: 'user@adobe.com',
    error: undefined,
    requiresOrgSelection: false,
    orgLacksAccess: false,
    tokenExpiresIn: 3600,
    tokenExpiringSoon: false,
};

export const baseState: Partial<WizardState> = {
    adobeAuth: baseAdobeAuth,
    adobeOrg: undefined,
    adobeProject: undefined,
    adobeWorkspace: undefined,
};

export const authenticatedState: Partial<WizardState> = {
    adobeAuth: authenticatedAdobeAuth,
    adobeOrg: {
        id: 'org-123',
        code: 'ORG123',
        name: 'Test Organization',
    },
    adobeProject: undefined,
    adobeWorkspace: undefined,
};

export interface AuthStatusData {
    message?: string;
    subMessage?: string;
    error?: string;
    code?: ErrorCode;  // Typed error code for programmatic handling
    isAuthenticated: boolean;
    isChecking?: boolean;
    email?: string;
    requiresOrgSelection?: boolean;
    orgLacksAccess?: boolean;
    tokenExpiresIn?: number;
    tokenExpiringSoon?: boolean;
    organization?: {
        id: string;
        code: string;
        name: string;
    };
}

export const successAuthData: AuthStatusData = {
    message: 'Authenticated successfully',
    subMessage: 'Welcome back!',
    isAuthenticated: true,
    isChecking: false,
    email: 'user@adobe.com',
    organization: {
        id: 'org-123',
        code: 'ORG123',
        name: 'Test Organization',
    },
};

export const timeoutAuthData: AuthStatusData = {
    message: 'Authentication timed out',
    subMessage: 'Please try again',
    error: 'timeout',
    code: ErrorCode.TIMEOUT,  // Typed error code
    isAuthenticated: false,
    isChecking: false,
};

export const checkingAuthData: AuthStatusData = {
    message: 'Checking authentication...',
    isAuthenticated: false,
    isChecking: true,
};

export function resetMocks(): void {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn()); // Return unsubscribe function
    mockReady.mockResolvedValue(undefined);
}
