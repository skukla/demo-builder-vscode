/**
 * The storefront's pages, as the catalog menu service needs them (EDS-24): one adapter
 * over the DA.live source API and Helix — the same calls `read_page`, `write_page`
 * (with publish) and `delete_page` make, in the same order — used by storefront setup,
 * reset and republish alike.
 *
 * DA.live and Helix are the external boundary, so they are the fakes; what is asserted
 * is HOW each is called: which org/site, which spelling of the path (the DA source API
 * wants `nav.html`, Helix wants `/nav`), and what happens when a step fails.
 */

import { createStorefrontPages } from '@/features/eds/services/catalogMenu/storefrontPageAdapter';

const TARGET = { daLiveOrg: 'skukla', daLiveSite: 'kukla-justrite' };

function transport() {
    const daLive = {
        readSource: jest.fn(),
        createSource: jest.fn().mockResolvedValue({ success: true }),
        deleteSource: jest.fn().mockResolvedValue({ success: true }),
        listDirectory: jest.fn().mockResolvedValue([]),
    };
    const helix = {
        previewAndPublishPage: jest.fn().mockResolvedValue(undefined),
        unpublishPage: jest.fn().mockResolvedValue(true),
    };
    return { daLive, helix, pages: createStorefrontPages({ daLive, helix }, TARGET) };
}

describe('read', () => {
    it('reads the DA.live source by its .html name, whole', async () => {
        const t = transport();
        t.daLive.readSource.mockResolvedValue({ status: 200, body: '<body>nav</body>', bytes: 16, truncated: false });

        expect(await t.pages.read('/nav')).toBe('<body>nav</body>');
        expect(t.daLive.readSource).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'nav.html', Number.POSITIVE_INFINITY);
    });

    it('answers null for a page that does not exist', async () => {
        const t = transport();
        t.daLive.readSource.mockResolvedValue({ status: 404, body: '', bytes: 0, truncated: false });
        expect(await t.pages.read('/safety-signs/exit-signs')).toBeNull();
        expect(t.daLive.readSource.mock.calls[0][2]).toBe('safety-signs/exit-signs.html');
    });

    it('throws on any other status instead of reading it as missing', async () => {
        const t = transport();
        t.daLive.readSource.mockResolvedValue({ status: 401, body: '', bytes: 0, truncated: false });
        await expect(t.pages.read('/nav')).rejects.toThrow('HTTP 401');
    });

    it('refuses a cut-short read, because writing it back would lose the rest of the page', async () => {
        const t = transport();
        t.daLive.readSource.mockResolvedValue({ status: 200, body: '<body>', bytes: 99, truncated: true });
        await expect(t.pages.read('/nav')).rejects.toThrow('/nav');
    });
});

describe('write', () => {
    it('overwrites the source, then previews and publishes the web path', async () => {
        const t = transport();

        await t.pages.write('/safety-signs', '<body>x</body>');

        expect(t.daLive.createSource).toHaveBeenCalledWith(
            'skukla',
            'kukla-justrite',
            'safety-signs.html',
            '<body>x</body>',
            { overwrite: true },
        );
        expect(t.helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/safety-signs');
        expect(t.daLive.createSource.mock.invocationCallOrder[0]).toBeLessThan(
            t.helix.previewAndPublishPage.mock.invocationCallOrder[0],
        );
    });

    it('throws, and publishes nothing, when the source write is refused', async () => {
        const t = transport();
        t.daLive.createSource.mockResolvedValue({ success: false, error: 'HTTP 403' });

        await expect(t.pages.write('/nav', '<body/>')).rejects.toThrow('HTTP 403');
        expect(t.helix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('lets a publish failure through, so the caller does not record a page as live', async () => {
        const t = transport();
        t.helix.previewAndPublishPage.mockRejectedValue(new Error('publish 401'));
        await expect(t.pages.write('/nav', '<body/>')).rejects.toThrow('publish 401');
    });
});

describe('remove', () => {
    it('unpublishes first, then deletes the source', async () => {
        const t = transport();

        await t.pages.remove('/safety-signs');

        expect(t.helix.unpublishPage).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/safety-signs');
        expect(t.daLive.deleteSource).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'safety-signs.html');
        expect(t.helix.unpublishPage.mock.invocationCallOrder[0]).toBeLessThan(
            t.daLive.deleteSource.mock.invocationCallOrder[0],
        );
    });

    it('keeps the source when the unpublish fails, so the page can still be removed later', async () => {
        const t = transport();
        t.helix.unpublishPage.mockResolvedValue(false);

        await expect(t.pages.remove('/safety-signs')).rejects.toThrow('/safety-signs');
        expect(t.daLive.deleteSource).not.toHaveBeenCalled();
    });

    it('throws when the source delete is refused', async () => {
        const t = transport();
        t.daLive.deleteSource.mockResolvedValue({ success: false, error: 'HTTP 500' });
        await expect(t.pages.remove('/safety-signs')).rejects.toThrow('HTTP 500');
    });
});

/**
 * `listPages` is how a hand-built category page at any address is found. One DA.live
 * list call per folder; the entry shape is `DaLiveEntry` (`path` carries the org and
 * site, files carry `ext`).
 */
describe('listPages', () => {
    const file = (path: string, ext = 'html') => ({ name: path, path: `/skukla/kukla-justrite${path}.${ext}`, ext });
    const folder = (path: string) => ({ name: path, path: `/skukla/kukla-justrite${path}` });

    function listing(tree: Record<string, ReturnType<typeof file | typeof folder>[]>) {
        const t = transport();
        t.daLive.listDirectory.mockImplementation(async (_org: string, _site: string, dir: string) => tree[dir] ?? []);
        return t;
    }

    it('walks every folder and answers the pages by web path', async () => {
        const t = listing({
            '/': [file('/index'), file('/about'), folder('/signs')],
            '/signs': [file('/signs/danger-signs'), folder('/signs/deep')],
            '/signs/deep': [file('/signs/deep/page')],
        });

        expect((await t.pages.listPages()).sort()).toEqual(['/about', '/index', '/signs/danger-signs', '/signs/deep/page']);
        expect(t.daLive.listDirectory.mock.calls.map((c) => c.slice(0, 3))).toEqual([
            ['skukla', 'kukla-justrite', '/'],
            ['skukla', 'kukla-justrite', '/signs'],
            ['skukla', 'kukla-justrite', '/signs/deep'],
        ]);
    });

    it('leaves out what cannot be a category page, and never opens those folders', async () => {
        const t = listing({
            '/': [
                file('/nav'),
                file('/footer'),
                file('/placeholders', 'json'),
                file('/hero', 'png'),
                folder('/products'),
                folder('/fragments'),
                folder('/drafts'),
                folder('/.da'),
                folder('/customer'),
            ],
            '/customer': [file('/customer/nav'), file('/customer/account')],
            '/products': [file('/products/sku-1')],
        });

        expect(await t.pages.listPages()).toEqual(['/customer/account']);
        expect(t.daLive.listDirectory.mock.calls.map((c) => c[2])).toEqual(['/', '/customer']);
    });

    it('accepts the extension spelled with or without its dot', async () => {
        const t = listing({ '/': [{ name: 'about', path: '/skukla/kukla-justrite/about.html', ext: '.html' }] });

        expect(await t.pages.listPages()).toEqual(['/about']);
    });

    it('lets a listing failure through', async () => {
        const t = transport();
        t.daLive.listDirectory.mockRejectedValue(new Error('DA.live 401'));

        await expect(t.pages.listPages()).rejects.toThrow('DA.live 401');
    });
});
