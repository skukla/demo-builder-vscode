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
