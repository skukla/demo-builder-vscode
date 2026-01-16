/**
 * Dashboard Handlers - DA.live Auth Pre-check Tests
 *
 * Tests for DA.live authentication pre-check in handleResetEds:
 * - Token validity check before confirmation dialog
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
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
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
jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: mockIsAuthenticated,
    })),
}));

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
            getFileContent: jest.fn(),
            createOrUpdateFile: jest.fn(),
            resetRepoToTemplate: jest.fn(),
        },
        oauthService: {},
    }),
    validateDaLiveToken: jest.fn().mockReturnValue({ valid: true, email: 'user@example.com' }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        storeToken: jest.fn().mockResolvedValue(undefined),
    }),
    showDaLiveAuthQuickPick: jest.fn().mockImplementation(() => Promise.resolve(mockQuickPickAuthResult)),
    clearServiceCache: jest.fn(),
}));

// Mock DaLiveContentOperations (dynamically imported)
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
    validateProjectPath: jest.fn(), // Allow all paths in tests
}));

// Mock global fetch for code sync verification
global.fetch = jest.fn();

// =============================================================================
// Now import the modules under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { handleResetEds } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { ServiceLocator } from '@/core/di';
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

describe('handleResetEds DA.live auth pre-check', () => {
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
    });

    // =========================================================================
    // Test 1: Valid token proceeds to confirmation dialog (happy path)
    // =========================================================================
    it('should proceed to confirmation dialog when DA.live token is valid', async () => {
        // Given: Valid DA.live token
        mockIsAuthenticated.mockResolvedValue(true);
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User cancels at confirmation dialog
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

        // Then: Should reach confirmation dialog
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('reset'),
            expect.objectContaining({ modal: true }),
            'Reset Project',
        );

        // And: Should return cancelled (user didn't confirm)
        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);
    });

    // =========================================================================
    // Test 2: Expired token shows notification with "Sign In" button
    // =========================================================================
    it('should show sign-in notification when DA.live token is expired', async () => {
        // Given: Expired DA.live token
        mockIsAuthenticated.mockResolvedValue(false);
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User dismisses the notification
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

        // Then: Should show warning notification with Sign In button
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Your DA.live session has expired. Please sign in to continue.',
            'Sign In',
        );

        // And: Should return error with DALIVE_AUTH_REQUIRED type
        expect(result.success).toBe(false);
        expect(result.error).toBe('DA.live authentication required');
        expect(result.errorType).toBe('DALIVE_AUTH_REQUIRED');
    });

    // =========================================================================
    // Test 3: User clicks "Sign In" invokes QuickPick authentication flow
    // =========================================================================
    it('should invoke QuickPick auth flow when user clicks Sign In', async () => {
        // Given: Expired DA.live token
        mockIsAuthenticated.mockResolvedValue(false);
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User clicks "Sign In" button, then cancels QuickPick
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

        // Setup QuickPick mock to return cancelled
        const { showDaLiveAuthQuickPick } = require('@/features/eds/handlers/edsHelpers');
        (showDaLiveAuthQuickPick as jest.Mock).mockResolvedValue({ success: false, cancelled: true });

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

        // Then: QuickPick should be invoked
        expect(showDaLiveAuthQuickPick).toHaveBeenCalledWith(context);

        // And: Should return cancelled
        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);
    });

    // =========================================================================
    // Test 4: User dismisses notification returns error without authRequired
    // =========================================================================
    it('should return error without authRequired when user dismisses notification', async () => {
        // Given: Expired DA.live token
        mockIsAuthenticated.mockResolvedValue(false);
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: User dismisses notification (returns undefined)
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: handleResetEds is called
        const result = await handleResetEds(context, { projectPath: project.path });

        // Then: Should return error without authRequired flag
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('DALIVE_AUTH_REQUIRED');
        expect(result.authRequired).toBeUndefined();
    });

    // =========================================================================
    // Test 5: Pre-check happens BEFORE confirmation dialog (order verification)
    // =========================================================================
    it('should check DA.live auth BEFORE showing confirmation dialog', async () => {
        // Given: Expired DA.live token
        mockIsAuthenticated.mockResolvedValue(false);
        const project = createMockEdsProject();
        const context = createMockContext(project);

        // And: Track showWarningMessage call order
        const callOrder: string[] = [];
        mockIsAuthenticated.mockImplementation(async () => {
            callOrder.push('isAuthenticated');
            return false;
        });
        (vscode.window.showWarningMessage as jest.Mock).mockImplementation(async (message: string) => {
            if (message.includes('DA.live')) {
                callOrder.push('daLiveNotification');
            } else if (message.includes('reset')) {
                callOrder.push('confirmationDialog');
            }
            return undefined;
        });

        // When: handleResetEds is called
        await handleResetEds(context, { projectPath: project.path });

        // Then: DA.live auth check should happen BEFORE any dialog
        expect(callOrder[0]).toBe('isAuthenticated');
        expect(callOrder[1]).toBe('daLiveNotification');

        // And: Confirmation dialog should NOT be shown (we returned early)
        expect(callOrder).not.toContain('confirmationDialog');
    });

    // =========================================================================
    // Test 6: Pre-check uses DaLiveAuthService instance with context
    // =========================================================================
    it('should instantiate DaLiveAuthService with context', async () => {
        // Given: Expired DA.live token
        mockIsAuthenticated.mockResolvedValue(false);
        const project = createMockEdsProject();
        const context = createMockContext(project);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: handleResetEds is called
        await handleResetEds(context, { projectPath: project.path });

        // Then: DaLiveAuthService should be instantiated with vscode.ExtensionContext
        const { DaLiveAuthService } = require('@/features/eds/services/daLiveAuthService');
        expect(DaLiveAuthService).toHaveBeenCalledWith(context.context);
    });

    // =========================================================================
    // Test 7: Logs message when DA.live token is expired
    // =========================================================================
    it('should log when DA.live token is expired', async () => {
        // Given: Expired DA.live token
        mockIsAuthenticated.mockResolvedValue(false);
        const project = createMockEdsProject();
        const context = createMockContext(project);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: handleResetEds is called
        await handleResetEds(context, { projectPath: project.path });

        // Then: Should log the expired token message
        expect(context.logger.info).toHaveBeenCalledWith(
            expect.stringContaining('DA.live token expired'),
        );
    });
});
