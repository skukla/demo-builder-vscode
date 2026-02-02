/**
 * Dashboard Handlers - DA.live Auth Tests
 *
 * Tests for DA.live authentication in handleResetEds:
 * - Confirmation dialog shown first (immediate UX feedback)
 * - Auth check happens inside progress notification
 * - Sign-in notification when token is expired/expiring
 * - User response handling (Sign In vs dismiss)
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

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
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 1 },
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showInformationMessage: jest.fn().mockResolvedValue(undefined),
        withProgress: jest.fn(),
        createQuickPick: jest.fn(() => mockQuickPick),
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    ProgressLocation: {
        Notification: 15,
    },
    env: {
        openExternal: jest.fn(),
        clipboard: {
            readText: jest.fn(),
        },
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Mock DaLiveAuthService
const mockIsAuthenticated = jest.fn();
const mockGetAccessToken = jest.fn();
jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: mockIsAuthenticated,
        getAccessToken: mockGetAccessToken,
    })),
}));

// Mock ServiceLocator (both import paths used in the code)
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock HelixService
jest.mock('@/features/eds/services/helixService');

// Mock stalenessDetector (required by dashboardHandlers module)
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication
jest.mock('@/features/authentication');

// Mock showDaLiveAuthQuickPick result holder
let mockQuickPickAuthResult: { success: boolean; cancelled?: boolean; email?: string; error?: string } = { success: false, cancelled: true };

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
            resetRepoToTemplate: jest.fn().mockResolvedValue({ commitSha: 'abc1234567890', fileCount: 50 }),
        },
        oauthService: {},
    }),
    validateDaLiveToken: jest.fn().mockReturnValue({ valid: true, email: 'user@example.com' }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        storeToken: jest.fn().mockResolvedValue(undefined),
    }),
    showDaLiveAuthQuickPick: jest.fn().mockImplementation(() => Promise.resolve(mockQuickPickAuthResult)),
    clearServiceCache: jest.fn(),
    getAppliedPatchPaths: jest.fn().mockReturnValue([]),
    publishPatchedCodeToLive: jest.fn().mockResolvedValue(undefined),
    bulkPreviewAndPublish: jest.fn().mockResolvedValue(undefined),
}));

// Mock DaLiveContentOperations (dynamically imported)
// Note: copyMediaFromContent is no longer called - Admin API downloads images during preview
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
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
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        show: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

// Mock validation
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
    validateProjectPath: jest.fn(), // Allow all paths in tests
}));

// Mock GitHubAppService (dynamically imported for Code Sync verification)
jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
        getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync/installations/new'),
    })),
}));

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
jest.mock('@/features/eds/services/edsResetService', () => ({
    resetEdsProjectWithUI: (...args: unknown[]) => mockResetEdsProjectWithUI(...args),
    extractResetParams: (...args: unknown[]) => mockExtractResetParams(...args),
    executeEdsReset: (...args: unknown[]) => mockExecuteEdsReset(...args),
}));

// =============================================================================
// Now import the modules under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { handleResetEds } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { ServiceLocator } from '@/core/di';
import { ServiceLocator as ServiceLocatorDirect } from '@/core/di/serviceLocator';
import { HelixService } from '@/features/eds/services/helixService';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock EDS project with full metadata for reset operations
 */
function createMockEdsProject(overrides?: Partial<Project>): Project {
    return {
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
    } as unknown as Project;
}

/**
 * Create mock handler context with required dependencies
 */
function createMockContext(project: Project | undefined): HandlerContext {
    return {
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            loadProjectFromPath: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as HandlerContext['context'],
    } as unknown as HandlerContext;
}

// =============================================================================
// Tests - DA.live Auth Pre-check in handleResetEds
// =============================================================================

describe('handleResetEds DA.live auth (confirmation-first flow)', () => {
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
        (ServiceLocatorDirect.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthService);

        // Make HelixService constructor return our mock
        (HelixService as jest.Mock).mockImplementation(() => mockHelixService);

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
        mockExtractResetParams.mockImplementation((project: Project) => {
            const edsInstance = project?.componentInstances?.['eds-storefront'];
            const metadata = edsInstance?.metadata || {};

            // Validate required fields (mirrors real implementation)
            if (!metadata.githubRepo) {
                return {
                    success: false,
                    error: 'Missing EDS metadata: GitHub repository not configured',
                };
            }
            if (!metadata.daLiveOrg || !metadata.daLiveSite) {
                return {
                    success: false,
                    error: 'Missing DA.live configuration: org and site are required',
                };
            }

            const [repoOwner, repoName] = (metadata.githubRepo as string).split('/');
            return {
                success: true,
                params: {
                    repoOwner,
                    repoName,
                    daLiveOrg: metadata.daLiveOrg,
                    daLiveSite: metadata.daLiveSite,
                    templateOwner: 'skukla',
                    templateRepo: 'citisignal-eds-boilerplate',
                    contentSource: {
                        org: 'demo-system-stores',
                        site: 'accs-citisignal',
                        indexPath: 'full-index.json',
                    },
                    project,
                },
            };
        });

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

        // When: handleResetEds is called without project path
        const result = await handleResetEds(context, undefined);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toBe('Project path is required');
    });

    it('should return error when project is not found', async () => {
        // Given: Project path that doesn't exist
        const context = createMockContext(undefined); // loadProjectFromPath returns undefined

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: '/nonexistent/path' });

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toBe('Project not found');
    });

    it('should delegate to resetEdsProjectWithUI with correct options', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // When: handleResetEds is called
        await handleResetEds(context, { projectPath: project.path });

        // Then: Should delegate to resetEdsProjectWithUI
        expect(mockResetEdsProjectWithUI).toHaveBeenCalledWith({
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

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

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

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

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

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

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

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

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

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

        // Then: Should return success with extra fields
        expect(result.success).toBe(true);
        expect(result.filesReset).toBe(150);
        expect(result.contentCopied).toBe(25);
        expect(result.meshRedeployed).toBe(true);
    });
});
