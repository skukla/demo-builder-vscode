/**
 * Storefront Setup Phases - Block Library Install Tracking Tests
 *
 * Tests that block library install tracking data (commit SHA, blockIds)
 * is saved to project state after successful block collection installation.
 *
 * TDD RED Phase: Tests written BEFORE implementation.
 */

import type { CustomBlockLibrary } from '@/types/blockLibraries';

// =============================================================================
// Mocks - jest.mock calls are hoisted, so we use jest.fn() inline
// =============================================================================

jest.mock('vscode', () => ({
    window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() },
    ProgressLocation: { Notification: 15 },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab-content'),
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: jest.fn().mockResolvedValue(null),
        createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/eds/services/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({
        createFromTemplate: jest.fn().mockResolvedValue({ fullName: 'owner/repo', htmlUrl: 'https://github.com/owner/repo' }),
        waitForContent: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true, codeStatus: 200 }),
        getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync'),
    })),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveTokenProvider: jest.fn().mockReturnValue({ getAccessToken: jest.fn().mockResolvedValue('token') }),
    createDaLiveServiceTokenProvider: jest.fn().mockReturnValue({ getAccessToken: jest.fn().mockResolvedValue('token') }),
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

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        registerSite: jest.fn().mockResolvedValue({ success: true }),
        setFolderMapping: jest.fn().mockResolvedValue({ success: true }),
        updateSiteConfig: jest.fn().mockResolvedValue({ success: true }),
        deleteSiteConfig: jest.fn().mockResolvedValue({ success: true }),
    })),
    DEFAULT_FOLDER_MAPPING: { '/products/': '/products/default' },
    buildSiteConfigParams: (owner: string, repo: string, org: string, site: string) => ({
        org: owner, site: repo, codeOwner: owner, codeRepo: repo,
        contentSourceUrl: `https://content.da.live/${org}/${site}/`,
    }),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000 },
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn().mockResolvedValue({
        success: true,
        contentFilesCopied: 0,
        libraryPaths: [],
    }),
}));

// Mock fetch for code sync verification
global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetupPhases';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import { getBlockLibrarySource, getBlockLibraryName } from '@/features/project-creation/services/blockLibraryLoader';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetupHandlers';
import type { HandlerContext } from '@/types/handlers';

// Cast imported mocks for type-safe access
const mockInstallBlockCollections = installBlockCollections as jest.MockedFunction<typeof installBlockCollections>;
const mockGetBlockLibrarySource = getBlockLibrarySource as jest.MockedFunction<typeof getBlockLibrarySource>;
const mockGetBlockLibraryName = getBlockLibraryName as jest.MockedFunction<typeof getBlockLibraryName>;

// =============================================================================
// Helpers
// =============================================================================

function createMockContext(overrides?: {
    currentProject?: Record<string, unknown> | null;
}): HandlerContext {
    const mockProject = overrides?.currentProject !== undefined
        ? overrides.currentProject
        : {
            name: 'test-project',
            path: '/path/to/test-project',
            status: 'configuring',
            created: new Date(),
            lastModified: new Date(),
        };

    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: { secrets: {} },
        sharedState: {},
        authManager: {
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        },
    } as unknown as HandlerContext;
}

function createEdsConfig(overrides?: Partial<StorefrontSetupStartPayload['edsConfig']>): StorefrontSetupStartPayload['edsConfig'] {
    return {
        repoName: 'test-repo',
        repoMode: 'new',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        githubOwner: 'test-owner',
        templateOwner: 'template-owner',
        templateRepo: 'template-repo',
        createdRepo: { owner: 'test-owner', name: 'test-repo', url: 'https://github.com/test-owner/test-repo', fullName: 'test-owner/test-repo' },
        ...overrides,
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('Storefront Setup Phases - Block Library Install Tracking', () => {
    const LIBRARY_VERSIONS = [
        {
            source: { owner: 'adobe', repo: 'isle5', branch: 'main' },
            name: 'Isle5',
            commitSha: 'abc123def456',
            blockIds: ['hero-cta', 'newsletter', 'search-bar'],
        },
        {
            source: { owner: 'partner', repo: 'blocks', branch: 'v2' },
            name: 'Partner Blocks',
            commitSha: '789xyz000aaa',
            blockIds: ['product-grid'],
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetBlockLibrarySource.mockImplementation((id: string) => {
            if (id === 'isle5') return { owner: 'adobe', repo: 'isle5', branch: 'main' };
            return undefined;
        });
        mockGetBlockLibraryName.mockImplementation((id: string) => id);
    });

    it('should save installedBlockLibraries to project after successful install', async () => {
        // Given: installBlockCollections returns success with libraryVersions
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 4,
            blockIds: ['hero-cta', 'newsletter', 'search-bar', 'product-grid'],
            libraryVersions: LIBRARY_VERSIONS,
        });

        const context = createMockContext();
        const edsConfig = createEdsConfig();
        const customLibs: CustomBlockLibrary[] = [
            { name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks', branch: 'v2' } },
        ];

        // When: Executing storefront setup with block libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined,
            ['isle5'],
            customLibs,
        );

        // Then: stateManager.saveProject should have been called with installedBlockLibraries
        const saveProjectMock = context.stateManager.saveProject as jest.Mock;
        expect(saveProjectMock).toHaveBeenCalled();

        // Find the call that saved installedBlockLibraries
        const savedProject = saveProjectMock.mock.calls.find(
            (call: unknown[]) => (call[0] as Record<string, unknown>).installedBlockLibraries !== undefined,
        );
        expect(savedProject).toBeDefined();

        const project = savedProject![0] as Record<string, unknown>;
        const installedLibs = project.installedBlockLibraries as Array<Record<string, unknown>>;
        expect(installedLibs).toHaveLength(2);
    });

    it('should include correct commit SHA, blockIds, and installedAt per library', async () => {
        // Given: installBlockCollections returns success with libraryVersions
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 4,
            blockIds: ['hero-cta', 'newsletter', 'search-bar', 'product-grid'],
            libraryVersions: LIBRARY_VERSIONS,
        });

        const context = createMockContext();
        const edsConfig = createEdsConfig();

        // When: Executing storefront setup
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined,
            ['isle5'],
            [{ name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks', branch: 'v2' } }],
        );

        // Then: Saved data should match expected structure
        const saveProjectMock = context.stateManager.saveProject as jest.Mock;
        const savedProject = saveProjectMock.mock.calls.find(
            (call: unknown[]) => (call[0] as Record<string, unknown>).installedBlockLibraries !== undefined,
        );
        expect(savedProject).toBeDefined();

        const installedLibs = (savedProject![0] as Record<string, unknown>).installedBlockLibraries as Array<{
            name: string;
            source: { owner: string; repo: string; branch: string };
            commitSha: string;
            blockIds: string[];
            installedAt: string;
        }>;

        // Verify first library
        expect(installedLibs[0].name).toBe('Isle5');
        expect(installedLibs[0].source).toEqual({ owner: 'adobe', repo: 'isle5', branch: 'main' });
        expect(installedLibs[0].commitSha).toBe('abc123def456');
        expect(installedLibs[0].blockIds).toEqual(['hero-cta', 'newsletter', 'search-bar']);
        expect(installedLibs[0].installedAt).toBeDefined();
        // installedAt should be a valid ISO date string
        expect(new Date(installedLibs[0].installedAt).toISOString()).toBe(installedLibs[0].installedAt);

        // Verify second library
        expect(installedLibs[1].name).toBe('Partner Blocks');
        expect(installedLibs[1].commitSha).toBe('789xyz000aaa');
        expect(installedLibs[1].blockIds).toEqual(['product-grid']);
    });

    it('should not save tracking data when install fails', async () => {
        // Given: installBlockCollections returns failure
        mockInstallBlockCollections.mockResolvedValue({
            success: false,
            blocksCount: 0,
            blockIds: [],
            error: 'Network error',
        });

        const context = createMockContext();
        const edsConfig = createEdsConfig();

        // When: Executing storefront setup with block libraries that fail to install
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined,
            ['isle5'],
        );

        // Then: saveProject should NOT have been called with installedBlockLibraries
        const saveProjectMock = context.stateManager.saveProject as jest.Mock;
        const savedWithTracking = saveProjectMock.mock.calls.find(
            (call: unknown[]) => (call[0] as Record<string, unknown>).installedBlockLibraries !== undefined,
        );
        expect(savedWithTracking).toBeUndefined();
    });
});
