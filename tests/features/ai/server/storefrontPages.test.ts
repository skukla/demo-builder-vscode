/**
 * The storefront's pages, as the catalog menu service needs them (EDS-24): one adapter
 * over the DA.live source API and Helix — the same calls `read_page`, `write_page`
 * (with publish) and `delete_page` make, in the same order — used by the agent's tools
 * and the dashboard alike.
 *
 * DA.live and Helix are the external boundary, so they are the fakes; what is asserted
 * is HOW each is called: which org/site, which spelling of the path (the DA source API
 * wants `nav.html`, Helix wants `/nav`), and what happens when a step fails.
 */

import { createStorefrontPages } from '@/features/ai/server/storefrontPages';

const TARGET = { daLiveOrg: 'skukla', daLiveSite: 'kukla-justrite' };

function transport() {
    const daLive = {
        readSource: jest.fn(),
        createSource: jest.fn().mockResolvedValue({ success: true }),
        deleteSource: jest.fn().mockResolvedValue({ success: true }),
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
