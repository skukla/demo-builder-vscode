/**
 * Reset's two touches on the category pages and the catalog menu (EDS-24, EDS-61): the
 * take-out before the content is re-copied, the put-back after it is published, on
 * reset's own clients. The step itself is `catalogMenuStep.test.ts`; this pins what reset
 * hands it and what reset shows.
 *
 * DA.live, Helix and GitHub are the boundary: `readSource` is a small in-memory site,
 * `getFileContent` answers whether the block is in the repository, and the Helix seam
 * lists and takes down the overlay's category pages.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { RESET_STEP } from '@/core/utils/resetStages';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import { putBackCatalogMenu, takeOutCatalogMenu } from '@/features/eds/services/reset/edsResetCatalogMenu';
import type { EdsResetParams } from '@/features/eds/services/reset/edsResetParams';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

const NAV = '<body><header></header><main><div><ul><li>Home</li></ul></div></main><footer></footer></body>';

function project(): Project {
    return createMockProject({
        selectedStack: 'eds-accs',
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

function clients(pages: Map<string, string>, hasBlock = true) {
    const daLiveContentOps = {
        // The listing a hand-built category page is looked for in: every page but the nav.
        listDirectory: jest.fn(async (_o: string, _s: string, dir: string) =>
            dir === '/'
                ? [...pages.keys()]
                      .filter((path) => path !== '/nav')
                      .map((path) => ({ name: path, path: `/skukla/kukla-justrite${path}.html`, ext: 'html' }))
                : [],
        ),
        readSource: jest.fn(async (_o: string, _s: string, file: string) => {
            const body = pages.get(`/${file.replace(/\.html$/, '')}`);
            return body === undefined
                ? { status: 404, body: '', bytes: 0, truncated: false }
                : { status: 200, body, bytes: body.length, truncated: false };
        }),
        createSource: jest.fn(async (_o: string, _s: string, file: string, html: string) => {
            pages.set(`/${file.replace(/\.html$/, '')}`, html);
            return { success: true };
        }),
        deleteSource: jest.fn(async (_o: string, _s: string, file: string) => {
            pages.delete(`/${file.replace(/\.html$/, '')}`);
            return { success: true };
        }),
    };
    const githubFileOps = { getFileContent: jest.fn().mockResolvedValue(hasBlock ? { content: '//' } : null) };
    return {
        daLiveContentOps: { sourceOps: daLiveContentOps },
        githubFileOps,
        githubTokenService: {},
        tokenProvider: { getAccessToken: jest.fn() },
    } as unknown as Parameters<typeof takeOutCatalogMenu>[2];
}

/** Helix: publishes, unpublishes and takes category pages down when asked. */
function helixSeam() {
    return {
        previewAndPublishPage: jest.fn().mockResolvedValue(undefined),
        unpublishPage: jest.fn().mockResolvedValue(true),
        listPublishedPaths: jest.fn(),
        unpublishPages: jest.fn(async (_o: string, _r: string, _b: string, paths: string[]) => ({
            total: paths.length,
            liveFailed: 0,
            previewFailed: 0,
        })),
    };
}

const context = () => ({ logger: createMockLogger(), stateManager: createMockStateManager() });

function params(p: Project): EdsResetParams {
    return {
        project: p,
        repoOwner: 'skukla',
        repoName: 'kukla-justrite',
        daLiveOrg: 'skukla',
        daLiveSite: 'kukla-justrite',
        byomOverlayUrl: 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp',
    } as EdsResetParams;
}

describe('takeOutCatalogMenu', () => {
    it('removes exactly what the record claims, shows it while clearing old content, and returns the site for the put-back', async () => {
        const p = project();
        p.componentInstances![COMPONENT_IDS.EDS_STOREFRONT]!.metadata!.catalogMenu = {
            pages: [{ path: '/signs', hash: 'stale-hash' }],
            navSwitch: false,
            categoryPaths: ['/apparel'],
            authoredSheet: true,
        };
        const pages = new Map([['/nav', NAV], ['/signs', '<body>edited</body>']]);
        const report = jest.fn();
        const helix = helixSeam();

        const taken = await takeOutCatalogMenu(params(p), context(), clients(pages), report, helix);

        // The page changed since it was written, so it is the SC's now: left in place.
        expect(pages.get('/signs')).toBe('<body>edited</body>');
        // The sheet goes before the content is published again, so the overlay leaves every
        // category address alone until the put-back writes it first. The category pages stay
        // for the put-back to keep or take down.
        expect(helix.unpublishPage).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/authored-category-pages.json');
        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(
            RESET_STEP.clearingOldContent,
            expect.stringContaining('because you edited it'),
        );
        expect(typeof taken.site.hasBlock).toBe('function');
    });

    it('says nothing when Demo Builder made nothing here', async () => {
        const report = jest.fn();
        const helix = helixSeam();
        await takeOutCatalogMenu(params(project()), context(), clients(new Map([['/nav', NAV]])), report, helix);
        expect(report).not.toHaveBeenCalled();
    });
});

describe('putBackCatalogMenu', () => {
    it('re-applies on the site from the take-out and reports on the catalog-menu step', async () => {
        const p = project();
        const pages = new Map([['/nav', NAV]]);
        const c = clients(pages, false);
        const report = jest.fn();
        const helix = helixSeam();
        const taken = await takeOutCatalogMenu(params(p), context(), c, report, helix);

        const summary = await putBackCatalogMenu(params(p), taken, createMockLogger(), report);

        // No block in the repository after the reset: nothing to put back, nothing said.
        expect(summary).toBeUndefined();
        expect(c.githubFileOps.getFileContent).toHaveBeenCalledWith(
            'skukla',
            'kukla-justrite',
            'blocks/catalog-menu/catalog-menu.js',
        );
        expect(report).not.toHaveBeenCalled();
        expect(readCatalogMenuRecord(p)).toEqual({ legacyPages: [], links: [], navSwitch: false });
        expect(pages.get('/nav')).toBe(NAV);
    });

    it("puts the take-out's sentence in front of the put-back's, so the result says both", async () => {
        const p = project();
        p.componentInstances![COMPONENT_IDS.EDS_STOREFRONT]!.metadata!.catalogMenu = {
            pages: [{ path: '/signs', hash: 'stale-hash' }],
            navSwitch: false,
        };
        const pages = new Map([['/nav', NAV], ['/signs', '<body>edited</body>']]);
        const report = jest.fn();
        const taken = await takeOutCatalogMenu(params(p), context(), clients(pages, false), report, helixSeam());

        const summary = await putBackCatalogMenu(params(p), taken, createMockLogger(), report);

        expect(summary).toStrictEqual({ sentence: 'Left 1 page alone because you edited it (/signs).', problem: false });
    });
});
