/**
 * HelixPageDiscovery — which DA.live documents a publish covers, measured on
 * its own (EDS-8, 2026-10-08). The decisions: HTML only, the two exclusion
 * lists, prefix stripping, `/index` collapsing, recursion by relative path,
 * and a listing failure that degrades to "nothing here" instead of throwing.
 */

import { HelixPageDiscovery } from '@/features/eds/services/helix/helixPageDiscovery';
import type { DaLiveEntry } from '@/features/eds/services/types';
import { createMockLogger } from '../../../../helpers/loggerFake';

const file = (path: string, ext = 'html'): DaLiveEntry => ({
    name: path.split('/').pop()!.replace(/\.[^.]+$/, ''),
    path,
    ext,
});
const folder = (path: string): DaLiveEntry => ({ name: path.split('/').pop()!, path });

describe('HelixPageDiscovery.listAllPages', () => {
    let logger: ReturnType<typeof createMockLogger>;
    let listDirectory: jest.Mock<Promise<DaLiveEntry[]>, [string, string, string]>;
    let discovery: HelixPageDiscovery;

    beforeEach(() => {
        logger = createMockLogger();
        listDirectory = jest.fn();
        discovery = new HelixPageDiscovery({ logger, daLiveOps: { listDirectory } });
    });

    it('starts at the site root and turns HTML documents into web paths', async () => {
        listDirectory.mockResolvedValueOnce([
            file('/org/site/about.html'),
            file('/org/site/Contact.HTML', 'HTML'),
        ]);

        const pages = await discovery.listAllPages('org', 'site');

        expect(listDirectory).toHaveBeenCalledWith('org', 'site', '/');
        // Only lower-case `html` is a page; the extension strip itself is case-insensitive.
        expect(pages).toEqual(['/about']);
    });

    it('collapses index documents onto their folder, and the root index onto /', async () => {
        listDirectory
            .mockResolvedValueOnce([file('/org/site/index.html'), folder('/org/site/products')])
            .mockResolvedValueOnce([file('/org/site/products/index.html')]);

        const pages = await discovery.listAllPages('org', 'site');

        expect(pages).toEqual(['/', '/products']);
    });

    it('strips only the trailing .html, not one inside the name', async () => {
        listDirectory.mockResolvedValueOnce([file('/org/site/my.html.page.html')]);

        expect(await discovery.listAllPages('org', 'site')).toEqual(['/my.html.page']);
    });

    it('skips documents that are not HTML', async () => {
        listDirectory.mockResolvedValueOnce([
            file('/org/site/metadata.json', 'json'),
            file('/org/site/hero.png', 'png'),
            file('/org/site/page.html'),
        ]);

        expect(await discovery.listAllPages('org', 'site')).toEqual(['/page']);
    });

    it.each(['metadata', 'redirects', 'placeholders', 'query-index', 'test-index'])(
        'skips the non-content document "%s" even when it is HTML',
        async (name) => {
            listDirectory.mockResolvedValueOnce([
                file(`/org/site/${name}.html`),
                file('/org/site/real.html'),
            ]);

            expect(await discovery.listAllPages('org', 'site')).toEqual(['/real']);
        },
    );

    it.each(['.helix', '.milo', 'placeholders', 'experiments', 'enrichment'])(
        'does not descend into the "%s" folder',
        async (name) => {
            listDirectory.mockResolvedValueOnce([
                folder(`/org/site/${name}`),
                file('/org/site/home.html'),
            ]);

            expect(await discovery.listAllPages('org', 'site')).toEqual(['/home']);
            expect(listDirectory).toHaveBeenCalledTimes(1);
        },
    );

    it('recurses into other folders by their path relative to the site', async () => {
        listDirectory
            .mockResolvedValueOnce([folder('/org/site/products'), file('/org/site/home.html')])
            .mockResolvedValueOnce([folder('/org/site/products/shoes')])
            .mockResolvedValueOnce([file('/org/site/products/shoes/runner.html')]);

        const pages = await discovery.listAllPages('org', 'site');

        expect(listDirectory).toHaveBeenNthCalledWith(2, 'org', 'site', '/products');
        expect(listDirectory).toHaveBeenNthCalledWith(3, 'org', 'site', '/products/shoes');
        expect(pages).toEqual(['/products/shoes/runner', '/home']);
    });

    it('a folder whose path is the site itself recurses from the root, not an empty path', async () => {
        listDirectory
            .mockResolvedValueOnce([folder('/org/site')])
            .mockResolvedValueOnce([]);

        await discovery.listAllPages('org', 'site');

        expect(listDirectory).toHaveBeenNthCalledWith(2, 'org', 'site', '/');
    });

    it('a listing that fails is warned about and yields no pages, without throwing', async () => {
        listDirectory.mockRejectedValueOnce(new Error('403'));

        await expect(discovery.listAllPages('org', 'site', '/private')).resolves.toStrictEqual([]);

        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('a failing subfolder loses only its own pages', async () => {
        listDirectory
            .mockResolvedValueOnce([folder('/org/site/broken'), file('/org/site/home.html')])
            .mockRejectedValueOnce(new Error('500'));

        expect(await discovery.listAllPages('org', 'site')).toEqual(['/home']);
    });
});
