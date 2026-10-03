/**
 * Catalog menu service — writes the category pages and the nav switch, and undoes both
 * (EDS-24).
 *
 * Every dependency is handed in: the category reader and the storefront pages (read /
 * write-and-publish / unpublish-and-delete — the operations `read_page`, `write_page`
 * and `delete_page` perform). The fake below is an in-memory DA.live site.
 *
 * Two promises are under test besides the writes:
 * - an SC's hand edits are never overwritten: a page is only rewritten or removed when
 *   its current content matches what this service recorded writing (ADR-013 in spirit);
 * - everything it does can be undone (CLAUDE.md property 1).
 */

import {
    applyCatalogMenu,
    removeCatalogMenu,
} from '@/features/eds/services/catalogMenu/catalogMenuService';
import type {
    CatalogMenuDeps,
    CatalogMenuRecord,
    StorefrontPages,
} from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div><div><p>Tools</p></div></main><footer></footer></body>';

const CATEGORIES: CatalogCategory[] = [
    { id: '41', name: 'Safety Signs', urlPath: 'safety-signs', level: 2, parentId: '2' },
    { id: '42', name: 'Exit Signs', urlPath: 'safety-signs/exit-signs', level: 3, parentId: '41' },
];

/** An in-memory DA.live site. `failWrites` makes a write throw for those paths. */
function fakeSite(initial: Record<string, string> = { '/nav': NAV }, failWrites: string[] = []) {
    const pages = new Map(Object.entries(initial));
    const written: string[] = [];
    const removed: string[] = [];
    const port: StorefrontPages = {
        read: async (path) => pages.get(path) ?? null,
        write: async (path, html) => {
            if (failWrites.includes(path)) throw new Error(`HTTP 500 writing ${path}`);
            pages.set(path, html);
            written.push(path);
        },
        remove: async (path) => {
            pages.delete(path);
            removed.push(path);
        },
    };
    return { pages, port, written, removed };
}

function deps(site: ReturnType<typeof fakeSite>, categories = CATEGORIES): CatalogMenuDeps {
    return { pages: site.port, readCategories: async () => categories };
}

describe('applyCatalogMenu', () => {
    it('writes one page per category and switches the menu on in the nav', async () => {
        const site = fakeSite();

        const report = await applyCatalogMenu(deps(site));

        expect(report.written).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(site.pages.get('/safety-signs')).toContain('<h1>Safety Signs</h1>');
        expect(report.nav).toBe('added');
        expect(site.pages.get('/nav')).toContain('<li>Shop the catalog</li><li>Custom Signs</li>');
        expect(site.pages.get('/nav')).toContain('class="catalog-menu"');
        expect(report.record.pages.map((p) => p.path)).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(report.record.navSwitch).toBe(true);
    });

    it('re-running rewrites its own unchanged pages and leaves the nav alone', async () => {
        const site = fakeSite();
        const first = await applyCatalogMenu(deps(site));
        site.written.length = 0;

        const second = await applyCatalogMenu(deps(site), first.record);

        expect(second.written).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(second.skipped).toStrictEqual([]);
        expect(second.nav).toBe('already-present');
        expect(site.written).not.toContain('/nav');
    });

    it('skips a page the SC edited by hand after it was written, and stops claiming it', async () => {
        const site = fakeSite();
        const first = await applyCatalogMenu(deps(site));
        site.pages.set('/safety-signs', '<body><main><div><h1>Our signs</h1></div></main></body>');

        const second = await applyCatalogMenu(deps(site), first.record);

        expect(second.skipped).toEqual([{ path: '/safety-signs', reason: 'edited' }]);
        expect(site.pages.get('/safety-signs')).toContain('Our signs');
        expect(second.record.pages.map((p) => p.path)).toEqual(['/safety-signs/exit-signs']);
    });

    it('never overwrites a page it did not write (an existing /apparel, say)', async () => {
        const site = fakeSite({ '/nav': NAV, '/safety-signs': '<body>authored by hand</body>' });

        const report = await applyCatalogMenu(deps(site));

        expect(report.skipped).toEqual([{ path: '/safety-signs', reason: 'not-ours' }]);
        expect(site.pages.get('/safety-signs')).toBe('<body>authored by hand</body>');
        expect(report.record.pages.map((p) => p.path)).toEqual(['/safety-signs/exit-signs']);
    });

    it('reports a failed page write and carries on with the rest', async () => {
        const site = fakeSite({ '/nav': NAV }, ['/safety-signs']);

        const report = await applyCatalogMenu(deps(site));

        expect(report.failed).toEqual([{ path: '/safety-signs', error: 'HTTP 500 writing /safety-signs' }]);
        expect(report.written).toEqual(['/safety-signs/exit-signs']);
        expect(report.nav).toBe('added');
    });

    it('records what DA.live holds after the write, so its own pages still match next time', async () => {
        // DA.live may normalise the HTML it stores; the record must describe what a
        // later read returns, or every re-run would mistake its own page for a hand edit.
        const site = fakeSite();
        const normalising: StorefrontPages = {
            ...site.port,
            write: async (path, html) => site.port.write(path, `${html}\n`),
        };
        const first = await applyCatalogMenu({ pages: normalising, readCategories: async () => CATEGORIES });

        const second = await applyCatalogMenu(
            { pages: normalising, readCategories: async () => CATEGORIES },
            first.record,
        );

        expect(second.skipped).toStrictEqual([]);
    });

    it('writes no nav and says so when the site has no nav document', async () => {
        const site = fakeSite({});

        const report = await applyCatalogMenu(deps(site));

        expect(report.nav).toBe('missing');
        expect(site.pages.has('/nav')).toBe(false);
        expect(report.record.navSwitch).toBe(false);
    });

    it('stops before writing anything when the category tree cannot be read', async () => {
        const site = fakeSite();
        const failing: CatalogMenuDeps = {
            pages: site.port,
            readCategories: async () => {
                throw new Error('Catalog Service 401');
            },
        };

        await expect(applyCatalogMenu(failing)).rejects.toThrow('Catalog Service 401');
        expect(site.written).toStrictEqual([]);
    });

    it('refuses an empty tree rather than switching on a menu with nothing in it', async () => {
        const site = fakeSite();

        await expect(applyCatalogMenu(deps(site, []))).rejects.toThrow(/no categories/i);
        expect(site.written).toStrictEqual([]);
    });

    it('keeps claiming pages from an earlier run that are no longer in the tree', async () => {
        const site = fakeSite();
        const first = await applyCatalogMenu(deps(site));

        const second = await applyCatalogMenu(deps(site, [CATEGORIES[0]]), first.record);

        expect(second.record.pages.map((p) => p.path)).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
    });
});

describe('removeCatalogMenu (the undo)', () => {
    it('removes the pages it wrote and the nav switch, returning the site to where it was', async () => {
        const site = fakeSite();
        const { record } = await applyCatalogMenu(deps(site));

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.removed).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(report.nav).toBe('removed');
        expect([...site.pages.keys()]).toEqual(['/nav']);
        expect(site.pages.get('/nav')).toBe(NAV);
    });

    it('leaves a page the SC has since edited, and says so', async () => {
        const site = fakeSite();
        const { record } = await applyCatalogMenu(deps(site));
        site.pages.set('/safety-signs/exit-signs', '<body>edited</body>');

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.skipped).toEqual([{ path: '/safety-signs/exit-signs', reason: 'edited' }]);
        expect(site.pages.get('/safety-signs/exit-signs')).toBe('<body>edited</body>');
    });

    it('treats a page that is already gone as done', async () => {
        const site = fakeSite();
        const { record } = await applyCatalogMenu(deps(site));
        site.pages.delete('/safety-signs');

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.alreadyGone).toEqual(['/safety-signs']);
        expect(site.removed).toEqual(['/safety-signs/exit-signs']);
    });

    it('removes nothing when there is no record of authorship', async () => {
        const site = fakeSite({ '/nav': NAV, '/safety-signs': '<body>x</body>' });
        const empty: CatalogMenuRecord = { pages: [], navSwitch: false };

        const report = await removeCatalogMenu({ pages: site.port }, empty);

        expect(site.removed).toStrictEqual([]);
        expect(report.nav).toBe('not-recorded');
        expect(site.pages.get('/nav')).toBe(NAV);
    });

    it('reports a failed removal and carries on', async () => {
        const site = fakeSite();
        const { record } = await applyCatalogMenu(deps(site));
        const failing: StorefrontPages = {
            ...site.port,
            remove: async (path) => {
                if (path === '/safety-signs') throw new Error('unpublish refused');
                return site.port.remove(path);
            },
        };

        const report = await removeCatalogMenu({ pages: failing }, record);

        expect(report.failed).toEqual([{ path: '/safety-signs', error: 'unpublish refused' }]);
        expect(report.removed).toEqual(['/safety-signs/exit-signs']);
        expect(report.record.pages.map((p) => p.path)).toEqual(['/safety-signs']);
    });
});
