/**
 * The storefront the catalog menu step runs against (EDS-24): which Catalog Service
 * request it sends, which file proves the block is there, and which DA.live site the
 * pages go to. One builder for creation, reset and republish.
 *
 * The project is bodea's real ACCS connection (the manifest values the
 * `run_commerce_query` tests read from `~/.demo-builder/projects/bodea/.demo-builder.json`),
 * so the request asserted below is the one that tool sends. Catalog Service (`fetchImpl`),
 * GitHub and DA.live/Helix are the faked boundaries; what is asserted is the arguments.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    CATALOG_MENU_BLOCK_FILE,
    createCatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuSiteDeps';
import { CATEGORIES_QUERY } from '@/features/eds/services/catalogMenu/categoryReader';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

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

function build(fetchImpl: jest.Mock, getFileContent = jest.fn()) {
    const daLive = {
        readSource: jest.fn().mockResolvedValue({ status: 404, body: '', bytes: 0, truncated: false }),
        createSource: jest.fn(),
        deleteSource: jest.fn(),
        listDirectory: jest.fn().mockResolvedValue([]),
    };
    const helix = { previewAndPublishPage: jest.fn(), unpublishPage: jest.fn() };
    const site = createCatalogMenuSite({
        project: justrite(),
        target: TARGET,
        daLive,
        helix,
        github: { getFileContent },
        fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return { site, daLive, getFileContent };
}

describe('createCatalogMenuSite', () => {
    it('reads the menu categories with the request run_commerce_query sends to Catalog Service', async () => {
        const fetchImpl = answers({ data: { categories: CATEGORIES } });
        const { site } = build(fetchImpl);

        expect(await site.readCategories()).toEqual([
            { id: '41', name: 'Safety Signs', urlPath: 'safety-signs', level: 2, parentId: '2' },
        ]);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(ACCS_ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers['Magento-Store-Code']).toBe('bodea_store');
        expect(init.headers['Magento-Website-Code']).toBe('bodea');
        expect(init.headers['Magento-Store-View-Code']).toBe('bodea_us');
        expect(JSON.parse(init.body)).toEqual({ query: CATEGORIES_QUERY, variables: { roles: ['show_in_menu'] } });
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

    it("reads and writes pages on the storefront's DA.live site", async () => {
        const { site, daLive } = build(answers());
        await site.pages.read('/nav');
        expect(daLive.readSource).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'nav.html', Number.POSITIVE_INFINITY);
    });
});
