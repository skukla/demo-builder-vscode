/**
 * Block Collection Helpers - Single Library: what the commit holds
 *
 * The install copies a library's block folders and nothing else: the storefront's
 * Universal Editor files are not touched (EDS-71 step 6). Plus install error
 * handling and how the commit is landed. Shared fixture builders live in
 * blockCollectionHelpers.testUtils.ts.
 *
 * Related suites:
 *   - blockCollectionHelpers-discovery.test.ts        (dynamic block discovery)
 *   - blockCollectionHelpers-multiLibrary-merging.test.ts (template blocks kept)
 *   - blockCollectionHelpers-handDeletions.test.ts    (block folders removed by hand)
 */

import {
    installBlockCollections,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { AddonSource } from '@/types/demoPackages';
import {
    createComponentDef,
    createDestComponentDef,
    setupBlockCollectionMocks,
    setupSuccessfulInstall,
    type MockGithubFileOps,
} from './blockCollectionHelpers.testUtils';

const UE_FILES = ['component-definition.json', 'component-filters.json', 'component-models.json'];

describe('installBlockCollections (single library)', () => {
    const TEST_SOURCE: AddonSource = { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' };
    let mockGithubFileOps: MockGithubFileOps;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    /**
     * Adobe deleted these three files with Universal Editor, and the DA.live block
     * list no longer reads them. Writing to them would only keep a deleted file
     * alive and give the template update a clash to resolve.
     */
    describe("the storefront's Universal Editor files", () => {
        it('commits only block folders, even when the library and the storefront both have the files', async () => {
            setupSuccessfulInstall(
                mockGithubFileOps,
                createComponentDef([{ title: 'Circle Carousel', id: 'circle-carousel' }]),
                createDestComponentDef(),
                ['circle-carousel'],
            );

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);
            const tree = mockGithubFileOps.commitTreeToBranch.mock.calls[0][3] as Array<{ path: string }>;
            expect(tree.map((entry) => entry.path)).toEqual(['blocks/circle-carousel/circle-carousel.js']);
        });

        it('does not read them from the library or the storefront', async () => {
            setupSuccessfulInstall(
                mockGithubFileOps,
                createComponentDef([{ title: 'Circle Carousel', id: 'circle-carousel' }]),
                createDestComponentDef(),
                ['circle-carousel'],
            );

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            const read = mockGithubFileOps.getFileContent.mock.calls.map((call) => call[2]);
            expect(read.filter((path) => UE_FILES.includes(path))).toStrictEqual([]);
        });

        it('records the blocks it copied and no authoring entries', async () => {
            setupSuccessfulInstall(
                mockGithubFileOps,
                createComponentDef([{ title: 'Circle Carousel', id: 'circle-carousel' }]),
                createDestComponentDef(),
                ['circle-carousel'],
            );

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            const [version] = result.libraryVersions ?? [];
            expect(version.blockIds).toEqual(['circle-carousel']);
            expect(Object.keys(version)).not.toContain('addedEntries');
        });
    });

    describe('error handling', () => {
        it('should return error result on API failure', async () => {
            mockGithubFileOps.listRepoFiles.mockRejectedValue(new Error('API rate limit'));

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('API rate limit');
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toStrictEqual([]);
        });

        it('should return error result on commit failure', async () => {
            setupSuccessfulInstall(mockGithubFileOps, null);
            mockGithubFileOps.createCommit.mockRejectedValue(new Error('Commit failed'));

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Commit failed');
        });
    });

    /**
     * Structural guard: the install lands its commit through
     * `commitTreeToBranch`, and never moves the ref itself.
     *
     * Every other assertion in these suites reads `createTree` / `createCommit`,
     * which the shared fake still drives — so all of them would keep passing if
     * someone re-inlined the four steps here and force-moved the ref by hand.
     * That is exactly the code this bug WAS: additive work calling
     * `updateBranchRef` directly, with `force` inherited from a default. A
     * colleague lost two real fixes to it on 2026-08-18.
     *
     * Installing a block library must never move `main` to a commit that is not a
     * descendant of what is there now. `commitTreeToBranch` is where that promise
     * is kept — unforced, and re-based on a fresh read if it loses the race.
     */
    describe('how the commit is landed', () => {
        it('goes through commitTreeToBranch', async () => {
            setupSuccessfulInstall(mockGithubFileOps, createComponentDef([
                { title: 'Circle Carousel', id: 'circle-carousel' },
            ]), createDestComponentDef(), ['circle-carousel']);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(mockGithubFileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        });

        it('writes the discovered blocks through that call, onto main', async () => {
            // A guard that only checked WHICH method was called would pass on an
            // empty commit.
            setupSuccessfulInstall(mockGithubFileOps, createComponentDef([
                { title: 'Circle Carousel', id: 'circle-carousel' },
            ]), createDestComponentDef(), ['circle-carousel']);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            const call = mockGithubFileOps.commitTreeToBranch.mock.calls[0];
            expect(call[2]).toBe('main');
            expect((call[3] as unknown[]).length).toBeGreaterThan(0);
        });
    });

});
