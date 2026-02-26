/**
 * EDS Reset Service - Custom Block Libraries Tests
 *
 * Tests that custom block libraries (user-provided GitHub URLs) are reinstalled
 * during project reset, after built-in block libraries.
 *
 * TDD RED Phase: Tests written BEFORE implementation.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

// =============================================================================
// Mocks - jest.mock calls are hoisted
// =============================================================================

jest.mock('vscode', () => ({
    window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() },
    ProgressLocation: { Notification: 15 },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000, PREREQUISITE_CHECK: 10000 },
}));

jest.mock('@/core/constants', () => ({
    COMPONENT_IDS: { EDS_STOREFRONT: 'eds-storefront' },
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
}));

// Mock dynamic imports used by resetRepoToTemplate
jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockReturnValue({ success: true, content: '{}' }),
    extractConfigParams: jest.fn().mockReturnValue({}),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        fileOperations: {
            resetRepoToTemplate: jest.fn().mockResolvedValue({ fileCount: 10, commitSha: 'abc1234567' }),
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        },
    }),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
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
        success: true, contentFilesCopied: 5, libraryPaths: [],
    }),
}));

jest.mock('@/features/eds/services/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn(),
}));

// Mock fetch for placeholder files
global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeEdsReset } from '@/features/eds/services/edsResetService';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import { getBlockLibrarySource, getBlockLibraryName } from '@/features/project-creation/services/blockLibraryLoader';

// Cast imported mocks
const mockInstallBlockCollections = installBlockCollections as jest.MockedFunction<typeof installBlockCollections>;
const mockGetBlockLibrarySource = getBlockLibrarySource as jest.MockedFunction<typeof getBlockLibrarySource>;
const mockGetBlockLibraryName = getBlockLibraryName as jest.MockedFunction<typeof getBlockLibraryName>;

// =============================================================================
// Helpers
// =============================================================================

function createProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        selectedBlockLibraries: ['isle5'],
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
        ...overrides,
    } as unknown as Project;
}

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

const mockTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };

// =============================================================================
// Tests
// =============================================================================

describe('EDS Reset Service - Custom Block Libraries', () => {
    const CUSTOM_LIBS: CustomBlockLibrary[] = [
        { name: 'My Custom Blocks', source: { owner: 'user', repo: 'custom-blocks', branch: 'main' } },
        { name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks-lib', branch: 'v2' } },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        // Built-in library lookup
        mockGetBlockLibrarySource.mockImplementation((id: string) => {
            if (id === 'isle5') return { owner: 'adobe', repo: 'isle5', branch: 'main' };
            return undefined;
        });
        mockGetBlockLibraryName.mockImplementation((id: string) => id);
        mockInstallBlockCollections.mockResolvedValue({
            success: true, blocksCount: 5, blockIds: ['block-1', 'block-2', 'block-3', 'block-4', 'block-5'],
        });
    });

    it('should reinstall all block libraries in a single deduped call via installBlockCollections', async () => {
        // Given: Project with both built-in and custom block libraries
        const project = createProject({
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: CUSTOM_LIBS,
        });
        const context = createMockContext();

        // When: Executing reset
        await executeEdsReset(
            {
                repoOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                project,
            },
            context,
            mockTokenProvider,
        );

        // Then: installBlockCollections (plural) called ONCE with all sources combined
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            [
                { source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' },
                { source: { owner: 'user', repo: 'custom-blocks', branch: 'main' }, name: 'My Custom Blocks' },
                { source: { owner: 'partner', repo: 'blocks-lib', branch: 'v2' }, name: 'Partner Blocks' },
            ],
            expect.anything(), // logger
        );

    });

    it('should call installBlockCollections with only built-in sources when customBlockLibraries is undefined', async () => {
        // Given: Project without custom block libraries
        const project = createProject({
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: undefined,
        });
        const context = createMockContext();

        // When: Executing reset
        await executeEdsReset(
            {
                repoOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                project,
            },
            context,
            mockTokenProvider,
        );

        // Then: installBlockCollections (plural) called with only built-in source
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            [{ source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' }],
            expect.anything(),
        );
    });
});
