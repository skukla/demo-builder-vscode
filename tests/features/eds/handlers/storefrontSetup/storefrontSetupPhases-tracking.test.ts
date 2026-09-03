/**
 * Storefront Setup Phases - Block Library Install Tracking Tests
 *
 * Tests that block library install tracking data (commit SHA, blockIds)
 * is saved to project state after successful block collection installation.
 *
 * TDD RED Phase: Tests written BEFORE implementation.
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

    it('should save installedBlockLibraries to project after successful install', async () => {
        // Given: installBlockCollections returns success with libraryVersions
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 4,
            blockIds: ['hero-cta', 'newsletter', 'search-bar', 'product-grid'],
            libraryVersions: LIBRARY_VERSIONS,
        });

        const context = createSetupContext({
            name: 'test-project',
            path: '/path/to/test-project',
            status: 'configuring',
            created: new Date(),
            lastModified: new Date(),
        });
        const edsConfig = createEdsConfig();
        const customLibs: CustomBlockLibrary[] = [
            { name: 'Partner Blocks', source: { owner: 'partner', repo: 'blocks', branch: 'v2' } },
        ];

        // When: Executing storefront setup with block libraries
        await executeStorefrontSetupPhases(context, edsConfig, AbortSignal.timeout(30000), {
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: customLibs,
        });

        // Then: stateManager.saveProject should have been called with installedBlockLibraries
        const saveProjectMock = context.stateManager.saveProject as jest.Mock;
        expect(saveProjectMock).toHaveBeenCalled();

        // Find the call that saved installedBlockLibraries
        const savedProject = saveProjectMock.mock.calls.find(
            (call: unknown[]) =>
                (call[0] as Record<string, unknown>).installedBlockLibraries !== undefined
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

        const context = createSetupContext({
            name: 'test-project',
            path: '/path/to/test-project',
            status: 'configuring',
            created: new Date(),
            lastModified: new Date(),
        });
        const edsConfig = createEdsConfig();

        // When: Executing storefront setup
        await executeStorefrontSetupPhases(context, edsConfig, AbortSignal.timeout(30000), {
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: [
                {
                    name: 'Partner Blocks',
                    source: { owner: 'partner', repo: 'blocks', branch: 'v2' },
                },
            ],
        });

        // Then: Saved data should match expected structure
        const saveProjectMock = context.stateManager.saveProject as jest.Mock;
        const savedProject = saveProjectMock.mock.calls.find(
            (call: unknown[]) =>
                (call[0] as Record<string, unknown>).installedBlockLibraries !== undefined
        );
        expect(savedProject).toBeDefined();

        const installedLibs = (savedProject![0] as Record<string, unknown>)
            .installedBlockLibraries as Array<{
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
        expect(new Date(installedLibs[0].installedAt).toISOString()).toBe(
            installedLibs[0].installedAt
        );

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

        const context = createSetupContext({
            name: 'test-project',
            path: '/path/to/test-project',
            status: 'configuring',
            created: new Date(),
            lastModified: new Date(),
        });
        const edsConfig = createEdsConfig();

        // When: Executing storefront setup with block libraries that fail to install
        await executeStorefrontSetupPhases(context, edsConfig, AbortSignal.timeout(30000), {
            selectedBlockLibraries: ['isle5'],
        });

        // Then: saveProject should NOT have been called with installedBlockLibraries
        const saveProjectMock = context.stateManager.saveProject as jest.Mock;
        const savedWithTracking = saveProjectMock.mock.calls.find(
            (call: unknown[]) =>
                (call[0] as Record<string, unknown>).installedBlockLibraries !== undefined
        );
        expect(savedWithTracking).toBeUndefined();
    });
});
