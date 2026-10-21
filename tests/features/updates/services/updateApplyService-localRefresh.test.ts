/**
 * updateApplyService.applyUpdatesHeadless — the local storefront copies are refreshed once
 * every update has run (EDS-57 step 1), for exactly the projects whose storefront an update
 * wrote to on GitHub.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    makeCtx,
    mockRefreshLocalStorefronts,
    resetFakes,
} from './updateApplyService.testUtils';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';

beforeEach(() => {
    resetFakes();
});

describe('local storefront refresh after an apply', () => {
    it('refreshes the projects a template, boilerplate or block library update wrote to', async () => {
        const template = edsProject({ name: 'tpl', path: '/p/tpl' });
        const adobe = edsProject({ name: 'adobe', path: '/p/adobe' });
        const component = edsProject({ name: 'cmp', path: '/p/cmp' });
        const selections = {
            ...emptySelections(),
            template: [{ project: template }],
            boilerplate: [
                {
                    project: adobe,
                    base: {
                        template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
                        commit: '71a67e027b4b288a67f5cda1fc106d2df9a34805',
                        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
                        found: 'first-commit' as const,
                    },
                    tested: '48bed04d072fff094b49a46709b351bd719b287a',
                },
            ],
            component: [{ project: component, componentId: 'citisignal-nextjs', currentVersion: '1', latestVersion: '2' }],
        };
        const ctx = makeCtx();

        await applyUpdatesHeadless(selections, ctx);

        expect(mockRefreshLocalStorefronts).toHaveBeenCalledTimes(1);
        // A component update writes no storefront, so its project is not refreshed.
        expect(mockRefreshLocalStorefronts).toHaveBeenCalledWith([template, adobe], ctx);
    });

    it('hands in an empty list when nothing wrote to a storefront', async () => {
        await applyUpdatesHeadless(emptySelections(), makeCtx());

        expect(mockRefreshLocalStorefronts).toHaveBeenCalledWith([], expect.anything());
    });

    it('includes block library installs', async () => {
        const project = edsProject({ name: 'blocks', path: '/p/blocks' });
        const selections = {
            ...emptySelections(),
            blockLibraryInstall: [{ project, library: { name: 'Demo Team Blocks', source: { owner: 'acme', repo: 'blocks', branch: 'main' } } }],
        };

        await applyUpdatesHeadless(selections, makeCtx());

        expect(mockRefreshLocalStorefronts).toHaveBeenCalledWith([project], expect.anything());
    });
});
