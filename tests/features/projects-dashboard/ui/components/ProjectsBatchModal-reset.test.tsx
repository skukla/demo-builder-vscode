/**
 * Reset Selected's window in two steps (owner, 2026-11-04). Step 1, Reset Projects: a row per
 * project, its repository under it, and a Remove Datapack box where its pack can go; a pack whose
 * changes could not be read has no box and says it is kept. Step 2, Datapack Changes, only when a
 * removed pack is not the SC's and has changes: a new pack's name per pack, or Discard Changes. The
 * answers carry the name, trimmed, or 'drop'.
 */

import { screen, within } from '@testing-library/react';
import { openOn, PROJECTS_BATCH_OPERATION_ID, resetBatchMocks, runRequest, type PrepareEnvelope } from './ProjectsBatchModal.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';

const RESET: PrepareEnvelope = {
    success: true,
    data: {
        action: 'reset',
        rows: [
            { path: '/p/a', name: asDisplayName('A'), datapack: { name: asDisplayName('Frescopa'), changes: 'asks' } },
            { path: '/p/b', name: asDisplayName('B'), datapack: { name: asDisplayName('Mine'), changes: 'saves' } },
            { path: '/p/c', name: asDisplayName('C') },
        ],
    },
};

const runButton = () => screen.getByRole('button', { name: 'Reset 3 Projects' });

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: Reset Selected', () => {
    it('says it is reading the demo data while the read is out', async () => {
        await openOn('reset', null);

        expect(screen.getByRole('dialog', { name: /^Reset \d+ Projects?\?$/ })).toBeInTheDocument();
        expect(screen.getByText('Reading demo data')).toBeInTheDocument();
    });

    it('ticks Remove Datapack per project that has a pack, and Continues to the changes a pack needs', async () => {
        await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.getByRole('checkbox', { name: 'Uninstall Datapack, A' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Uninstall Datapack, B' })).toBeChecked();
        expect(screen.queryByRole('checkbox', { name: 'Uninstall Datapack, C' })).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('data-variant', 'accent');
    });

    it('asks each pack that needs it for a new name, empty, the run waiting; a name goes trimmed', async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await user.click(screen.getByRole('button', { name: 'Continue' }));

        expect(screen.getByRole('dialog', { name: 'Datapack Changes' })).toHaveAttribute('data-status', 'warning');
        expect(screen.getByText('Frescopa')).toBeInTheDocument();
        const field = screen.getByRole('textbox', { name: 'New datapack name, A' });
        expect(field).toHaveValue('');
        expect(runButton()).toBeDisabled();
        expect(runButton()).toHaveAttribute('data-variant', 'negative');

        await user.type(field, 'My Copy ');
        await user.click(runButton());

        expect(runRequest()).toEqual({
            action: 'reset',
            answers: [
                { path: '/p/a', removeDatapack: true, changes: { saveAs: 'My Copy' } },
                { path: '/p/b', removeDatapack: true },
                { path: '/p/c', removeDatapack: false },
            ],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
    });

    it("Discard Changes needs no name, sets the field aside, and sends 'drop'", async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await user.click(screen.getByRole('button', { name: 'Continue' }));

        await user.click(screen.getByRole('checkbox', { name: 'Discard Changes, A' }));

        expect(screen.queryByRole('textbox', { name: 'New datapack name, A' })).toBeNull();
        expect(screen.getByText('Changes discarded')).toBeInTheDocument();
        await user.click(runButton());
        expect((runRequest() as { answers: unknown[] }).answers[0]).toEqual({ path: '/p/a', removeDatapack: true, changes: 'drop' });
    });

    it('goes Back to the projects with their boxes as they were', async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await user.click(screen.getByRole('checkbox', { name: 'Uninstall Datapack, B' }));
        await user.click(screen.getByRole('button', { name: 'Continue' }));

        await user.click(screen.getByRole('button', { name: 'Back' }));

        expect(screen.getByRole('dialog', { name: /^Reset \d+ Projects?\?$/ })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Uninstall Datapack, B' })).not.toBeChecked();
    });

    it('needs no step 2 once the pack that asks is kept, and keeps what is unticked', async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        await user.click(screen.getByRole('checkbox', { name: 'Uninstall Datapack, A' }));
        await user.click(runButton());

        expect((runRequest() as { answers: Array<{ removeDatapack: boolean }> }).answers.map((a) => a.removeDatapack)).toEqual([
            false,
            true,
            false,
        ]);
    });

    // Option B (owner, 2026-11-04): a pack whose changes could not be read stays, said on its row.
    it('keeps a pack whose changes could not be read: no box, and a note on its row', async () => {
        await openOn('reset', {
            success: true,
            data: { action: 'reset', rows: [{ path: '/p/a', name: asDisplayName('A'), datapack: { name: asDisplayName('Team'), changes: 'unchecked' } }] },
        });
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.queryByRole('checkbox', { name: 'Uninstall Datapack, A' })).toBeNull();
        expect(screen.getByText("Couldn't check for changes. Datapack kept.")).toHaveClass('dialog-problem', 'text-notice');
    });

    it('refuses two packs saved under one name in the list', async () => {
        const { user } = await openOn('reset', {
            success: true,
            data: {
                action: 'reset',
                rows: [
                    { path: '/p/a', name: asDisplayName('A'), datapack: { name: asDisplayName('Team'), changes: 'asks' } },
                    { path: '/p/b', name: asDisplayName('B'), datapack: { name: asDisplayName('Team'), changes: 'asks' } },
                ],
            },
        });
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await user.click(screen.getByRole('button', { name: 'Continue' }));

        await user.type(screen.getByRole('textbox', { name: 'New datapack name, A' }), 'Mine');
        await user.type(screen.getByRole('textbox', { name: 'New datapack name, B' }), 'mine');

        expect(screen.getByText('Another datapack in this list has that name')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset 2 Projects' })).toBeDisabled();
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
        await openOn('reset', {
            success: true,
            data: { action: 'reset', rows: [{ path: '/p/a', name: asDisplayName('A'), summary: 'Starter (B2B + B2C), Edge Delivery + ACCS' }] },
        });
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.getByText('Starter (B2B + B2C), Edge Delivery + ACCS')).toHaveClass('work-row-detail');
    });

    // A storefront's repository names what the reset overwrites; it leads over the summary.
    it("draws a storefront's repository under its name, in place of its summary", async () => {
        await openOn('reset', {
            success: true,
            data: { action: 'reset', rows: [{ path: '/p/a', name: asDisplayName('A'), repository: 'skukla/a', summary: 'Starter (B2B + B2C), Edge Delivery + ACCS' }] },
        });
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.getByText('skukla/a')).toHaveClass('work-row-detail');
        expect(screen.queryByText('Starter (B2B + B2C), Edge Delivery + ACCS')).toBeNull();
    });

    it('offers no Remove Datapack when no project has a pack', async () => {
        await openOn('reset', {
            success: true,
            data: { action: 'reset', rows: [{ path: '/p/a', name: asDisplayName('A') }, { path: '/p/b', name: asDisplayName('B') }, { path: '/p/c', name: asDisplayName('C') }] },
        });
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });

        expect(screen.queryByRole('checkbox', { name: /Uninstall Datapack/ })).toBeNull();
        expect(runButton()).toBeEnabled();
    });
});
