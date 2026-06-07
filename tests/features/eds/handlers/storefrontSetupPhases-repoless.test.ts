/**
 * Repoless satellite site creation (Step 4) — the dedicated short path.
 *
 * A satellite (edsConfig.upstream present) references an existing repo's code:
 *   - NO fork (createFromTemplate not called)
 *   - NO Code Sync App install / code-sync verification / CDN code preview
 *   - registerSite cross-org: code.owner = upstream.owner, org/site = the joiner's own DA.live
 *
 * The canonical path (no upstream) is unchanged — characterized here as the regression guard.
 */

import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

// =============================================================================
// Mocks (module-level so we can assert on the cross-cutting calls)
// =============================================================================

const mockRegisterSite = jest.fn();
const mockUpdateSiteConfig = jest.fn();
const mockDeleteSiteConfig = jest.fn();
const mockCreateFromTemplate = jest.fn();
const mockWaitForContent = jest.fn();
const mockPreviewCode = jest.fn();

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        registerSite: mockRegisterSite,
        updateSiteConfig: mockUpdateSiteConfig,
        deleteSiteConfig: mockDeleteSiteConfig,
    })),
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
    executeEdsPipeline: jest.fn().mockResolvedValue({ libraryPaths: [] }),
}));

jest.mock('vscode', () => ({
    window: { showWarningMessage: jest.fn(), showErrorMessage: jest.fn() },
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
    createDaLiveTokenProvider: jest.fn().mockReturnValue({ getAccessToken: jest.fn().mockResolvedValue('mock-token') }),
    createDaLiveServiceTokenProvider: jest.fn().mockReturnValue({ getAccessToken: jest.fn().mockResolvedValue('mock-token') }),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({
        createFromTemplate: mockCreateFromTemplate,
        waitForContent: mockWaitForContent,
        resetToTemplate: jest.fn(),
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
    HelixService: jest.fn().mockImplementation(() => ({ previewCode: mockPreviewCode })),
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

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetupPhases';

function createMockContext(): HandlerContext {
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(), trace: jest.fn() } as unknown as Logger,
        debugLogger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: { secrets: {}, globalState: { get: jest.fn(), update: jest.fn() } } as unknown as HandlerContext['context'],
        sharedState: {},
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({ getAccessToken: jest.fn().mockResolvedValue('mock-token') }),
        },
    } as unknown as HandlerContext;
}

// repoMode 'new' WITHOUT createdRepo → exercises the canonical fork path.
function createCanonicalEdsConfig() {
    return {
        repoName: 'citisignal',
        repoMode: 'new' as const,
        daLiveOrg: 'commerce-sc',
        daLiveSite: 'citisignal',
        githubOwner: 'commerce-sc',
        templateOwner: 'adobe-rnd',
        templateRepo: 'aem-boilerplate-xcom',
    };
}

// Same, plus an upstream reference → satellite.
function createSatelliteEdsConfig() {
    return {
        ...createCanonicalEdsConfig(),
        daLiveOrg: 'content-sc',
        daLiveSite: 'citisignal',
        githubOwner: 'content-sc',
        upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
    };
}

describe('canonical path (no upstream) — regression characterization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRegisterSite.mockResolvedValue({ success: true });
        mockCreateFromTemplate.mockResolvedValue({ htmlUrl: 'https://github.com/commerce-sc/citisignal', fullName: 'commerce-sc/citisignal' });
    });

    it('forks from template and registers the site with the operator’s own owner', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createCanonicalEdsConfig(), new AbortController().signal);

        expect(mockCreateFromTemplate).toHaveBeenCalled();
        expect(mockRegisterSite).toHaveBeenCalledWith(expect.objectContaining({ codeOwner: 'commerce-sc' }));
    });
});

describe('satellite path (upstream present) — repoless, no fork', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRegisterSite.mockResolvedValue({ success: true });
    });

    it('does NOT fork the upstream', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createSatelliteEdsConfig(), new AbortController().signal);
        expect(mockCreateFromTemplate).not.toHaveBeenCalled();
    });

    it('registers the site cross-org: code.owner = upstream, org/site = the joiner’s own DA.live', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createSatelliteEdsConfig(), new AbortController().signal);
        expect(mockRegisterSite).toHaveBeenCalledWith(expect.objectContaining({
            codeOwner: 'commerce-sc',
            codeRepo: 'citisignal-upstream',
            org: 'content-sc',
            site: 'citisignal',
        }));
    });

    it('does NOT run code-sync / CDN code preview for the satellite', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createSatelliteEdsConfig(), new AbortController().signal);
        expect(mockPreviewCode).not.toHaveBeenCalled();
    });
});
