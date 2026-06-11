/**
 * AEM-Sites content source on the satellite path (Slice 2, Step 05).
 *
 * When the joiner's satellite uses AEM Sites as its content source:
 *   - registerSite's content.source.url points at the AEM author URL + content path
 *   - the DA.live content-population pipeline is SKIPPED (point-at: AEM IS the content)
 *   - DA.live permissions are NOT configured (no DA.live content to grant)
 *
 * The DA.live satellite path is unchanged — characterized in
 * storefrontSetupPhases-repoless.test.ts (the regression guard).
 */

import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

const mockRegisterSite = jest.fn();
const mockUpdateSiteConfig = jest.fn();
const mockDeleteSiteConfig = jest.fn();
const mockCreateFromTemplate = jest.fn();

// buildSiteConfigParams mock that HONORS the injected ContentSource (6th arg),
// so the real AemContentSource (constructed in phase3) composes the source URL.
jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        registerSite: mockRegisterSite,
        updateSiteConfig: mockUpdateSiteConfig,
        deleteSiteConfig: mockDeleteSiteConfig,
    })),
    buildSiteConfigParams: (
        owner: string, repo: string, org: string, site: string, overlayUrl: string | undefined,
        contentSource?: { buildRegistrationSource: (c: { org: string; site: string }) => { url: string; type: string } },
    ) => {
        const src = contentSource
            ? contentSource.buildRegistrationSource({ org, site })
            : { url: `https://content.da.live/${org}/${site}/`, type: 'markup' };
        return {
            org, site, codeOwner: owner, codeRepo: repo,
            contentSourceUrl: src.url, contentSourceType: src.type,
            ...(overlayUrl && { contentOverlayUrl: overlayUrl }),
        };
    },
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
        waitForContent: jest.fn(),
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
    HelixService: jest.fn().mockImplementation(() => ({ previewCode: jest.fn() })),
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
import { configureDaLivePermissions } from '@/features/eds/handlers/edsHelpers';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';

const mockConfigureDaLivePermissions = configureDaLivePermissions as jest.MockedFunction<typeof configureDaLivePermissions>;
const mockExecuteEdsPipeline = executeEdsPipeline as jest.MockedFunction<typeof executeEdsPipeline>;

const AEM_AUTHOR_URL = 'https://author-p57319-e1619941.adobeaemcloud.com';
const AEM_CONTENT_PATH = '/content/citisignal';

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

// AEM-sourced satellite: upstream (→ satellite path) + aem-sites content source, no DA.live contentSource.
function createAemSatelliteEdsConfig() {
    return {
        repoName: 'citisignal',
        repoMode: 'new' as const,
        daLiveOrg: 'content-sc',
        daLiveSite: 'citisignal',
        githubOwner: 'content-sc',
        upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
        contentSourceType: 'aem-sites' as const,
        aemContentSource: { authorUrl: AEM_AUTHOR_URL, contentPath: AEM_CONTENT_PATH },
    };
}

describe('AEM-Sites satellite (contentSourceType = aem-sites)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRegisterSite.mockResolvedValue({ success: true });
    });

    it('registers content.source pointing at the AEM author URL + content path (markup)', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createAemSatelliteEdsConfig(), new AbortController().signal);

        expect(mockRegisterSite).toHaveBeenCalledWith(expect.objectContaining({
            contentSourceUrl: 'https://author-p57319-e1619941.adobeaemcloud.com/content/citisignal',
            contentSourceType: 'markup',
            codeOwner: 'commerce-sc',
            codeRepo: 'citisignal-upstream',
        }));
    });

    it('SKIPS the DA.live content-population pipeline (point-at: AEM is the content)', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createAemSatelliteEdsConfig(), new AbortController().signal);

        expect(mockExecuteEdsPipeline).toHaveBeenCalledWith(
            expect.objectContaining({ skipContent: true }),
            expect.anything(),
        );
    });

    it('does NOT configure DA.live permissions for an AEM source', async () => {
        await executeStorefrontSetupPhases(createMockContext(), createAemSatelliteEdsConfig(), new AbortController().signal);

        expect(mockConfigureDaLivePermissions).not.toHaveBeenCalled();
    });

    it('does not return a false success when AEM registration keeps failing (fails loud)', async () => {
        mockRegisterSite.mockResolvedValue({
            success: false, statusCode: 401,
            error: 'DA.live authentication required. Please sign in to DA.live first.',
        });

        await expect(
            executeStorefrontSetupPhases(createMockContext(), createAemSatelliteEdsConfig(), new AbortController().signal),
        ).rejects.toThrow();
    });
});
