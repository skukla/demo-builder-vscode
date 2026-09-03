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
import type { GitHubAppService } from '@/features/eds/services/github/githubAppService';

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
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => mockAuthService),
    },
}));
jest.mock('@/features/authentication/services/ensureProjectOrgContext', () => ({
    ensureProjectOrgContext: (...args: unknown[]) => mockEnsureProjectOrgContext(...args),
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

/**
 * The GitHub App service the specs hand to `resetEdsProjectWithUI` via its options,
 * replacing the module mock (ADR-016 wall). The App check reached the class through
 * `await import(...)`, so interception was the only way in until the entry point
 * offered a seam.
 *
 * Partial by design — `isAppInstalled` is all `resolveAppInstallation` calls — so it
 * is cast into the real type once, here, per ADR-016 rule 2.
 */
const fakeGitHubAppService = {
    isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
} as unknown as GitHubAppService;

export * as vscode from 'vscode';
export { resetEdsProjectWithUI };

export {
    fakeGitHubAppService,
    mockAuthService,
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
};
