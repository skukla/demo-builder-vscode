/**
 * updateApplyService.applyUpdatesHeadless — the local storefront copies are refreshed once
 * every update has run (EDS-57 step 1), for exactly the projects whose storefront an update
 * wrote to on GitHub.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    installedLibrary,
    makeCtx,
    mockRefreshLocalStorefronts,
    resetFakes,
} from './updateApplyService.testUtils';
import * as vscode from 'vscode';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';

/** The block library sync setting: 'ask' puts the replace question to the SC. */
function setSyncBehavior(value: 'ask'): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn(() => value) });
}

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
        const onProgress = jest.fn();
        const onLocalCopy = jest.fn();

        await applyUpdatesHeadless(selections, ctx, onProgress, { onLocalCopy });

        // Each project's copy right after its own updates (one project at a time,
        // 2026-10-21). A component update writes no storefront, so its project is not
        // refreshed. The run's progress goes with it, so the window says what it is doing.
        expect(mockRefreshLocalStorefronts.mock.calls).toEqual([
            [[template], ctx, onProgress, onLocalCopy],
            [[adobe], ctx, onProgress, onLocalCopy],
        ]);
    });

    it('refreshes nothing when nothing wrote to a storefront', async () => {
        const component = edsProject({ name: 'cmp', path: '/p/cmp' });

        await applyUpdatesHeadless(
            { ...emptySelections(), component: [{ project: component, componentId: 'c', latestVersion: '2' }] },
            makeCtx(),
        );

        expect(mockRefreshLocalStorefronts).not.toHaveBeenCalled();
    });

    // Told item by item (the Updates modal), a library the SC kept wrote nothing, so its
    // copy is not refreshed (2026-10-21).
    it('refreshes only the projects whose update applied, when told item by item', async () => {
        const kept = edsProject({ name: 'kept', path: '/p/kept' });
        const applied = edsProject({ name: 'applied', path: '/p/applied' });
        const selections = {
            ...emptySelections(),
            blockLibrary: [
                { project: kept, library: installedLibrary('Lib A'), latestCommit: 'b' },
                { project: applied, library: installedLibrary('Lib A'), latestCommit: 'b' },
            ],
        };
        setSyncBehavior('ask');
        const questions = {
            onClash: jest.fn(),
            onUnfinished: jest.fn(),
            replaceLibraryBlocks: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
            aiAsksFirst: jest.fn(() => true),
        };

        await applyUpdatesHeadless(selections, makeCtx(), undefined, { questions, onItem: jest.fn() });

        expect(mockRefreshLocalStorefronts).toHaveBeenCalledWith([applied], expect.anything(), undefined, undefined);
    });

    it('includes block library installs', async () => {
        const project = edsProject({ name: 'blocks', path: '/p/blocks' });
        const selections = {
            ...emptySelections(),
            blockLibraryInstall: [{ project, library: { name: 'Demo Team Blocks', source: { owner: 'acme', repo: 'blocks', branch: 'main' } } }],
        };

        await applyUpdatesHeadless(selections, makeCtx());

        expect(mockRefreshLocalStorefronts).toHaveBeenCalledWith([project], expect.anything(), undefined, undefined);
    });
});
