/**
 * EDS Reset Service - Adobe I/O Auth Tests
 *
 * Regression test: resetEdsProjectWithUI should call loginAndRestoreProjectContext
 * (not bare login()) when Adobe I/O re-authentication is needed during reset.
 * This ensures the AIO CLI has the correct org/project/workspace context after login,
 * matching the pattern used by deployMesh, dashboardHandlers, and configure.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockLoginAndRestoreProjectContext = jest.fn();
const mockLogin = jest.fn();
const mockIsAuthenticated = jest.fn();

jest.mock('vscode', () => ({
    window: {
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn(),
    },
    ProgressLocation: { Notification: 15 },
    env: { openExternal: jest.fn() },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: mockIsAuthenticated,
            login: mockLogin,
            loginAndRestoreProjectContext: mockLoginAndRestoreProjectContext,
        })),
    },
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

jest.mock('@/core/validation', () => ({
    validateProjectPath: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
        UI: { MIN_LOADING: 500, NOTIFICATION: 2000 },
    },
}));

jest.mock('@/core/constants', () => ({
    COMPONENT_IDS: {
        EDS_STOREFRONT: 'eds-storefront',
        EDS_COMMERCE_MESH: 'eds-commerce-mesh',
        EDS_ACCS_MESH: 'eds-accs-mesh',
    },
}));

// Mock demo-packages.json — provide minimal data for extractResetParams
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

// DA.live auth — always authenticated (we're testing Adobe I/O path)
jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    })),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
    showDaLiveAuthQuickPick: jest.fn(),
}));

jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
    })),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import * as vscode from 'vscode';
import { resetEdsProjectWithUI } from '@/features/eds/services/edsResetService';

// =============================================================================
// Helpers
// =============================================================================

function createProjectWithMesh(adobeContext?: {
    organization?: string;
    projectId?: string;
    workspace?: string;
}): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'running',
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        adobe: adobeContext,
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-org/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
            },
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh',
                path: '/test/mesh',
                status: 'deployed',
            },
        },
    } as unknown as Project;
}

function createMockContext(project: Project): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
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
// Tests
// =============================================================================

describe('resetEdsProjectWithUI - Adobe I/O Auth', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // withProgress executes the callback immediately
        (vscode.window.withProgress as jest.Mock).mockImplementation(async (_options, callback) => {
            return callback({ report: jest.fn() });
        });
    });

    it('should call loginAndRestoreProjectContext with project adobe context when re-auth needed', async () => {
        // Given: Project with mesh and Adobe context
        const project = createProjectWithMesh({
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'workspace-789',
        });
        const context = createMockContext(project);

        // And: Adobe I/O auth has expired
        mockIsAuthenticated.mockResolvedValue(false);

        // And: Login fails (causes early return so we don't need to mock executeEdsReset)
        mockLoginAndRestoreProjectContext.mockResolvedValue(false);

        // And: User confirms reset, then clicks Sign In
        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project')  // Confirmation dialog
            .mockResolvedValueOnce('Sign In');        // Adobe I/O auth prompt

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Should call loginAndRestoreProjectContext (not bare login())
        expect(mockLoginAndRestoreProjectContext).toHaveBeenCalledWith({
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'workspace-789',
        });
        expect(mockLogin).not.toHaveBeenCalled();

        // And: Should return auth error since login failed
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
    });

    it('should pass undefined adobe fields gracefully when project lacks adobe context', async () => {
        // Given: Project with mesh but no Adobe context
        const project = createProjectWithMesh();
        const context = createMockContext(project);

        // And: Adobe I/O auth expired, login fails
        mockIsAuthenticated.mockResolvedValue(false);
        mockLoginAndRestoreProjectContext.mockResolvedValue(false);

        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project')
            .mockResolvedValueOnce('Sign In');

        // When
        await resetEdsProjectWithUI({ project, context });

        // Then: Should call loginAndRestoreProjectContext with undefined fields
        expect(mockLoginAndRestoreProjectContext).toHaveBeenCalledWith({
            organization: undefined,
            projectId: undefined,
            workspace: undefined,
        });
        expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should return ADOBE_AUTH_REQUIRED when user dismisses sign-in prompt', async () => {
        // Given: Project with mesh
        const project = createProjectWithMesh({ organization: 'org-1' });
        const context = createMockContext(project);

        // And: Adobe I/O auth expired
        mockIsAuthenticated.mockResolvedValue(false);

        // And: User confirms reset but dismisses auth prompt
        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project')
            .mockResolvedValueOnce(undefined);  // Dismissed

        // When
        const result = await resetEdsProjectWithUI({ project, context });

        // Then: Should not attempt login at all
        expect(mockLoginAndRestoreProjectContext).not.toHaveBeenCalled();
        expect(mockLogin).not.toHaveBeenCalled();

        // And: Should return auth error
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
    });
});
