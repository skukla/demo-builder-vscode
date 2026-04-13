/**
 * Storefront Setup Phases - Configuration Service Registration Tests
 *
 * Tests that folder mapping failures are surfaced clearly to the user,
 * not silently swallowed. Without folder mapping, all product detail
 * page URLs (/products/{urlKey}/{sku}) return 404.
 *
 * Bug: registerConfigurationService() logged folder mapping failures
 * as logger.warn and never notified the user. This caused silent PDP
 * breakage on newly created sites.
 */

import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

// =============================================================================
// Mocks - defined before imports
// =============================================================================

const mockRegisterSite = jest.fn();
const mockSetFolderMapping = jest.fn();
const mockUpdateSiteConfig = jest.fn();
const mockDeleteSiteConfig = jest.fn();

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        registerSite: mockRegisterSite,
        setFolderMapping: mockSetFolderMapping,
        updateSiteConfig: mockUpdateSiteConfig,
        deleteSiteConfig: mockDeleteSiteConfig,
    })),
    DEFAULT_FOLDER_MAPPING: { '/products/': '/products/default' },
    buildSiteConfigParams: (owner: string, repo: string, org: string, site: string) => ({
        org, site, codeOwner: owner, codeRepo: repo,
        contentSourceUrl: `https://content.da.live/${org}/${site}/`,
    }),
}));

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

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mountpoints:\n  /: https://content.da.live/org/site'),
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn().mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, CONFIG_SERVICE_RETRY_DELAY: 0 },
}));

// Mock fetch for code sync verification
global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
// Import module under test (after mocks)
// =============================================================================

import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetupPhases';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';

const mockEnsureDaLiveAuth = ensureDaLiveAuth as jest.MockedFunction<typeof ensureDaLiveAuth>;

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

describe('registerConfigurationService - folder mapping failure visibility', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
        // Default: site registration succeeds
        mockRegisterSite.mockResolvedValue({ success: true });
        // Default: folder mapping succeeds
        mockSetFolderMapping.mockResolvedValue({ success: true });
    });

    it('should log error when setFolderMapping fails', async () => {
        mockSetFolderMapping.mockResolvedValue({
            success: false, error: 'Folder mapping not supported',
        });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Should log at ERROR level, not WARN
        const errorCalls = (context.logger.error as jest.Mock).mock.calls;
        const hasFolderMappingError = errorCalls.some(
            (call: string[]) => call[0].includes('Folder mapping failed'),
        );
        expect(hasFolderMappingError).toBe(true);
    });

    it('should send warning progress message when setFolderMapping fails', async () => {
        mockSetFolderMapping.mockResolvedValue({
            success: false, error: 'API rejected',
        });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Should send a progress message with warning about PDP routing
        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const hasWarningMessage = sendCalls.some(
            ([type, payload]: [string, { message?: string }]) =>
                type === 'storefront-setup-progress'
                && payload.message?.includes('product detail pages'),
        );
        expect(hasWarningMessage).toBe(true);
    });

    it('should trigger re-auth when registerSite returns 401', async () => {
        // First call: 401 (token expired), second call after re-auth: success
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 401, error: 'Unauthorized' })
            .mockResolvedValueOnce({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Should have prompted re-auth
        expect(mockEnsureDaLiveAuth).toHaveBeenCalled();
        // Should have retried and succeeded
        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
        expect(mockSetFolderMapping).toHaveBeenCalled();
    });

    it('should trigger re-auth when setFolderMapping returns 401', async () => {
        mockRegisterSite.mockResolvedValue({ success: true });
        // First call: 401 (token expired), second call after re-auth: success
        mockSetFolderMapping
            .mockResolvedValueOnce({ success: false, statusCode: 401, error: 'Token expired' })
            .mockResolvedValueOnce({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Should have prompted re-auth
        expect(mockEnsureDaLiveAuth).toHaveBeenCalled();
        // Should have retried folder mapping
        expect(mockSetFolderMapping).toHaveBeenCalledTimes(2);
    });

    it('should log error when registerConfigurationService throws', async () => {
        mockRegisterSite.mockRejectedValue(new Error('Network timeout'));

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Should log at ERROR level, not WARN
        const errorCalls = (context.logger.error as jest.Mock).mock.calls;
        const hasConfigServiceError = errorCalls.some(
            (call: string[]) => call[0].includes('Configuration Service')
                || call[0].includes('Folder mapping'),
        );
        expect(hasConfigServiceError).toBe(true);
    });

    it('should NOT log error when folder mapping succeeds', async () => {
        mockRegisterSite.mockResolvedValue({ success: true });
        mockSetFolderMapping.mockResolvedValue({ success: true });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Should NOT have any error logs about folder mapping
        const errorCalls = (context.logger.error as jest.Mock).mock.calls;
        const hasFolderMappingError = errorCalls.some(
            (call: string[]) => call[0].includes('Folder mapping'),
        );
        expect(hasFolderMappingError).toBe(false);
    });

});

describe('registerConfigurationService - registerSite non-auth failure visibility', () => {
    let context: HandlerContext;

    function createExistingRepoEdsConfig() {
        return {
            ...createEdsConfig(),
            repoMode: 'existing' as const,
            existingRepo: 'test-owner/test-repo',
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
        mockSetFolderMapping.mockResolvedValue({ success: true });
    });

    it('should send warning and skip folder mapping for existing repo 403 (no retry)', async () => {
        mockRegisterSite.mockResolvedValue({
            success: false, statusCode: 403, error: 'Forbidden — no admin access',
        });

        await executeStorefrontSetupPhases(
            context, createExistingRepoEdsConfig(), new AbortController().signal,
        );

        // Should notify user — existing repo 403 is a genuine permission problem
        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const warningCall = sendCalls.find(
            ([type, payload]: [string, { phase?: string; message?: string }]) =>
                type === 'storefront-setup-progress'
                && payload.phase === 'site-config'
                && payload.message?.includes('da.live preview'),
        );
        expect(warningCall).toBeDefined();
        // Should not retry — existing repo means the App was already installed
        expect(mockRegisterSite).toHaveBeenCalledTimes(1);
        // Should skip folder mapping — no site record
        expect(mockSetFolderMapping).not.toHaveBeenCalled();
    });
});

describe('registerConfigurationService - new repo 403 retry on propagation delay', () => {
    let context: HandlerContext;

    function createNewRepoEdsConfig() {
        return { ...createEdsConfig(), repoMode: 'new' as const };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
        mockSetFolderMapping.mockResolvedValue({ success: true });
    });

    it('retries once and succeeds when first 403 was a propagation race', async () => {
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: true });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
        // No warning message — retry succeeded
        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const hasWarning = sendCalls.some(
            ([type, payload]: [string, { message?: string }]) =>
                type === 'storefront-setup-progress' && payload.message?.includes('da.live preview'),
        );
        expect(hasWarning).toBe(false);
        // Folder mapping should run after successful retry
        expect(mockSetFolderMapping).toHaveBeenCalledTimes(1);
    });

    it('handles 409 on retry by updating site config', async () => {
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: false, statusCode: 409, error: 'Conflict' });
        mockUpdateSiteConfig.mockResolvedValue({ success: true });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
        expect(mockUpdateSiteConfig).toHaveBeenCalledTimes(1);
        expect(mockSetFolderMapping).toHaveBeenCalledTimes(1);
    });

    it('shows warning and skips folder mapping when retry also fails', async () => {
        mockRegisterSite.mockResolvedValue({
            success: false, statusCode: 403, error: 'Forbidden',
        });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const warningCall = sendCalls.find(
            ([type, payload]: [string, { phase?: string; message?: string }]) =>
                type === 'storefront-setup-progress'
                && payload.phase === 'site-config'
                && payload.message?.includes('da.live preview'),
        );
        expect(warningCall).toBeDefined();
        expect(mockSetFolderMapping).not.toHaveBeenCalled();
    });

    it('triggers re-auth when retry returns 401 then succeeds', async () => {
        // 403 → retry → 401 → recovery loop re-auths → 200
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: false, statusCode: 401, error: 'Unauthorized' })
            .mockResolvedValueOnce({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        // Should have prompted re-auth
        expect(mockEnsureDaLiveAuth).toHaveBeenCalled();
        // 403 attempt + 401 attempt + post-re-auth attempt
        expect(mockRegisterSite).toHaveBeenCalledTimes(3);
        expect(mockSetFolderMapping).toHaveBeenCalled();
    });
});
