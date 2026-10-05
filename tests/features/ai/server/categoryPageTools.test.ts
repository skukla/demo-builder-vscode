/**
 * check_category_pages and add_category_pages — the agent's doors for pages for
 * categories added after setup (EDS-27).
 *
 * Boundaries faked: the open project and its storefront (an in-memory DA.live site,
 * handed in through the tools' site seam). The step and the service are real, so what is
 * asserted about a write is what reached the page port.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { registerCategoryPageTools } from '@/features/ai/server/categoryPageTools';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import { applyCatalogMenuStep, type CatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { fakeStorefront } from '../../eds/services/catalogMenu/catalogMenuService.testUtils';

const NAV = '<body><header></header><main><div><ul><li>Home</li></ul></div></main><footer></footer></body>';
const SIGNS: CatalogCategory = { id: '135', name: 'Signs', urlPath: 'signs' };
const TOOLS: CatalogCategory = { id: '300', name: 'Tools', urlPath: 'tools' };

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

function fakeServer() {
    const tools = new Map<string, ToolHandler>();
    return {
        registerTool(name: string, _def: unknown, handler: ToolHandler) {
            tools.set(name, handler);
        },
        async call(name: string, args: unknown = {}): Promise<Record<string, unknown>> {
            const handler = tools.get(name);
            if (!handler) throw new Error(`no tool ${name}`);
            return JSON.parse((await handler(args)).content[0].text);
        },
    };
}

function storefrontProject(): Project {
    return createMockProject({
        selectedStack: 'eds-accs',
        componentSelections: { frontend: COMPONENT_IDS.EDS_STOREFRONT },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'skukla/kukla-justrite', daLiveOrg: 'skukla', daLiveSite: 'kukla-justrite' },
            },
        },
    });
}

/** A storefront set up with Signs; Tools arrives in Commerce afterwards. */
async function setUp(options: { setting?: unknown; pages?: (port: StorefrontPages) => StorefrontPages } = {}) {
    const project = storefrontProject();
    const s = fakeStorefront({ '/nav': NAV });
    let categories = [SIGNS];
    const site = (): CatalogMenuSite => ({
        pages: options.pages ? options.pages(s.port) : s.port,
        hasBlock: async () => true,
        readCategories: async () => categories,
    });
    await applyCatalogMenuStep(project, { ...site(), pages: s.port });
    s.written.length = 0;
    categories = [SIGNS, TOOLS];

    const saveProject = jest.fn().mockResolvedValue(undefined);
    const ctx = createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
    });
    const server = fakeServer();
    const siteFor = jest.fn(() => site());
    registerCategoryPageTools(server, () => ctx, () => options.setting, siteFor);
    return { project, s, server, saveProject, siteFor };
}

const expired = (port: StorefrontPages): StorefrontPages => ({
    ...port,
    read: async () => {
        throw new DaLiveAuthError('Authentication expired. Please log in again.');
    },
});

describe('check_category_pages', () => {
    it('names the categories without a page and how the project is set, and writes nothing', async () => {
        const { server, s, saveProject, project, siteFor } = await setUp();

        const answer = await server.call('check_category_pages');

        expect(siteFor).toHaveBeenCalledWith(expect.anything(), project);
        expect(answer).toEqual({
            storefront: 'skukla/kukla-justrite',
            missing: [{ name: 'Tools', path: '/tools' }],
            addsAutomatically: false,
            setting: { 'demoBuilder.categoryPages.autoAdd': false, thisProject: 'follows the setting' },
            hint: expect.stringContaining('add_category_pages'),
        });
        expect(s.written).toStrictEqual([]);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('reports the setting and the project\'s own choice', async () => {
        const { server, project } = await setUp({ setting: true });
        const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (instance) instance.metadata = { ...instance.metadata, autoAddCategoryPages: false };

        const answer = await server.call('check_category_pages');

        expect(answer.addsAutomatically).toBe(false);
        expect(answer.setting).toEqual({ 'demoBuilder.categoryPages.autoAdd': true, thisProject: 'off' });
    });

    it('answers a sign-in handoff when DA.live refuses the sign-in, not an empty list', async () => {
        const { server } = await setUp({ pages: expired });

        const answer = await server.call('check_category_pages');

        expect(answer.needsAuth).toBe('dalive');
        expect(answer).not.toHaveProperty('missing');
    });

    it('refuses a project that is not an Edge Delivery storefront', async () => {
        const server = fakeServer();
        const ctx = createMockHandlerContext({
            stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(createMockProject()) }),
        });
        registerCategoryPageTools(server, () => ctx, () => false, () => null);

        expect(await server.call('check_category_pages')).toEqual({
            error: 'check_category_pages applies only to EDS storefront projects',
        });
    });
});

describe('add_category_pages', () => {
    it('without confirm: says what it would write and where, and writes nothing', async () => {
        const { server, s, saveProject } = await setUp();

        const answer = await server.call('add_category_pages', {});

        expect(answer.error).toBe(
            'add_category_pages would write and publish 1 new page on the storefront skukla/kukla-justrite ' +
                '(Tools at /tools). No existing page and nothing in the nav is changed. Call again with confirm:true.',
        );
        expect(s.written).toStrictEqual([]);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('with confirm: writes only the missing page and saves the record', async () => {
        const { server, s, saveProject, project } = await setUp();

        const answer = await server.call('add_category_pages', { confirm: true });

        expect(s.written).toEqual(['/tools']);
        expect(s.removed).toStrictEqual([]);
        expect(answer).toEqual({
            added: [{ name: 'Tools', path: '/tools' }],
            summary: 'Added a page for 1 new category: Tools (/tools).',
        });
        expect(saveProject).toHaveBeenCalledWith(project);
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path)).toContain('/tools');
    });

    it('with nothing missing: says so without asking for confirm, and does not save', async () => {
        const { server, s, saveProject } = await setUp();
        await server.call('add_category_pages', { confirm: true });
        saveProject.mockClear();
        s.written.length = 0;

        const answer = await server.call('add_category_pages', {});

        expect(answer).toEqual({ added: [], summary: 'No category is missing a page.' });
        expect(s.written).toStrictEqual([]);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('answers a sign-in handoff when DA.live refuses the sign-in, and writes nothing', async () => {
        const { server, s } = await setUp({ pages: expired });

        const answer = await server.call('add_category_pages', { confirm: true });

        expect(answer.needsAuth).toBe('dalive');
        expect(s.written).toStrictEqual([]);
    });
});
