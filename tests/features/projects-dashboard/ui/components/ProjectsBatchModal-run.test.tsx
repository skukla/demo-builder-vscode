/**
 * The batch window's run: a row per project in the order the extension tells them, the running
 * row saying its step, a failed row saying why, a question under the running row with its answers
 * as the buttons, the end as the title with its icon, and a close mid-run handed to a notification.
 * Every close after a run refreshes the list.
 */

import { screen, within } from '@testing-library/react';
import {
    mockPostMessage,
    openOn,
    PROJECTS_BATCH_OPERATION_ID,
    push,
    resetBatchMocks,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';

const DELETE: PrepareEnvelope = {
    success: true,
    data: {
        action: 'delete',
        rows: [
            { path: '/p/a', name: 'A' },
            { path: '/p/b', name: 'B' },
            { path: '/p/c', name: 'C' },
        ],
    },
};

const ID = PROJECTS_BATCH_OPERATION_ID;

/** The window open on the questions, then Delete pressed: the run under way. */
async function running() {
    const opened = await openOn('delete', DELETE);
    await screen.findByRole('dialog', { name: 'Delete Projects' });
    await opened.user.click(screen.getByRole('button', { name: 'Delete 3 Projects' }));
    await push('operationProgress', { id: ID, state: 'running' });
    return opened;
}

/** Each row's name and state, top to bottom. */
function rows(): Array<[string, string | null]> {
    return Array.from(document.querySelectorAll('.work-row')).map((row) => [
        row.querySelector('.checkbox-row-label')?.textContent ?? '',
        row.getAttribute('data-state'),
    ]);
}

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: the run', () => {
    it('lists the rows in the order the extension tells them, all waiting first', async () => {
        await running();

        for (const path of ['/p/c', '/p/a', '/p/b']) await push('projectsBatchRow', { path, state: 'waiting' });

        expect(rows()).toEqual([
            ['C', 'waiting'],
            ['A', 'waiting'],
            ['B', 'waiting'],
        ]);
    });

    it("the running row says its step; a failed row says why under its name; a done row says nothing", async () => {
        await running();
        for (const path of ['/p/a', '/p/b', '/p/c']) await push('projectsBatchRow', { path, state: 'waiting' });

        await push('projectsBatchRow', { path: '/p/a', state: 'done' });
        await push('projectsBatchRow', { path: '/p/b', state: 'failed', message: 'The repository could not be deleted.' });
        await push('projectsBatchRow', { path: '/p/c', state: 'running', message: 'Deleting the DA.live site' });

        expect(rows()).toEqual([
            ['A', 'done'],
            ['B', 'failed'],
            ['C', 'running'],
        ]);
        const [a, b, c] = Array.from(document.querySelectorAll('.work-row')) as HTMLElement[];
        expect(a.querySelector('.checkbox-row-detail')).toBeNull();
        expect(within(b).getByText('The repository could not be deleted.')).toHaveClass('work-row-why');
        expect(within(c).getByText('Deleting the DA.live site')).toHaveClass('checkbox-row-detail');
    });

    it('asks a question under the running row, its answers the only buttons', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });
        await push('operationProgress', {
            id: ID,
            state: 'running',
            prompt: { message: 'Stop the demo first?', actions: ['Stop It', 'Skip'] },
        });

        const runningRow = document.querySelector('.work-row[data-state="running"]') as HTMLElement;
        expect(within(runningRow).getByText('Stop the demo first?')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run in Background' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Stop It' })).toBeInTheDocument();
    });

    it('ends as its title says, with its icon, and Close refreshes the list', async () => {
        const { user, onClosed } = await running();
        await push('operationProgress', { id: ID, state: 'succeeded' });

        const dialog = screen.getByRole('dialog', { name: 'Projects Deleted' });
        expect(dialog).toHaveAttribute('data-status', 'success');
        await user.click(screen.getByRole('button', { name: 'Close' }));

        expect(onClosed).toHaveBeenCalledTimes(1);
        expect(mockPostMessage).not.toHaveBeenCalledWith('backgroundOperation', expect.anything());
    });

    it('a run some projects did not finish ends on the warning', async () => {
        await running();
        await push('operationProgress', { id: ID, state: 'succeeded', warning: '1 project not deleted.' });

        expect(screen.getByRole('dialog', { name: "Couldn't Delete Projects" })).toHaveAttribute('data-status', 'warning');
    });

    it('a failed run says why above the rows and offers the logs', async () => {
        await running();
        await push('operationProgress', { id: ID, state: 'failed', error: 'Projects are already being reset or deleted.' });

        expect(screen.getByRole('dialog', { name: "Couldn't Delete Projects" })).toHaveAttribute('data-status', 'error');
        expect(screen.getByText('Projects are already being reset or deleted.')).toHaveClass('work-row-why');
        expect(screen.getByRole('button', { name: 'Open Debug Logs' })).toBeInTheDocument();
    });

    it('closing mid-run hands it to a notification under its title, and refreshes the list', async () => {
        const { user, onClosed } = await running();

        await user.click(screen.getByRole('button', { name: 'Run in Background' }));

        expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', { id: ID, title: 'Deleting Projects' });
        expect(onClosed).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
