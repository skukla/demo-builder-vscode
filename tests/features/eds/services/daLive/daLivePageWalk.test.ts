/**
 * listDaLivePages — the folder walk shared by the catalog menu's search for hand-built
 * pages and reset's listing of the authored pages under /products.
 *
 * The list API is the boundary. Its entry shape is the measured one: paths carry the
 * `/{org}/{site}` prefix and a folder has no `ext` (`contentAuthoringTools.ts`).
 */

import { listDaLivePages } from '@/features/eds/services/daLive/daLivePageWalk';

const TREE: Record<string, Array<{ name: string; path: string; ext?: string }>> = {
    '/': [
        { name: 'nav', path: '/acme/shop/nav.html', ext: 'html' },
        { name: 'signs', path: '/acme/shop/signs' },
        { name: 'drafts', path: '/acme/shop/drafts' },
        { name: 'prices', path: '/acme/shop/prices.json', ext: 'json' },
    ],
    '/signs': [{ name: 'exit', path: '/acme/shop/signs/exit.html', ext: 'html' }],
    '/drafts': [{ name: 'wip', path: '/acme/shop/drafts/wip.html', ext: 'html' }],
};

const client = () => ({ listDirectory: jest.fn(async (_o: string, _s: string, dir: string) => TREE[dir] ?? []) });

describe('listDaLivePages', () => {
    it('answers every page document by web path, folders included, and nothing that is not a page', async () => {
        const daLive = client();

        expect(await listDaLivePages(daLive, 'acme', 'shop', '/')).toStrictEqual(['/nav', '/signs/exit', '/drafts/wip']);
        expect(daLive.listDirectory).toHaveBeenCalledWith('acme', 'shop', '/signs');
    });

    it('never opens a folder the caller rules out', async () => {
        const daLive = client();

        const pages = await listDaLivePages(daLive, 'acme', 'shop', '/', (path) => path === '/drafts');

        expect(pages).toStrictEqual(['/nav', '/signs/exit']);
        expect(daLive.listDirectory).not.toHaveBeenCalledWith('acme', 'shop', '/drafts');
    });

    it('starts where it is told', async () => {
        expect(await listDaLivePages(client(), 'acme', 'shop', '/signs')).toStrictEqual(['/signs/exit']);
    });

    it('lets a failed listing through as a failure', async () => {
        const daLive = { listDirectory: jest.fn().mockRejectedValue(new Error('Authentication expired')) };

        await expect(listDaLivePages(daLive, 'acme', 'shop', '/')).rejects.toThrow('Authentication expired');
    });
});
