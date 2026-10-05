/**
 * Reset's touch on the product pages the overlay published (EDS-26): they come out
 * before the content is re-copied and the catalog is pre-warmed, so a reset ends with
 * only the current catalog's product pages.
 *
 * Boundaries faked: Helix (through the module's own seam), the DA.live folder listing,
 * and the state manager's list of local projects. The removal itself is real
 * (`productPageRemoval.test.ts` covers its rules); this pins what reset HANDS it —
 * which site, which authored pages, which project is "this one" — and what reset shows.
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { EdsResetParams } from '@/features/eds/services/reset/edsResetParams';
import { takeOutProductPages, withPageSentences } from '@/features/eds/services/reset/edsResetProductPages';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

function storefront(name: string, githubRepo: string): Project {
    return createMockProject({
        name,
        path: `/projects/${name}`,
        selectedStack: 'eds-accs',
        componentSelections: { frontend: COMPONENT_IDS.EDS_STOREFRONT },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo },
            },
        },
    });
}

const THIS = storefront('justrite', 'skukla/kukla-justrite');

function setUp(localProjects: Project[] = [THIS]) {
    const helix = {
        listPublishedPaths: jest
            .fn()
            .mockResolvedValue(['/products/drum/dc-100', '/products/default', '/products/guides/sizing', '/index']),
        unpublishPages: jest.fn(async (_o: string, _r: string, _b: string, paths: string[]) => ({
            success: true,
            count: paths.length,
            total: paths.length,
            liveFailed: 0,
            previewFailed: 0,
        })),
    };
    // DA.live prefixes listed paths with /{org}/{site}; a folder has no `ext`.
    const listDirectory = jest.fn(async (_org: string, _site: string, dir: string) => {
        if (dir === '/products') {
            return [
                { name: 'default', path: '/da-org/da-site/products/default.html', ext: 'html' },
                { name: 'guides', path: '/da-org/da-site/products/guides' },
            ];
        }
        if (dir === '/products/guides') {
            return [{ name: 'sizing', path: '/da-org/da-site/products/guides/sizing.html', ext: 'html' }];
        }
        return [];
    });
    const stateManager = createMockStateManager({
        getAllProjects: jest
            .fn()
            .mockResolvedValue(localProjects.map((p) => ({ name: p.name, path: p.path, lastModified: new Date(0) }))),
        loadProjectFromPath: jest.fn(async (path: string) => localProjects.find((p) => p.path === path) ?? null),
    });
    const params = {
        project: THIS,
        repoOwner: 'skukla',
        repoName: 'kukla-justrite',
        daLiveOrg: 'da-org',
        daLiveSite: 'da-site',
    } as EdsResetParams;
    const report = jest.fn();
    const logger = createMockLogger();
    const run = () =>
        takeOutProductPages(params, { logger, stateManager }, { daLiveContentOps: { listDirectory } }, report, helix);
    return { helix, listDirectory, report, run, logger };
}

describe('takeOutProductPages', () => {
    it('removes the generated product pages on the GitHub-keyed site, never an authored one', async () => {
        const { helix, listDirectory, run } = setUp();

        const sentence = await run();

        expect(helix.listPublishedPaths).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'main', '/products/*');
        // The authored pages are read from the DA.live site, folder by folder.
        expect(listDirectory).toHaveBeenCalledWith('da-org', 'da-site', '/products');
        expect(listDirectory).toHaveBeenCalledWith('da-org', 'da-site', '/products/guides');
        expect(helix.unpublishPages).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'main', [
            '/products/drum/dc-100',
        ]);
        expect(sentence).toBe('Removed 1 product page from skukla/kukla-justrite, live and preview.');
    });

    it('shows what it is doing and what happened on the progress line', async () => {
        const { report, run } = setUp();

        await run();

        expect(report.mock.calls).toStrictEqual([
            [8, 'Removing the old product pages'],
            [8, 'Removed 1 product page from skukla/kukla-justrite, live and preview.'],
        ]);
    });

    it('refuses when another local project publishes to the same repository, and this project does not count', async () => {
        const { helix, run } = setUp([THIS, storefront('justrite-b2b', 'skukla/kukla-justrite')]);

        const sentence = await run();

        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(sentence).toContain('the project "justrite-b2b" also publishes to skukla/kukla-justrite');
    });

    it('removes nothing when DA.live cannot list the authored pages', async () => {
        const { helix, listDirectory, run } = setUp();
        listDirectory.mockRejectedValue(new Error('Authentication expired. Please log in again.'));

        const sentence = await run();

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(sentence).toContain('so none were removed');
    });

    it('has nothing to say when Helix lists no product pages', async () => {
        const { helix, report, run } = setUp();
        helix.listPublishedPaths.mockResolvedValue(['/products/default']);

        expect(await run()).toBeUndefined();
        expect(report).toHaveBeenCalledTimes(1);
    });
});

describe('withPageSentences', () => {
    it('adds only the sentences there are', () => {
        const result = { success: true };

        expect(withPageSentences(result, { catalogMenu: undefined, productPages: undefined })).toBe(result);
        expect(withPageSentences(result, { catalogMenu: 'A.', productPages: 'B.' })).toStrictEqual({
            success: true,
            catalogMenu: 'A.',
            productPages: 'B.',
        });
    });
});
