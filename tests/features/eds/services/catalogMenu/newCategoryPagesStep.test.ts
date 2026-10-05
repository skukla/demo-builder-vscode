/**
 * Pages for categories added after setup (EDS-27): the check and the add-only write.
 *
 * Boundaries faked: the storefront's pages (an in-memory DA.live site), whether the
 * repository has the block, and the category read. The service, the record and the
 * summary are real.
 *
 * The promises under test:
 * - the check is a READ: it never writes or removes, whatever it finds;
 * - a category counts as having a page by EDS-24's own tests — a page at its address
 *   (ours, edited, or someone else's), a row in the nav table, or a hand-built page for
 *   it at any address;
 * - the add writes ONLY the missing pages: never the nav, never an existing page, never
 *   a removal;
 * - a read that fails is a failure, never "every category is missing a page";
 * - nothing happens on a storefront without the block, or one Demo Builder never set up.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import {
    addNewCategoryPagesStep,
    applyCatalogMenuStep,
    findNewCategoryPagesStep,
    type CatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuStep';
import { categoryPageHtml, type CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import { fakeStorefront, type FakeStorefront } from './catalogMenuService.testUtils';

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div><div><p>Tools</p></div></main><footer></footer></body>';

const SIGNS: CatalogCategory = { id: '135', name: 'Signs', urlPath: 'signs', level: 2, parentId: '119' };
const APPAREL: CatalogCategory = { id: '201', name: 'Apparel', urlPath: 'apparel', level: 2, parentId: '119' };
const TOOLS: CatalogCategory = { id: '300', name: 'Tools', urlPath: 'tools', level: 2, parentId: '119' };
const GLOVES: CatalogCategory = { id: '301', name: 'Gloves', urlPath: 'apparel/gloves', level: 3, parentId: '201' };

function site(pages: StorefrontPages, categories: CatalogCategory[], overrides: Partial<CatalogMenuSite> = {}) {
    return {
        pages,
        hasBlock: async () => true,
        readCategories: jest.fn(async () => categories),
        ...overrides,
    } satisfies CatalogMenuSite;
}

function storefrontProject(): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'skukla/kukla-justrite' },
            },
        },
    });
}

/** A storefront set up by EDS-24's step with Signs and Apparel. */
async function setUp(extraPages: Record<string, string> = {}): Promise<{ project: Project; s: FakeStorefront }> {
    const project = storefrontProject();
    const s = fakeStorefront({ '/nav': NAV, ...extraPages });
    await applyCatalogMenuStep(project, site(s.port, [SIGNS, APPAREL]));
    s.written.length = 0;
    s.removed.length = 0;
    return { project, s };
}

describe('findNewCategoryPagesStep', () => {
    it('names the categories added since setup, and writes nothing', async () => {
        const { project, s } = await setUp();
        const before = new Map(s.pages);

        const check = await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL, TOOLS, GLOVES]));

        expect(check).toEqual({
            status: 'missing',
            categories: [
                { name: 'Tools', path: '/tools' },
                { name: 'Gloves', path: '/apparel/gloves' },
            ],
        });
        expect(s.written).toStrictEqual([]);
        expect(s.removed).toStrictEqual([]);
        expect(new Map(s.pages)).toEqual(before);
    });

    it('finds nothing when every category has its page', async () => {
        const { project, s } = await setUp();

        expect(await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL]))).toEqual({
            status: 'nothing',
        });
    });

    it("counts a page somebody else made at the category's address as its page", async () => {
        const { project, s } = await setUp({ '/tools': '<body><main><h1>Our tools</h1></main></body>' });

        const check = await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL, TOOLS]));

        expect(check).toEqual({ status: 'nothing' });
    });

    it('counts a page Demo Builder wrote and the SC then edited as its page', async () => {
        const { project, s } = await setUp();
        s.pages.set('/signs', '<body><main><h1>Signs, rewritten by hand</h1></main></body>');

        expect(await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL]))).toEqual({
            status: 'nothing',
        });
    });

    it('counts a hand-built page for the category at ANY address as its page', async () => {
        const { project, s } = await setUp({ '/hand-tools': categoryPageHtml('Hand tools', 'tools') });

        const check = await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL, TOOLS]));

        expect(check).toEqual({ status: 'nothing' });
    });

    it('counts a row the SC typed in the nav table as its page', async () => {
        const { project, s } = await setUp();
        const nav = s.pages.get('/nav') ?? '';
        const typedRow = '<div><div>tools</div><div>/our-tools</div></div>';
        s.pages.set('/nav', nav.replace('<div class="catalog-menu">', `<div class="catalog-menu">${typedRow}`));
        expect(s.pages.get('/nav')).toContain(typedRow);

        const check = await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL, TOOLS]));

        expect(check).toEqual({ status: 'nothing' });
    });

    it('does not walk the whole site when every category has a page at its own address', async () => {
        const { project, s } = await setUp();
        const listPages = jest.fn(s.port.listPages);

        await findNewCategoryPagesStep(project, site({ ...s.port, listPages }, [SIGNS, APPAREL]));

        expect(listPages).not.toHaveBeenCalled();
    });

    it('says nothing on a storefront without the block, and reads no categories', async () => {
        const { project, s } = await setUp();
        const noBlock = site(s.port, [SIGNS, APPAREL, TOOLS], { hasBlock: async () => false });

        expect(await findNewCategoryPagesStep(project, noBlock)).toEqual({ status: 'nothing' });
        expect(noBlock.readCategories).not.toHaveBeenCalled();
    });

    it('says nothing on a storefront Demo Builder never set the menu up on', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const never = site(s.port, [SIGNS, APPAREL]);

        expect(await findNewCategoryPagesStep(project, never)).toEqual({ status: 'nothing' });
        expect(never.readCategories).not.toHaveBeenCalled();
    });

    it('reports a failed page listing as a failure, never as missing pages', async () => {
        const { project, s } = await setUp();
        const broken: StorefrontPages = {
            ...s.port,
            listPages: async () => {
                throw new Error('HTTP 500 listing /');
            },
        };

        const check = await findNewCategoryPagesStep(project, site(broken, [SIGNS, APPAREL, TOOLS]));

        expect(check).toEqual({ status: 'failed', signIn: false, error: 'HTTP 500 listing /' });
    });

    it('reports an expired DA.live sign-in as a sign-in failure', async () => {
        const { project, s } = await setUp();
        const expired: StorefrontPages = {
            ...s.port,
            read: async () => {
                throw new DaLiveAuthError('Authentication expired. Please log in again.');
            },
        };

        const check = await findNewCategoryPagesStep(project, site(expired, [SIGNS, APPAREL, TOOLS]));

        expect(check).toMatchObject({ status: 'failed', signIn: true });
    });

    it('reports a storefront whose nav cannot be found as a failure', async () => {
        const { project, s } = await setUp();
        s.pages.clear();

        const check = await findNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL, TOOLS]));

        expect(check).toMatchObject({ status: 'failed', signIn: false });
        expect(s.written).toStrictEqual([]);
    });

    it('reports a failed block check as a failure', async () => {
        const { project, s } = await setUp();
        const unknown = site(s.port, [SIGNS], {
            hasBlock: async () => {
                throw new Error('GitHub said no');
            },
        });

        expect(await findNewCategoryPagesStep(project, unknown)).toEqual({
            status: 'failed',
            signIn: false,
            error: 'GitHub said no',
        });
    });
});

describe('addNewCategoryPagesStep', () => {
    it('writes only the missing pages, leaves the nav alone, and records what it wrote', async () => {
        const { project, s } = await setUp();
        const navBefore = s.pages.get('/nav');
        const signsBefore = s.pages.get('/signs');

        const result = await addNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL, TOOLS, GLOVES]));

        // The arguments handed to the page port: two writes, both new addresses.
        expect(s.written).toEqual(['/tools', '/apparel/gloves']);
        expect(s.removed).toStrictEqual([]);
        expect(s.pages.get('/tools')).toBe(categoryPageHtml('Tools', 'tools'));
        expect(s.pages.get('/nav')).toBe(navBefore);
        expect(s.pages.get('/signs')).toBe(signsBefore);
        expect(result.added).toEqual([
            { name: 'Tools', path: '/tools' },
            { name: 'Gloves', path: '/apparel/gloves' },
        ]);
        expect(result.summary).toBe('Added pages for 2 new categories: Tools (/tools), Gloves (/apparel/gloves).');
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path).sort()).toEqual([
            '/apparel',
            '/apparel/gloves',
            '/signs',
            '/tools',
        ]);
    });

    it('never rewrites a page Demo Builder wrote earlier, even an unedited one', async () => {
        const { project, s } = await setUp();

        const result = await addNewCategoryPagesStep(project, site(s.port, [SIGNS, APPAREL]));

        expect(s.written).toStrictEqual([]);
        expect(result.added).toStrictEqual([]);
        expect(result.summary).toBe('No category is missing a page.');
    });

    it('never removes the page of a category that has left Commerce', async () => {
        const { project, s } = await setUp();

        await addNewCategoryPagesStep(project, site(s.port, [SIGNS, TOOLS]));

        expect(s.removed).toStrictEqual([]);
        expect(s.pages.has('/apparel')).toBe(true);
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path)).toContain('/apparel');
    });

    it('writes nothing when the pages cannot be read', async () => {
        const { project, s } = await setUp();
        const broken: StorefrontPages = {
            ...s.port,
            listPages: async () => {
                throw new Error('HTTP 500 listing /');
            },
        };

        const result = await addNewCategoryPagesStep(project, site(broken, [SIGNS, APPAREL, TOOLS]));

        expect(s.written).toStrictEqual([]);
        expect(result.added).toStrictEqual([]);
        expect(result.signIn).toBe(false);
        expect(result.summary).toBe('No category pages were added: HTTP 500 listing /.');
    });

    it('names a page that could not be written and keeps the ones that were', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV }, ['/tools']);
        await applyCatalogMenuStep(project, site(s.port, [SIGNS]));
        s.written.length = 0;

        const result = await addNewCategoryPagesStep(project, site(s.port, [SIGNS, TOOLS, APPAREL]));

        expect(s.written).toEqual(['/apparel']);
        expect(result.added).toEqual([{ name: 'Apparel', path: '/apparel' }]);
        expect(result.summary).toContain('Added a page for 1 new category: Apparel (/apparel).');
        expect(result.summary).toContain("1 page couldn't be written");
        expect(result.summary).toContain('/tools');
    });

    it('does nothing on a storefront without the block', async () => {
        const { project, s } = await setUp();

        const result = await addNewCategoryPagesStep(
            project,
            site(s.port, [SIGNS, APPAREL, TOOLS], { hasBlock: async () => false }),
        );

        expect(s.written).toStrictEqual([]);
        expect(result.added).toStrictEqual([]);
    });
});
