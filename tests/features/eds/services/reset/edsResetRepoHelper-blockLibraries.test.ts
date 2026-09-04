/**
 * resetRepoToTemplate — which block libraries get reinstalled, and how.
 *
 * Mutation testing (PL-22, batch MUT-07) found every decision in the library
 * walk unconstrained: package filtering, the source/name lookup, content-source
 * collection, the custom-library append, the singular/plural progress line, the
 * merged-vs-standalone inspector commit, and the ids the reset reports back.
 * Each test here asserts the list handed to `installBlockCollections` or the
 * call handed to `installInspectorTagging` — the argument, not the answer.
 */

import {
    INSPECTOR_ENTRY,
    SOURCE_A,
    SOURCE_B,
    SOURCE_CUSTOM,
    buildParams,
    installDefaults,
    mocks,
    runReset,
} from './edsResetRepoHelper.testUtils';
import type { AddonSource } from '@/types/demoPackages';
import { createMockProject } from '../../../../helpers/projectFake';

function catalog(sources: Record<string, AddonSource | undefined>, names: Record<string, string> = {}) {
    mocks.getBlockLibrarySource.mockImplementation((id) => sources[id]);
    mocks.getBlockLibraryName.mockImplementation((id) => names[id] ?? '');
}

function projectWith(overrides: Parameters<typeof createMockProject>[0]) {
    return createMockProject({ name: 'p', path: '/p', selectedPackage: 'pkg', ...overrides });
}

beforeEach(installDefaults);

describe('resetRepoToTemplate — block library reinstall', () => {
    it('installs every available library, named from the catalog, with inspector entries in the same commit', async () => {
        catalog({ 'lib-a': SOURCE_A, 'lib-b': SOURCE_B }, { 'lib-a': 'Library A' });
        mocks.getBlockLibraryContentSource.mockImplementation((id) =>
            id === 'lib-a' ? { org: 'content-org', site: 'content-site' } : undefined,
        );
        mocks.generateInspectorTreeEntries.mockResolvedValue([INSPECTOR_ENTRY]);
        mocks.installBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 2,
            blockIds: ['hero', 'cards'],
        });
        const params = buildParams({
            project: projectWith({ selectedBlockLibraries: ['lib-a', 'lib-b'] }),
        });

        const { result, githubFileOps, report, context } = await runReset(params);

        expect(mocks.isBlockLibraryAvailableForPackage).toHaveBeenCalledWith('lib-a', 'pkg');
        expect(mocks.installBlockCollections).toHaveBeenCalledWith(
            githubFileOps,
            'me',
            'shop',
            [
                { source: SOURCE_A, name: 'Library A' },
                { source: SOURCE_B, name: 'lib-b' },
            ],
            context.logger,
            [INSPECTOR_ENTRY],
        );
        expect(mocks.installInspectorTagging).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(2, 'Re-installing blocks from 2 libraries...');
        expect(result.blockCollectionIds).toEqual(['hero', 'cards']);
        expect(result.libraryContentSources).toEqual([{ org: 'content-org', site: 'content-site' }]);
    });

    it('skips a library the package excludes before looking up its source', async () => {
        catalog({ 'lib-a': SOURCE_A, 'lib-x': SOURCE_B });
        mocks.isBlockLibraryAvailableForPackage.mockImplementation((id) => id !== 'lib-x');
        mocks.getBlockLibraryContentSource.mockReturnValue({ org: 'o', site: 's' });
        const params = buildParams({
            project: projectWith({ selectedBlockLibraries: ['lib-a', 'lib-x'] }),
        });

        const { result } = await runReset(params);

        expect(mocks.getBlockLibrarySource).not.toHaveBeenCalledWith('lib-x');
        expect(mocks.installBlockCollections.mock.calls[0][3]).toEqual([
            { source: SOURCE_A, name: 'lib-a' },
        ]);
        // One content source: the excluded library never reaches the lookup.
        expect(result.libraryContentSources).toEqual([{ org: 'o', site: 's' }]);
    });

    it('leaves out a selected library with no source but keeps its content source; one library reads singular', async () => {
        catalog({ 'lib-a': SOURCE_A, ghost: undefined }, { 'lib-a': 'Library A' });
        mocks.getBlockLibraryContentSource.mockImplementation((id) =>
            id === 'ghost' ? { org: 'ghost-org', site: 'ghost-site' } : undefined,
        );
        const params = buildParams({
            project: projectWith({ selectedBlockLibraries: ['lib-a', 'ghost'] }),
        });

        const { result, report } = await runReset(params);

        expect(mocks.installBlockCollections.mock.calls[0][3]).toEqual([
            { source: SOURCE_A, name: 'Library A' },
        ]);
        expect(report).toHaveBeenCalledWith(2, 'Re-installing blocks from 1 library...');
        expect(result.libraryContentSources).toEqual([{ org: 'ghost-org', site: 'ghost-site' }]);
    });

    it('checks package availability against an empty id when the project has no package', async () => {
        catalog({ 'lib-a': SOURCE_A });
        const params = buildParams({
            project: projectWith({ selectedPackage: undefined, selectedBlockLibraries: ['lib-a'] }),
        });

        await runReset(params);

        expect(mocks.isBlockLibraryAvailableForPackage).toHaveBeenCalledWith('lib-a', '');
    });

    it('appends custom block libraries after the catalog ones with their own name and source', async () => {
        catalog({ 'lib-a': SOURCE_A }, { 'lib-a': 'Library A' });
        const params = buildParams({
            project: projectWith({
                selectedBlockLibraries: ['lib-a'],
                customBlockLibraries: [{ name: 'My Blocks', source: SOURCE_CUSTOM }],
            }),
        });

        await runReset(params);

        expect(mocks.installBlockCollections.mock.calls[0][3]).toEqual([
            { source: SOURCE_A, name: 'Library A' },
            { source: SOURCE_CUSTOM, name: 'My Blocks' },
        ]);
    });

    it('reports no collection ids when the block install fails', async () => {
        catalog({ 'lib-a': SOURCE_A });
        mocks.installBlockCollections.mockResolvedValue({
            success: false,
            blocksCount: 0,
            blockIds: [],
            error: 'tree push failed',
        });
        const params = buildParams({ project: projectWith({ selectedBlockLibraries: ['lib-a'] }) });

        const { result } = await runReset(params);

        expect(result.blockCollectionIds).toBeUndefined();
    });

    it('installs inspector tagging standalone when there are entries but no libraries', async () => {
        mocks.generateInspectorTreeEntries.mockResolvedValue([INSPECTOR_ENTRY]);
        const params = buildParams({ project: projectWith({ selectedBlockLibraries: [] }) });

        const { result, githubFileOps, report, context } = await runReset(params);

        expect(mocks.installBlockCollections).not.toHaveBeenCalled();
        expect(mocks.installInspectorTagging).toHaveBeenCalledWith(
            githubFileOps,
            'me',
            'shop',
            'pkg',
            context.logger,
        );
        expect(report).toHaveBeenCalledWith(3, 'Installing inspector tagging...');
        expect(result.blockCollectionIds).toBeUndefined();
        expect(result.libraryContentSources).toEqual([]);
    });

    it('installs nothing when the project selects no libraries and no inspector entries exist', async () => {
        const params = buildParams({
            project: projectWith({ selectedBlockLibraries: undefined }),
        });

        const { result, report } = await runReset(params);

        expect(mocks.isBlockLibraryAvailableForPackage).not.toHaveBeenCalled();
        expect(mocks.installBlockCollections).not.toHaveBeenCalled();
        expect(mocks.installInspectorTagging).not.toHaveBeenCalled();
        expect(report.mock.calls.map(([step]) => step)).not.toContain(3);
        expect(result.blockCollectionIds).toBeUndefined();
    });

    it('proceeds with no extra tree entries when inspector generation throws', async () => {
        catalog({ 'lib-a': SOURCE_A });
        mocks.generateInspectorTreeEntries.mockRejectedValue(new Error('sdk unavailable'));
        const params = buildParams({ project: projectWith({ selectedBlockLibraries: ['lib-a'] }) });

        await runReset(params);

        expect(mocks.installBlockCollections.mock.calls[0][5]).toEqual([]);
        expect(mocks.installInspectorTagging).not.toHaveBeenCalled();
    });
});
