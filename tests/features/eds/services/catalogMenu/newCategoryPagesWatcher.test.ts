/**
 * The watcher that gives new categories their pages while a project is open (EDS-27).
 *
 * Boundaries faked: the open project, the storefront (an in-memory DA.live site), the
 * setting, the save and the notice. The step, the service and the record are real, so
 * every assertion about a write is an assertion about what reached the page port.
 *
 * The promises under test:
 * - setting OFF: it offers, and writes nothing until the SC says yes;
 * - setting ON: it adds without asking and then names what it added;
 * - the per-project choice beats the setting, both ways;
 * - an expired DA.live sign-in is one notice and no write — and no repeat every tick;
 * - a failed read is never an offer to add a page per category;
 * - the same offer is not made twice.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import { applyCatalogMenuStep, type CatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import {
    readAutoAddOverride,
    resolveAutoAddCategoryPages,
    writeAutoAddOverride,
} from '@/features/eds/services/catalogMenu/categoryPageAutoAdd';
import {
    ADD_PAGES,
    ALWAYS_FOR_PROJECT,
    STOP_FOR_PROJECT,
    createNewCategoryPagesWatcher,
} from '@/features/eds/services/catalogMenu/newCategoryPagesWatcher';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import { fakeStorefront, type FakeStorefront } from './catalogMenuService.testUtils';

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div></main><footer></footer></body>';

const SIGNS: CatalogCategory = { id: '135', name: 'Signs', urlPath: 'signs' };
const TOOLS: CatalogCategory = { id: '300', name: 'Tools', urlPath: 'tools' };
const GLOVES: CatalogCategory = { id: '301', name: 'Gloves', urlPath: 'gloves' };

function storefrontProject(): Project {
    return createMockProject({
        name: 'justrite',
        title: 'Justrite',
        path: '/projects/justrite',
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

interface Harness {
    project: Project;
    s: FakeStorefront;
    categories: CatalogCategory[];
    setting: boolean;
    pages: StorefrontPages;
    notify: jest.Mock<Promise<string | undefined>, [string, ...string[]]>;
    save: jest.Mock<Promise<void>, [Project]>;
    warn: jest.Mock;
    watcher: ReturnType<typeof createNewCategoryPagesWatcher>;
}

/** A storefront set up with Signs; Tools and Gloves arrive in Commerce afterwards. */
async function harness(answer?: string): Promise<Harness> {
    const project = storefrontProject();
    const s = fakeStorefront({ '/nav': NAV });
    const h = {
        project,
        s,
        categories: [SIGNS],
        setting: false,
        pages: s.port,
        notify: jest.fn(async (_message: string, ..._actions: string[]) => answer),
        save: jest.fn(async (_project: Project) => undefined),
        warn: jest.fn(),
    } as Harness;
    const site = (): CatalogMenuSite => ({
        pages: h.pages,
        hasBlock: async () => true,
        readCategories: async () => h.categories,
    });
    await applyCatalogMenuStep(project, site());
    s.written.length = 0;
    h.categories = [SIGNS, TOOLS, GLOVES];
    h.watcher = createNewCategoryPagesWatcher({
        openProject: async () => h.project,
        siteFor: () => site(),
        autoAddByDefault: () => h.setting,
        save: h.save,
        notify: h.notify,
        logger: { info: jest.fn(), warn: h.warn, debug: jest.fn() },
    });
    return h;
}

describe('the per-project choice', () => {
    it('follows the setting until the project says otherwise, then wins both ways', () => {
        const project = storefrontProject();

        expect(readAutoAddOverride(project)).toBeUndefined();
        expect(resolveAutoAddCategoryPages(project, false)).toBe(false);
        expect(resolveAutoAddCategoryPages(project, true)).toBe(true);

        writeAutoAddOverride(project, true);
        expect(resolveAutoAddCategoryPages(project, false)).toBe(true);
        writeAutoAddOverride(project, false);
        expect(resolveAutoAddCategoryPages(project, true)).toBe(false);

        writeAutoAddOverride(project, undefined);
        expect(readAutoAddOverride(project)).toBeUndefined();
        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).not.toHaveProperty(
            'autoAddCategoryPages',
        );
    });

    it('reads anything but a boolean as "follow the setting"', () => {
        const project = storefrontProject();
        const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (instance) instance.metadata = { ...instance.metadata, autoAddCategoryPages: 'yes' };

        expect(readAutoAddOverride(project)).toBeUndefined();
        expect(resolveAutoAddCategoryPages(project, 'true')).toBe(false);
    });
});

describe('setting off: it offers', () => {
    it('asks by count and name, and writes nothing when the SC does not answer', async () => {
        const h = await harness(undefined);

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.notify).toHaveBeenCalledTimes(1);
        expect(h.notify).toHaveBeenCalledWith(
            '2 new categories on "Justrite" have no page yet (Tools, Gloves). Add their pages?',
            ADD_PAGES,
            ALWAYS_FOR_PROJECT,
        );
        expect(h.s.written).toStrictEqual([]);
        expect(h.save).not.toHaveBeenCalled();
    });

    it('adds the pages on one click, saves the record, and says what it added', async () => {
        const h = await harness(ADD_PAGES);

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.s.written).toEqual(['/tools', '/gloves']);
        expect(h.save).toHaveBeenCalledTimes(1);
        expect(readCatalogMenuRecord(h.save.mock.calls[0][0]).pages.map((p) => p.path)).toEqual(
            expect.arrayContaining(['/tools', '/gloves']),
        );
        expect(h.notify).toHaveBeenLastCalledWith(
            'Justrite: Added pages for 2 new categories: Tools (/tools), Gloves (/gloves).',
        );
        expect(readAutoAddOverride(h.project)).toBeUndefined();
    });

    it('"always for this project" keeps the choice on the project and adds the pages', async () => {
        const h = await harness(ALWAYS_FOR_PROJECT);

        await h.watcher.check();
        await h.watcher.idle();

        expect(readAutoAddOverride(h.project)).toBe(true);
        expect(h.s.written).toEqual(['/tools', '/gloves']);
        expect(h.save).toHaveBeenCalled();
    });

    it('does not make the same offer again on the next look', async () => {
        const h = await harness(undefined);

        await h.watcher.check();
        await h.watcher.idle();
        await h.watcher.check();
        await h.watcher.idle();

        expect(h.notify).toHaveBeenCalledTimes(1);
    });

    it('offers again when another category arrives', async () => {
        const h = await harness(undefined);

        await h.watcher.check();
        await h.watcher.idle();
        h.categories = [SIGNS, TOOLS];
        await h.watcher.check();
        await h.watcher.idle();

        expect(h.notify).toHaveBeenCalledTimes(2);
        expect(h.notify.mock.calls[1][0]).toBe(
            '1 new category on "Justrite" has no page yet (Tools). Add its page?',
        );
    });

    it('adds nothing when the project was closed before the SC answered', async () => {
        const h = await harness(ADD_PAGES);
        const other = storefrontProject();
        other.path = '/projects/other';
        h.notify.mockImplementationOnce(async () => {
            h.project = other;
            return ADD_PAGES;
        });

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.s.written).toStrictEqual([]);
    });
});

describe('setting on: it adds without asking', () => {
    it('writes the pages, saves, and names what it added with a way to stop', async () => {
        const h = await harness(undefined);
        h.setting = true;

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.s.written).toEqual(['/tools', '/gloves']);
        expect(h.save).toHaveBeenCalledTimes(1);
        expect(h.notify).toHaveBeenCalledTimes(1);
        expect(h.notify).toHaveBeenCalledWith(
            'Justrite: Added pages for 2 new categories: Tools (/tools), Gloves (/gloves).',
            STOP_FOR_PROJECT,
        );
    });

    it('"stop for this project" turns it off for the project and saves that', async () => {
        const h = await harness(STOP_FOR_PROJECT);
        h.setting = true;

        await h.watcher.check();
        await h.watcher.idle();

        expect(readAutoAddOverride(h.project)).toBe(false);
        expect(h.save).toHaveBeenCalledTimes(2);
    });

    it('asks first on a project whose own choice is off', async () => {
        const h = await harness(undefined);
        h.setting = true;
        writeAutoAddOverride(h.project, false);

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.s.written).toStrictEqual([]);
        expect(h.notify).toHaveBeenCalledWith(expect.stringContaining('Add their pages?'), ADD_PAGES, ALWAYS_FOR_PROJECT);
    });

    it('says nothing when there is nothing new', async () => {
        const h = await harness(undefined);
        h.setting = true;
        h.categories = [SIGNS];

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.notify).not.toHaveBeenCalled();
        expect(h.s.written).toStrictEqual([]);
        expect(h.save).not.toHaveBeenCalled();
    });
});

describe('when it cannot look', () => {
    it('an expired DA.live sign-in is one notice, no write, and no repeat on the next look', async () => {
        const h = await harness(undefined);
        h.setting = true;
        h.pages = {
            ...h.s.port,
            read: async () => {
                throw new DaLiveAuthError('Authentication expired. Please log in again.');
            },
        };

        await h.watcher.check();
        await h.watcher.idle();
        await h.watcher.check();
        await h.watcher.idle();

        expect(h.notify).toHaveBeenCalledTimes(1);
        expect(h.notify).toHaveBeenCalledWith(
            'Demo Builder could not check "Justrite" for new categories because your DA.live sign-in has expired. ' +
                'Sign in to DA.live and it will check again.',
        );
        expect(h.s.written).toStrictEqual([]);
    });

    it('checks again once the sign-in works, and tells the SC again if it lapses later', async () => {
        const h = await harness(undefined);
        const expired: StorefrontPages = {
            ...h.s.port,
            read: async () => {
                throw new DaLiveAuthError('Authentication expired. Please log in again.');
            },
        };
        h.pages = expired;
        await h.watcher.check();
        await h.watcher.idle();

        h.pages = h.s.port;
        await h.watcher.check();
        await h.watcher.idle();
        expect(h.notify).toHaveBeenLastCalledWith(expect.stringContaining('Add their pages?'), ADD_PAGES, ALWAYS_FOR_PROJECT);

        h.pages = expired;
        await h.watcher.check();
        await h.watcher.idle();
        expect(h.notify).toHaveBeenCalledTimes(3);
    });

    it('a failed page listing is logged, offers nothing, and writes nothing', async () => {
        const h = await harness(ADD_PAGES);
        h.setting = true;
        h.pages = {
            ...h.s.port,
            listPages: async () => {
                throw new Error('HTTP 500 listing /');
            },
        };

        await h.watcher.check();
        await h.watcher.idle();

        expect(h.notify).not.toHaveBeenCalled();
        expect(h.s.written).toStrictEqual([]);
        expect(h.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 500 listing /'));
    });

    it('does nothing when no project is open, or the open one has no storefront', async () => {
        const h = await harness(ADD_PAGES);
        const watcher = createNewCategoryPagesWatcher({
            openProject: async () => undefined,
            siteFor: () => null,
            autoAddByDefault: () => true,
            save: h.save,
            notify: h.notify,
            logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        });

        await watcher.check();
        await watcher.idle();

        expect(h.notify).not.toHaveBeenCalled();
        expect(h.s.written).toStrictEqual([]);
    });
});
