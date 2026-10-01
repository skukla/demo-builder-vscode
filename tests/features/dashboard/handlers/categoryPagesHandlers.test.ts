/**
 * generateCategoryPages / removeCategoryPages — the handlers the dashboard and the
 * agent tools share. Driven with handed-in deps (ADR-016): a Commerce that answers
 * a small tree, and an in-memory DA.live.
 *
 * The project is shaped like a real ACCS + Edge Delivery manifest (selectedStack
 * `eds-accs`, the storefront's `githubRepo` metadata, the ACCS store codes), with
 * neutral names: this repository is public.
 */

import {
    commerceQueryRunner,
    makeGenerateCategoryPages,
    makeRemoveCategoryPages,
    type CategoryPagesDeps,
} from '@/features/dashboard/handlers/categoryPagesHandlers';
import type { CategoryPageStore } from '@/features/eds/services/categoryPages/categoryPages';
import type { CategoryQueryRunner } from '@/features/eds/services/categoryPages/categoryTree';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const GRAPHQL = 'https://na1-sandbox.api.commerce.adobe.com/tenant-1/graphql';

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'acme',
        selectedStack: 'eds-accs',
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'acme',
                ACCS_STORE_CODE: 'acme_store',
                ACCS_STORE_VIEW_CODE: 'acme_us',
                ACCS_GRAPHQL_ENDPOINT: GRAPHQL,
            },
        },
        componentInstances: {
            'eds-storefront': {
                ...edsStorefrontInstance(),
                metadata: { githubRepo: 'acme-org/acme-store', daLiveOrg: 'acme-org' },
            },
        },
        ...overrides,
    });
}

/** Root 2 → Safety Signs (10, in menu) → Exit (11, in menu); Clearance (12) hidden. */
const TREE: Record<string, Record<string, unknown>> = {
    '2': { id: '2', name: 'Root', urlPath: '', level: 1, parentId: '1', roles: ['active'], children: ['10', '12'] },
    '10': { id: '10', name: 'Safety Signs', urlPath: 'safety-signs', level: 2, parentId: '2', roles: ['active', 'show_in_menu'], children: ['11'] },
    '11': { id: '11', name: 'Exit', urlPath: 'safety-signs/exit', level: 3, parentId: '10', roles: ['active', 'show_in_menu'], children: [] },
    '12': { id: '12', name: 'Clearance', urlPath: 'clearance', level: 2, parentId: '2', roles: ['active'], children: [] },
};

const runner: CategoryQueryRunner = async (query, variables) => {
    if (query.includes('storeConfig')) return { storeConfig: { root_category_uid: 'Mg==' } };
    return { categories: (variables.ids as string[]).map((id) => TREE[id]).filter(Boolean) };
};

function harness(project: Project | null, deps: Partial<CategoryPagesDeps> = {}) {
    const pages = new Map<string, string>();
    const store: CategoryPageStore = {
        read: async (path) => (pages.has(path) ? { status: 200, body: pages.get(path)! } : { status: 404, body: '' }),
        write: async (path, html) => {
            pages.set(path, html);
            return { written: true, published: true, path };
        },
        remove: async (path) => {
            pages.delete(path);
            return { deleted: true, unpublished: true, path };
        },
    };
    const stateManager = createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) });
    const context: HandlerContext = createMockHandlerContext({ stateManager });
    const full: CategoryPagesDeps = {
        checkSignIns: async () => undefined,
        queryRunner: () => runner,
        pageStore: () => store,
        ...deps,
    };
    return {
        pages,
        stateManager,
        context,
        generate: (payload?: { rootCategoryId?: string }) => makeGenerateCategoryPages(full)(context, payload),
        remove: () => makeRemoveCategoryPages(full)(context),
    };
}

describe('generateCategoryPages', () => {
    it('writes a page per menu category, records them on the project, and answers what it did', async () => {
        const project = edsProject();
        const h = harness(project);

        const res = await h.generate();

        expect(res.success).toBe(true);
        expect(res.data).toMatchObject({
            storeView: 'acme_us',
            rootCategoryId: '2',
            categoriesRead: 4,
            written: ['/safety-signs', '/safety-signs/exit'],
            skipped: [{ id: '12', name: 'Clearance', reason: 'not in the menu' }],
            caveat: expect.stringMatching(/shared catalog/),
        });
        expect(Object.keys(project.categoryPages!.pages)).toEqual(['/safety-signs', '/safety-signs/exit']);
        // Saved after each page, not once at the end.
        expect(h.stateManager.saveProject).toHaveBeenCalledTimes(2);
        expect(h.pages.get('/safety-signs')).toContain('<div>urlPath</div><div>safety-signs</div>');
    });

    it('passes a named root through to the tree read', async () => {
        const seen: string[] = [];
        const h = harness(edsProject(), {
            queryRunner: () => async (query, variables) => {
                seen.push(query.includes('storeConfig') ? 'storeConfig' : String(variables.ids));
                return runner(query, variables, 'catalogService');
            },
        });
        await h.generate({ rootCategoryId: '10' });
        expect(seen[0]).toBe('10');
        expect(seen).not.toContain('storeConfig');
    });

    it('refuses before reading anything when a sign-in is missing', async () => {
        const queryRunner = jest.fn();
        const h = harness(edsProject(), {
            checkSignIns: async () => ({ success: false, error: 'DA.live sign-in required', needsAuth: 'dalive' }),
            queryRunner,
        });
        expect(await h.generate()).toMatchObject({ success: false, needsAuth: 'dalive' });
        expect(queryRunner).not.toHaveBeenCalled();
    });

    it('answers the tree-read failure in words and writes nothing', async () => {
        const h = harness(edsProject(), {
            queryRunner: () => async () => {
                throw new Error('commerceGraphQl returned HTTP 401.');
            },
        });
        const res = await h.generate();
        expect(res).toEqual({ success: false, error: 'Could not read the category tree: commerceGraphQl returned HTTP 401.' });
        expect(h.pages.size).toBe(0);
    });

    it('refuses a project with no Edge Delivery storefront', async () => {
        const h = harness(edsProject({ selectedStack: 'headless-accs' }));
        expect(await h.generate()).toMatchObject({ success: false, code: 'INVALID_OPERATION' });
    });

    it('refuses when no project is open', async () => {
        expect(await harness(null).generate()).toMatchObject({ success: false, code: 'PROJECT_NOT_FOUND' });
    });
});

describe('removeCategoryPages', () => {
    it('removes what generate wrote and drops the record from the project', async () => {
        const project = edsProject();
        const h = harness(project);
        await h.generate();
        h.pages.set('/about', '<body>the SC wrote this</body>');

        const res = await h.remove();

        expect(res).toMatchObject({ success: true, data: { removed: ['/safety-signs', '/safety-signs/exit'], stillRecorded: [] } });
        expect([...h.pages.keys()]).toEqual(['/about']);
        expect(project.categoryPages).toBeUndefined();
    });

    it('keeps a hand-edited page and its record', async () => {
        const project = edsProject();
        const h = harness(project);
        await h.generate();
        h.pages.set('/safety-signs', '<body>edited</body>');

        const res = await h.remove();

        expect(res).toMatchObject({ data: { removed: ['/safety-signs/exit'], handEdited: ['/safety-signs'], stillRecorded: ['/safety-signs'] } });
        expect(Object.keys(project.categoryPages!.pages)).toEqual(['/safety-signs']);
    });

    it('has nothing to do, and needs no sign-in, when nothing was generated', async () => {
        const checkSignIns = jest.fn();
        const h = harness(edsProject(), { checkSignIns });
        expect(await h.remove()).toMatchObject({ success: true, data: { removed: [] } });
        expect(checkSignIns).not.toHaveBeenCalled();
    });
});

describe('commerceQueryRunner', () => {
    function answering(body: unknown, status = 200) {
        const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, text: async () => JSON.stringify(body) });
        return { fetchMock, run: commerceQueryRunner(edsProject(), fetchMock as unknown as typeof fetch) };
    }

    it('sends the query with the store-scope headers and answers data', async () => {
        const { fetchMock, run } = answering({ data: { categories: [] } });
        expect(await run('{ categories(ids: ["2"]) { id } }', { ids: ['2'] }, 'catalogService')).toEqual({ categories: [] });
        const [url, init] = fetchMock.mock.calls[0];
        // ACCS answers Catalog Service on its one endpoint, with the cs headers.
        expect(url).toBe(GRAPHQL);
        expect(init.headers).toMatchObject({ Store: 'acme_us', 'Magento-Website-Code': 'acme', 'Magento-Store-View-Code': 'acme_us' });
        expect(JSON.parse(init.body)).toEqual({ query: '{ categories(ids: ["2"]) { id } }', variables: { ids: ['2'] } });
    });

    it('throws the GraphQL errors a 200 carries', async () => {
        const { run } = answering({ errors: [{ message: 'Unknown argument "ids"' }] });
        await expect(run('{ x }', {}, 'catalogService')).rejects.toThrow('Unknown argument "ids"');
    });

    it('throws the HTTP status', async () => {
        const { run } = answering({}, 401);
        await expect(run('{ x }', {}, 'commerceGraphQl')).rejects.toThrow(/HTTP 401/);
    });
});
