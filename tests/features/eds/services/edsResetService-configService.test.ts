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
const mockSetFolderMapping = jest.fn();

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        updateSiteConfig: mockUpdateSiteConfig,
        setFolderMapping: mockSetFolderMapping,
    })),
    DEFAULT_FOLDER_MAPPING: { '/products/': '/products/default' },
    buildSiteConfigParams: (owner: string, repo: string, org: string, site: string) => ({
        org, site, codeOwner: owner, codeRepo: repo,
        contentSourceUrl: `https://content.da.live/${org}/${site}/`,
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
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000, PREREQUISITE_CHECK: 10000, UI: { MIN_LOADING: 200 } },
}));

jest.mock('@/core/constants', () => ({
    COMPONENT_IDS: { EDS_STOREFRONT: 'eds-storefront' },
}));

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
        })),
        getCommandExecutor: jest.fn(() => ({})),
    },
}));

jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: jest.fn(() => undefined),
    hasEntries: jest.fn((obj: unknown) => obj && Object.keys(obj as object).length > 0),
}));

jest.mock('@/features/project-creation/config/demo-packages.json', () => ({
    packages: [{
        id: 'citisignal',
        storefronts: {
            'eds-paas': {
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                contentSource: { org: 'content-org', site: 'content-site' },
            },
        },
    }],
}), { virtual: true });

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
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
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({
        previewCode: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
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

jest.mock('@/features/eds/services/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn(),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn(),
}));

global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeEdsReset } from '@/features/eds/services/edsResetService';

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
                    daLiveSite: 'test-site',
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
        daLiveSite: 'test-site',
        templateOwner: 'template-owner',
        templateRepo: 'template-repo',
        project: createProject(),
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('executeEdsReset - Configuration Service (Step 6)', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createContext();
        // Default: both operations succeed
        mockUpdateSiteConfig.mockResolvedValue({ success: true });
        mockSetFolderMapping.mockResolvedValue({ success: true });
    });

    it('calls updateSiteConfig and setFolderMapping on successful reset', async () => {
        await executeEdsReset(createParams(), context, mockTokenProvider);

        expect(mockUpdateSiteConfig).toHaveBeenCalledTimes(1);
        expect(mockSetFolderMapping).toHaveBeenCalledTimes(1);
    });

    it('does NOT call setFolderMapping when updateSiteConfig fails', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, error: 'Not authorized' });

        const result = await executeEdsReset(createParams(), context, mockTokenProvider);

        expect(mockSetFolderMapping).not.toHaveBeenCalled();
        // Reset completes despite Config Service failure
        expect(result.success).toBe(true);
    });

    it('logs warning and continues when updateSiteConfig fails', async () => {
        mockUpdateSiteConfig.mockResolvedValue({ success: false, error: 'API rejected' });

        const result = await executeEdsReset(createParams(), context, mockTokenProvider);

        const warnCalls = (context.logger.warn as jest.Mock).mock.calls;
        const hasConfigWarning = warnCalls.some(
            (call: string[]) => call[0].includes('Configuration Service'),
        );
        expect(hasConfigWarning).toBe(true);
        expect(result.success).toBe(true);
    });

    it('logs warning and continues when setFolderMapping fails', async () => {
        mockSetFolderMapping.mockResolvedValue({ success: false, error: 'Folder mapping not supported' });

        const result = await executeEdsReset(createParams(), context, mockTokenProvider);

        const warnCalls = (context.logger.warn as jest.Mock).mock.calls;
        const hasFolderWarning = warnCalls.some(
            (call: string[]) => call[0].includes('Folder mapping'),
        );
        expect(hasFolderWarning).toBe(true);
        // Reset must complete — folder mapping failure is non-fatal
        expect(result.success).toBe(true);
    });

    it('does NOT log folder mapping warning when setFolderMapping succeeds', async () => {
        await executeEdsReset(createParams(), context, mockTokenProvider);

        const warnCalls = (context.logger.warn as jest.Mock).mock.calls;
        const hasFolderWarning = warnCalls.some(
            (call: string[]) => call[0].includes('Folder mapping'),
        );
        expect(hasFolderWarning).toBe(false);
    });
});
