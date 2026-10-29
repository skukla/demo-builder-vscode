/**
 * updateApplyService.applyUpdatesHeadless with `onItem` — the Updates modal's row by row
 * run (2026-10-21): each item told as it starts and as it ends, and the totals the same
 * as a run told nothing, so the agent's `apply_updates` reads no difference.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    installedLibrary,
    makeCtx,
    mockSyncFork,
    mockUpdateComponent,
    resetFakes,
} from './updateApplyService.testUtils';
import * as vscode from 'vscode';
import type { UpdateQuestions } from '@/features/updates/services/updateApplyService';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';

const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;

function setSyncBehavior(value: 'ask' | 'enabled'): void {
    getConfigMock.mockReturnValue({ get: jest.fn((_k: string, def: unknown) => value ?? def) });
}

const forkA = { owner: 'me', repo: 'a', branch: 'main' };
const forkB = { owner: 'me', repo: 'b', branch: 'main' };

function mixed(): UpdateSelections {
    const project = edsProject();
    return {
        ...emptySelections(),
        forkSync: [forkA, forkB],
        component: [{ project, componentId: 'eds-storefront', currentVersion: '1.0.0', latestVersion: '1.1.0', downloadUrl: 'https://x/1.1.0.zip' }],
        blockLibrary: [{ project, library: installedLibrary('Lib A'), latestCommit: 'bbb' }],
        inspector: [{ project, latestCommit: 'newsha' }],
    } as UpdateSelections;
}

beforeEach(() => {
    resetFakes();
    setSyncBehavior('enabled');
});

describe('applyUpdatesHeadless, told each item', () => {
    it('tells each item as it starts and as it ends, a failure with its reason', async () => {
        mockSyncFork
            .mockResolvedValueOnce({ success: true, message: 'ok' })
            .mockResolvedValueOnce({ success: false, message: 'upstream gone' });
        const onItem = jest.fn();

        await applyUpdatesHeadless({ ...emptySelections(), forkSync: [forkA, forkB] }, makeCtx(), undefined, { onItem });

        expect(onItem.mock.calls).toEqual([
            ['forkSync', forkA, { state: 'running' }],
            ['forkSync', forkA, { state: 'done' }],
            ['forkSync', forkB, { state: 'running' }],
            ['forkSync', forkB, { state: 'failed', message: 'me/b: upstream gone' }],
        ]);
    });

    it('answers the same totals as a run told nothing', async () => {
        mockUpdateComponent.mockRejectedValueOnce(new Error('download failed'));
        const told = await applyUpdatesHeadless(mixed(), makeCtx(), undefined, { onItem: jest.fn() });
        mockUpdateComponent.mockRejectedValueOnce(new Error('download failed'));
        const untold = await applyUpdatesHeadless(mixed(), makeCtx());

        expect(told).toEqual(untold);
        expect(told.totalFailed).toBe(1);
        expect(told.totalApplied).toBe(4);
    });

    // One project at a time, in the order the Updates modal lists them (owner,
    // 2026-10-21): by kind, the first project's template ran before the second's library.
    it('runs one project at a time, in the order it is given', async () => {
        const first = edsProject({ name: 'first', path: '/p/first' });
        const second = edsProject({ name: 'second', path: '/p/second' });
        const onItem = jest.fn();
        const selections = {
            ...emptySelections(),
            forkSync: [forkA],
            template: [{ project: second }],
            blockLibrary: [{ project: first, library: installedLibrary('Lib A'), latestCommit: 'bbb' }],
        } as UpdateSelections;

        await applyUpdatesHeadless(selections, makeCtx(), undefined, { onItem, projectOrder: ['/p/first', '/p/second'] });

        const started = onItem.mock.calls.filter(([, , o]) => o.state === 'running').map(([kind]) => kind);
        expect(started).toEqual(['forkSync', 'blockLibrary', 'template']);
    });

    it('tells a library the SC chose to keep as left alone, in a sentence', async () => {
        setSyncBehavior('ask');
        const questions = { replaceLibraryBlocks: jest.fn().mockResolvedValue(false) } as unknown as UpdateQuestions;
        const onItem = jest.fn();
        const item = { project: edsProject(), library: installedLibrary('Lib A'), latestCommit: 'bbb' };

        await applyUpdatesHeadless({ ...emptySelections(), blockLibrary: [item] }, makeCtx(), undefined, { onItem, questions });

        expect(onItem).toHaveBeenLastCalledWith('blockLibrary', item, {
            state: 'skipped',
            message: 'Not updated — your blocks were kept.',
        });
    });
});
