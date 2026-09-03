/**
 * EDS Reset Service - Custom Block Libraries Tests
 *
 * Tests that custom block libraries (user-provided GitHub URLs) are reinstalled
 * during project reset, after built-in block libraries.
 *
 * TDD RED Phase: Tests written BEFORE implementation.
 */

import './edsResetService.sharedMocks';

import type { Project } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

// =============================================================================
// Mocks - jest.mock calls are hoisted
// =============================================================================

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

// Mock dynamic imports used by resetRepoToTemplate

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        fileOperations: {
            resetRepoToTemplate: jest
                .fn()
                .mockResolvedValue({ fileCount: 10, commitSha: 'abc1234567' }),
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

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn().mockResolvedValue({
        success: true,
        contentFilesCopied: 5,
        libraryPaths: [],
    }),
}));

// Mock fetch for placeholder files
global.fetch = jest.fn().mockResolvedValue({ ok: false });

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { createResetContext, meshDeps, resetParams } from './edsResetService.testUtils';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import {
    getBlockLibrarySource,
    getBlockLibraryName,
} from '@/features/components/services/blockLibraryLoader';
import { createMockProject } from '../../../../helpers/projectFake';

// Cast imported mocks
const mockInstallBlockCollections = installBlockCollections as jest.MockedFunction<
    typeof installBlockCollections
>;
const mockGetBlockLibrarySource = getBlockLibrarySource as jest.MockedFunction<
    typeof getBlockLibrarySource
>;
const mockGetBlockLibraryName = getBlockLibraryName as jest.MockedFunction<
    typeof getBlockLibraryName
>;

// =============================================================================
// Helpers
// =============================================================================

function createProject(overrides?: Partial<Project>): Project {
    return createMockProject({
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
                    daLiveSite: 'test-repo',
                },
            },
        },
        ...overrides,
    });
}

const mockTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };

// =============================================================================
// Tests
// =============================================================================

describe('EDS Reset Service - Custom Block Libraries', () => {
    const CUSTOM_LIBS: CustomBlockLibrary[] = [
        {
            name: 'My Custom Blocks',
            source: { owner: 'user', repo: 'custom-blocks', branch: 'main' },
        },
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
            success: true,
            blocksCount: 5,
            blockIds: ['block-1', 'block-2', 'block-3', 'block-4', 'block-5'],
        });
    });

    it('should reinstall all block libraries in a single deduped call via installBlockCollections', async () => {
        // Given: Project with both built-in and custom block libraries
        const project = createProject({
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: CUSTOM_LIBS,
        });
        const context = createResetContext();

        // When: Executing reset
        await executeEdsReset(
            resetParams(project),
            context,
            mockTokenProvider,
            meshDeps
        );

        // Then: installBlockCollections (plural) called ONCE with all sources combined
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(),
            'test-owner',
            'test-repo',
            [
                { source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' },
                {
                    source: { owner: 'user', repo: 'custom-blocks', branch: 'main' },
                    name: 'My Custom Blocks',
                },
                {
                    source: { owner: 'partner', repo: 'blocks-lib', branch: 'v2' },
                    name: 'Partner Blocks',
                },
            ],
            expect.anything(), // logger
            expect.anything() // inspectorEntries
        );
    });

    it('should call installBlockCollections with only built-in sources when customBlockLibraries is undefined', async () => {
        // Given: Project without custom block libraries
        const project = createProject({
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: undefined,
        });
        const context = createResetContext();

        // When: Executing reset
        await executeEdsReset(
            resetParams(project),
            context,
            mockTokenProvider,
            meshDeps
        );

        // Then: installBlockCollections (plural) called with only built-in source
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            expect.anything(),
            'test-owner',
            'test-repo',
            [{ source: { owner: 'adobe', repo: 'isle5', branch: 'main' }, name: 'isle5' }],
            expect.anything(),
            expect.anything() // inspectorEntries
        );
    });
});
