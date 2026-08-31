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

// `createSetupServices` now takes its GitHub clients from `getGitHubServices`
// (ADR-015 / D-2 — the cache holds the token-validation result). That builder
// calls `getLogger()`, which throws unless the logger is initialised. Same mock
// the other suites of getGitHubServices consumers use.


jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));




jest.mock('@/features/eds/services/github/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({
        createFromTemplate: jest.fn().mockResolvedValue({ fullName: 'owner/repo', htmlUrl: 'https://github.com/owner/repo' }),
        waitForContent: jest.fn().mockResolvedValue(undefined),
    })),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.


// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.


// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000, UI: { MIN_LOADING: 200 } },
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

import {
    createSetupContext,
    executeStorefrontSetupPhases,
} from './storefrontSetupPhases.testUtils';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import { getBlockLibrarySource, getBlockLibraryName } from '@/features/components/services/blockLibraryLoader';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { ServiceLocator } from '@/core/di';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';

// Cast imported mocks for type-safe access
const mockInstallBlockCollections = installBlockCollections as jest.MockedFunction<typeof installBlockCollections>;
const mockGetBlockLibrarySource = getBlockLibrarySource as jest.MockedFunction<typeof getBlockLibrarySource>;
const mockGetBlockLibraryName = getBlockLibraryName as jest.MockedFunction<typeof getBlockLibraryName>;

// =============================================================================
// Helpers
// =============================================================================

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


/**
 * ADR-015 (2026-08-28): this boundary resolves the shell executor from the
 * registry, which the shared node setup empties after EVERY test — so the fake
 * is seeded per-test rather than mocked at the module level.
 */
beforeEach(() => {
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
});

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
        const context = createSetupContext();
        const edsConfig = createEdsConfig();

        // When: Executing setup with both built-in and custom libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            { selectedBlockLibraries: ['isle5'], customBlockLibraries: CUSTOM_LIBS },
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
        const context = createSetupContext();
        const edsConfig = createEdsConfig();

        // When: Executing setup without custom libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            { selectedBlockLibraries: ['isle5'] },
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
            { selectedBlockLibraries: ['isle5'], customBlockLibraries: [] },
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
        const context = createSetupContext();
        const edsConfig = createEdsConfig();
        const customLibs: CustomBlockLibrary[] = [
            { name: 'My Fancy Blocks', source: { owner: 'user', repo: 'fancy', branch: 'main' } },
        ];

        // When: Executing setup with only custom libraries
        await executeStorefrontSetupPhases(
            context, edsConfig, AbortSignal.timeout(30000),
            { customBlockLibraries: customLibs },
        );

        // Then: Progress message should mention the library count
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'storefront-code',
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
