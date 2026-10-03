/**
 * The catalog menu's two handlers (EDS-24) — the ONE path both surfaces dispatch into:
 * the dashboard's dialog and the agent's `build_catalog_menu` / `remove_catalog_menu`.
 * Pattern B: each answers by returning.
 *
 * Boundaries faked: the sign-in services and the GitHub file read (`edsHelpers`), the
 * storefront's pages (an in-memory DA.live site in place of `storefrontPagesFor`), and
 * Catalog Service (`fetch`). The category reader, the page writer, the record and the
 * summary are real.
 *
 * The project is bodea's real ACCS connection (the same manifest values the
 * `run_commerce_query` tests read from `~/.demo-builder/projects/bodea/.demo-builder.json`),
 * so the request Catalog Service receives is the one that tool sends.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { storefrontPagesFor } from '@/features/ai/server/storefrontPages';
import {
    CATALOG_MENU_BLOCK_FILE,
    LIBRARY_MISSING,
    handleBuildCatalogMenu,
    handleRemoveCatalogMenu,
    previewCatalogMenu,
} from '@/features/dashboard/handlers/catalogMenuHandlers';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import { CATEGORIES_QUERY } from '@/features/eds/services/catalogMenu/categoryReader';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { BuildCatalogMenuResult, RemoveCatalogMenuResult } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/features/ai/server/storefrontPages', () => ({
    ...jest.requireActual('@/features/ai/server/storefrontPages'),
    storefrontPagesFor: jest.fn(),
}));

const mockGitHub = getGitHubServices as jest.Mock;
const mockDaLive = getDaLiveAuthService as jest.Mock;
const mockPagesFor = storefrontPagesFor as jest.Mock;

const ACCS_ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql';
const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div></main><footer></footer></body>';
const CATEGORIES = [
    { id: '41', name: 'Safety Signs', level: 2, parentId: '2', urlPath: 'safety-signs' },
    { id: '42', name: 'Exit Signs', level: 3, parentId: '41', urlPath: 'safety-signs/exit-signs' },
];

const fileOperations = { getFileContent: jest.fn() };
const tokenService = { validateToken: jest.fn() };
const daLiveAuth = { isAuthenticated: jest.fn() };

/** An in-memory DA.live site. */
function fakeSite(initial: Record<string, string> = { '/nav': NAV }) {
    const pages = new Map(Object.entries(initial));
    const port: StorefrontPages = {
        read: async (path) => pages.get(path) ?? null,
        write: async (path, html) => {
            pages.set(path, html);
        },
        remove: async (path) => {
            pages.delete(path);
        },
    };
    return { pages, port };
}

function justrite(metadata: Record<string, unknown> = {}): Project {
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
        commerceStoreStructure: {
            websites: [{ id: 1, code: 'bodea', name: 'Bodea' }],
            storeGroups: [{ id: 1, code: 'bodea_store', name: 'Bodea Store', website_id: 1, root_category_id: 2 }],
            storeViews: [],
        },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'skukla/kukla-justrite', daLiveOrg: 'skukla', ...metadata },
            },
        },
    });
}

function contextFor(project: Project | null) {
    const context = createMockHandlerContext();
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    (context.stateManager.saveProject as jest.Mock).mockResolvedValue(undefined);
    return context;
}

function catalogAnswers(...answers: unknown[]): jest.Mock {
    const fetchMock = jest.fn();
    for (const data of answers) {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data }) });
    }
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

const recordOf = (project: Project) =>
    project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.catalogMenu;

let site: ReturnType<typeof fakeSite>;

beforeEach(() => {
    jest.clearAllMocks();
    site = fakeSite();
    mockPagesFor.mockImplementation(() => site.port);
    mockGitHub.mockReturnValue({ fileOperations, tokenService });
    mockDaLive.mockReturnValue(daLiveAuth);
    tokenService.validateToken.mockResolvedValue({ valid: true });
    daLiveAuth.isAuthenticated.mockResolvedValue(true);
    fileOperations.getFileContent.mockResolvedValue({ content: '// block', sha: 's', path: CATALOG_MENU_BLOCK_FILE });
});

describe('handleBuildCatalogMenu', () => {
    it('reads the tree with the storefront store headers, writes the pages and the switch, and keeps the record', async () => {
        const fetchMock = catalogAnswers({ categories: CATEGORIES });
        const project = justrite();
        const context = contextFor(project);

        const result = await handleBuildCatalogMenu(context, undefined);

        // The request run_commerce_query would send to Catalog Service on ACCS.
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(ACCS_ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers['Magento-Store-Code']).toBe('bodea_store');
        expect(init.headers['Magento-Website-Code']).toBe('bodea');
        expect(init.headers['Magento-Store-View-Code']).toBe('bodea_us');
        expect(JSON.parse(init.body)).toEqual({ query: CATEGORIES_QUERY, variables: { roles: ['show_in_menu'] } });

        // The storefront the pages go to is this project's.
        expect(mockPagesFor).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ daLiveOrg: 'skukla', daLiveSite: 'kukla-justrite', repoOwner: 'skukla' }),
        );
        expect(site.pages.get('/safety-signs')).toContain('<h1>Safety Signs</h1>');
        expect(site.pages.get('/nav')).toContain('<li>Shop the catalog</li>');

        expect(result.success).toBe(true);
        const data = result.data as BuildCatalogMenuResult;
        expect(data.written).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(data.summary).toBe('Wrote and published 2 category pages. Added the catalog menu to your nav.');
        expect(data).not.toHaveProperty('record');

        const record = recordOf(project) as { pages: Array<{ path: string }>; navSwitch: boolean };
        expect(record.pages.map((p) => p.path)).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(record.navSwitch).toBe(true);
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('checks the storefront repository for the catalog-menu block before anything else', async () => {
        catalogAnswers({ categories: CATEGORIES });
        await handleBuildCatalogMenu(contextFor(justrite()), undefined);
        expect(fileOperations.getFileContent).toHaveBeenCalledWith('skukla', 'kukla-justrite', CATALOG_MENU_BLOCK_FILE);
    });

    it('answers how to add the library, and writes nothing, when the block is missing', async () => {
        fileOperations.getFileContent.mockResolvedValue(null);
        const fetchMock = catalogAnswers({ categories: CATEGORIES });
        const context = contextFor(justrite());

        const result = await handleBuildCatalogMenu(context, undefined);

        expect(result).toEqual({
            success: false,
            error: LIBRARY_MISSING,
            code: ErrorCode.COMPONENT_DEPENDENCY_MISSING,
        });
        expect(LIBRARY_MISSING).toContain('Demo Builder Blocks');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(site.pages.get('/nav')).toBe(NAV);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('rebuilds over its own record: a page it wrote before is rewritten, not treated as someone else\'s', async () => {
        catalogAnswers({ categories: CATEGORIES }, { categories: CATEGORIES });
        const project = justrite();
        await handleBuildCatalogMenu(contextFor(project), undefined);

        const again = await handleBuildCatalogMenu(contextFor(project), undefined);

        const data = again.data as BuildCatalogMenuResult;
        expect(data.written).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(data.skipped).toStrictEqual([]);
        expect(data.nav).toBe('already-present');
    });

    it('changes nothing when Catalog Service has no menu categories', async () => {
        catalogAnswers({ categories: [] });
        const project = justrite();
        project.commerceStoreStructure = undefined;
        const context = contextFor(project);

        const result = await handleBuildCatalogMenu(context, undefined);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/^Nothing was changed\. .*no categories marked "Include in Menu"/);
        expect(site.pages.get('/nav')).toBe(NAV);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('changes nothing when Catalog Service answers with errors', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ errors: [{ message: 'Missing Magento-Website-Code Header' }] }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        const result = await handleBuildCatalogMenu(contextFor(justrite()), undefined);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Missing Magento-Website-Code Header');
        expect(site.pages.size).toBe(1);
    });

    it('asks for the sign-ins it needs before touching anything', async () => {
        daLiveAuth.isAuthenticated.mockResolvedValue(false);
        const noDaLive = await handleBuildCatalogMenu(contextFor(justrite()), undefined);
        expect(noDaLive).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(noDaLive.error).toContain('DA.live');

        daLiveAuth.isAuthenticated.mockResolvedValue(true);
        tokenService.validateToken.mockResolvedValue({ valid: false });
        const noGitHub = await handleBuildCatalogMenu(contextFor(justrite()), undefined);
        expect(noGitHub).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(noGitHub.error).toContain('GitHub');
        expect(fileOperations.getFileContent).not.toHaveBeenCalled();
    });

    it('refuses without a project, and refuses a project with no Edge Delivery storefront', async () => {
        expect(await handleBuildCatalogMenu(contextFor(null), undefined)).toMatchObject({
            success: false,
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
        const headless = createMockProject({ selectedStack: 'headless-paas' });
        expect(await handleBuildCatalogMenu(contextFor(headless), undefined)).toMatchObject({
            success: false,
            code: ErrorCode.INVALID_OPERATION,
        });
    });
});

describe('previewCatalogMenu', () => {
    it('counts the pages a build would write and names the site, writing nothing', async () => {
        catalogAnswers({ categories: CATEGORIES });
        const context = contextFor(justrite());

        const result = await previewCatalogMenu(context);

        expect(result).toEqual({ success: true, data: { site: 'skukla/kukla-justrite', pages: 2 } });
        expect(site.pages.get('/nav')).toBe(NAV);
        expect(site.pages.size).toBe(1);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('answers the read failure rather than a count', async () => {
        catalogAnswers({ categories: [] });
        const project = justrite();
        project.commerceStoreStructure = undefined;
        const result = await previewCatalogMenu(contextFor(project));
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/no categories marked "Include in Menu"/);
    });
});

describe('handleRemoveCatalogMenu', () => {
    it('removes what the build wrote, takes the switch out, and clears the record', async () => {
        catalogAnswers({ categories: CATEGORIES });
        const project = justrite();
        await handleBuildCatalogMenu(contextFor(project), undefined);
        const context = contextFor(project);

        const result = await handleRemoveCatalogMenu(context, undefined);

        const data = result.data as RemoveCatalogMenuResult;
        expect(data.removed).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(data.nav).toBe('removed');
        expect(data.summary).toBe('Removed 2 category pages. Took the catalog menu out of your nav.');
        // Round trip to zero: the nav reads exactly as before, the pages are gone.
        expect(site.pages.get('/nav')).toBe(NAV);
        expect(site.pages.has('/safety-signs')).toBe(false);
        expect(recordOf(project)).toBeUndefined();
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('removes nothing, and says so, when Demo Builder never built a menu here', async () => {
        site = fakeSite({ '/nav': NAV, '/safety-signs': '<body>by hand</body>' });
        const context = contextFor(justrite());

        const result = await handleRemoveCatalogMenu(context, undefined);

        expect(result.success).toBe(true);
        expect((result.data as RemoveCatalogMenuResult).summary).toBe(
            'There is no catalog menu from Demo Builder on this storefront, so nothing was removed.',
        );
        expect(site.pages.get('/safety-signs')).toBe('<body>by hand</body>');
        // Removal never needs the block: undo works even after the library is gone.
        expect(fileOperations.getFileContent).not.toHaveBeenCalled();
    });

    it('asks for the sign-ins first', async () => {
        daLiveAuth.isAuthenticated.mockResolvedValue(false);
        expect(await handleRemoveCatalogMenu(contextFor(justrite()), undefined)).toMatchObject({
            success: false,
            code: ErrorCode.AUTH_REQUIRED,
        });
    });
});
