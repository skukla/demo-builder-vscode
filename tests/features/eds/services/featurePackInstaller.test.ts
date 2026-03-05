/**
 * Feature Pack Installer Tests
 *
 * Tests for installing feature pack blocks, initializers, and dependencies
 * into the destination repository during storefront setup.
 */

import {
    installFeaturePacks,
} from '@/features/eds/services/featurePackInstaller';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';

// Mock the feature pack loader
jest.mock('@/features/project-creation/services/featurePackLoader', () => ({
    getFeaturePack: jest.fn(),
}));

// Mock the block collection helpers
jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

import { getFeaturePack } from '@/features/project-creation/services/featurePackLoader';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';

const mockGetFeaturePack = getFeaturePack as jest.MockedFunction<typeof getFeaturePack>;
const mockInstallBlockCollections = installBlockCollections as jest.MockedFunction<typeof installBlockCollections>;

// --- Test Helpers ---

function createMockLogger(): Logger {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };
}

function createMockGithubFileOps(): jest.Mocked<GitHubFileOperations> {
    return {
        getFileContent: jest.fn(),
        createOrUpdateFile: jest.fn(),
        listRepoFiles: jest.fn(),
        getBranchInfo: jest.fn(),
        createTree: jest.fn(),
        createCommit: jest.fn(),
        updateBranchRef: jest.fn(),
        getBlobContent: jest.fn(),
    } as unknown as jest.Mocked<GitHubFileOperations>;
}

const B2B_FEATURE_PACK = {
    id: 'b2b-commerce',
    name: 'B2B Commerce',
    description: 'B2B features',
    source: { owner: 'hlxsites', repo: 'aem-boilerplate-commerce', branch: 'b2b' },
    stackTypes: ['eds-storefront'],
    configFlags: { 'commerce-b2b-enabled': true },
    blocks: { install: true, sourceDir: 'blocks' },
    initializers: {
        install: true,
        sourceDir: 'scripts/initializers',
        files: ['company.js', 'quotes.js'],
    },
    dependencies: {
        '@dropins/storefront-quotes': '^1.0.0',
        '@dropins/storefront-account-b2b': '^1.0.0',
    },
};

describe('installFeaturePacks', () => {
    let logger: Logger;
    let githubFileOps: jest.Mocked<GitHubFileOperations>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
        githubFileOps = createMockGithubFileOps();
    });

    it('should return success with zero counts when no packs selected', async () => {
        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', [], logger,
        );

        expect(result.success).toBe(true);
        expect(result.blocksInstalled).toBe(0);
        expect(result.initializersInstalled).toBe(0);
        expect(result.dependenciesAdded).toBe(0);
    });

    it('should skip unknown pack IDs with a warning', async () => {
        mockGetFeaturePack.mockReturnValue(undefined);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['nonexistent'], logger,
        );

        expect(result.success).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining("'nonexistent' not found"),
        );
    });

    it('should install blocks via installBlockCollections', async () => {
        mockGetFeaturePack.mockReturnValue(B2B_FEATURE_PACK);
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 5,
            blockIds: ['company', 'quotes', 'purchase-orders', 'requisition-lists', 'company-switcher'],
        });
        // No initializers or deps for this test
        const packWithBlocksOnly = {
            ...B2B_FEATURE_PACK,
            initializers: undefined,
            dependencies: undefined,
        };
        mockGetFeaturePack.mockReturnValue(packWithBlocksOnly);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.blocksInstalled).toBe(5);
        expect(mockInstallBlockCollections).toHaveBeenCalledWith(
            githubFileOps, 'owner', 'repo',
            [{ source: B2B_FEATURE_PACK.source, name: 'B2B Commerce' }],
            logger, [],
        );
    });

    it('should fetch initializer files from source repo', async () => {
        const packWithInitOnly = {
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            dependencies: undefined,
        };
        mockGetFeaturePack.mockReturnValue(packWithInitOnly);

        // Mock getFileContent for initializer files
        githubFileOps.getFileContent
            .mockResolvedValueOnce({
                content: '// company.js content',
                sha: 'sha1',
            } as never)
            .mockResolvedValueOnce({
                content: '// quotes.js content',
                sha: 'sha2',
            } as never);

        githubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        } as never);
        githubFileOps.createTree.mockResolvedValue('new-tree-sha' as never);
        githubFileOps.createCommit.mockResolvedValue('new-commit-sha' as never);
        githubFileOps.updateBranchRef.mockResolvedValue(undefined as never);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.initializersInstalled).toBe(2);

        // Verify files were fetched from the correct source
        expect(githubFileOps.getFileContent).toHaveBeenCalledWith(
            'hlxsites', 'aem-boilerplate-commerce',
            'scripts/initializers/company.js', 'b2b',
        );
        expect(githubFileOps.getFileContent).toHaveBeenCalledWith(
            'hlxsites', 'aem-boilerplate-commerce',
            'scripts/initializers/quotes.js', 'b2b',
        );

        // Verify tree entries include the initializer files
        const createTreeCall = githubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2];
        expect(treeEntries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: 'scripts/initializers/company.js',
                    content: '// company.js content',
                }),
                expect.objectContaining({
                    path: 'scripts/initializers/quotes.js',
                    content: '// quotes.js content',
                }),
            ]),
        );
    });

    it('should merge dependencies into package.json', async () => {
        const packWithDepsOnly = {
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            initializers: undefined,
        };
        mockGetFeaturePack.mockReturnValue(packWithDepsOnly);

        // Mock existing package.json
        githubFileOps.getFileContent.mockResolvedValueOnce({
            content: JSON.stringify({
                name: 'my-storefront',
                dependencies: {
                    '@dropins/storefront-cart': '^1.0.0',
                },
            }, null, 2),
            sha: 'pkg-sha',
        } as never);

        githubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        } as never);
        githubFileOps.createTree.mockResolvedValue('new-tree-sha' as never);
        githubFileOps.createCommit.mockResolvedValue('new-commit-sha' as never);
        githubFileOps.updateBranchRef.mockResolvedValue(undefined as never);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.dependenciesAdded).toBe(2);

        // Verify merged package.json
        const createTreeCall = githubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2];
        const pkgEntry = treeEntries.find((e: { path: string }) => e.path === 'package.json');
        expect(pkgEntry).toBeDefined();

        const mergedPkg = JSON.parse(pkgEntry.content);
        expect(mergedPkg.dependencies['@dropins/storefront-cart']).toBe('^1.0.0'); // preserved
        expect(mergedPkg.dependencies['@dropins/storefront-quotes']).toBe('^1.0.0'); // added
        expect(mergedPkg.dependencies['@dropins/storefront-account-b2b']).toBe('^1.0.0'); // added
    });

    it('should not overwrite existing dependencies', async () => {
        const packWithDepsOnly = {
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            initializers: undefined,
            dependencies: {
                '@dropins/storefront-cart': '^2.0.0', // already exists with different version
            },
        };
        mockGetFeaturePack.mockReturnValue(packWithDepsOnly);

        githubFileOps.getFileContent.mockResolvedValueOnce({
            content: JSON.stringify({
                name: 'my-storefront',
                dependencies: {
                    '@dropins/storefront-cart': '^1.0.0',
                },
            }, null, 2),
            sha: 'pkg-sha',
        } as never);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.dependenciesAdded).toBe(0);
        // No commit should be made since nothing was added
        expect(githubFileOps.createTree).not.toHaveBeenCalled();
    });

    it('should install blocks, initializers, and dependencies together', async () => {
        mockGetFeaturePack.mockReturnValue(B2B_FEATURE_PACK);

        // Block installation
        mockInstallBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 3,
            blockIds: ['company', 'quotes', 'requisition-lists'],
        });

        // Initializer files
        githubFileOps.getFileContent
            .mockResolvedValueOnce({ content: '// company.js', sha: 's1' } as never) // company.js
            .mockResolvedValueOnce({ content: '// quotes.js', sha: 's2' } as never) // quotes.js
            .mockResolvedValueOnce({ // package.json
                content: JSON.stringify({ name: 'store', dependencies: {} }, null, 2),
                sha: 'pkg-sha',
            } as never);

        githubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha', commitSha: 'commit-sha',
        } as never);
        githubFileOps.createTree.mockResolvedValue('new-tree-sha' as never);
        githubFileOps.createCommit.mockResolvedValue('new-commit-sha' as never);
        githubFileOps.updateBranchRef.mockResolvedValue(undefined as never);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.blocksInstalled).toBe(3);
        expect(result.initializersInstalled).toBe(2);
        expect(result.dependenciesAdded).toBe(2);

        // Blocks via installBlockCollections
        expect(mockInstallBlockCollections).toHaveBeenCalledTimes(1);
        // Initializers + deps via single atomic commit
        expect(githubFileOps.createCommit).toHaveBeenCalledTimes(1);
    });

    it('should handle missing initializer files gracefully', async () => {
        const packWithInitOnly = {
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            dependencies: undefined,
        };
        mockGetFeaturePack.mockReturnValue(packWithInitOnly);

        // First file exists, second doesn't
        githubFileOps.getFileContent
            .mockResolvedValueOnce({ content: '// company.js', sha: 's1' } as never)
            .mockResolvedValueOnce(null as never);

        githubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha', commitSha: 'commit-sha',
        } as never);
        githubFileOps.createTree.mockResolvedValue('new-tree-sha' as never);
        githubFileOps.createCommit.mockResolvedValue('new-commit-sha' as never);
        githubFileOps.updateBranchRef.mockResolvedValue(undefined as never);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.initializersInstalled).toBe(1); // Only one found
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('quotes.js'),
        );
    });

    it('should handle block installation failure gracefully', async () => {
        mockGetFeaturePack.mockReturnValue({
            ...B2B_FEATURE_PACK,
            initializers: undefined,
            dependencies: undefined,
        });

        mockInstallBlockCollections.mockResolvedValue({
            success: false,
            blocksCount: 0,
            blockIds: [],
            error: 'Source repo not accessible',
        });

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true); // Overall success since failure is non-fatal
        expect(result.blocksInstalled).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Source repo not accessible'),
        );
    });

    it('should handle missing package.json in destination', async () => {
        const packWithDepsOnly = {
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            initializers: undefined,
        };
        mockGetFeaturePack.mockReturnValue(packWithDepsOnly);

        githubFileOps.getFileContent.mockResolvedValueOnce(null as never);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.dependenciesAdded).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('No package.json'),
        );
    });

    it('should handle API errors and return failure result', async () => {
        mockGetFeaturePack.mockReturnValue({
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            initializers: undefined,
        });

        githubFileOps.getFileContent.mockRejectedValueOnce(new Error('API rate limit'));

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('API rate limit');
    });

    it('should skip initializers when pack has install: false', async () => {
        const packNoInit = {
            ...B2B_FEATURE_PACK,
            blocks: undefined,
            dependencies: undefined,
            initializers: { install: false, sourceDir: 'scripts/initializers', files: ['company.js'] },
        };
        mockGetFeaturePack.mockReturnValue(packNoInit);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.initializersInstalled).toBe(0);
        expect(githubFileOps.getFileContent).not.toHaveBeenCalled();
    });

    it('should skip blocks when pack has install: false', async () => {
        const packNoBlocks = {
            ...B2B_FEATURE_PACK,
            initializers: undefined,
            dependencies: undefined,
            blocks: { install: false },
        };
        mockGetFeaturePack.mockReturnValue(packNoBlocks);

        const result = await installFeaturePacks(
            githubFileOps, 'owner', 'repo', ['b2b-commerce'], logger,
        );

        expect(result.success).toBe(true);
        expect(result.blocksInstalled).toBe(0);
        expect(mockInstallBlockCollections).not.toHaveBeenCalled();
    });
});
