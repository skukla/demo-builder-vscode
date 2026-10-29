/**
 * Storefront Setup Phases - Block Library Install Tracking Tests
 *
 * What storefront setup installed (commit SHA, blockIds per library) comes back
 * ON THE RESULT, for project creation to save onto the project it is creating or
 * editing. It used to be saved onto `getCurrentProject()` — in the wizard, the
 * project that was open BEFORE it, not the one being made (fixed 2026-10-09).
 */

// FIRST, before the family harness: that file re-exports the subject, so requiring
// it loads the subject and binds its collaborators. These mocks must be registered
// before that happens (measured 2026-09-02 — five tests fail the other way round).
import {
    mockGetBlockLibraryName,
    mockGetBlockLibrarySource,
    mockInstallBlockCollections,
} from './storefrontSetupPhases.blockLibraries.testUtils';

import type { CustomBlockLibrary } from '@/types/blockLibraries';

// =============================================================================
// Mocks - jest.mock calls are hoisted, so we use jest.fn() inline
// =============================================================================

// `createSetupServices` now takes its GitHub clients from `getGitHubServices`
// (ADR-015 / D-2 — the cache holds the token-validation result). That builder
// calls `getLogger()`, which throws unless the logger is initialised. Same mock
// the other suites of getGitHubServices consumers use.

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

// Mock fetch for code sync verification
global.fetch = jest.fn().mockResolvedValue({ ok: true });

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    createSetupContext,
    executeStorefrontSetupPhases,
    createEdsConfig,
} from './storefrontSetupPhases.testUtils';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockProject } from '../../../../helpers/projectFake';

// =============================================================================
// Helpers
// =============================================================================

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

    it('returns the records on the result and leaves the open project alone', async () => {
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 4,
            blockIds: ['hero-cta', 'newsletter', 'search-bar', 'product-grid'],
            libraryVersions: LIBRARY_VERSIONS,
        });
        // The project open before the wizard: NOT the one this storefront is for.
        const openProject = createMockProject({ name: 'justrite' });
        const context = createSetupContext(openProject);
        const customLibs: CustomBlockLibrary[] = [
            { name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks', branch: 'v2' } },
        ];

        const result = await executeStorefrontSetupPhases(
            context,
            createEdsConfig(),
            AbortSignal.timeout(30000),
            { selectedBlockLibraries: ['isle5'], customBlockLibraries: customLibs },
        );

        expect(context.stateManager.saveProject).not.toHaveBeenCalledWith(openProject);
        expect(openProject.installedBlockLibraries).toBeUndefined();
        // The records ride the threaded repoInfo, which every result spreads; this
        // harness stops short of a complete run (phase 3 is unmocked), and the
        // success-path wire is pinned in storefrontSetupHandlers-outcomes.
        expect(result.installedBlockLibraries?.map((lib) => lib.name)).toEqual([
            'Isle5',
            'Partner Blocks',
        ]);
    });

    it('carries commit SHA, blockIds and installedAt per library', async () => {
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 4,
            blockIds: ['hero-cta', 'newsletter', 'search-bar', 'product-grid'],
            libraryVersions: LIBRARY_VERSIONS,
        });

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            createEdsConfig(),
            AbortSignal.timeout(30000),
            {
                selectedBlockLibraries: ['isle5'],
                customBlockLibraries: [
                    { name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks', branch: 'v2' } },
                ],
            },
        );

        const installedLibs = result.installedBlockLibraries ?? [];
        expect(installedLibs[0]).toMatchObject({
            name: 'Isle5',
            source: { owner: 'adobe', repo: 'isle5', branch: 'main' },
            commitSha: 'abc123def456',
            blockIds: ['hero-cta', 'newsletter', 'search-bar'],
        });
        expect(new Date(installedLibs[0].installedAt).toISOString()).toBe(installedLibs[0].installedAt);
        expect(installedLibs[1]).toMatchObject({
            name: 'Partner Blocks',
            commitSha: '789xyz000aaa',
            blockIds: ['product-grid'],
        });
    });

    it('returns no records and saves nothing when the install fails', async () => {
        mockInstallBlockCollections.mockResolvedValue({
            success: false,
            blocksCount: 0,
            blockIds: [],
            error: 'Network error',
        });
        const openProject = createMockProject({ name: 'justrite' });
        const context = createSetupContext(openProject);

        const result = await executeStorefrontSetupPhases(
            context,
            createEdsConfig(),
            AbortSignal.timeout(30000),
            { selectedBlockLibraries: ['isle5'] },
        );

        expect(result.installedBlockLibraries).toBeUndefined();
        expect(context.stateManager.saveProject).not.toHaveBeenCalledWith(openProject);
    });
});
