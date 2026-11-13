/**
 * Reset Selected's window (owner, 2026-11-04): a row per project, its repository under it, and a
 * Remove Datapack box where its pack can go; a pack whose changes could not be read has no box and
 * says it is kept. When a removed pack has changes, the red button runs into "Save Your Changes
 * First?" (step-05 S1, decisions J7-2): a row per datapack, Datapack and Save As, each a filled-in
 * name; Reset Without Saving, Cancel, Save and Reset. The answers carry a new name, or 'drop', or
 * nothing for the SC's own pack saved into itself.
 */

import { screen, within } from '@testing-library/react';
import { resetQuestions } from '../../../../helpers/projectsBatchFixtures';
import { openOn, PROJECTS_BATCH_OPERATION_ID, resetBatchMocks, runRequest, type PrepareEnvelope } from './ProjectsBatchModal.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { BatchResetRow, BatchSaveNames } from '@/types/projectsBatch';

const ROWS: BatchResetRow[] = [
    { path: '/p/a', name: asDisplayName('A'), datapack: { name: 'Frescopa', changes: 'asks' } },
    { path: '/p/b', name: asDisplayName('B'), datapack: { name: 'Mine', changes: 'saves' } },
    { path: '/p/c', name: asDisplayName('C') },
];

const prepared = (rows: BatchResetRow[], save: Partial<BatchSaveNames> = {}): PrepareEnvelope => ({ success: true, data: resetQuestions(rows, save) });

const RESET = prepared(ROWS, { ownNames: ['Mine'] });

const runButton = () => screen.getByRole('button', { name: 'Reset 3 Projects' });
const nameField = (project: string) => screen.getByRole('textbox', { name: `Save As, ${project}` });

/** Opens on these questions and presses the red button. */
async function pressReset(prepare: PrepareEnvelope, button = 'Reset 3 Projects') {
    const opened = await openOn('reset', prepare);
    await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
    await opened.user.click(screen.getByRole('button', { name: button }));
    return opened;
}

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: Reset Selected', () => {
    it('says it is reading the demo data while the read is out', async () => {
        await openOn('reset', null);

        expect(screen.getByRole('dialog', { name: /^Reset \d+ Projects?\?$/ })).toBeInTheDocument();
        expect(screen.getByText('Reading demo data')).toBeInTheDocument();
    });

    it('ticks Remove Datapack per project that has a pack, the red button ready with no name asked', async () => {
        await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.getByRole('checkbox', { name: 'Uninstall Datapack, A' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Uninstall Datapack, B' })).toBeChecked();
        expect(screen.queryByRole('checkbox', { name: 'Uninstall Datapack, C' })).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
        expect(runButton()).toBeEnabled();
        expect(runButton()).toHaveAttribute('data-variant', 'negative');
    });

    it('asks "Save Your Changes First?" over a row per datapack with changes, each name filled in, running nothing yet', async () => {
        await pressReset(RESET);

        const dialog = screen.getByRole('dialog', { name: 'Save Your Changes First?' });
        expect(dialog).toHaveAttribute('data-status', 'warning');
        expect(screen.getByText("Your changes will be lost if you don't save them.")).toBeInTheDocument();
        // The batch table's headings (J7-2).
        expect(screen.getByText('Datapack')).toHaveClass('batch-changes-head');
        expect(screen.getByText('Save As')).toHaveClass('batch-changes-head');
        expect(within(dialog).getByText('Frescopa').closest('table')).toHaveClass('batch-delete-table', 'batch-changes-table');
        // Someone else's starts "My <Pack>"; the SC's own starts with its own name.
        expect(nameField('A')).toHaveValue('My Frescopa');
        expect(nameField('B')).toHaveValue('Mine');
        expect(screen.queryByRole('textbox', { name: 'Save As, C' })).toBeNull();
        const window = screen.getByRole('dialog', { name: 'Save Your Changes First?' });
        expect(within(window).getAllByRole('button').map((b) => b.textContent)).toStrictEqual(['Reset Without Saving', 'Cancel', 'Save and Reset']);
        expect(runRequest()).toBeUndefined();
    });

    it("Save and Reset sends someone else's pack's new name, and nothing for the SC's own saved into itself", async () => {
        const { user } = await pressReset(RESET);

        await user.click(screen.getByRole('button', { name: 'Save and Reset' }));

        expect(runRequest()).toEqual({
            action: 'reset',
            answers: [
                { path: '/p/a', removeDatapack: true, changes: { saveAs: 'My Frescopa' } },
                { path: '/p/b', removeDatapack: true },
                { path: '/p/c', removeDatapack: false },
            ],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
        expect(await screen.findByRole('dialog', { name: 'Resetting Projects' })).toBeInTheDocument();
    });

    it("sends a name the SC typed, trimmed, and another name on their own pack as a new datapack", async () => {
        const { user } = await pressReset(RESET);

        await user.clear(nameField('A'));
        await user.type(nameField('A'), ' My Copy ');
        await user.clear(nameField('B'));
        await user.type(nameField('B'), 'Mine Two');
        await user.click(screen.getByRole('button', { name: 'Save and Reset' }));

        expect((runRequest() as { answers: unknown[] }).answers).toEqual([
            { path: '/p/a', removeDatapack: true, changes: { saveAs: 'My Copy' } },
            { path: '/p/b', removeDatapack: true, changes: { saveAs: 'Mine Two' } },
            { path: '/p/c', removeDatapack: false },
        ]);
    });

    it("Reset Without Saving sends 'drop' on every row", async () => {
        const { user } = await pressReset(RESET);

        await user.click(screen.getByRole('button', { name: 'Reset Without Saving' }));

        expect((runRequest() as { answers: unknown[] }).answers).toEqual([
            { path: '/p/a', removeDatapack: true, changes: 'drop' },
            { path: '/p/b', removeDatapack: true, changes: 'drop' },
            { path: '/p/c', removeDatapack: false },
        ]);
    });

    it('Cancel closes everything and runs nothing', async () => {
        const { user, onClosed } = await pressReset(RESET);

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(runRequest()).toBeUndefined();
        expect(onClosed).not.toHaveBeenCalled();
    });

    it('runs at once, asking nothing, once no pack with changes goes, and keeps what is unticked', async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        await user.click(screen.getByRole('checkbox', { name: 'Uninstall Datapack, A' }));
        await user.click(screen.getByRole('checkbox', { name: 'Uninstall Datapack, B' }));
        await user.click(runButton());

        expect(screen.queryByRole('dialog', { name: 'Save Your Changes First?' })).toBeNull();
        expect(runRequest()).toMatchObject({
            answers: [
                { path: '/p/a', removeDatapack: false },
                { path: '/p/b', removeDatapack: false },
                { path: '/p/c', removeDatapack: false },
            ],
        });
    });

    // P5-Q6: the setting that saves the SC's own packs without asking leaves their rows out, as
    // Switch does; with no other row the run starts at once.
    it("leaves out the SC's own pack when the setting saves it, and runs at once when it was the only one", async () => {
        const { user } = await pressReset(prepared(ROWS, { ownNames: ['Mine'], alwaysSave: true }));

        expect(nameField('A')).toHaveValue('My Frescopa');
        expect(screen.queryByRole('textbox', { name: 'Save As, B' })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Save and Reset' }));
        expect((runRequest() as { answers: unknown[] }).answers[1]).toEqual({ path: '/p/b', removeDatapack: true });
    });

    it('runs at once when the only pack with changes is the SC\'s own and the setting saves it', async () => {
        await pressReset(prepared([ROWS[1]], { ownNames: ['Mine'], alwaysSave: true }), 'Reset 1 Project');

        expect(screen.queryByRole('dialog', { name: 'Save Your Changes First?' })).toBeNull();
        expect(runRequest()).toMatchObject({ answers: [{ path: '/p/b', removeDatapack: true }] });
    });

    // Option B (owner, 2026-11-04): a pack whose changes could not be read stays, said on its row.
    it('keeps a pack whose changes could not be read: no box, and a note on its row', async () => {
        await openOn('reset', prepared([{ path: '/p/a', name: asDisplayName('A'), datapack: { name: 'Team', changes: 'unchecked' } }]));
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.queryByRole('checkbox', { name: 'Uninstall Datapack, A' })).toBeNull();
        expect(screen.getByText("Couldn't check for changes. Datapack kept.")).toHaveClass('dialog-problem', 'text-notice');
    });

    it('starts two rows of one pack under two names, and refuses one name on both, the save waiting', async () => {
        const { user } = await pressReset(
            prepared([
                { path: '/p/a', name: asDisplayName('A'), datapack: { name: 'Team', changes: 'asks' } },
                { path: '/p/b', name: asDisplayName('B'), datapack: { name: 'Team', changes: 'asks' } },
            ]),
            'Reset 2 Projects',
        );
        expect(nameField('A')).toHaveValue('My Team');
        expect(nameField('B')).toHaveValue('My Team 2');
        expect(screen.getByRole('button', { name: 'Save and Reset' })).toBeEnabled();

        await user.clear(nameField('B'));
        await user.type(nameField('B'), 'my team');

        expect(screen.getByText('You already have a datapack named my team.')).toHaveClass('dialog-problem', 'text-negative');
        expect(screen.getByRole('button', { name: 'Save and Reset' })).toBeDisabled();
        // Losing the changes needs no name.
        expect(screen.getByRole('button', { name: 'Reset Without Saving' })).toBeEnabled();
    });

    it("refuses a name one of the SC's datapacks has, and an empty one; room for the line is kept on every row", async () => {
        const { user } = await pressReset(RESET);
        const lines = () => screen.getAllByRole('textbox').map((field) => field.closest('td')?.querySelector('.dialog-problem')?.textContent);
        // Each row keeps its problem line from the start, so the window never grows (rule 14).
        expect(lines()).toStrictEqual(['\u00a0', '\u00a0']);

        await user.clear(nameField('A'));
        await user.type(nameField('A'), 'mine');
        // One of the SC's datapacks for A; for B, another row's name (each line names its own row's).
        expect(lines()).toStrictEqual(['You already have a datapack named mine.', 'You already have a datapack named Mine.']);
        expect(screen.getByRole('button', { name: 'Save and Reset' })).toBeDisabled();

        await user.clear(nameField('A'));
        expect(lines()).toStrictEqual(['Give it a name.', '\u00a0']);
    });

    // A reset replaces each project's code (owner, 2026-11-04): a dangerous confirm, so it says what
    // happens, carries the amber icon, and its button is red, as Delete Selected's is.
    it('says what a reset does, amber, with a red button', async () => {
        await openOn('reset', RESET);
        const dialog = await screen.findByRole('dialog', { name: 'Reset 3 Projects?' });

        expect(dialog).toHaveAttribute('data-status', 'warning');
        // One column fits large: Reset is not widened.
        expect(dialog).not.toHaveAttribute('data-wide');
        // The pack beside its box, the projects under a Project header (owner, 2026-11-05).
        expect(screen.getByText('Project')).toBeInTheDocument();
        const cell = screen.getByRole('checkbox', { name: 'Uninstall Datapack, A' }).closest('td') as HTMLElement;
        expect(within(cell).getByText('Frescopa')).toBeInTheDocument();
        expect(
            screen.getByText('Each project returns to how it was set up. Code changes are lost.'),
        ).toBeInTheDocument();
    });

    // Each project as the run draws it: its name, and under it what it is (owner, 2026-11-04).
    it("draws each project's package and stack under its name", async () => {
        await openOn('reset', prepared([{ path: '/p/a', name: asDisplayName('A'), summary: 'Starter (B2B + B2C), Edge Delivery + ACCS' }]));
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.getByText('Starter (B2B + B2C), Edge Delivery + ACCS')).toHaveClass('work-row-detail');
    });

    // A storefront's repository names what the reset overwrites; it leads over the summary.
    it("draws a storefront's repository under its name, in place of its summary", async () => {
        await openOn('reset', prepared([{ path: '/p/a', name: asDisplayName('A'), repository: 'skukla/a', summary: 'Starter (B2B + B2C), Edge Delivery + ACCS' }]));
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.getByText('skukla/a')).toHaveClass('work-row-detail');
        expect(screen.queryByText('Starter (B2B + B2C), Edge Delivery + ACCS')).toBeNull();
    });

    it('offers no Remove Datapack when no project has a pack', async () => {
        await openOn('reset', prepared([{ path: '/p/a', name: asDisplayName('A') }, { path: '/p/b', name: asDisplayName('B') }, { path: '/p/c', name: asDisplayName('C') }]));
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.queryByRole('checkbox', { name: /Uninstall Datapack/ })).toBeNull();
        expect(runButton()).toBeEnabled();
    });
});
