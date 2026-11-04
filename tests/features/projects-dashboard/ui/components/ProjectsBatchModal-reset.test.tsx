/**
 * Reset Selected's window: "Reading demo data" while it reads, then one Remove Datapack (only when a
 * project has a pack) and a line per project. A pack whose changes are not the SC's own asks for a
 * name, empty to start, or Remove Without Saving, and the run waits for one; a pack that saves to
 * their library says so. The answers carry the name, trimmed, or 'drop'.
 */

import { screen } from '@testing-library/react';
import { openOn, PROJECTS_BATCH_OPERATION_ID, resetBatchMocks, runRequest, type PrepareEnvelope } from './ProjectsBatchModal.testUtils';

const RESET: PrepareEnvelope = {
    success: true,
    data: {
        action: 'reset',
        rows: [
            { path: '/p/a', name: 'A', datapack: { name: 'Frescopa', changes: 'asks' } },
            { path: '/p/b', name: 'B', datapack: { name: 'Mine', changes: 'saves' } },
            { path: '/p/c', name: 'C' },
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

        expect(screen.getByRole('dialog', { name: 'Reset Projects' })).toBeInTheDocument();
        expect(screen.getByText('Reading demo data')).toBeInTheDocument();
    });

    it('asks with Remove Datapack ticked, an empty name, and the run waiting for it', async () => {
        await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: 'Reset Projects' });

        expect(screen.getByRole('checkbox', { name: 'Remove Datapack' })).toBeChecked();
        expect(screen.getByRole('textbox', { name: 'Save Changes As' })).toHaveValue('');
        expect(screen.getByText('Saving to your library')).toBeInTheDocument();
        expect(runButton()).toBeDisabled();
        expect(runButton()).toHaveAttribute('data-variant', 'accent');
    });

    it('a blank name keeps the run waiting; a name sends it trimmed', async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: 'Reset Projects' });
        const field = screen.getByRole('textbox', { name: 'Save Changes As' });

        await user.type(field, '   ');
        expect(runButton()).toBeDisabled();

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

    it("Remove Without Saving needs no name, sets the field aside, and sends 'drop'", async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: 'Reset Projects' });

        await user.click(screen.getByRole('checkbox', { name: 'Remove Without Saving' }));

        expect(screen.getByRole('textbox', { name: 'Save Changes As' })).toBeDisabled();
        await user.click(runButton());
        expect((runRequest() as { answers: unknown[] }).answers[0]).toEqual({ path: '/p/a', removeDatapack: true, changes: 'drop' });
    });

    it('unticking Remove Datapack hides what each pack needs and keeps every pack', async () => {
        const { user } = await openOn('reset', RESET);
        await screen.findByRole('dialog', { name: 'Reset Projects' });

        await user.click(screen.getByRole('checkbox', { name: 'Remove Datapack' }));

        expect(screen.queryByRole('textbox', { name: 'Save Changes As' })).toBeNull();
        expect(screen.queryByText('Saving to your library')).toBeNull();
        await user.click(runButton());
        expect((runRequest() as { answers: Array<{ removeDatapack: boolean }> }).answers.map((a) => a.removeDatapack)).toEqual([
            false,
            false,
            false,
        ]);
    });

    it('offers no Remove Datapack when no project has a pack', async () => {
        await openOn('reset', {
            success: true,
            data: { action: 'reset', rows: [{ path: '/p/a', name: 'A' }, { path: '/p/b', name: 'B' }, { path: '/p/c', name: 'C' }] },
        });
        await screen.findByRole('dialog', { name: 'Reset Projects' });

        expect(screen.queryByRole('checkbox', { name: 'Remove Datapack' })).toBeNull();
        expect(runButton()).toBeEnabled();
    });
});
