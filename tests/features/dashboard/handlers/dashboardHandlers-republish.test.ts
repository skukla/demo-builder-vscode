/**
 * Dashboard Handlers - Republish Content Tests
 *
 * Tests for handleRepublishContent on the dashboard detail view. Mirrors the
 * kebab implementation but resolves the project via getCurrentProject(). Reuses
 * republishStorefrontContent + the same EDS metadata reads + DA.live auth.
 */

import './dashboardValidatorMocks';

jest.mock('@/core/validation/validators/ProjectNameValidator', () => ({
    validateProjectNameSecurity: jest.fn(),
}));

// Imported by the dashboardHandlers module, so it has to answer even when unused.
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: jest.fn().mockResolvedValue({ success: true }),
}));

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mock Setup
// =============================================================================


jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
// edsHelpers - DA.live auth + github services (dynamically imported)
const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
    getDaLiveAuthService: jest.fn().mockReturnValue({}),
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
}));

// storefrontRepublishService - the shared pipeline (dynamically imported)
const mockRepublishStorefrontContent = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontContent: (...args: unknown[]) => mockRepublishStorefrontContent(...args),
}));

// =============================================================================
// Imports under test
// =============================================================================

import * as vscode from 'vscode';
import { handleRepublishContent } from '@/features/dashboard/handlers/dashboardHandlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

// =============================================================================
// Utilities
// =============================================================================

function createMockEdsProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-eds-project',
        path: '/path/to/project',
        status: 'ready',
        created: new Date('2025-01-26T10:00:00.000Z'),
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
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
        },
        ...overrides,
    } as unknown as Project;
}

function createMockContext(project: Project | undefined): HandlerContext {
    return createMockHandlerContext({
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
}

// =============================================================================
// Tests
// =============================================================================

describe('handleRepublishContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Run the withProgress callback immediately
        (vscode.window.withProgress as jest.Mock).mockImplementation(async (_opts, cb) => {
            return cb({ report: jest.fn() });
        });

        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockRepublishStorefrontContent.mockResolvedValue({ success: true, cdnVerified: true });
    });

    it('should return error when no current project', async () => {
        const context = createMockContext(undefined);

        const result = await handleRepublishContent(context);

        expect(result.success).toBe(false);
        expect(mockRepublishStorefrontContent).not.toHaveBeenCalled();
    });

    it('should return error when EDS repository metadata is missing', async () => {
        const project = createMockEdsProject({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    type: 'frontend',
                    status: 'ready',
                    metadata: {},
                },
            } as unknown as Project['componentInstances'],
        });
        const context = createMockContext(project);

        const result = await handleRepublishContent(context);

        expect(result.success).toBe(false);
        expect(mockRepublishStorefrontContent).not.toHaveBeenCalled();
    });

    it('should not republish when DA.live auth fails', async () => {
        const project = createMockEdsProject();
        const context = createMockContext(project);
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, error: 'auth required' });

        const result = await handleRepublishContent(context);

        expect(result.success).toBe(false);
        expect(mockRepublishStorefrontContent).not.toHaveBeenCalled();
    });

    it('should run republishStorefrontContent with metadata-derived repo/org/site', async () => {
        const project = createMockEdsProject();
        const context = createMockContext(project);

        const result = await handleRepublishContent(context);

        expect(result.success).toBe(true);
        expect(mockRepublishStorefrontContent).toHaveBeenCalledWith(
            expect.objectContaining({
                repoOwner: 'test-org',
                repoName: 'test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
            })
        );
    });

    it('should surface republish failure', async () => {
        const project = createMockEdsProject();
        const context = createMockContext(project);
        mockRepublishStorefrontContent.mockResolvedValue({
            success: false,
            error: 'pipeline failed',
        });

        const result = await handleRepublishContent(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('pipeline failed');
    });

    /**
     * The amber dot must clear when the republish succeeds.
     *
     * `republishStorefrontContent` sets `edsStorefrontStatusSummary = 'published'`
     * on the project, but this handler returned `{ success: true }` and pushed
     * nothing — so the open dashboard kept rendering the storefront status it was
     * given at init, and the Republish tile stayed amber until the dashboard was
     * reopened.
     *
     * Its neighbour `handleRenameProject` gets this right for the same reason
     * (the title comes from the status payload, so it re-runs status). The
     * storefront status travels in that same payload —
     * `buildStatusPayload` carries `edsStorefrontStatus`.
     */
    it('pushes a status update so the tile stops showing amber', async () => {
        const context = createMockContext(createMockEdsProject());

        await handleRepublishContent(context);

        const posted = (context.panel!.webview.postMessage as jest.Mock).mock.calls.map(
            ([m]) => m?.type
        );
        expect(posted).toContain('statusUpdate');
    });

    it('does NOT push when the republish failed — nothing changed', async () => {
        mockRepublishStorefrontContent.mockResolvedValue({
            success: false,
            error: 'boom',
        });
        const context = createMockContext(createMockEdsProject());

        await handleRepublishContent(context);

        const posted = (context.panel!.webview.postMessage as jest.Mock).mock.calls.map(
            ([m]) => m?.type
        );
        expect(posted).not.toContain('statusUpdate');
    });
});
