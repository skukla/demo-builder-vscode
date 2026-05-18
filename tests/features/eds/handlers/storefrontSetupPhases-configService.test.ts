/**
 * Storefront Setup Phases - Configuration Service Registration Tests
 *
 * Tests Configuration Service site registration, focusing on:
 * - 403 propagation retry (admin role propagation after GitHub App install)
 * - 401 re-authentication recovery
 * - 409 conflict handling (update path)
 * - Folder mapping is NOT called from setup flow (deprecated by Adobe;
 *   see aem.live/developer/byom — CitiSignal handles /products/{sku}
 *   via client-side routing)
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
    buildSiteConfigParams: (owner: string, repo: string, org: string, site: string, overlayUrl?: string) => ({
        org, site, codeOwner: owner, codeRepo: repo,
        contentSourceUrl: `https://content.da.live/${org}/${site}/`,
        ...(overlayUrl && { contentOverlayUrl: overlayUrl }),
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

describe('registerConfigurationService - folder mapping NOT called from setup flow', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
        mockRegisterSite.mockResolvedValue({ success: true });
        mockSetFolderMapping.mockResolvedValue({ success: true });
    });

    it('does NOT call setFolderMapping after successful site registration', async () => {
        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        // Folder mapping is deprecated by Adobe (aem.live/developer/byom).
        // Setup flow must not configure it. CitiSignal handles /products/{sku}
        // via client-side routing.
        expect(mockSetFolderMapping).not.toHaveBeenCalled();
    });

    it('does NOT call setFolderMapping after 403 retry success', async () => {
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: true });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        expect(mockSetFolderMapping).not.toHaveBeenCalled();
    });
});

describe('registerConfigurationService - error handling', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
        mockRegisterSite.mockResolvedValue({ success: true });
    });

    it('triggers re-auth when registerSite returns 401', async () => {
        // First call: 401 (token expired), second call after re-auth: success
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 401, error: 'Unauthorized' })
            .mockResolvedValueOnce({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        expect(mockEnsureDaLiveAuth).toHaveBeenCalled();
        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
    });

    it('logs error when registerConfigurationService throws', async () => {
        mockRegisterSite.mockRejectedValue(new Error('Network timeout'));

        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        const errorCalls = (context.logger.error as jest.Mock).mock.calls;
        const hasConfigServiceError = errorCalls.some(
            (call: string[]) => call[0].includes('Configuration Service'),
        );
        expect(hasConfigServiceError).toBe(true);
    });
});

describe('registerConfigurationService - existing repo 403', () => {
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
    });

    it('sends warning and does not retry for existing repo 403', async () => {
        mockRegisterSite.mockResolvedValue({
            success: false, statusCode: 403, error: 'Forbidden — no admin access',
        });

        await executeStorefrontSetupPhases(
            context, createExistingRepoEdsConfig(), new AbortController().signal,
        );

        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const warningCall = sendCalls.find(
            ([type, payload]: [string, { phase?: string; message?: string }]) =>
                type === 'storefront-setup-progress'
                && payload.phase === 'site-config'
                && payload.message?.includes('da.live preview'),
        );
        expect(warningCall).toBeDefined();
        // Existing repo means the App was already installed — no propagation retry.
        expect(mockRegisterSite).toHaveBeenCalledTimes(1);
    });
});

describe('registerConfigurationService - new repo 403 multi-retry on propagation delay', () => {
    let context: HandlerContext;

    function createNewRepoEdsConfig() {
        return { ...createEdsConfig(), repoMode: 'new' as const };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
    });

    it('retries with backoff and succeeds on first retry', async () => {
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: true });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        // Initial call + 1 retry that succeeds
        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const hasWarning = sendCalls.some(
            ([type, payload]: [string, { message?: string }]) =>
                type === 'storefront-setup-progress' && payload.message?.includes('da.live preview'),
        );
        expect(hasWarning).toBe(false);
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
    });

    it('retries 3 times before giving up on continued 403', async () => {
        mockRegisterSite.mockResolvedValue({
            success: false, statusCode: 403, error: 'Forbidden',
        });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        // Initial call + 3 retries (30s/45s/60s backoff) = 4 total
        expect(mockRegisterSite).toHaveBeenCalledTimes(4);
        const sendCalls = (context.sendMessage as jest.Mock).mock.calls;
        const warningCall = sendCalls.find(
            ([type, payload]: [string, { phase?: string; message?: string }]) =>
                type === 'storefront-setup-progress'
                && payload.phase === 'site-config'
                && payload.message?.includes('da.live preview'),
        );
        expect(warningCall).toBeDefined();
    });

    it('stops retrying when a non-403 error appears mid-retry', async () => {
        // 403 → retry 1 returns 500 (non-403, non-401, non-409) → stop retrying
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: false, statusCode: 500, error: 'Server error' });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        // Initial + 1 retry that returned 500 — should not continue retrying
        expect(mockRegisterSite).toHaveBeenCalledTimes(2);
    });

    it('triggers re-auth when retry returns 401', async () => {
        // 403 → retry → 401 → recovery loop re-auths → 200
        mockRegisterSite
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: false, statusCode: 401, error: 'Unauthorized' })
            .mockResolvedValueOnce({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        await executeStorefrontSetupPhases(
            context, createNewRepoEdsConfig(), new AbortController().signal,
        );

        expect(mockEnsureDaLiveAuth).toHaveBeenCalled();
        // 403 → retry sees 401 (throws) → recovery loop re-runs → success
        expect(mockRegisterSite).toHaveBeenCalledTimes(3);
    });
});

describe('registerConfigurationService - BYOM overlay threading', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
        mockRegisterSite.mockResolvedValue({ success: true });
    });

    it('passes byomOverlayUrl from edsConfig into registerSite params', async () => {
        const config = { ...createEdsConfig(), byomOverlayUrl: 'https://byom.example.com' };

        await executeStorefrontSetupPhases(context, config, new AbortController().signal);

        expect(mockRegisterSite).toHaveBeenCalledWith(
            expect.objectContaining({ contentOverlayUrl: 'https://byom.example.com' }),
        );
    });

    it('omits contentOverlayUrl when byomOverlayUrl is not in edsConfig', async () => {
        await executeStorefrontSetupPhases(
            context, createEdsConfig(), new AbortController().signal,
        );

        const callArgs = mockRegisterSite.mock.calls[0][0];
        expect(callArgs.contentOverlayUrl).toBeUndefined();
    });
});
