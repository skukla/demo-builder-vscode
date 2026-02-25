/**
 * EDS Reset UI - Auth Guard Refactor Tests
 *
 * Tests for the refactored checkDaLiveAuth and checkAdobeAuth functions
 * in edsResetUI.ts, now using shared guards:
 * - ensureDaLiveAuth (from edsHelpers.ts)
 * - ensureAdobeIOAuth (from adobeAuthGuard.ts)
 *
 * Step 4b: Replace inline auth checks with shared guard calls.
 */

import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks - defined before imports
// =============================================================================

// Mock ensureDaLiveAuth
const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: mockEnsureDaLiveAuth,
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    }),
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
    showDaLiveAuthQuickPick: jest.fn(),
}));

// Mock ensureAdobeIOAuth
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: mockEnsureAdobeIOAuth,
}));

// Mock ServiceLocator for checkAdobeAuth
const mockAuthService = {
    isAuthenticated: jest.fn(),
    loginAndRestoreProjectContext: jest.fn(),
};
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => mockAuthService),
    },
}));

jest.mock('vscode', () => ({
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
}), { virtual: true });

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
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

// Mock demo-packages.json for extractResetParams
jest.mock('@/features/project-creation/config/demo-packages.json', () => ({
    packages: [{
        id: 'citisignal',
        storefronts: {
            'eds-paas': {
                templateOwner: 'test-owner',
                templateRepo: 'test-template',
                contentSource: { org: 'content-org', site: 'content-site', indexPath: 'index.json' },
            },
        },
    }],
}), { virtual: true });

jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: jest.fn((project: any) => {
        if (!project?.componentInstances) return undefined;
        return Object.values(project.componentInstances).find(
            (c: any) => c.subType === 'mesh'
        );
    }),
    hasEntries: jest.fn((obj: any) => obj && Object.keys(obj).length > 0),
}));

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    })),
}));

jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
    })),
}));

jest.mock('@/features/eds/services/edsResetService', () => ({
    executeEdsReset: jest.fn().mockResolvedValue({ success: true }),
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: {
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            templateOwner: 'tmpl-owner',
            templateRepo: 'tmpl-repo',
        },
    }),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import * as vscode from 'vscode';
import { resetEdsProjectWithUI } from '@/features/eds/services/edsResetUI';

// =============================================================================
// Helpers
// =============================================================================

function createProject(hasMesh = false): Project {
    const project: Project = {
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
            },
        },
    } as unknown as Project;

    if (hasMesh) {
        project.componentInstances!['commerce-mesh'] = {
            id: 'commerce-mesh',
            name: 'API Mesh',
            subType: 'mesh',
            path: '/test/mesh',
            status: 'deployed',
        } as any;
    }

    return project;
}

function createMockContext(): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: { secrets: {} },
    } as unknown as HandlerContext;
}

// =============================================================================
// Tests - checkDaLiveAuth (refactored)
// =============================================================================

describe('edsResetUI - checkDaLiveAuth (refactored to use ensureDaLiveAuth)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // User confirms reset by default
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');
    });

    it('should return null (continue) when DA.live auth is valid', async () => {
        // Given: ensureDaLiveAuth returns authenticated
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        const project = createProject();
        const context = createMockContext();

        // When: resetEdsProjectWithUI is called
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: ensureDaLiveAuth should have been called with context
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(
            context,
            expect.any(String), // logPrefix
        );

        // And: Reset should proceed (not fail with auth error)
        // The result should be from executeEdsReset (mocked as success)
        expect(result.success).toBe(true);
    });

    it('should return null (continue) when DA.live sign-in succeeds', async () => {
        // Given: ensureDaLiveAuth succeeds after re-auth prompt
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        const project = createProject();
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Reset should proceed
        expect(result.success).toBe(true);
    });

    it('should restore status and return error when DA.live auth is cancelled', async () => {
        // Given: ensureDaLiveAuth returns cancelled
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });
        const project = createProject();
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Should return DALIVE_AUTH_REQUIRED error
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('DALIVE_AUTH_REQUIRED');
        expect(result.cancelled).toBe(true);

        // And: Project status should be restored (via finally block)
        expect(context.stateManager.saveProject).toHaveBeenCalled();
    });

    it('should restore status and return error when DA.live auth fails', async () => {
        // Given: ensureDaLiveAuth returns failed (not cancelled)
        mockEnsureDaLiveAuth.mockResolvedValue({
            authenticated: false,
            error: 'Token validation failed',
        });
        const project = createProject();
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Should return DALIVE_AUTH_REQUIRED error with error message
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('DALIVE_AUTH_REQUIRED');
    });
});

// =============================================================================
// Tests - checkAdobeAuth (refactored)
// =============================================================================

describe('edsResetUI - checkAdobeAuth (refactored to use ensureAdobeIOAuth)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // User confirms reset by default
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');
        // DA.live auth succeeds by default
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    });

    it('should return null (continue) when Adobe I/O auth is valid', async () => {
        // Given: Both DA.live and Adobe I/O auth pass
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        const project = createProject(true); // has mesh
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: ensureAdobeIOAuth should have been called
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                authManager: mockAuthService,
                logger: context.logger,
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: 'proj-456',
                    workspace: 'ws-789',
                }),
                warningMessage: expect.stringContaining('Adobe I/O session has expired'),
            }),
        );

        // And: Reset should proceed
        expect(result.success).toBe(true);
    });

    it('should return null (continue) when Adobe I/O sign-in succeeds', async () => {
        // Given: Adobe I/O re-auth succeeds
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        const project = createProject(true);
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Reset should proceed
        expect(result.success).toBe(true);
    });

    it('should restore status and return error when Adobe I/O auth is cancelled', async () => {
        // Given: Adobe I/O auth cancelled
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });
        const project = createProject(true);
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Should return ADOBE_AUTH_REQUIRED
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
        expect(result.cancelled).toBe(true);
    });

    it('should restore status and return error when Adobe I/O sign-in fails', async () => {
        // Given: Adobe I/O auth fails
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const project = createProject(true);
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Should return ADOBE_AUTH_REQUIRED
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
    });

    it('should skip Adobe I/O auth check when project has no mesh', async () => {
        // Given: Project without mesh component
        const project = createProject(false); // no mesh
        const context = createMockContext();

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: ensureAdobeIOAuth should NOT have been called
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();

        // And: Reset should proceed with just DA.live auth
        expect(result.success).toBe(true);
    });

    it('should pass correct logPrefix to ensureAdobeIOAuth', async () => {
        // Given: Custom logPrefix
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        const project = createProject(true);
        const context = createMockContext();

        // When
        await resetEdsProjectWithUI({ project, context, logPrefix: '[Dashboard]' });

        // Then: logPrefix should be forwarded
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                logPrefix: '[Dashboard]',
            }),
        );
    });
});
