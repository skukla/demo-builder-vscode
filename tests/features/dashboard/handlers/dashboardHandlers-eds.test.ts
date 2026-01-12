/**
 * Dashboard Handlers - EDS Actions Tests
 *
 * Tests for EDS (Edge Delivery Services) action handlers:
 * - handlePublishEds: Publish all content to CDN via HelixService
 * - handleResetEds: Reset EDS project with cleanup and recreation
 *
 * Part of Step 1: Implement handlePublishEds handler
 * Part of Step 2: Implement handleResetEds handler
 */

import { handlePublishEds, handleResetEds } from '@/features/dashboard/handlers/dashboardHandlers';
import { ServiceLocator } from '@/core/di';
import { HelixService } from '@/features/eds/services/helixService';
import { CleanupService } from '@/features/eds/services/cleanupService';
import { EdsProjectService } from '@/features/eds/services/edsProjectService';
import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';
import { ErrorCode } from '@/types/errorCodes';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// Mock vscode - define mock functions inside the factory to avoid hoisting issues
jest.mock('vscode', () => {
    const mockShowWarningMessage = jest.fn();
    return {
        commands: {
            executeCommand: jest.fn().mockResolvedValue(undefined),
        },
        window: {
            activeColorTheme: { kind: 1 },
            showWarningMessage: mockShowWarningMessage,
        },
        ColorThemeKind: { Dark: 2, Light: 1 },
        env: {
            openExternal: jest.fn(),
        },
        Uri: {
            parse: jest.fn((url: string) => ({ toString: () => url })),
        },
    };
}, { virtual: true });

// Get reference to the mocked showWarningMessage for test assertions
import * as vscode from 'vscode';
const mockShowWarningMessage = vscode.window.showWarningMessage as jest.Mock;

// Mock ServiceLocator
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock HelixService
jest.mock('@/features/eds/services/helixService');

// Mock CleanupService
jest.mock('@/features/eds/services/cleanupService');

// Mock EdsProjectService
jest.mock('@/features/eds/services/edsProjectService');

// Mock stalenessDetector (required by dashboardHandlers module)
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication
jest.mock('@/features/authentication');

// Mock validation
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));

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
        jest.useFakeTimers();

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
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should return success when publish completes', async () => {
        // Given: An EDS project with valid metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // When: handlePublishEds is called
        const result = await handlePublishEds(context);

        // Then: Should return success
        expect(result.success).toBe(true);

        // And: HelixService.publishAllSiteContent should be called with repoFullName
        expect(mockHelixService.publishAllSiteContent).toHaveBeenCalledWith('test-org/test-repo');

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
    let mockCleanupService: jest.Mocked<CleanupService>;
    let mockEdsProjectService: jest.Mocked<EdsProjectService>;
    let mockAuthService: { getTokenManager: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Reset mock for confirmation dialog
        mockShowWarningMessage.mockReset();

        // Setup mock CleanupService
        mockCleanupService = {
            cleanupEdsResources: jest.fn().mockResolvedValue({
                backendData: { success: true, skipped: false },
                helix: { success: true, skipped: false },
                daLive: { success: true, skipped: false },
                github: { success: true, skipped: false },
            }),
        } as unknown as jest.Mocked<CleanupService>;

        // Setup mock EdsProjectService
        mockEdsProjectService = {
            setupProject: jest.fn().mockResolvedValue({ success: true }),
        } as unknown as jest.Mocked<EdsProjectService>;

        // Setup mock AuthenticationService (required for service creation)
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        };

        // Wire up ServiceLocator
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthService);

        // Make service constructors return our mocks
        (CleanupService as jest.Mock).mockImplementation(() => mockCleanupService);
        (EdsProjectService as jest.Mock).mockImplementation(() => mockEdsProjectService);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should show confirmation dialog before reset', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        mockShowWarningMessage.mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: Confirmation dialog should be shown with modal:true
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
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
        mockShowWarningMessage.mockResolvedValue(undefined);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return cancelled result
        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);

        // And: No cleanup should be called
        expect(mockCleanupService.cleanupEdsResources).not.toHaveBeenCalled();
    });

    it('should call CleanupService with correct options', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        mockShowWarningMessage.mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: CleanupService should be called with full cleanup options
        expect(mockCleanupService.cleanupEdsResources).toHaveBeenCalledWith(
            expect.objectContaining({
                githubRepo: 'test-org/test-repo',
            }),
            expect.objectContaining({
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            }),
        );
    });

    it('should call EdsProjectService.setupProject after cleanup', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        mockShowWarningMessage.mockResolvedValue('Reset Project');

        // When: handleResetEds is called
        await handleResetEds(context);

        // Then: EdsProjectService.setupProject should be called
        expect(mockEdsProjectService.setupProject).toHaveBeenCalled();
    });

    it('should return success when reset completes', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        mockShowWarningMessage.mockResolvedValue('Reset Project');

        // And: Both cleanup and setup succeed
        mockCleanupService.cleanupEdsResources.mockResolvedValue({
            backendData: { success: true, skipped: false },
            helix: { success: true, skipped: false },
            daLive: { success: true, skipped: false },
            github: { success: true, skipped: false },
        });
        mockEdsProjectService.setupProject.mockResolvedValue({ success: true });

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return success
        expect(result.success).toBe(true);
    });

    it('should return error when cleanup fails', async () => {
        // Given: Valid EDS project with metadata
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User confirms the reset
        mockShowWarningMessage.mockResolvedValue('Reset Project');

        // And: CleanupService throws an error
        const cleanupError = new Error('Failed to delete GitHub repository');
        mockCleanupService.cleanupEdsResources.mockRejectedValue(cleanupError);

        // When: handleResetEds is called
        const result = await handleResetEds(context);

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to delete');

        // And: EdsProjectService.setupProject should NOT be called
        expect(mockEdsProjectService.setupProject).not.toHaveBeenCalled();
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
        expect(mockShowWarningMessage).not.toHaveBeenCalled();

        // And: No cleanup should be called
        expect(mockCleanupService.cleanupEdsResources).not.toHaveBeenCalled();
    });
});
