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
    installBlockCollection: jest.fn(),
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
import { installBlockCollection } from '@/features/eds/services/blockCollectionHelpers';
import { getBlockLibrarySource, getBlockLibraryName } from '@/features/project-creation/services/blockLibraryLoader';

// Cast imported mocks
const mockInstallBlockCollection = installBlockCollection as jest.MockedFunction<typeof installBlockCollection>;
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
        mockInstallBlockCollection.mockResolvedValue({
            success: true, blocksCount: 3, blockIds: ['block-1', 'block-2', 'block-3'],
        });
    });

    it('should reinstall custom block libraries during reset when project has customBlockLibraries', async () => {
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

        // Then: installBlockCollection should be called for built-in (isle5)
        expect(mockInstallBlockCollection).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            { owner: 'adobe', repo: 'isle5', branch: 'main' },
            expect.anything(), 'isle5',
        );

        // And: installBlockCollection should be called for each custom library
        expect(mockInstallBlockCollection).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            { owner: 'user', repo: 'custom-blocks', branch: 'main' },
            expect.anything(), 'My Custom Blocks',
        );
        expect(mockInstallBlockCollection).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            { owner: 'partner', repo: 'blocks-lib', branch: 'v2' },
            expect.anything(), 'Partner Blocks',
        );

        // Total: 1 built-in + 2 custom = 3 calls
        expect(mockInstallBlockCollection).toHaveBeenCalledTimes(3);
    });

    it('should skip custom libraries when customBlockLibraries is empty or undefined', async () => {
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

        // Then: Only built-in library installed (1 call)
        expect(mockInstallBlockCollection).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollection).toHaveBeenCalledWith(
            expect.anything(), 'test-owner', 'test-repo',
            { owner: 'adobe', repo: 'isle5', branch: 'main' },
            expect.anything(), 'isle5',
        );
    });
});
