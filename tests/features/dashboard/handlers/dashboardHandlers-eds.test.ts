/**
 * Dashboard Handlers - EDS Actions Tests
 *
 * Tests for EDS (Edge Delivery Services) action handlers:
 * - handleResetEds: Reset EDS project (reset repo contents to template, recopy content)
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';
import { ErrorCode } from '@/types/errorCodes';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 1 },
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn(),
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    ProgressLocation: {
        Notification: 15,
    },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Mock ServiceLocator
jest.mock('@/core/di', () => ({
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

// Mock edsHelpers - getGitHubServices
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        repoOperations: {},
        fileOperations: {
            listRepoFiles: jest.fn(),
            deleteFile: jest.fn(),
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn(),
            resetRepoToTemplate: jest.fn(), // Bulk tree operation
        },
        oauthService: {},
    }),
    clearServiceCache: jest.fn(),
    showDaLiveAuthQuickPick: jest.fn().mockResolvedValue({ success: false, cancelled: true }),
    getAppliedPatchPaths: jest.fn().mockReturnValue([]),
    publishPatchedCodeToLive: jest.fn().mockResolvedValue(undefined),
    bulkPreviewAndPublish: jest.fn().mockResolvedValue(undefined),
}));

// Mock DaLiveContentOperations (dynamically imported)
// The mock must return success result by default
// Note: copyMediaFromContent is no longer called - Admin API downloads images during preview
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        copyContentFromSource: jest.fn().mockResolvedValue({
            success: true,
            totalFiles: 10,
            copiedFiles: ['file1', 'file2'],
            failedFiles: [],
        }),
    })),
}));

// Mock DaLiveAuthService - default to authenticated
// This allows existing EDS tests to pass without being blocked by auth pre-check
jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    })),
}));

// Mock core logging (prevents "Logger not initialized" error)
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
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

// Mock global fetch for code sync verification
global.fetch = jest.fn();

// Mock edsResetService (dynamically imported) - the shared service for EDS resets
// resetEdsProjectWithUI is the consolidated entry point for EDS reset
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
import { handleResetEds } from '@/features/dashboard/handlers/dashboardHandlers';
import { ServiceLocator } from '@/core/di';
import { HelixService } from '@/features/eds/services/helixService';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock EDS project with metadata
 */
function createMockEdsProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-eds-project',
        path: '/path/to/project',
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
                    // keeping here for reference but they're not used by the reset flow
                    liveUrl: 'https://main--test-repo--test-org.aem.live',
                    previewUrl: 'https://main--test-repo--test-org.aem.page',
                },
            },
        },
        ...overrides,
    } as unknown as Project;
}

/**
 * Create mock handler context
 */
function createMockContext(project: Project | undefined): HandlerContext {
    return {
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as unknown as HandlerContext['panel'],
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
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            secrets: {},
        },
    } as unknown as HandlerContext;
}

// =============================================================================
// Tests
// =============================================================================

describe('handleResetEds', () => {
    let mockHelixService: jest.Mocked<HelixService>;
    let mockAuthService: { getTokenManager: jest.Mock };
    let mockFileOps: {
        listRepoFiles: jest.Mock;
        deleteFile: jest.Mock;
        getFileContent: jest.Mock;
        createOrUpdateFile: jest.Mock;
        resetRepoToTemplate: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock HelixService
        mockHelixService = {
            publishAllSiteContent: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<HelixService>;

        // Setup mock AuthenticationService
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        };

        // Wire up ServiceLocator
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthService);

        // Make HelixService constructor return our mock
        (HelixService as jest.Mock).mockImplementation(() => mockHelixService);

        // Setup GitHub mocks - get references from the mocked module
        const gitHubServices = (getGitHubServices as jest.Mock)();
        mockFileOps = gitHubServices.fileOperations;

        // Reset and configure GitHub mocks
        mockFileOps.listRepoFiles.mockReset();
        mockFileOps.deleteFile.mockReset().mockResolvedValue(undefined);
        mockFileOps.getFileContent.mockReset();
        mockFileOps.createOrUpdateFile.mockReset().mockResolvedValue(undefined);
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
        // This is the consolidated function that handles confirmation, auth, and progress
        mockResetEdsProjectWithUI.mockResolvedValue({
            success: true,
            filesReset: 100,
            contentCopied: 10,
        });
    });

    // =================================================================
    // Handler Delegation Tests
    // The dashboard handler delegates to resetEdsProjectWithUI
    // Detailed behavior tests are in edsResetService tests
    // =================================================================

    it('should return error when no current project', async () => {
        // Given: No current project
        const context = createMockContext(undefined);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toBe('No project found');

        // And: resetEdsProjectWithUI should not be called
        expect(mockResetEdsProjectWithUI).not.toHaveBeenCalled();
    });

    it('should delegate to resetEdsProjectWithUI with correct options', async () => {
        // Given: Valid EDS project
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should delegate to resetEdsProjectWithUI
        expect(mockResetEdsProjectWithUI).toHaveBeenCalledWith({
            project,
            context,
            logPrefix: '[Dashboard]',
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
        const result = await handleResetEds(context);

        // Then: Should return the success result
        expect(result.success).toBe(true);
        expect(result.filesReset).toBe(100);
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
        const result = await handleResetEds(context);

        // Then: Should return cancelled
        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);
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
        const result = await handleResetEds(context);

        // Then: Should return the error
        expect(result.success).toBe(false);
        expect(result.error).toBe('EDS metadata missing');
    });
});
