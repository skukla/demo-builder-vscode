/**
 * Dashboard Handlers - DA.live Auth Tests
 *
 * Tests for DA.live authentication in handleResetProject:
 * - Confirmation dialog shown first (immediate UX feedback)
 * - Auth check happens inside progress notification
 * - Sign-in notification when token is expired/expiring
 * - User response handling (Sign In vs dismiss)
 */

import { HandlerContext } from '@/types/handlers';
import { fakeExtractResetParams } from '../../../helpers/edsResetParamsFake';
import { Project } from '@/types/base';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

// Mock QuickPick for DA.live auth flow
const mockQuickPick = {
    title: '',
    items: [],
    placeholder: '',
    busy: false,
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    onDidAccept: jest.fn(),
    onDidHide: jest.fn(),
    selectedItems: [],
};

// Mock vscode

// Mock DaLiveAuthService
const mockIsAuthenticated = jest.fn();
const mockGetAccessToken = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: mockIsAuthenticated,
        getAccessToken: mockGetAccessToken,
    })),
}));

// Mock ServiceLocator. There used to be TWO of these — the comment here read
// "both import paths used in the code", because the same class was reachable
// through `@/core/di` and `@/core/di/serviceLocator`. The two factories had
// DRIFTED: only one declared getCommandExecutor, and jest keeps the last
// registration, so which one won depended on their order in this file. That is
// precisely the defect ADR-022's rule names — a symbol reachable by two paths is
// a symbol whose home nobody can name. One path now, so one mock.
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));

// Mock HelixService
jest.mock('@/features/eds/services/helix/helixService');

// Mock stalenessDetector (required by dashboardHandlers module)
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication

// Mock showDaLiveAuthQuickPick result holder
const mockQuickPickAuthResult: {
    success: boolean;
    cancelled?: boolean;
    email?: string;
    error?: string;
} = { success: false, cancelled: true };

// Mock edsHelpers - getGitHubServices, validateDaLiveToken, getDaLiveAuthService, showDaLiveAuthQuickPick
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        repoOperations: {},
        fileOperations: {
            listRepoFiles: jest.fn(),
            deleteFile: jest.fn(),
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn(),
            resetRepoToTemplate: jest
                .fn()
                .mockResolvedValue({ commitSha: 'abc1234567890', fileCount: 50 }),
        },
        oauthService: {},
    }),
    validateDaLiveToken: jest.fn().mockReturnValue({ valid: true, email: 'user@example.com' }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        storeToken: jest.fn().mockResolvedValue(undefined),
    }),
    showDaLiveAuthQuickPick: jest
        .fn()
        .mockImplementation(() => Promise.resolve(mockQuickPickAuthResult)),
    clearServiceCache: jest.fn(),
    getAppliedPatchPaths: jest.fn().mockReturnValue([]),
    publishPatchedCodeToLive: jest.fn().mockResolvedValue(undefined),
    bulkPreviewAndPublish: jest.fn().mockResolvedValue(undefined),
}));

// Mock DaLiveContentOperations (dynamically imported)
// Note: copyMediaFromContent is no longer called - Admin API downloads images during preview
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        copyContentFromSource: jest.fn().mockResolvedValue({
            success: true,
            totalFiles: 10,
            copiedFiles: ['file1', 'file2'],
            failedFiles: [],
        }),
        createBlockLibraryFromTemplate: jest.fn().mockResolvedValue({
            success: true,
            blocksCount: 0,
            paths: [],
        }),
    })),
}));

// Mock core logging (prevents "Logger not initialized" error)

// Mock validation
jest.mock('@/core/validation/PathSafetyValidator', () => ({
    validateProjectPath: jest.fn(),
}));

jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));

// Mock GitHubAppService (dynamically imported for Code Sync verification)
// GitHubAppService is NOT mocked. Measured 2026-08-31: removing the mock changes
// nothing this suite observes — it was silencing a construction with no side effects.

// Mock configGenerator (dynamically imported for config.json generation)
jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockResolvedValue({
        success: true,
        content: '{"host":"example.com"}',
    }),
    extractConfigParams: jest.fn().mockReturnValue({}),
}));

// Mock configSyncService for CDN verification
jest.mock('@/features/eds/services/configSyncService', () => ({
    verifyCdnResources: jest.fn().mockResolvedValue({
        configVerified: true,
        blockLibraryVerified: true,
    }),
}));

// Mock global fetch for code sync verification
global.fetch = jest.fn();

// Mock edsResetService (dynamically imported) - the shared service for EDS resets
// resetEdsProjectWithUI is the consolidated entry point used by handlers
// extractResetParams and executeEdsReset are internal to the service
const mockResetEdsProjectWithUI = jest.fn();
const mockExtractResetParams = jest.fn();
const mockExecuteEdsReset = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetUI', () => ({
    resetEdsProjectWithUI: (...args: unknown[]) => mockResetEdsProjectWithUI(...args),
}));
jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    extractResetParams: (...args: unknown[]) => mockExtractResetParams(...args),
    executeEdsReset: (...args: unknown[]) => mockExecuteEdsReset(...args),
}));

// =============================================================================
// Now import the modules under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { handleResetProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ServiceLocator as ServiceLocatorDirect } from '@/core/di/serviceLocator';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock EDS project with full metadata for reset operations
 */
function createMockEdsProject(overrides?: Partial<Project>): Project {
    return createMockProject({
        name: 'test-eds-project',
        path: '/Users/test/.demo-builder/projects/test-eds',
        status: 'running',
        created: new Date('2025-01-26T10:00:00.000Z'),
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
        // Must match demo-packages.json for template lookup
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
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
                    // Note: templateOwner/templateRepo are derived from brand+stack in demo-packages.json
                    liveUrl: 'https://main--test-repo--test-org.aem.live',
                    previewUrl: 'https://main--test-repo--test-org.aem.page',
                },
            },
        },
        ...overrides,
    });
}

/**
 * Create mock handler context with required dependencies
 */
function createMockContext(project: Project | undefined): HandlerContext {
    return createMockHandlerContext({
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as unknown as HandlerContext['panel'],
        stateManager: createMockStateManager({
            loadProjectFromPath: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        debugLogger: createMockLogger() as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as HandlerContext['context'],
    });
}

// =============================================================================
// Tests - DA.live Auth Pre-check in handleResetProject
// =============================================================================

describe('handleResetProject DA.live auth (confirmation-first flow)', () => {
    let mockHelixService: jest.Mocked<HelixService>;
    let mockAuthService: { getTokenManager: jest.Mock };
    let mockFileOps: {
        resetRepoToTemplate: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock HelixService
        mockHelixService = {
            publishAllSiteContent: jest.fn().mockResolvedValue(undefined),
            previewCode: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<HelixService>;

        // Setup mock AuthenticationService
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        };

        // Wire up ServiceLocator (both import paths)
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthService);
        (ServiceLocatorDirect.getAuthenticationService as jest.Mock).mockReturnValue(
            mockAuthService
        );

        // Make HelixService constructor return our mock
        (HelixService as unknown as jest.Mock).mockImplementation(() => mockHelixService);

        // Setup GitHub mocks
        const gitHubServices = (getGitHubServices as jest.Mock)();
        mockFileOps = gitHubServices.fileOperations;
        mockFileOps.resetRepoToTemplate.mockReset().mockResolvedValue({
            commitSha: 'abc1234567890',
            fileCount: 100,
        });

        // Mock fetch for code sync verification
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

        // Setup withProgress mock to execute the callback
        (vscode.window.withProgress as jest.Mock).mockImplementation(async (_options, callback) => {
            const progressReporter = { report: jest.fn() };
            return callback(progressReporter);
        });

        // Default: DA.live token is valid
        mockIsAuthenticated.mockResolvedValue(true);
        mockGetAccessToken.mockResolvedValue('mock-dalive-token');

        // Reset mockQuickPick state
        mockQuickPick.title = '';
        mockQuickPick.items = [];
        mockQuickPick.placeholder = '';
        mockQuickPick.busy = false;
        mockQuickPick.show.mockClear();
        mockQuickPick.hide.mockClear();
        mockQuickPick.dispose.mockClear();
        mockQuickPick.onDidAccept.mockClear();
        mockQuickPick.onDidHide.mockClear();
        mockQuickPick.selectedItems = [];

        // Setup edsResetService mocks
        // Default: extractResetParams returns success with valid params
        mockExtractResetParams.mockImplementation(fakeExtractResetParams);

        // Default: executeEdsReset returns success
        mockExecuteEdsReset.mockResolvedValue({
            success: true,
            filesReset: 100,
            contentCopied: 10,
        });

        // Default: resetEdsProjectWithUI returns success
        // This is the consolidated function that the handler delegates to
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: true,
            filesReset: 100,
            contentCopied: 10,
        });
    });

    // =================================================================
    // Handler Delegation Tests
    // The projects-dashboard handler delegates to resetEdsProjectWithUI
    // Detailed auth behavior tests should be in edsResetService tests
    // =================================================================

    it('should return error when project path is missing', async () => {
        // Given: No project path
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // When: handleResetProject is called without project path
        const result = await handleResetProject(context, undefined);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toBe('Project path is required');
    });

    it('should return error when project is not found', async () => {
        // Given: Project path that doesn't exist
        const context = createMockContext(undefined); // loadProjectFromPath returns undefined

        // When: handleResetProject is called
        const result = await handleResetProject(context, { projectPath: '/nonexistent/path' });

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toBe('Project not found');
    });

    it('should delegate to resetEdsProjectWithUI with correct options', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // When: handleResetProject is called
        await handleResetProject(context, { projectPath: project.path });

        // Then: Should delegate to resetEdsProjectWithUI
        expect(mockResetEdsProjectWithUI).toHaveBeenCalledWith({
            // ADR-015: collaborators the mesh-redeploy step receives.
            meshDeps: expect.anything(),
            project,
            context,
            logPrefix: '[ProjectsList]',
            includeBlockLibrary: true,
            verifyCdn: true,
            showLogsOnError: true,
        });
    });

    it('should return success from resetEdsProjectWithUI', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: resetEdsProjectWithUI returns success
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: true,
            filesReset: 100,
            contentCopied: 10,
        });

        // When: handleResetProject is called
        const result = await handleResetProject(context, { projectPath: project.path });

        // Then: Should return success
        expect(result.success).toBe(true);
    });

    it('should return cancelled from resetEdsProjectWithUI', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: resetEdsProjectWithUI returns cancelled
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: false,
            cancelled: true,
        });

        // When: handleResetProject is called
        const result = await handleResetProject(context, { projectPath: project.path });

        // Then: Should return cancelled
        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);
    });

    it('should return auth error from resetEdsProjectWithUI', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: resetEdsProjectWithUI returns auth error
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: false,
            error: 'DA.live authentication required',
            errorType: 'DALIVE_AUTH_REQUIRED',
        });

        // When: handleResetProject is called
        const result = await handleResetProject(context, { projectPath: project.path });

        // Then: Should return the auth error
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('DALIVE_AUTH_REQUIRED');
    });

    it('should return error from resetEdsProjectWithUI', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: resetEdsProjectWithUI returns error
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: false,
            error: 'EDS metadata missing',
        });

        // When: handleResetProject is called
        const result = await handleResetProject(context, { projectPath: project.path });

        // Then: Should return the error
        expect(result.success).toBe(false);
        expect(result.error).toBe('EDS metadata missing');
    });

    it('should pass result with extra fields from resetEdsProjectWithUI', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: resetEdsProjectWithUI returns success with extra fields
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: true,
            filesReset: 150,
            contentCopied: 25,
            meshRedeployed: true,
        });

        // When: handleResetProject is called
        const result = await handleResetProject(context, { projectPath: project.path });

        // Then: Should return success with extra fields
        expect(result.success).toBe(true);
        expect(result.filesReset).toBe(150);
        expect(result.contentCopied).toBe(25);
        expect(result.meshRedeployed).toBe(true);
    });
});
