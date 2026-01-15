/**
 * Dashboard Handlers - EDS Actions Tests
 *
 * Tests for EDS (Edge Delivery Services) action handlers:
 * - handlePublishEds: Publish all content to CDN via HelixService
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
        },
        oauthService: {},
    }),
    clearServiceCache: jest.fn(),
}));

// Mock DaLiveContentOperations (dynamically imported)
// The mock must return success result by default
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

// Mock global fetch for code sync verification
global.fetch = jest.fn();

// =============================================================================
// Now import the modules under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { handlePublishEds, handleResetEds } from '@/features/dashboard/handlers/dashboardHandlers';
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
        selectedStack: 'eds-commerce',
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
                    templateOwner: 'hlxsites',
                    templateRepo: 'citisignal',
                    contentSource: {
                        org: 'demo-system-stores',
                        site: 'accs-citisignal',
                    },
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

describe('handlePublishEds', () => {
    let mockHelixService: jest.Mocked<HelixService>;
    let mockAuthService: { getTokenManager: jest.Mock };

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

        // Setup withProgress mock to execute the callback
        (vscode.window.withProgress as jest.Mock).mockImplementation(async (_options, callback) => {
            const progressReporter = { report: jest.fn() };
            return callback(progressReporter);
        });
    });

    it('should return success when publish completes', async () => {
        // Given: An EDS project with valid metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // When: handlePublishEds is called
        const result = await handlePublishEds(context);

        // Then: Should return success
        expect(result.success).toBe(true);

        // And: HelixService.publishAllSiteContent should be called with all parameters
        expect(mockHelixService.publishAllSiteContent).toHaveBeenCalledWith(
            'test-org/test-repo',
            'main',
            undefined,
            undefined,
            expect.any(Function),
        );

        // And: Should log the operation
        expect(context.logger.info).toHaveBeenCalled();
    });

    it('should return error when EDS metadata is missing', async () => {
        // Given: An EDS project without githubRepo metadata
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

        // When: handlePublishEds is called
        const result = await handlePublishEds(context);

        // Then: Should return error with appropriate code
        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.CONFIG_INVALID);
        expect(result.error).toContain('metadata');

        // And: HelixService should NOT be called
        expect(mockHelixService.publishAllSiteContent).not.toHaveBeenCalled();
    });

    it('should return error when HelixService throws', async () => {
        // Given: An EDS project with valid metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: HelixService throws an error
        const publishError = new Error('Access denied. You do not have permission to publish this content.');
        mockHelixService.publishAllSiteContent.mockRejectedValue(publishError);

        // When: handlePublishEds is called
        const result = await handlePublishEds(context);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('Access denied');

        // And: Should log the error
        expect(context.logger.error).toHaveBeenCalled();
    });

    it('should return error when project not found', async () => {
        // Given: No current project
        const context = createMockContext(undefined);

        // When: handlePublishEds is called
        const result = await handlePublishEds(context);

        // Then: Should return error with PROJECT_NOT_FOUND code
        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(result.error).toContain('project');

        // And: HelixService should NOT be called
        expect(mockHelixService.publishAllSiteContent).not.toHaveBeenCalled();
    });
});

// =============================================================================
// handleResetEds Tests
// =============================================================================

describe('handleResetEds', () => {
    let mockHelixService: jest.Mocked<HelixService>;
    let mockAuthService: { getTokenManager: jest.Mock };
    let mockFileOps: {
        listRepoFiles: jest.Mock;
        deleteFile: jest.Mock;
        getFileContent: jest.Mock;
        createOrUpdateFile: jest.Mock;
    };

    // Sample file data for tests
    const templateFiles = [
        { path: 'scripts/aem.js', type: 'blob' as const, sha: 'sha-aem-js', size: 1000 },
        { path: 'styles/styles.css', type: 'blob' as const, sha: 'sha-styles-css', size: 500 },
        { path: 'blocks/header/header.js', type: 'blob' as const, sha: 'sha-header-js', size: 200 },
    ];

    const userFilesWithExtraFile = [
        { path: 'scripts/aem.js', type: 'blob' as const, sha: 'sha-aem-js', size: 1000 }, // Same as template
        { path: 'styles/styles.css', type: 'blob' as const, sha: 'sha-styles-css-old', size: 500 }, // Different SHA
        { path: 'custom/my-file.js', type: 'blob' as const, sha: 'sha-custom', size: 300 }, // Extra file to delete
        { path: 'fstab.yaml', type: 'blob' as const, sha: 'sha-fstab', size: 100 }, // Should be preserved/updated
    ];

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

        // Default: return sample files for listing
        mockFileOps.listRepoFiles.mockImplementation(async (owner: string, _repo: string) => {
            if (owner === 'hlxsites') {
                return templateFiles;
            }
            return userFilesWithExtraFile;
        });

        // Default: return mock content for template files and user repo files
        mockFileOps.getFileContent.mockImplementation(async (owner: string, _repo: string, path: string) => {
            if (owner === 'hlxsites') {
                return { content: `content of ${path}`, sha: `sha-${path}`, path, encoding: 'utf-8' };
            }
            // For user repo files - look up in userFilesWithExtraFile
            const userFile = userFilesWithExtraFile.find(f => f.path === path);
            if (userFile) {
                return { content: `content of ${path}`, sha: userFile.sha, path, encoding: 'utf-8' };
            }
            return null;
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
        expect(mockFileOps.listRepoFiles).not.toHaveBeenCalled();
    });

    it('should list files from both template and user repos', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should list files from template repo
        expect(mockFileOps.listRepoFiles).toHaveBeenCalledWith('hlxsites', 'citisignal', 'main');

        // And: Should list files from user repo
        expect(mockFileOps.listRepoFiles).toHaveBeenCalledWith('test-org', 'test-repo', 'main');
    });

    it('should delete extra files not in template (except fstab.yaml)', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should delete extra file (custom/my-file.js)
        expect(mockFileOps.deleteFile).toHaveBeenCalledWith(
            'test-org',
            'test-repo',
            'custom/my-file.js',
            expect.stringContaining('remove'),
            'sha-custom',
        );

        // And: Should NOT delete fstab.yaml (preserved for configuration)
        const deleteFileCalls = mockFileOps.deleteFile.mock.calls;
        const deletedPaths = deleteFileCalls.map((call: string[]) => call[2]);
        expect(deletedPaths).not.toContain('fstab.yaml');
    });

    it('should copy template files with different SHA', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should copy file with different SHA (styles/styles.css)
        expect(mockFileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'test-org',
            'test-repo',
            'styles/styles.css',
            expect.any(String),
            expect.stringContaining('reset'),
            'sha-styles-css-old', // Existing SHA for update
        );

        // And: Should copy new file from template (blocks/header/header.js - not in user repo)
        expect(mockFileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'test-org',
            'test-repo',
            'blocks/header/header.js',
            expect.any(String),
            expect.stringContaining('reset'),
            undefined, // No existing SHA - new file
        );
    });

    it('should skip files with identical SHA (no unnecessary updates)', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should NOT copy file with identical SHA (scripts/aem.js has same SHA in both)
        const createOrUpdateCalls = mockFileOps.createOrUpdateFile.mock.calls;
        const updatedPaths = createOrUpdateCalls.map((call: string[]) => call[2]);
        expect(updatedPaths).not.toContain('scripts/aem.js');
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

        // And: Should show success message
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('EDS project reset successfully!');
    });

    it('should return error when file listing fails', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // And: GitHub file listing fails
        const listError = new Error('Failed to list files: permission denied');
        mockFileOps.listRepoFiles.mockRejectedValue(listError);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('permission denied');

        // And: Should show error message
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('should configure fstab.yaml for DA.live', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Should configure fstab.yaml with DA.live path
        expect(mockFileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'test-org',
            'test-repo',
            'fstab.yaml',
            expect.stringContaining('https://content.da.live/test-org/test-site/'),
            expect.stringContaining('fstab.yaml'),
            'sha-fstab', // Existing SHA from mock
        );
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
        expect(mockFileOps.listRepoFiles).not.toHaveBeenCalled();
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
});
