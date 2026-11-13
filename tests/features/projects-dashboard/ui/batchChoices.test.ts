/**
 * batchChoices — the rules of the batch window's questions: which delete boxes start ticked, a
 * column's all/some/none over only the rows that have its option, which datapacks "Save Your
 * Changes First?" asks about and the names it starts with and refuses (step-05 S1, J7-2), and the
 * answers sent for each project.
 */

import {
    changesOf,
    columnState,
    dataTicks,
    deleteAnswers,
    initialDeleteTicks,
    initialRemoveTicks,
    nameProblems,
    namesOf,
    removeColumnState,
    resetAnswers,
    saveRows,
    toggleColumn,
    toggleDeleteTick,
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
        datapack: { name: 'Pack A', changes: 'asks' },
    },
    { path: '/p/b', name: asDisplayName('B'), repo: { name: asDisplayName('me/b'), ticked: false }, datapack: { name: 'Pack B', changes: 'unchecked' } },
    { path: '/p/c', name: asDisplayName('C'), datapack: { name: 'Pack C', changes: 'saves' } },
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

        expect(deleteAnswers(DELETE_ROWS, ticks, {})).toEqual([
            { path: '/p/a', deleteGitHubRepo: true, deleteDaLiveSite: false, removeDatapackData: false },
            { path: '/p/b', deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: false },
            { path: '/p/c', deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: false },
        ]);
    });

    // Uninstall Datapack (walk F96): never ticked to start, no box where the changes could not be
    // read (a batch never discards what nobody could see), and the save question's answer rides with it.
    it("offers the data box only where the pack's changes were read, and never ticks it to start", () => {
        const ticks = initialDeleteTicks(DELETE_ROWS);
        const all = toggleColumn(DELETE_ROWS, ticks, 'datapack');

        expect(columnState(DELETE_ROWS, all, 'datapack')).toEqual({ offered: true, all: true, some: true });
        expect(all['/p/b'].datapack).toBe(false);
        expect(dataTicks(DELETE_ROWS, { ...all, '/p/b': { repo: false, site: false, datapack: true } })).toStrictEqual({
            '/p/a': true,
            '/p/b': false,
            '/p/c': true,
        });
    });

    it("sends the save question's answer with the data's removal, for a pack whose data goes", () => {
        const ticks = toggleColumn(DELETE_ROWS, initialDeleteTicks(DELETE_ROWS), 'datapack');

        expect(deleteAnswers(DELETE_ROWS, ticks, { '/p/a': { saveAs: 'My Copy' }, '/p/c': 'drop' })).toEqual([
            { path: '/p/a', deleteGitHubRepo: true, deleteDaLiveSite: true, removeDatapackData: true, changes: { saveAs: 'My Copy' } },
            { path: '/p/b', deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: false },
            { path: '/p/c', deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: true, changes: 'drop' },
        ]);
        // A pack whose data stays sends no answer about its changes.
        expect(deleteAnswers(DELETE_ROWS, initialDeleteTicks(DELETE_ROWS), { '/p/a': 'drop' })[0]).not.toHaveProperty('changes');
    });
});

// Reset Selected (owner, 2026-11-04): a Remove Datapack box per project, as Delete Selected's table
// has; what happens to a removed pack's changes is the save question's (below).
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

    it('sends a name, a drop, a plain removal or a keep, per project', () => {
        expect(resetAnswers(RESET_ROWS, { ...ALL, '/p/c': false }, { '/p/a': { saveAs: 'My Copy' } })).toStrictEqual([
            { path: '/p/a', removeDatapack: true, changes: { saveAs: 'My Copy' } },
            { path: '/p/b', removeDatapack: true },
            { path: '/p/c', removeDatapack: false },
            { path: '/p/d', removeDatapack: false },
            { path: '/p/e', removeDatapack: false },
        ]);
        expect(resetAnswers(RESET_ROWS, ALL, { '/p/a': 'drop' })[0]).toStrictEqual({
            path: '/p/a',
            removeDatapack: true,
            changes: 'drop',
        });
        // A kept pack sends no answer about its changes.
        expect(resetAnswers(RESET_ROWS, { ...ALL, '/p/a': false }, { '/p/a': 'drop' })[0]).toStrictEqual({ path: '/p/a', removeDatapack: false });
    });
});

// "Save Your Changes First?" after the red button (step-05 S1; decisions J7-2): one row per datapack
// whose data goes with changes, each a filled-in name field. The SC's own starts with its own name
// and saves into it; someone else's starts "My <Pack>", counting on when taken.
describe('the save question', () => {
    const OWN = ['Mine', 'My Frescopa', 'Luma'];

    it("asks about every removed pack with changes, the SC's own included, never a kept or unread one", () => {
        expect(saveRows(RESET_ROWS, ALL, false).map((row) => row.path)).toStrictEqual(['/p/a', '/p/b']);
        expect(saveRows(RESET_ROWS, { ...ALL, '/p/a': false }, false).map((row) => row.path)).toStrictEqual(['/p/b']);
    });

    // P5-Q6: the setting that saves the SC's own packs without asking leaves their rows out, as
    // Switch does (`mustAsk`); someone else's still asks, since a save needs a name.
    it("leaves out the SC's own pack when the setting saves it without asking", () => {
        expect(saveRows(RESET_ROWS, ALL, true).map((row) => row.path)).toStrictEqual(['/p/a']);
    });

    it("starts the SC's own with its own name, someone else's with the first free \"My <Pack>\"", () => {
        const rows = saveRows(RESET_ROWS, ALL, false);

        expect(namesOf(rows, OWN, {})).toStrictEqual({ '/p/a': 'My Frescopa 2', '/p/b': 'Mine' });
        expect(namesOf(rows, [], {})).toStrictEqual({ '/p/a': 'My Frescopa', '/p/b': 'Mine' });
    });

    it('starts two rows of one pack under two names, and keeps what was typed', () => {
        const two: BatchResetRow[] = [
            { path: '/p/a', name: asDisplayName('A'), datapack: { name: 'Bodea', changes: 'asks' } },
            { path: '/p/z', name: asDisplayName('Z'), datapack: { name: 'Bodea', changes: 'asks' } },
        ];

        expect(namesOf(two, [], {})).toStrictEqual({ '/p/a': 'My Bodea', '/p/z': 'My Bodea 2' });
        expect(namesOf(two, [], { '/p/z': 'Typed' })).toStrictEqual({ '/p/a': 'My Bodea', '/p/z': 'Typed' });
    });

    it("refuses an empty name, one of the SC's other datapacks, and another row's, whatever the case", () => {
        const rows = saveRows(RESET_ROWS, ALL, false);

        expect(nameProblems(rows, { '/p/a': 'My Frescopa 2', '/p/b': 'Mine' }, OWN)).toStrictEqual({});
        expect(nameProblems(rows, { '/p/a': '  ', '/p/b': 'Mine' }, OWN)).toStrictEqual({ '/p/a': 'Give it a name.' });
        expect(nameProblems(rows, { '/p/a': 'luma', '/p/b': 'Mine' }, OWN)).toStrictEqual({ '/p/a': 'You already have a datapack named luma.' });
        expect(nameProblems(rows, { '/p/a': 'Copy', '/p/b': ' copy ' }, OWN)).toStrictEqual({
            '/p/a': 'You already have a datapack named Copy.',
            '/p/b': 'You already have a datapack named copy.',
        });
        // Someone else's pack may not take the SC's own pack's name: that pack is not its own.
        expect(nameProblems(rows, { '/p/a': 'Mine', '/p/b': 'Other' }, OWN)).toStrictEqual({ '/p/a': 'You already have a datapack named Mine.' });
    });

    // Review of step-05 S1: two projects built from the SC's own Bodea could not both save into it,
    // each row refusing the other's "Bodea". Saving into one's own pack is not taking a name.
    it("lets two projects on the SC's own pack both save into it, and still refuses a clash they typed", () => {
        const two: BatchResetRow[] = [
            { path: '/p/a', name: asDisplayName('A'), datapack: { name: asDisplayName('Bodea'), changes: 'saves' } },
            { path: '/p/z', name: asDisplayName('Z'), datapack: { name: asDisplayName('Bodea'), changes: 'saves' } },
        ];
        const ownNames = ['Bodea', 'Luma'];

        expect(namesOf(two, ownNames, {})).toStrictEqual({ '/p/a': 'Bodea', '/p/z': 'Bodea' });
        expect(nameProblems(two, { '/p/a': 'Bodea', '/p/z': ' bodea ' }, ownNames)).toStrictEqual({});
        expect(changesOf(two, { '/p/a': 'Bodea', '/p/z': ' bodea ' }, 'save')).toStrictEqual({});
        // One renamed to a new name, the other still into Bodea: no clash.
        expect(nameProblems(two, { '/p/a': 'Bodea Copy', '/p/z': 'Bodea' }, ownNames)).toStrictEqual({});
        // Both typed the same new name: a clash, as for any two rows.
        expect(nameProblems(two, { '/p/a': 'Copy', '/p/z': 'Copy' }, ownNames)).toStrictEqual({
            '/p/a': 'You already have a datapack named Copy.',
            '/p/z': 'You already have a datapack named Copy.',
        });
    });

    it("saves the SC's own into itself by sending nothing, any other name as a new datapack, trimmed", () => {
        const rows = saveRows(RESET_ROWS, ALL, false);

        expect(changesOf(rows, { '/p/a': ' My Copy ', '/p/b': 'Mine' }, 'save')).toStrictEqual({ '/p/a': { saveAs: 'My Copy' } });
        // Never the own name as saveAs: the save would refuse it as taken (`saveIntoFor`).
        expect(changesOf(rows, { '/p/a': 'My Copy', '/p/b': ' mine ' }, 'save')).toStrictEqual({ '/p/a': { saveAs: 'My Copy' } });
        expect(changesOf(rows, { '/p/a': 'My Copy', '/p/b': 'Mine Two' }, 'save')).toStrictEqual({
            '/p/a': { saveAs: 'My Copy' },
            '/p/b': { saveAs: 'Mine Two' },
        });
    });

    it("drops every row's changes without saving", () => {
        const rows = saveRows(RESET_ROWS, ALL, false);

        expect(changesOf(rows, { '/p/a': 'My Copy', '/p/b': 'Mine' }, 'drop')).toStrictEqual({ '/p/a': 'drop', '/p/b': 'drop' });
    });
});
