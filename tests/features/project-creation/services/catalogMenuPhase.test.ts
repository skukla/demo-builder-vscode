/**
 * catalogMenuPhase — creation's turn at the catalog menu step (EDS-24): after sample
 * data, on the real project, never fatal. The step itself is tested in
 * `catalogMenuStep.test.ts`; this suite pins what creation adds — which storefront, the
 * progress line, the edit-mode record carry, and the swallow-and-warn contract.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuStep';
import { readAutoAddOverride } from '@/features/eds/services/catalogMenu/categoryPageAutoAdd';
import { executeCatalogMenuPhase } from '@/features/project-creation/services/catalogMenuPhase';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { fakeStorefront } from '../../eds/services/catalogMenu/catalogMenuService.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const NAV = '<body><header></header><main><div><ul><li>Home</li></ul></div></main><footer></footer></body>';

function storefront(githubRepo = 'skukla/kukla-justrite', extra: Record<string, unknown> = {}): Project {
    return createMockProject({
        selectedStack: 'eds-accs',
        componentSelections: { frontend: COMPONENT_IDS.EDS_STOREFRONT },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo, daLiveOrg: 'skukla', ...extra },
            },
        },
    });
}

const fakeSite = (initial: Record<string, string> = { '/nav': NAV }) => fakeStorefront(initial);

function siteOver(port: StorefrontPages): CatalogMenuSite {
    return {
        pages: port,
        hasBlock: async () => true,
        readCategories: async () => [{ id: '1', name: 'Signs and Labels', urlPath: 'signs' }],
    };
}

describe('executeCatalogMenuPhase', () => {
    it("writes the pages on this project's storefront and puts the outcome on the progress line", async () => {
        const project = storefront();
        const s = fakeSite();
        const makeSite = jest.fn(() => siteOver(s.port));
        const progress = jest.fn();

        await executeCatalogMenuPhase(createMockHandlerContext(), project, progress, undefined, makeSite);

        expect(makeSite).toHaveBeenCalledWith(
            expect.objectContaining({ repoOwner: 'skukla', repoName: 'kukla-justrite', daLiveSite: 'kukla-justrite' }),
        );
        expect(s.pages.get('/signs')).toContain('<h1>Signs and Labels</h1>');
        expect(readCatalogMenuRecord(project).navSwitch).toBe(true);
        expect(progress).toHaveBeenCalledWith(
            'Writing Category Pages',
            97,
            expect.stringContaining('Wrote and published 1 category page.'),
        );
    });

    it('builds nothing for a project without a storefront', async () => {
        const makeSite = jest.fn();
        const progress = jest.fn();

        await executeCatalogMenuPhase(createMockHandlerContext(), createMockProject(), progress, undefined, makeSite);

        expect(makeSite).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });

    it('says nothing when the storefront does not have the block', async () => {
        const s = fakeSite();
        const progress = jest.fn();

        await executeCatalogMenuPhase(createMockHandlerContext(), storefront(), progress, undefined, () => ({
            ...siteOver(s.port),
            hasBlock: async () => false,
        }));

        expect(progress).not.toHaveBeenCalled();
        expect(s.pages.get('/nav')).toBe(NAV);
    });

    it('edit mode: keeps treating the pages Demo Builder wrote as its own', async () => {
        const before = storefront();
        const s = fakeSite();
        await executeCatalogMenuPhase(createMockHandlerContext(), before, jest.fn(), undefined, () => siteOver(s.port));
        const rebuilt = storefront(); // edit mode rebuilds componentInstances without the record

        const progress = jest.fn();
        await executeCatalogMenuPhase(createMockHandlerContext(), rebuilt, progress, before, () => siteOver(s.port));

        expect(readCatalogMenuRecord(rebuilt).pages.map((p) => p.path)).toEqual(['/signs']);
        expect(progress.mock.calls[0][2]).not.toContain("didn't write");
    });

    it("edit mode: the SC's own choice about pages for new categories follows the storefront", async () => {
        const before = storefront('skukla/kukla-justrite', { autoAddCategoryPages: true });
        const rebuilt = storefront();
        const s = fakeSite();

        await executeCatalogMenuPhase(createMockHandlerContext(), rebuilt, jest.fn(), before, () => siteOver(s.port));

        expect(readAutoAddOverride(rebuilt)).toBe(true);
    });

    it('edit mode onto a different storefront: the old record does not follow', async () => {
        const before = storefront('skukla/old-site');
        before.componentInstances![COMPONENT_IDS.EDS_STOREFRONT]!.metadata!.catalogMenu = {
            pages: [{ path: '/signs', hash: 'x' }],
            navSwitch: true,
        };
        const rebuilt = storefront('skukla/new-site');
        const s = fakeSite();

        await executeCatalogMenuPhase(createMockHandlerContext(), rebuilt, jest.fn(), before, () => siteOver(s.port));

        expect(readCatalogMenuRecord(rebuilt).pages).toEqual([
            expect.objectContaining({ path: '/signs' }),
        ]);
        expect(readCatalogMenuRecord(rebuilt).pages[0].hash).not.toBe('x');
    });

    it('never fails creation: a site that cannot be built is swallowed, and nothing is reported as written', async () => {
        const progress = jest.fn();
        const project = storefront();

        await expect(
            executeCatalogMenuPhase(createMockHandlerContext(), project, progress, undefined, () => {
                throw new Error('no DA.live session');
            }),
        ).resolves.toBeUndefined();
        expect(progress).not.toHaveBeenCalled();
        expect(readCatalogMenuRecord(project)).toEqual({ pages: [], links: [], navSwitch: false });
    });
});
