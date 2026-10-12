/**
 * readStorefrontCodePaths — the storefront's code, read once from the SC's own repository.
 *
 * In every flow that copies content the SC's GitHub repository already holds the
 * final code (EDS-40 research, section 3), so that is where the copy reads it:
 * one archive download per create or reset. When the download fails the copy must
 * still run, on the fixed lists.
 */

import type { ArchivedFile } from '@/features/eds/services/github/githubRepoArchive';
import { readStorefrontCodePaths } from '@/features/eds/services/storefrontCodeReader';
import { createMockLogger } from '../../../helpers/loggerFake';
import { STOREFRONT_CODE } from './storefrontCodeFixture';

const REPO = { owner: 'me', repo: 'shop' };

/** A repository archive holding these files, as `downloadRepoContents` returns it. */
function archiveOf(files: Record<string, string>): Map<string, ArchivedFile> {
    return new Map(
        Object.entries(files).map(([path, content]) => [path, { data: Buffer.from(content, 'utf8'), mode: '100644' }]),
    );
}

describe('readStorefrontCodePaths', () => {
    it('downloads the SC’s own repository, once', async () => {
        const downloadRepoContents = jest.fn().mockResolvedValue(archiveOf({ 'blocks/x/x.js': "go('/cart');" }));

        await readStorefrontCodePaths({ downloadRepoContents }, REPO, createMockLogger());

        expect(downloadRepoContents).toHaveBeenCalledTimes(1);
        expect(downloadRepoContents).toHaveBeenCalledWith('me', 'shop');
    });

    it('returns the paths the storefront’s code loads', async () => {
        const files = Object.fromEntries(STOREFRONT_CODE.map((file) => [file.path, file.content]));
        const downloadRepoContents = jest.fn().mockResolvedValue(archiveOf(files));

        const paths = await readStorefrontCodePaths({ downloadRepoContents }, REPO, createMockLogger());

        expect(paths).toEqual(
            expect.arrayContaining(['/cart', '/customer/forgotpassword', '/store-switcher', '/placeholders/auth.json']),
        );
    });

    it('reads only the storefront’s own JavaScript', async () => {
        const downloadRepoContents = jest.fn().mockResolvedValue(
            archiveOf({
                'blocks/x/x.js': "go('/cart');",
                'scripts/__dropins__/storefront-cart/api.js': "go('/from-a-dropin');",
                'tools/picker/picker.js': "go('/from-a-tool');",
                'README.md': "see '/from-the-readme'",
            }),
        );

        const paths = await readStorefrontCodePaths({ downloadRepoContents }, REPO, createMockLogger());

        expect(paths).toEqual(['/cart']);
    });

    it('answers "not read" when the download fails, so the copy can fall back', async () => {
        const downloadRepoContents = jest.fn().mockRejectedValue(new Error('Failed to download archive: HTTP 404'));

        await expect(
            readStorefrontCodePaths({ downloadRepoContents }, REPO, createMockLogger()),
        ).resolves.toBeUndefined();
    });

    it('answers "not read" for a repository with no storefront code in it', async () => {
        // An empty list would mean "this storefront loads nothing", and the copy
        // would then skip the fixed lists too.
        const downloadRepoContents = jest.fn().mockResolvedValue(archiveOf({ 'README.md': 'hello' }));

        await expect(
            readStorefrontCodePaths({ downloadRepoContents }, REPO, createMockLogger()),
        ).resolves.toBeUndefined();
    });
});
