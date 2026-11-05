/**
 * batchChoices — the rules of the batch window's questions: which delete boxes start ticked, a
 * column's all/some/none over only the rows that have its option, the answers sent for each
 * project, and when a reset may run.
 */

import {
    changeRows,
    columnState,
    deleteAnswers,
    discardColumnState,
    duplicateNamePaths,
    initialDeleteTicks,
    initialRemoveTicks,
    removeColumnState,
    resetAnswers,
    resetIsReady,
    toggleColumn,
    toggleDeleteTick,
    toggleDiscardColumn,
    toggleRemoveColumn,
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
    { path: '/p/e', name: asDisplayName('E'), datapack: { name: asDisplayName('Unread'), changes: 'unchecked' } },
];

/** Every removable pack ticked, as the window opens. */
const ALL = initialRemoveTicks(RESET_ROWS);

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

// Reset Selected in two steps (owner, 2026-11-04): a Remove Datapack box per project, as Delete
// Selected's table has, then only the packs that need an answer, each saved as new or discarded.
describe('reset choices', () => {
    it("ticks every pack that can go, and offers no box for none or one whose changes weren't read", () => {
        expect(ALL).toStrictEqual({ '/p/a': true, '/p/b': true, '/p/c': true });
    });

    it('reads and toggles the Remove Datapack column over the rows that have a box', () => {
        expect(removeColumnState(RESET_ROWS, ALL)).toStrictEqual({ offered: true, all: true, some: true });
        const none = toggleRemoveColumn(RESET_ROWS, ALL);
        expect(removeColumnState(RESET_ROWS, none)).toStrictEqual({ offered: true, all: false, some: false });
        expect(toggleRemoveColumn(RESET_ROWS, { ...none, '/p/b': true })).toStrictEqual(ALL);
    });

    it('asks in step 2 only for a removed pack that is not yours and has changes', () => {
        expect(changeRows(RESET_ROWS, ALL).map((row) => row.path)).toStrictEqual(['/p/a']);
        expect(changeRows(RESET_ROWS, { ...ALL, '/p/a': false })).toStrictEqual([]);
    });

    it('waits for a name or Discard Changes on every pack that asks', () => {
        expect(resetIsReady(RESET_ROWS, ALL, {})).toBe(false);
        expect(resetIsReady(RESET_ROWS, ALL, { '/p/a': { saveAs: '   ', drop: false } })).toBe(false);
        expect(resetIsReady(RESET_ROWS, ALL, { '/p/a': { saveAs: 'My Copy', drop: false } })).toBe(true);
        expect(resetIsReady(RESET_ROWS, ALL, { '/p/a': { saveAs: '', drop: true } })).toBe(true);
        expect(resetIsReady(RESET_ROWS, { ...ALL, '/p/a': false }, {})).toBe(true);
    });

    it('refuses two packs in the list saved under one name, whatever its case or spaces', () => {
        const two: BatchResetRow[] = [
            RESET_ROWS[0],
            { path: '/p/z', name: asDisplayName('Z'), datapack: { name: asDisplayName('Frescopa'), changes: 'asks' } },
        ];
        const ticks = initialRemoveTicks(two);
        const fields = { '/p/a': { saveAs: 'My Copy', drop: false }, '/p/z': { saveAs: ' my copy ', drop: false } };

        expect([...duplicateNamePaths(two, ticks, fields)]).toStrictEqual(['/p/z']);
        expect(resetIsReady(two, ticks, fields)).toBe(false);
        expect(duplicateNamePaths(two, ticks, { ...fields, '/p/z': { saveAs: 'Other', drop: false } }).size).toBe(0);
    });

    it('reads and toggles the Discard Changes column over the packs that ask', () => {
        const rows = changeRows(RESET_ROWS, ALL);
        expect(discardColumnState(rows, {})).toStrictEqual({ offered: true, all: false, some: false });
        const dropped = toggleDiscardColumn(rows, { '/p/a': { saveAs: 'typed', drop: false } });
        expect(dropped['/p/a']).toStrictEqual({ saveAs: 'typed', drop: true });
        expect(discardColumnState(rows, dropped)).toStrictEqual({ offered: true, all: true, some: true });
    });

    it('sends a name, a drop, a plain removal or a keep, per project', () => {
        expect(resetAnswers(RESET_ROWS, { ...ALL, '/p/c': false }, { '/p/a': { saveAs: '  My Copy ', drop: false } })).toStrictEqual([
            { path: '/p/a', removeDatapack: true, changes: { saveAs: 'My Copy' } },
            { path: '/p/b', removeDatapack: true },
            { path: '/p/c', removeDatapack: false },
            { path: '/p/d', removeDatapack: false },
            { path: '/p/e', removeDatapack: false },
        ]);
        expect(resetAnswers(RESET_ROWS, ALL, { '/p/a': { saveAs: 'typed', drop: true } })[0]).toStrictEqual({
            path: '/p/a',
            removeDatapack: true,
            changes: 'drop',
        });
    });
});
