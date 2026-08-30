/**
 * Shared setup for the edsResetUI suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/auth/adobeAuthGuard, @/core/di, @/core/logging, @/core/utils/timeoutConfig, @/features/authentication/services/ensureProjectOrgContext, @/features/eds/handlers/edsHelpers, @/features/eds/services/daLive/daLiveAuthService, @/features/eds/services/github/githubAppService, @/types/typeGuards, vscode
 * Left inline (specs disagree):  @/features/data-installer/services/commerceCredentials, @/features/data-installer/services/sampleDataInstall, @/features/eds/services/reset/edsResetService
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { resetEdsProjectWithUI } from '@/features/eds/services/reset/edsResetUI';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: mockEnsureDaLiveAuth,
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    }),
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
    tryCreateDaLiveTokenProvider: jest.fn(() => undefined),
    showDaLiveAuthQuickPick: jest.fn(),
    resolveByomOverlayConfig: jest.fn(
        (fromConfigUrl: string | undefined, org: string, site: string) =>
            fromConfigUrl ? `${fromConfigUrl}?org=${org}&site=${site}&key=test-secret` : undefined
    ),
}));
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: mockEnsureAdobeIOAuth,
}));
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => mockAuthService),
    },
}));
jest.mock('@/features/authentication/services/ensureProjectOrgContext', () => ({
    ensureProjectOrgContext: (...args: unknown[]) => mockEnsureProjectOrgContext(...args),
}));
jest.mock(
    'vscode',
    () => ({
        window: {
            showWarningMessage: jest.fn(),
            showInformationMessage: jest.fn(),
            showErrorMessage: jest.fn(),
            withProgress: jest.fn().mockImplementation(async (_options: any, callback: any) => {
                return callback({ report: jest.fn() });
            }),
        },
        ProgressLocation: { Notification: 15 },
        env: { openExternal: jest.fn() },
        Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
    }),
    { virtual: true }
);
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
        UI: { MIN_LOADING: 500, NOTIFICATION: 2000 },
    },
}));
jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: jest.fn((project: any) => {
        if (!project?.componentInstances) return undefined;
        return Object.values(project.componentInstances).find((c: any) => c.subType === 'mesh');
    }),
    hasEntries: jest.fn((obj: any) => obj && Object.keys(obj).length > 0),
}));
jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    })),
}));
jest.mock('@/features/eds/services/github/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
    })),
}));
// Mock ensureDaLiveAuth
const mockEnsureDaLiveAuth = jest.fn();
// Mock ensureAdobeIOAuth
const mockEnsureAdobeIOAuth = jest.fn();
// Mock ServiceLocator for checkAdobeAuth
const mockAuthService = {
    isAuthenticated: jest.fn(),
    loginAndRestoreProjectContext: jest.fn(),
};
// Mock ensureProjectOrgContext — the inline action-time org gate used by
// checkOrgContext (it owns the "Switch IMS Org" prompt + forced login internally).
const mockEnsureProjectOrgContext = jest.fn();

export * as vscode from 'vscode';
export { resetEdsProjectWithUI };

export {
    mockAuthService,
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
};
