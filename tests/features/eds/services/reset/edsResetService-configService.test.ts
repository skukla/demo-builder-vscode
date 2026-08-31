/**
 * EDS Reset Service - Configuration Service Tests
 *
 * Tests that Step 6 (Configuration Service) of the reset pipeline:
 * - Re-registers the site when it was never registered (updateSiteConfig handles
 *   this via DELETE → 404-ok → PUT register)
 * - Sets folder mapping after successful registration
 * - Logs a warning when folder mapping fails but does NOT abort the reset
 * - Logs a warning when updateSiteConfig fails but does NOT abort the reset
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockUpdateSiteConfig = jest.fn();
const mockRegisterSite = jest.fn();

jest.mock('@/features/eds/services/configService/configurationService', () => ({
    // Mirrors the real 4-arg shape (legacyLookupKey retired 2026-08-23):
    // lookup key AND content source both use the GitHub owner/repo.
    buildSiteConfigParams: (owner: string, repo: string, daLiveOrg: string, overlayUrl?: string) => ({
        org: owner, site: repo, codeOwner: owner, codeRepo: repo,
        contentSourceUrl: `https://content.da.live/${daLiveOrg}/${repo}/`,
        ...(overlayUrl && { contentOverlayUrl: overlayUrl }),
    }),
}));

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));

jest.mock('vscode', () => ({
    window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() },
    ProgressLocation: { Notification: 15 },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000, NORMAL: 30000, PREREQUISITE_CHECK: 10000, UI: { MIN_LOADING: 200 },
        CONFIG_SERVICE_RETRY_DELAY: 0,
    },
}));

jest.mock('@/core/constants', () => ({
    COMPONENT_IDS: { EDS_STOREFRONT: 'eds-storefront' },
}));

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn().mockResolvedValue(true),
        })),
        getCommandExecutor: jest.fn(() => ({})),
    },
}));

jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: jest.fn(() => undefined),
    hasEntries: jest.fn((obj: unknown) => obj && Object.keys(obj as object).length > 0),
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn().mockReturnValue(null),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockReturnValue({ success: true, content: '{}' }),
    extractConfigParams: jest.fn().mockReturnValue({}),
    buildConfigGeneratorParams: jest.fn().mockReturnValue({}),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn().mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        fileOperations: {
            resetRepoToTemplate: jest.fn().mockResolvedValue({ fileCount: 5, commitSha: 'abc123' }),
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        },
    }),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    surfaceOverlayRegistrationFailure: jest.fn(),
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        getAccessToken: jest.fn().mockResolvedValue('token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    })),
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn().mockResolvedValue({
        success: true, contentFilesCopied: 3, libraryPaths: [],
    }),
}));

jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn(),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn(),
}));

global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import type { ConfigStepServices } from '@/features/eds/services/reset/edsResetConfigStep';
import { surfaceOverlayRegistrationFailure } from '@/features/eds/handlers/edsHelpers';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';

/** Shared fake (PL-16) — this was one of eleven hand-rolled copies. */
const meshDeps = createMeshDepsFake();


const mockSurfaceOverlayFailure = surfaceOverlayRegistrationFailure as jest.MockedFunction<
    typeof surfaceOverlayRegistrationFailure
>;

// =============================================================================
// Helpers
// =============================================================================

function createProject(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        selectedBlockLibraries: [],
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-repo',
                },
            },
        },
    } as unknown as Project;
}

function createContext(): HandlerContext {
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(), trace: jest.fn(),
        } as unknown as Logger,
        debugLogger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
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

const mockTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };

function createParams() {
    return {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-repo',
        templateOwner: 'template-owner',
        templateRepo: 'template-repo',
        project: createProject(),
    };
}

// =============================================================================
// Tests
// =============================================================================

/**
 * The Config Service, handed in through the reset's config-step seam.
 *
 * There used to be a `jest.mock` of the service CLASS here. The registrar genuinely
 * drives `registerSite` and `updateSiteConfig`, so unlike most of this batch the mock
 * was load-bearing — what it could not do is let the suite say WHICH service the
 * registration went through. Typed to the registrar's own two-method interface, so
 * tsc rejects a shape that drifts from what the code will call.
 */
const SERVICES: ConfigStepServices = {
    configService: { registerSite: mockRegisterSite, updateSiteConfig: mockUpdateSiteConfig },
};

describe('executeEdsReset - Configuration Service (Step 6)', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createContext();
        // Reset targets an EXISTING site, so the shared registrar's opening PUT
        // gets the 409 the real service returns and falls through to the update.
        // Before this suite went through `registerSiteConfig`, the reset path
        // called updateSiteConfig directly and had no 409/401 handling at all.
        mockRegisterSite.mockResolvedValue({ success: false, statusCode: 409, error: 'Conflict' });
        mockUpdateSiteConfig.mockResolvedValue({ success: true });
    });

    it('reports a SKIPPED config write on the successful result', async () => {
        // Observed risk: the reset rewrites the repo at step 1, fails the config
        // write at step 7, and still ends with '"<project>" reset successfully'.
        // The step-7 message goes out on the single-line progress notification,
        // which steps 8-11 overwrite within seconds — so the one sentence naming
        // the remedy is gone before it can be read. PDPs will not load and the
        // user is told the run worked.
        //
        // Rides out on a SUCCESSFUL result, the same way MESH_REDEPLOY_FAILED
        // does: the reset genuinely did the rest of its work.
        mockUpdateSiteConfig.mockResolvedValue({ success: false, statusCode: 500, error: 'boom' });

        const result = await executeEdsReset(createParams(), context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(result.success).toBe(true);
        expect(result.errorType).toBe('CONFIG_WRITE_FAILED');
        expect(result.error).toMatch(/Repair Site Configuration/i);
    });

    it('leaves errorType unset when the config write lands', async () => {
        const result = await executeEdsReset(createParams(), context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(result.success).toBe(true);
        expect(result.errorType).toBeUndefined();
    });

    it('calls updateSiteConfig on successful reset', async () => {
        await executeEdsReset(createParams(), context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(mockUpdateSiteConfig).toHaveBeenCalledTimes(1);
    });

    it('logs warning and continues when updateSiteConfig fails', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, error: 'API rejected' });

        const result = await executeEdsReset(createParams(), context, mockTokenProvider, meshDeps, undefined, SERVICES);

        const warnCalls = (context.logger.warn as jest.Mock).mock.calls;
        const hasConfigWarning = warnCalls.some(
            (call: string[]) => call[0].includes('Configuration Service'),
        );
        expect(hasConfigWarning).toBe(true);
        expect(result.success).toBe(true);
    });

    it('threads byomOverlayUrl into updateSiteConfig params when present', async () => {
        const params = { ...createParams(), byomOverlayUrl: 'https://byom.example.com' };

        await executeEdsReset(params, context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(mockUpdateSiteConfig).toHaveBeenCalledWith(
            expect.objectContaining({ contentOverlayUrl: 'https://byom.example.com' }),
        );
    });

    it('omits contentOverlayUrl from updateSiteConfig params when byomOverlayUrl absent', async () => {
        await executeEdsReset(createParams(), context, mockTokenProvider, meshDeps, undefined, SERVICES);

        const callArgs = mockUpdateSiteConfig.mock.calls[0][0];
        expect(callArgs.contentOverlayUrl).toBeUndefined();
    });

    it('surfaces the overlay failure when overlay configured but update fails', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, error: 'API rejected' });
        const params = { ...createParams(), byomOverlayUrl: 'https://byom.example.com' };

        await executeEdsReset(params, context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(mockSurfaceOverlayFailure).toHaveBeenCalled();
    });

    it('does NOT surface the overlay failure when overlay update succeeds', async () => {
        const params = { ...createParams(), byomOverlayUrl: 'https://byom.example.com' };

        await executeEdsReset(params, context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
    });

    it('does NOT surface the overlay failure when no overlay configured even if update fails', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, error: 'API rejected' });

        await executeEdsReset(createParams(), context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
    });

    it('retries the config write on a 403 (admin-role propagation) then succeeds', async () => {
        mockUpdateSiteConfig
            .mockResolvedValueOnce({ success: false, statusCode: 403, error: 'Forbidden' })
            .mockResolvedValueOnce({ success: true });
        const params = { ...createParams(), byomOverlayUrl: 'https://byom.example.com' };

        await executeEdsReset(params, context, mockTokenProvider, meshDeps, undefined, SERVICES);

        // initial 403 + one retry that succeeds
        expect(mockUpdateSiteConfig).toHaveBeenCalledTimes(2);
        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
    });

    it('surfaces the overlay failure after 403 retries are exhausted', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, statusCode: 403, error: 'Forbidden' });
        const params = { ...createParams(), byomOverlayUrl: 'https://byom.example.com' };

        await executeEdsReset(params, context, mockTokenProvider, meshDeps, undefined, SERVICES);

        // initial + 3 propagation retries
        expect(mockUpdateSiteConfig).toHaveBeenCalledTimes(4);
        expect(mockSurfaceOverlayFailure).toHaveBeenCalled();
    });

    it('does NOT retry a non-403 config failure', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, statusCode: 500, error: 'Server error' });
        const params = { ...createParams(), byomOverlayUrl: 'https://byom.example.com' };

        await executeEdsReset(params, context, mockTokenProvider, meshDeps, undefined, SERVICES);

        expect(mockUpdateSiteConfig).toHaveBeenCalledTimes(1);
        expect(mockSurfaceOverlayFailure).toHaveBeenCalled();
    });
});
