/**
 * batchChoices — the rules of the batch window's questions: which delete boxes start ticked, a
 * column's all/some/none over only the rows that have its option, the answers sent for each
 * project, and when a reset may run.
 */

import {
    columnState,
    deleteAnswers,
    initialDeleteTicks,
    resetAnswers,
    resetIsReady,
    toggleColumn,
    toggleDeleteTick,
} from '@/features/projects-dashboard/ui/batchChoices';
import type { BatchDeleteRow, BatchResetRow } from '@/types/projectsBatch';
import { asDisplayName } from '@/core/utils/projectDisplayName';

const DELETE_ROWS: BatchDeleteRow[] = [
    {
        path: '/p/a',
        name: asDisplayName('A'),
        repo: { name: 'me/a', ticked: true },
        site: { name: 'me/a', ticked: true },
        datapack: { name: 'Pack A', ticked: false },
    },
    { path: '/p/b', name: asDisplayName('B'), repo: { name: asDisplayName('me/b'), ticked: false } },
    { path: '/p/c', name: asDisplayName('C') },
];

const RESET_ROWS: BatchResetRow[] = [
    { path: '/p/a', name: asDisplayName('A'), datapack: { name: asDisplayName('Frescopa'), changes: 'asks' } },
    { path: '/p/b', name: asDisplayName('B'), datapack: { name: asDisplayName('Mine'), changes: 'saves' } },
    { path: '/p/c', name: asDisplayName('C'), datapack: { name: asDisplayName('Clean') } },
    { path: '/p/d', name: asDisplayName('D') },
];

describe('delete choices', () => {
    it('starts each box where the prepare said, and a box a row does not have unticked', () => {
        expect(initialDeleteTicks(DELETE_ROWS)).toEqual({
            '/p/a': { repo: true, site: true, datapack: false },
            '/p/b': { repo: false, site: false, datapack: false },
            '/p/c': { repo: false, site: false, datapack: false },
        });
    });

    it('reads a column over only the rows that have its option: some, all, none, absent', () => {
        const ticks = initialDeleteTicks(DELETE_ROWS);

        expect(columnState(DELETE_ROWS, ticks, 'repo')).toEqual({ offered: true, all: false, some: true });
        expect(columnState(DELETE_ROWS, ticks, 'site')).toEqual({ offered: true, all: true, some: true });
        expect(columnState(DELETE_ROWS, ticks, 'datapack')).toEqual({ offered: true, all: false, some: false });
        expect(columnState([DELETE_ROWS[2]], ticks, 'repo')).toEqual({ offered: false, all: false, some: false });
    });

    it('a column header ticks every box it can when not all are, then unticks them all', () => {
        const once = toggleColumn(DELETE_ROWS, initialDeleteTicks(DELETE_ROWS), 'repo');
        expect(columnState(DELETE_ROWS, once, 'repo').all).toBe(true);
        // C has no repository: its box is never ticked.
        expect(once['/p/c'].repo).toBe(false);

        const twice = toggleColumn(DELETE_ROWS, once, 'repo');
        expect(columnState(DELETE_ROWS, twice, 'repo').some).toBe(false);
    });

    it('sends one answer per project, true only for a ticked box the project has', () => {
        const ticks = toggleDeleteTick(initialDeleteTicks(DELETE_ROWS), '/p/a', 'site');

        expect(deleteAnswers(DELETE_ROWS, ticks)).toEqual([
            { path: '/p/a', deleteGitHubRepo: true, deleteDaLiveSite: false, deleteDatapack: false },
            { path: '/p/b', deleteGitHubRepo: false, deleteDaLiveSite: false, deleteDatapack: false },
            { path: '/p/c', deleteGitHubRepo: false, deleteDaLiveSite: false, deleteDatapack: false },
        ]);
    });
});

describe('reset choices', () => {
    it('waits for a name, or Remove Without Saving, on a pack that asks', () => {
        expect(resetIsReady(RESET_ROWS, true, {})).toBe(false);
        expect(resetIsReady(RESET_ROWS, true, { '/p/a': { saveAs: '   ', drop: false } })).toBe(false);
        expect(resetIsReady(RESET_ROWS, true, { '/p/a': { saveAs: 'My Copy', drop: false } })).toBe(true);
        expect(resetIsReady(RESET_ROWS, true, { '/p/a': { saveAs: '', drop: true } })).toBe(true);
    });

    it('asks nothing while Remove Datapack is unticked', () => {
        expect(resetIsReady(RESET_ROWS, false, {})).toBe(true);
    });

    it('sends the trimmed name for a pack that asks, and removes the others as they are', () => {
        expect(resetAnswers(RESET_ROWS, true, { '/p/a': { saveAs: '  My Copy ', drop: false } })).toEqual([
            { path: '/p/a', removeDatapack: true, changes: { saveAs: 'My Copy' } },
            { path: '/p/b', removeDatapack: true },
            { path: '/p/c', removeDatapack: true },
            { path: '/p/d', removeDatapack: false },
        ]);
    });

    it("sends 'drop' for Remove Without Saving, whatever was typed", () => {
        expect(resetAnswers(RESET_ROWS, true, { '/p/a': { saveAs: 'typed', drop: true } })[0]).toEqual({
            path: '/p/a',
            removeDatapack: true,
            changes: 'drop',
        });
    });

    it('keeps every pack with Remove Datapack unticked', () => {
        expect(resetAnswers(RESET_ROWS, false, {}).map((answer) => answer.removeDatapack)).toEqual([false, false, false, false]);
    });
});
