/**
 * EDS Reset Service - Adobe I/O Auth Tests
 *
 * Regression test: resetEdsProjectWithUI should call loginAndRestoreProjectContext
 * (not bare login()) when Adobe I/O re-authentication is needed during reset.
 * This ensures the AIO CLI has the correct org/project/workspace context after login,
 * matching the pattern used by deployMesh, dashboardHandlers, and configure.
 */

import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================


// Mock ensureAdobeIOAuth (used by refactored checkAdobeAuth)
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
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



// DA.live auth — always authenticated (we're testing Adobe I/O path)

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    }),
    showDaLiveAuthQuickPick: jest.fn(),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

// =============================================================================
// Imports (after mocks)
// =============================================================================

import * as vscode from 'vscode';
import { resetEdsProjectWithUI } from '@/features/eds/services/reset/edsResetUI';
import {
    createResetContext,
    meshDeps,
} from './edsResetService.testUtils';



// Injected demo-packages fixture for extractResetParams (replaces config leaf mock)
const testPackages = [{
    id: 'citisignal',
    storefronts: {
        'eds-paas': {
            templateOwner: 'test-owner',
            templateRepo: 'test-template',
            contentSource: { org: 'content-org', site: 'content-site', indexPath: 'index.json' },
        },
    },
}];

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
                    daLiveSite: 'test-repo',
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

    it('should call ensureAdobeIOAuth with project adobe context when mesh project resets', async () => {
        // Given: Project with mesh and Adobe context
        const project = createProjectWithMesh({
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'workspace-789',
        });
        const context = createResetContext(project);

        // And: ensureAdobeIOAuth returns failed (causes early return)
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        // And: User confirms reset
        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project');

        // When
        const result = await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages });

        // Then: Should call ensureAdobeIOAuth with project context
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: 'proj-456',
                    workspace: 'workspace-789',
                }),
            }),
        );

        // And: Should return auth error since auth failed
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
    });

    it('should pass partial adobe fields gracefully (org set, ids undefined)', async () => {
        // Given: an Adobe-context project (a mesh IS an Adobe I/O project) whose
        // projectId/workspace happen to be undefined. The org alone arms the gate.
        const project = createProjectWithMesh({ organization: 'org-123' });
        const context = createResetContext(project);

        // And: ensureAdobeIOAuth returns failed (early return, before any reset work)
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project');

        // When
        await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages });

        // Then: ensureAdobeIOAuth is called with the org set and the ids undefined
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: undefined,
                    workspace: undefined,
                }),
            }),
        );
    });

    it('should return ADOBE_AUTH_REQUIRED when ensureAdobeIOAuth returns cancelled', async () => {
        // Given: Project with mesh
        const project = createProjectWithMesh({ organization: 'org-1' });
        const context = createResetContext(project);

        // And: ensureAdobeIOAuth returns cancelled
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        // And: User confirms reset
        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project');

        // When
        const result = await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages });

        // Then: Should return auth error
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
        expect(result.cancelled).toBe(true);
    });
});
