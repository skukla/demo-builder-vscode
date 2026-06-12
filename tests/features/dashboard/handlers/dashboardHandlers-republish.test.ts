/**
 * Dashboard Handlers - Republish Content Tests
 *
 * Tests for handleRepublishContent on the dashboard detail view. Mirrors the
 * kebab implementation but resolves the project via getCurrentProject(). Reuses
 * republishStorefrontContent + the same EDS metadata reads + DA.live auth.
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

jest.setTimeout(5000);

// =============================================================================
// Mock Setup
// =============================================================================

jest.mock('vscode', () => ({
    commands: { executeCommand: jest.fn().mockResolvedValue(undefined) },
    window: {
        activeColorTheme: { kind: 1 },
        showErrorMessage: jest.fn(),
        withProgress: jest.fn(),
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    ProgressLocation: { Notification: 15 },
    env: {
        clipboard: { writeText: jest.fn() },
        openExternal: jest.fn(),
    },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
    validateProjectNameSecurity: jest.fn(),
}));
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: jest.fn().mockResolvedValue({ success: true }),
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
jest.mock('@/features/eds/services/storefrontRepublishService', () => ({
    republishStorefrontContent: (...args: unknown[]) => mockRepublishStorefrontContent(...args),
}));

// =============================================================================
// Imports under test
// =============================================================================

import * as vscode from 'vscode';
import { handleRepublishContent } from '@/features/dashboard/handlers/dashboardHandlers';

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
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: { secrets: {} },
    } as unknown as HandlerContext;
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
            }),
        );
    });

    it('should surface republish failure', async () => {
        const project = createMockEdsProject();
        const context = createMockContext(project);
        mockRepublishStorefrontContent.mockResolvedValue({ success: false, error: 'pipeline failed' });

        const result = await handleRepublishContent(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('pipeline failed');
    });
});
