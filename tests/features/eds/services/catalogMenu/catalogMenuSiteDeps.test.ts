/**
 * The storefront the catalog menu step runs against (EDS-24, EDS-61): which Catalog
 * Service request it sends, which file proves the block is there, which DA.live site the
 * template and nav are on, and which Helix site the category pages are published to and
 * taken down from. One builder for creation, reset, republish and the store change.
 *
 * The project is bodea's real ACCS connection (the manifest values the
 * `run_commerce_query` tests read from `~/.demo-builder/projects/bodea/.demo-builder.json`),
 * so the request asserted below is the one that tool sends. Catalog Service (`fetchImpl`),
 * GitHub and DA.live/Helix are the faked boundaries; what is asserted is the arguments.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    CATALOG_MENU_BLOCK_FILE,
    CATALOG_MENU_CORE_FILE,
    createCatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuSiteDeps';
import { CATEGORIES_QUERY } from '@/features/eds/services/catalogMenu/categoryReader';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

const ACCS_ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql';
const TARGET = { daLiveOrg: 'skukla', daLiveSite: 'kukla-justrite', repoOwner: 'skukla', repoName: 'kukla-justrite' };
const CATEGORIES = [
    { id: '41', name: 'Safety Signs', level: 2, parentId: '2', urlPath: 'safety-signs' },
];

function justrite(): Project {
    return createMockProject({
        name: 'kukla-justrite',
        selectedStack: 'eds-accs',
        componentSelections: { backend: 'adobe-commerce-accs', frontend: COMPONENT_IDS.EDS_STOREFRONT },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'bodea',
                ACCS_STORE_CODE: 'bodea_store',
                ACCS_STORE_VIEW_CODE: 'bodea_us',
                ACCS_GRAPHQL_ENDPOINT: ACCS_ENDPOINT,
            },
        },
    });
}

function answers(...bodies: unknown[]): jest.Mock {
    const fetchImpl = jest.fn();
    for (const body of bodies) {
        fetchImpl.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
    }
    return fetchImpl;
}

function build(fetchImpl: jest.Mock, getFileContent = jest.fn(), project = justrite()) {
    const daLive = {
        readSource: jest.fn().mockResolvedValue({ status: 404, body: '', bytes: 0, truncated: false }),
        createSource: jest.fn().mockResolvedValue({ success: true, path: '/authored-category-pages.json' }),
        deleteSource: jest.fn().mockResolvedValue({ success: true }),
        listDirectory: jest.fn().mockResolvedValue([]),
    };
    const helix = {
        previewAndPublishPage: jest.fn().mockResolvedValue(undefined),
        unpublishPage: jest.fn().mockResolvedValue(true),
        listPublishedPaths: jest.fn(),
        unpublishPages: jest.fn(async (_o: string, _r: string, _b: string, paths: string[]) => ({
            total: paths.length,
            liveFailed: 0,
            previewFailed: 0,
        })),
    };
    const site = createCatalogMenuSite({
        project,
        target: TARGET,
        daLive,
        helix,
        github: { getFileContent },
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
        overlay: true,
        fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return { site, daLive, helix, getFileContent };
}

describe('createCatalogMenuSite', () => {
    it('reads the categories with the request run_commerce_query sends to Catalog Service', async () => {
        const fetchImpl = answers({ data: { categories: CATEGORIES } });
        const { site } = build(fetchImpl);

        expect(await site.readCategories()).toEqual([
            { id: '41', name: 'Safety Signs', urlPath: 'safety-signs', level: 2, parentId: '2', inMenu: true },
        ]);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(ACCS_ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers['Magento-Store-Code']).toBe('bodea_store');
        expect(init.headers['Magento-Website-Code']).toBe('bodea');
        expect(init.headers['Magento-Store-View-Code']).toBe('bodea_us');
        expect(JSON.parse(init.body)).toEqual({ query: CATEGORIES_QUERY });
    });

    it('lets a Catalog Service error through, so the step writes nothing over it', async () => {
        const { site } = build(answers({ errors: [{ message: 'Missing Magento-Website-Code Header' }] }));
        await expect(site.readCategories()).rejects.toThrow('Missing Magento-Website-Code Header');
    });

    it("looks for the block in the storefront's own repository", async () => {
        const getFileContent = jest.fn().mockResolvedValueOnce({ content: '// block' }).mockResolvedValueOnce(null);
        const { site } = build(answers(), getFileContent);

        expect(await site.hasBlock()).toBe(true);
        expect(await site.hasBlock()).toBe(false);
        expect(getFileContent).toHaveBeenCalledWith('skukla', 'kukla-justrite', CATALOG_MENU_BLOCK_FILE);
        expect(CATALOG_MENU_BLOCK_FILE).toBe('blocks/catalog-menu/catalog-menu.js');
    });

    // The line rule, copied from demo-builder-block-library's catalog-menu-core.js: the
    // block as it is since 2026-10-25, and as it was before (commit b160c2f).
    const NEW_RULE = 'const LINE_PATTERN = /^commerce\\s*:\\s*(.+)$/i;';
    const OLD_RULE = 'const LINE_PATTERN = /^shop the catalog\\s*(?::\\s*(.*))?$/i;';

    it("reads which line the storefront's own copy of the block understands", async () => {
        const getFileContent = jest
            .fn()
            .mockResolvedValueOnce({ content: NEW_RULE })
            .mockResolvedValueOnce({ content: OLD_RULE })
            .mockResolvedValueOnce(null);
        const { site } = build(answers(), getFileContent);

        expect(await site.menuLine()).toBe('commerce');
        expect(await site.menuLine()).toBe('shop');
        // A block too old to have the core file reads the old line too.
        expect(await site.menuLine()).toBe('shop');
        expect(getFileContent).toHaveBeenCalledWith('skukla', 'kukla-justrite', CATALOG_MENU_CORE_FILE);
        expect(CATALOG_MENU_CORE_FILE).toBe('blocks/catalog-menu/catalog-menu-core.js');
    });

    it("reads and writes pages on the storefront's DA.live site", async () => {
        const { site, daLive } = build(answers());
        await site.pages.read('/nav');
        expect(daLive.readSource).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'nav.html', Number.POSITIVE_INFINITY);
    });

    it("publishes a category page on the storefront's site, through the authenticated Helix path", async () => {
        const { site, helix } = build(answers());

        await site.categoryPages.publish('/signs');

        expect(helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/signs');
    });

    it('writes the authored-pages sheet as a DA.live JSON sheet, then previews and publishes its .json path', async () => {
        const { site, daLive, helix } = build(answers());

        await site.categoryPages.publishAuthoredSheet(['/apparel']);

        const [org, siteName, path, body, options] = daLive.createSource.mock.calls[0];
        expect([org, siteName, path]).toEqual(['skukla', 'kukla-justrite', 'authored-category-pages.json']);
        expect(JSON.parse(body).data.data).toEqual([{ path: '/apparel' }]);
        expect(options).toEqual({ overwrite: true, contentType: 'application/json' });
        expect(helix.previewAndPublishPage).toHaveBeenCalledWith(
            'skukla',
            'kukla-justrite',
            '/authored-category-pages.json',
        );
        expect(daLive.createSource.mock.invocationCallOrder[0]).toBeLessThan(
            helix.previewAndPublishPage.mock.invocationCallOrder[0],
        );
    });

    it('publishes nothing when the sheet could not be written', async () => {
        const { site, daLive, helix } = build(answers());
        daLive.createSource.mockResolvedValueOnce({ success: false, error: 'HTTP 401' });

        await expect(site.categoryPages.publishAuthoredSheet([])).rejects.toThrow('HTTP 401');
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('takes the sheet out: unpublished first, then its source deleted', async () => {
        const { site, daLive, helix } = build(answers());

        await site.categoryPages.removeAuthoredSheet();

        expect(helix.unpublishPage).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/authored-category-pages.json');
        expect(daLive.deleteSource).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'authored-category-pages.json');
    });

    it('publishes at setup on ACCS, the backend product pages are published for', () => {
        expect(build(answers()).site.categoryPages.publishAtSetup).toBe(true);
        const paas = createMockProject({
            componentSelections: { backend: 'adobe-commerce-paas', frontend: COMPONENT_IDS.EDS_STOREFRONT },
            componentConfigs: { 'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://paas.example' } },
        });
        expect(build(answers(), jest.fn(), paas).site.categoryPages.publishAtSetup).toBe(false);
    });

    it('takes category pages off the GitHub repository Helix keys the site by', async () => {
        const { site, helix } = build(answers());

        const result = await site.categoryPages.remove(['/gloves']);

        expect(helix.unpublishPages).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'main', ['/gloves']);
        expect(result.status).toBe('removed');
    });

    it('carries whether the product page overlay is on', () => {
        expect(build(answers()).site.overlay).toBe(true);
    });
});
