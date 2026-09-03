/**
 * Block Collection Helpers - Shared Test Utilities
 *
 * Pure builders for component-definition.json / component-filters.json /
 * component-models.json fixtures and mock blocks/ file entries. Shared across
 * the blockCollectionHelpers single-library and merge test suites.
 *
 * NOTE: This is a `*.testUtils.ts` file (not `*.test.ts`) so Jest does not treat
 * it as a test suite — it contains no `describe`/`it` blocks.
 */

/** Create a component-definition.json with specified blocks */
export function createComponentDef(
    blocks: Array<{ title: string; id: string; unsafeHTML?: string }>,
): string {
    return JSON.stringify({
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({
                title: b.title,
                id: b.id,
                plugins: b.unsafeHTML ? { da: { unsafeHTML: b.unsafeHTML } } : undefined,
            })),
        }],
    });
}

/** Create a destination component-definition.json with existing blocks */
export function createDestComponentDef(
    blocks: Array<{ title: string; id: string }> = [
        { title: 'Hero', id: 'hero' },
        { title: 'Cards', id: 'cards' },
    ],
): string {
    return JSON.stringify({
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({ title: b.title, id: b.id })),
        }],
    });
}

/** Create a source component-filters.json */
export function createComponentFilters(
    sectionBlocks: string[],
    subFilters: Array<{ id: string; components: string[] }> = [],
): string {
    return JSON.stringify([
        { id: 'main', components: ['section'] },
        { id: 'section', components: sectionBlocks },
        ...subFilters,
    ]);
}

/** Create a destination component-filters.json with common defaults */
export function createDestComponentFilters(
    sectionBlocks: string[] = ['hero', 'cards', 'enrichment', 'fragment', 'text', 'image'],
): string {
    return JSON.stringify([
        { id: 'main', components: ['section'] },
        { id: 'section', components: sectionBlocks },
    ]);
}

/** Create a source component-models.json (flat array of model objects) */
export function createComponentModels(
    models: Array<{ id: string; fields?: Array<{ name: string; component: string }> }>,
): string {
    return JSON.stringify(models.map(m => ({
        id: m.id,
        fields: m.fields ?? [{ component: 'text', name: 'text', label: 'Text', valueType: 'string' }],
    })));
}

/** Create a destination component-models.json with common defaults */
export function createDestComponentModels(
    models: Array<{ id: string }> = [
        { id: 'hero' }, { id: 'cards' }, { id: 'section' }, { id: 'page-metadata' },
    ],
): string {
    return JSON.stringify(models.map(m => ({
        id: m.id,
        fields: [{ component: 'text', name: 'text', label: 'Text', valueType: 'string' }],
    })));
}

/** Create mock file entries for blocks/ directories */
export function createBlockFileEntries(
    blockIds: string[],
    extraFiles: Array<{ path: string; sha: string }> = [],
): Array<{ path: string; mode: string; type: 'blob'; sha: string }> {
    const blockEntries = blockIds.map(id => ({
        path: `blocks/${id}/${id}.js`,
        mode: '100644',
        type: 'blob' as const,
        sha: `sha-${id}`,
    }));
    const extras = extraFiles.map(f => ({
        path: f.path,
        mode: '100644',
        type: 'blob' as const,
        sha: f.sha,
    }));
    return [...blockEntries, ...extras];
}

/**
 * Make the mocked `commitTreeToBranch` do what the real one does on the happy
 * path: read the branch, build a tree on its base, commit, move the ref.
 *
 * The suites here assert WHICH files were written and WHAT the commit message
 * was, by reading `createTree` / `createCommit`. Those facts did not change when
 * the four steps moved behind one method — so rather than rewrite sixty
 * assertions to read a different call, the fake keeps them pointed at the same
 * observations. It is faithful, not convenient: a fake that skipped the inner
 * calls would let the caller stop writing files without a single test noticing.
 *
 * The retry and the never-force rule are pinned where they live, against the
 * real implementation, in `githubFileOperations-branchRef.test.ts`.
 *
 * @param mock - the mocked GitHubFileOperations to install the behaviour on
 */
export function delegateCommitTreeToBranch(mock: {
    getBranchInfo: jest.Mock;
    createTree: jest.Mock;
    createCommit: jest.Mock;
    updateBranchRef: jest.Mock;
    commitTreeToBranch: jest.Mock;
}): void {
    mock.commitTreeToBranch.mockImplementation(
        async (
            owner: string,
            repo: string,
            branch: string,
            entries: unknown,
            message: string,
        ) => {
            const { treeSha, commitSha } = await mock.getBranchInfo(owner, repo, branch);
            const newTreeSha = await mock.createTree(owner, repo, entries, treeSha);
            const newCommitSha = await mock.createCommit(
                owner,
                repo,
                message,
                newTreeSha,
                commitSha,
            );
            await mock.updateBranchRef(owner, repo, branch, newCommitSha);
            return newCommitSha;
        },
    );
}

import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

/** The blocks these suites discover unless a test names others. */
export const DEFAULT_BLOCKS = ['hero-cta', 'newsletter', 'search-bar'];

export interface BlockCollectionHarness {
    mockLogger: jest.Mocked<Logger>;
    mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
}

/**
 * The GitHub file-operations double four of these suites build identically.
 *
 * Every method the installer touches is present, because a partial double fails
 * as a TypeError inside the code under test rather than as a missing
 * expectation. `delegateCommitTreeToBranch` is called here for the same reason
 * the suites called it: the helper reaches its commit path through that
 * delegate.
 */
export function setupBlockCollectionMocks(): BlockCollectionHarness {
    const mockLogger = createMockLogger() as unknown as jest.Mocked<Logger>;

    const mockGithubFileOps = {
        listRepoFiles: jest.fn(),
        getBlobContent: jest.fn(),
        getFileContent: jest.fn(),
        getBranchInfo: jest.fn(),
        createTree: jest.fn(),
        createCommit: jest.fn(),
        updateBranchRef: jest.fn(),
        commitTreeToBranch: jest.fn(),
    } as unknown as jest.Mocked<GitHubFileOperations>;

    delegateCommitTreeToBranch(
        mockGithubFileOps as unknown as Parameters<typeof delegateCommitTreeToBranch>[0]
    );

    return { mockLogger, mockGithubFileOps };
}

/**
 * Mocks for one successful single-library install.
 *
 * Shared by the two component-definition suites; the other three drive
 * different install shapes and keep their own. `blockIds` varies so a caller can
 * exercise dynamic discovery.
 */
export function setupSuccessfulInstall(
    mockGithubFileOps: jest.Mocked<GitHubFileOperations>,
    sourceComponentDef: string | null,
    destComponentDef: string = createDestComponentDef(),
    blockIds: string[] = DEFAULT_BLOCKS,
): void {
    mockGithubFileOps.listRepoFiles
        .mockResolvedValueOnce([]) // destination — empty, no existing blocks
        .mockResolvedValueOnce(createBlockFileEntries(blockIds));

    mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');

    mockGithubFileOps.getFileContent.mockImplementation(
        async (owner: string, repo: string, path: string) => {
            // Filters and models are not what the component-definition tests read.
            if (path === 'component-filters.json' || path === 'component-models.json') return null;
            if (owner === 'stephen-garner-adobe' && repo === 'isle5') {
                if (sourceComponentDef === null) return null;
                return { content: sourceComponentDef, sha: 'source-sha', path, encoding: 'base64' };
            }
            return { content: destComponentDef, sha: 'dest-sha', path, encoding: 'base64' };
        }
    );

    mockGithubFileOps.getBranchInfo.mockResolvedValue({
        treeSha: 'tree-sha',
        commitSha: 'commit-sha',
    });
    mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
    mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
    mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
}

/**
 * The commit path, primed for a run that succeeds.
 *
 * Six lines that appeared fifteen times across the discovery and dedup suites,
 * always in this order and always with these values. They are not what those
 * suites are testing — both drive `listRepoFiles` themselves and assert on what
 * reached `createTree` — so the repetition was scaffolding around the one line
 * that varied.
 *
 * `getBranchInfo` is set to a fixed answer here. A test that needs it to vary
 * per repository calls this first and overrides afterwards, which is what the
 * two suites already did by hand.
 */
export function primeCommitPath(mockGithubFileOps: jest.Mocked<GitHubFileOperations>): void {
    mockGithubFileOps.getBlobContent.mockResolvedValue('content');
    mockGithubFileOps.getFileContent.mockResolvedValue(null);
    mockGithubFileOps.getBranchInfo.mockResolvedValue({
        treeSha: 'tree-sha',
        commitSha: 'commit-sha',
    });
    mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
    mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
    mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
}
