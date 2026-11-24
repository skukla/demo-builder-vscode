/**
 * ensureEdsContent — the block library it builds for an imported project, and the blocks that
 * build left on a placeholder, handed to the caller to record (EDS-71 step 4c).
 *
 * Split from `edsContentSetup.test.ts` (2026-11-23, the 750-line test cap); the shared mocks and
 * the SUT import are in `edsContentSetup.testUtils.ts`.
 */

// The harness owns the mocks and the SUT import, so it is imported first (see its header).
import {
    ensureEdsContent,
    makeConfig,
    makeDeps,
    mockFetch,
    mockGetFileContent,
    mockListRepoFiles,
    mockWriteStorefrontBlockLibrary,
    setupDefaultMocks,
} from './edsContentSetup.testUtils';
import type { StorefrontLibraryInput } from '@/features/eds/services/blockLibrary/storefrontLibraryWriter';

describe('ensureEdsContent — the block library', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDefaultMocks();
    });

    describe('the block library', () => {
        it("builds from the storefront's own repository and writes to its DA.live site", async () => {
            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockListRepoFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
            const [org, site, input] = mockWriteStorefrontBlockLibrary.mock.calls[0];
            expect([org, site]).toEqual(['test-org', 'test-site']);
            expect((input as StorefrontLibraryInput).blocks.map((block) => block.id)).toEqual(['hero']);
        });

        it("reads the package's content sources, the libraries and the demo's site", async () => {
            const config = makeConfig({
                accountContentSource: { org: 'b2b-org', site: 'b2b-site' },
                blockLibraries: ['isle5'],
                demoContentSource: { org: 'demo-org', site: 'demo-site' },
            });

            await ensureEdsContent(config, makeDeps());

            const asked = mockFetch.mock.calls.map(([url]) => url as string);
            expect(asked).toEqual(expect.arrayContaining([
                'https://main--source-site--source-org.aem.page/docs/library/blocks.json',
                'https://main--b2b-site--b2b-org.aem.page/docs/library/blocks.json',
                'https://main--demo-site--demo-org.aem.page/docs/library/blocks/hero.plain.html',
            ]));
            expect(mockListRepoFiles).toHaveBeenCalledWith('stephen-garner-adobe', 'isle5', 'main');
        });

        it('hands the writer a code reader that fetches from the storefront on GitHub', async () => {
            await ensureEdsContent(makeConfig(), makeDeps());

            const input = mockWriteStorefrontBlockLibrary.mock.calls[0][2] as StorefrontLibraryInput;
            await input.placeholderFor('hero');

            // A reader that resolves to undefined shapes every placeholder as one cell.
            expect(mockGetFileContent).toHaveBeenCalledWith(
                'test-owner',
                'test-repo',
                'blocks/hero/hero.js',
                'main'
            );
        });
    });

    // EDS-71 step 4c: the caller records them for the Draft Examples tile.
    describe('the blocks still needing an example', () => {
        it('hands the caller the blocks the built list left on a placeholder', async () => {
            mockWriteStorefrontBlockLibrary.mockResolvedValue({
                success: true, blocksCount: 3, paths: ['/library'], needsExample: ['tabs'],
            });
            const onBlocksNeedingExamples = jest.fn();

            await ensureEdsContent(makeConfig(), { ...makeDeps(), onBlocksNeedingExamples });

            expect(onBlocksNeedingExamples.mock.calls).toStrictEqual([[['tabs']]]);
        });

        it('says nothing when the list was not written', async () => {
            mockWriteStorefrontBlockLibrary.mockResolvedValue({ success: false, blocksCount: 0, paths: [] });
            const onBlocksNeedingExamples = jest.fn();

            await ensureEdsContent(makeConfig(), { ...makeDeps(), onBlocksNeedingExamples });

            expect(onBlocksNeedingExamples).not.toHaveBeenCalled();
        });
    });
});
