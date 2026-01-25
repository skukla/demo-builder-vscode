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
            getFileContent: jest.fn(),
            createOrUpdateFile: jest.fn(),
            resetRepoToTemplate: jest.fn(), // Bulk tree operation
        },
        oauthService: {},
    }),
    clearServiceCache: jest.fn(),
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
}));

// Mock GitHubAppService (dynamically imported for Code Sync verification)
jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
        getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync/installations/new'),
    })),
}));

// Mock templatePatchRegistry (dynamically imported for template patches)
jest.mock('@/features/eds/services/templatePatchRegistry', () => ({
    applyTemplatePatches: jest.fn().mockResolvedValue([
        { patchId: 'header-nav-tools-defensive', applied: true },
    ]),
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
    });

    it('should show confirmation dialog before reset', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Confirmation dialog should be shown with modal:true
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('reset'),
            expect.objectContaining({ modal: true }),
            'Reset Project',
        );
    });

    it('should return cancelled when user declines', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User clicks Cancel (returns undefined)
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return cancelled result
        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);

        // And: No GitHub operations should be called
        expect(mockFileOps.resetRepoToTemplate).not.toHaveBeenCalled();
    });

    it('should call bulk resetRepoToTemplate with correct parameters', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should call bulk reset with template and target repos
        // Template values derived from demo-packages.json: citisignal package + eds-paas stack
        expect(mockFileOps.resetRepoToTemplate).toHaveBeenCalledWith(
            'demo-system-stores',   // templateOwner (from demo-packages.json)
            'accs-citisignal',      // templateRepo (from demo-packages.json)
            'test-org',             // targetOwner
            'test-repo',            // targetRepo
            expect.any(Map),        // fileOverrides (contains fstab.yaml)
            'main',                 // branch
        );

        // And: fileOverrides should contain fstab.yaml with DA.live path
        const fileOverrides = mockFileOps.resetRepoToTemplate.mock.calls[0][4] as Map<string, string>;
        expect(fileOverrides.has('fstab.yaml')).toBe(true);
        expect(fileOverrides.get('fstab.yaml')).toContain('https://content.da.live/test-org/test-site/');
    });

    it('should use bulk operation instead of file-by-file copying', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Bulk operation should be used (not individual file operations)
        expect(mockFileOps.resetRepoToTemplate).toHaveBeenCalledTimes(1);

        // And: Individual file operations should NOT be used for the reset
        // (only for content copying which is handled separately by DA.live)
        expect(mockFileOps.listRepoFiles).not.toHaveBeenCalled();
        expect(mockFileOps.deleteFile).not.toHaveBeenCalled();
        expect(mockFileOps.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('should return success when reset completes', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return success
        expect(result.success).toBe(true);

        // And: Should show auto-dismissing success notification
        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            { location: vscode.ProgressLocation.Notification, title: '"test-eds-project" reset successfully' },
            expect.any(Function),
        );
    });

    it('should return error when bulk reset fails', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // And: Bulk reset fails
        const resetError = new Error('Failed to reset repo: permission denied');
        mockFileOps.resetRepoToTemplate.mockRejectedValue(resetError);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('permission denied');

        // And: Should show error message
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('should include fstab.yaml override in bulk reset', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Bulk reset should be called with fstab.yaml in file overrides
        expect(mockFileOps.resetRepoToTemplate).toHaveBeenCalled();
        const fileOverrides = mockFileOps.resetRepoToTemplate.mock.calls[0][4] as Map<string, string>;

        // And: fstab.yaml should have DA.live content source path
        expect(fileOverrides.get('fstab.yaml')).toContain('https://content.da.live/test-org/test-site/');
        expect(fileOverrides.get('fstab.yaml')).toContain('mountpoints:');
    });

    it('should return error when project has no EDS metadata', async () => {
        // Given: Project without EDS metadata (no githubRepo)
        const project = createMockEdsProject({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    type: 'frontend',
                    status: 'ready',
                    metadata: {
                        // No githubRepo - missing EDS metadata
                        daLiveOrg: 'test-org',
                        daLiveSite: 'test-site',
                    },
                },
            },
        });
        const context = createMockContext(project);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return error about missing metadata
        expect(result.success).toBe(false);
        expect(result.error).toContain('metadata');

        // And: No confirmation dialog should be shown
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();

        // And: No GitHub operations should be called
        expect(mockFileOps.resetRepoToTemplate).not.toHaveBeenCalled();
    });

    it('should return error when DA.live config is missing', async () => {
        // Given: Project without DA.live metadata
        const project = createMockEdsProject({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    type: 'frontend',
                    status: 'ready',
                    metadata: {
                        githubRepo: 'test-org/test-repo',
                        // No daLiveOrg/daLiveSite
                    },
                },
            },
        });
        const context = createMockContext(project);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return error about missing DA.live config
        expect(result.success).toBe(false);
        expect(result.error).toContain('DA.live');

        // And: No confirmation dialog should be shown
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should publish content to CDN after reset', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should publish content to CDN with progress callback
        expect(mockHelixService.publishAllSiteContent).toHaveBeenCalledWith(
            'test-org/test-repo',
            'main',
            undefined,
            undefined,
            expect.any(Function),
        );
    });

    it('should copy content with absolute media URLs for Admin API image handling', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Content should be copied to DA.live
        // The transformHtmlForDaLive method converts relative media URLs to absolute URLs
        // pointing to the source CDN, allowing Admin API to download images during preview
        const { DaLiveContentOperations } = require('@/features/eds/services/daLiveContentOperations');
        const mockInstance = DaLiveContentOperations.mock.results[0]?.value;

        // Content is copied with source info (absolute URLs handled internally)
        expect(mockInstance.copyContentFromSource).toHaveBeenCalledWith(
            expect.objectContaining({
                org: 'demo-system-stores',
                site: 'accs-citisignal',
                indexUrl: expect.stringContaining('full-index.json'),
            }),
            'test-org', // daLiveOrg
            'test-site', // daLiveSite
            expect.any(Function), // progressCallback
        );
    });
});
