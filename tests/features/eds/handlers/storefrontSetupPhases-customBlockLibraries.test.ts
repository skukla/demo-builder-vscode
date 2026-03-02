/**
 * Storefront Setup Phases - Custom Block Libraries Tests
 *
 * Tests that custom block libraries (user-provided GitHub URLs) are installed
 * during the Helix config phase, after built-in block libraries.
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

function createMockContext(): HandlerContext {
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(null),
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

describe('Storefront Setup Phases - Custom Block Libraries', () => {
    const CUSTOM_LIBS: CustomBlockLibrary[] = [
        { name: 'My Custom Blocks', source: { owner: 'user', repo: 'custom-blocks', branch: 'main' } },
        { name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks-lib', branch: 'v2' } },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        // Built-in library source lookup returns a valid source for 'isle5'
        mockGetBlockLibrarySource.mockImplementation((id: string) => {
            if (id === 'isle5') return { owner: 'adobe', repo: 'isle5', branch: 'main' };
            return undefined;
        });
        mockGetBlockLibraryName.mockImplementation((id: string) => id);
        mockInstallBlockCollections.mockResolvedValue({
            success: true, blocksCount: 5, blockIds: ['block-1', 'block-2', 'block-3', 'block-4', 'block-5'],
        });
    });

    it('should install all block libraries in a single deduped call via installBlockCollections', async () => {
        // Given: Both built-in and custom block libraries selected
        const context = createMockContext();
        const edsConfig = createEdsConfig();

        // When: Executing setup with both built-in and custom libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined, // selectedAddons
            ['isle5'], // selectedBlockLibraries (built-in)
            CUSTOM_LIBS, // customBlockLibraries (NEW parameter)
        );

        // Then: installBlockCollections (plural) should be called ONCE with all sources combined
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(), // githubFileOps
            'test-owner', 'test-repo',
            [
                { source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' },
                { source: { owner: 'user', repo: 'custom-blocks', branch: 'main' }, name: 'My Custom Blocks' },
                { source: { owner: 'partner', repo: 'blocks-lib', branch: 'v2' }, name: 'Partner Blocks' },
            ],
            expect.anything(), // logger
            expect.anything(), // inspectorEntries
        );

    });

    it('should call installBlockCollections with only built-in sources when custom is undefined', async () => {
        // Given: Only built-in block libraries, no custom
        const context = createMockContext();
        const edsConfig = createEdsConfig();

        // When: Executing setup without custom libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined, // selectedAddons
            ['isle5'], // selectedBlockLibraries
            undefined, // no customBlockLibraries
        );

        // Then: installBlockCollections (plural) called with only built-in source
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            [{ source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' }],
            expect.anything(),
            expect.anything(), // inspectorEntries
        );

        // When: Executing with empty custom libraries array
        jest.clearAllMocks();
        mockGetBlockLibrarySource.mockReturnValue({ owner: 'adobe', repo: 'isle5', branch: 'main' });
        mockInstallBlockCollections.mockResolvedValue({
            success: true, blocksCount: 3, blockIds: ['block-1', 'block-2', 'block-3'],
        });

        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined,
            ['isle5'],
            [], // empty custom libraries
        );

        // Then: Still only built-in library in the call
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            [{ source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' }],
            expect.anything(),
            expect.anything(), // inspectorEntries
        );
    });

    it('should send progress message mentioning library count', async () => {
        // Given: Custom block libraries with specific names
        const context = createMockContext();
        const edsConfig = createEdsConfig();
        const customLibs: CustomBlockLibrary[] = [
            { name: 'My Fancy Blocks', source: { owner: 'user', repo: 'fancy', branch: 'main' } },
        ];

        // When: Executing setup with only custom libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            undefined, // selectedAddons
            undefined, // no built-in block libraries
            customLibs, // customBlockLibraries
        );

        // Then: Progress message should mention the library count
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'helix-config',
                message: expect.stringContaining('1'),
            }),
        );

        // And: installBlockCollections should be called with the custom library
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            [{ source: { owner: 'user', repo: 'fancy', branch: 'main' }, name: 'My Fancy Blocks' }],
            expect.anything(),
            expect.anything(), // inspectorEntries
        );
    });
});
