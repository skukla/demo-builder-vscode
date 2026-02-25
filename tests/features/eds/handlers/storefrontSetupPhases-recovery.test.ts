/**
 * Storefront Setup Phases - Mid-pipeline Recovery Tests
 *
 * Tests for DA.live token expiry recovery during content pipeline:
 * - DaLiveAuthError triggers ensureDaLiveAuth pause-and-prompt
 * - Successful re-auth resumes pipeline (second attempt succeeds)
 * - Failed re-auth (cancelled) throws descriptive error
 * - Failed re-auth (error) throws descriptive error
 * - Max attempts (2) exceeded -> throws on 3rd DaLiveAuthError
 * - Non-auth errors propagate normally
 * - Progress messages sent for auth-recovery and resume
 * - Signal aborted -> throws "Operation cancelled" before pipeline
 *
 * Step 5b: Wrap content pipeline with DaLiveAuthError catch for mid-pipeline recovery.
 */

import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

// =============================================================================
// Mocks - defined before imports
// =============================================================================

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn(),
}));

jest.mock('vscode', () => ({
    window: {
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
}), { virtual: true });

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('user@test.com'),
    })),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveTokenProvider: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    }),
    createDaLiveServiceTokenProvider: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    }),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({
        createFromTemplate: jest.fn(),
        waitForContent: jest.fn(),
    })),
}));

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: jest.fn().mockResolvedValue(null),
        createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
    })),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({
        previewCode: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        registerSite: jest.fn().mockResolvedValue({ success: true }),
        setFolderMapping: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mountpoints:\n  /: https://content.da.live/org/site'),
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollection: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));

// Mock fetch for code sync verification
global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
// Import DaLiveAuthError and module under test (after mocks)
// =============================================================================

import { DaLiveAuthError } from '@/features/eds/services/types';
import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetupPhases';
import { ensureDaLiveAuth, configureDaLivePermissions } from '@/features/eds/handlers/edsHelpers';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';

// Get mock references
const mockEnsureDaLiveAuth = ensureDaLiveAuth as jest.MockedFunction<typeof ensureDaLiveAuth>;
const mockExecuteEdsPipeline = executeEdsPipeline as jest.MockedFunction<typeof executeEdsPipeline>;
const mockConfigurePerms = configureDaLivePermissions as jest.MockedFunction<typeof configureDaLivePermissions>;

// =============================================================================
// Helpers
// =============================================================================

function createMockContext(): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as Logger,
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            secrets: {},
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as HandlerContext['context'],
        sharedState: {},
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        },
    } as unknown as HandlerContext;
}

function createEdsConfig() {
    return {
        repoName: 'test-repo',
        repoMode: 'new' as const,
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        githubOwner: 'test-owner',
        templateOwner: 'tmpl-owner',
        templateRepo: 'tmpl-repo',
        createdRepo: {
            owner: 'test-owner',
            name: 'test-repo',
            url: 'https://github.com/test-owner/test-repo',
            fullName: 'test-owner/test-repo',
        },
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('executeStorefrontSetupPhases - Mid-pipeline Recovery', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    // =========================================================================
    // DaLiveAuthError triggers recovery
    // =========================================================================

    it('should trigger ensureDaLiveAuth when DaLiveAuthError is thrown', async () => {
        // Given: Pipeline throws DaLiveAuthError on first attempt, succeeds on second
        mockExecuteEdsPipeline
            .mockRejectedValueOnce(new DaLiveAuthError('DA.live token expired'))
            .mockResolvedValueOnce({ success: true, libraryPaths: [] });

        // And: Re-auth succeeds
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: ensureDaLiveAuth should have been called
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(mockContext, '[Storefront Setup]');
        expect(result.success).toBe(true);
    });

    // =========================================================================
    // Successful re-auth resumes pipeline
    // =========================================================================

    it('should resume pipeline after successful re-auth', async () => {
        // Given: First pipeline call fails with auth error
        mockExecuteEdsPipeline
            .mockRejectedValueOnce(new DaLiveAuthError('Token expired'))
            .mockResolvedValueOnce({ success: true, libraryPaths: ['nav'] });

        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Pipeline should have been called twice
        expect(mockExecuteEdsPipeline).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
    });

    // =========================================================================
    // Failed re-auth (cancelled)
    // =========================================================================

    it('should throw descriptive error when re-auth is cancelled', async () => {
        // Given: Pipeline fails with auth error
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('Token expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should return error (caught by outer try-catch)
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
    });

    // =========================================================================
    // Failed re-auth (error)
    // =========================================================================

    it('should throw descriptive error when re-auth fails', async () => {
        // Given: Pipeline fails, re-auth fails
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('Token expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({
            authenticated: false,
            error: 'Token validation failed',
        });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('re-authentication failed');
    });

    // =========================================================================
    // Max attempts exceeded
    // =========================================================================

    it('should throw after max re-auth attempts (2) are exceeded', async () => {
        // Given: Pipeline always fails with auth error
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('Token expired'));
        // Re-auth always succeeds but token keeps expiring
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should have attempted pipeline 3 times (initial + 2 retries)
        expect(mockExecuteEdsPipeline).toHaveBeenCalledTimes(3);
        // And: ensureDaLiveAuth called twice (the max)
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledTimes(2);
        // And: Final result should be an error
        expect(result.success).toBe(false);
    });

    // =========================================================================
    // Non-auth errors propagate normally
    // =========================================================================

    it('should propagate non-auth errors without recovery attempt', async () => {
        // Given: Pipeline throws a non-auth error
        mockExecuteEdsPipeline.mockRejectedValue(new Error('Network timeout'));

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should NOT call ensureDaLiveAuth
        expect(mockEnsureDaLiveAuth).not.toHaveBeenCalled();

        // And: Error should propagate
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network timeout');
    });

    // =========================================================================
    // Progress messages
    // =========================================================================

    it('should send auth-recovery progress message during recovery', async () => {
        // Given: Pipeline throws auth error
        mockExecuteEdsPipeline
            .mockRejectedValueOnce(new DaLiveAuthError('Token expired'))
            .mockResolvedValueOnce({ success: true, libraryPaths: [] });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should send auth-recovery progress
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'auth-recovery',
                progress: -1,
            }),
        );

        // And: Should send resume progress after re-auth
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'content-copy',
                message: expect.stringContaining('Resuming'),
            }),
        );
    });

    // =========================================================================
    // Signal aborted before pipeline
    // =========================================================================

    it('should throw Operation cancelled when signal is already aborted', async () => {
        // Given: Signal is already aborted
        const abortController = new AbortController();
        abortController.abort();

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            abortController.signal,
        );

        // Then: Should return error about cancellation
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');

        // And: Pipeline should not have been called
        expect(mockExecuteEdsPipeline).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Phase 2-3 Configuration Recovery Tests
// =============================================================================

describe('executeStorefrontSetupPhases - Phase 2-3 Configuration Recovery', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        // Default: pipeline succeeds
        mockExecuteEdsPipeline.mockResolvedValue({ success: true, libraryPaths: [] });
    });

    it('should recover when configureDaLivePermissions throws DaLiveAuthError', async () => {
        // Given: configureDaLivePermissions throws DaLiveAuthError on first call
        mockConfigurePerms
            .mockRejectedValueOnce(new DaLiveAuthError('DA.live token expired during operation'))
            .mockResolvedValueOnce({ success: true });

        // And: Re-auth succeeds
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should succeed after recovery
        expect(result.success).toBe(true);
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(mockContext, '[Storefront Setup]');
        // configureDaLivePermissions called twice (fail + retry)
        expect(mockConfigurePerms).toHaveBeenCalledTimes(2);
    });

    it('should send auth-recovery progress during phase 2-3 recovery', async () => {
        // Given: Phase 3 throws DaLiveAuthError
        mockConfigurePerms
            .mockRejectedValueOnce(new DaLiveAuthError('Token expired'))
            .mockResolvedValueOnce({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should send auth-recovery progress for phase 2-3
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'auth-recovery',
                progress: -1,
            }),
        );
        // And: Should send resume progress
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'code-sync',
                message: expect.stringContaining('Resuming'),
            }),
        );
    });

    it('should fail when phase 2-3 re-auth is cancelled', async () => {
        // Given: Phase 3 throws DaLiveAuthError
        mockConfigurePerms.mockRejectedValue(new DaLiveAuthError('Token expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
    });

    it('should fail after max re-auth attempts in phases 2-3', async () => {
        // Given: configureDaLivePermissions always throws DaLiveAuthError
        mockConfigurePerms.mockRejectedValue(new DaLiveAuthError('Token expired'));
        // Re-auth always succeeds but token keeps expiring
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeStorefrontSetupPhases(
            mockContext,
            createEdsConfig(),
            new AbortController().signal,
        );

        // Then: configureDaLivePermissions called 3 times (initial + 2 retries)
        expect(mockConfigurePerms).toHaveBeenCalledTimes(3);
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(false);
    });
});
