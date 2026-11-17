/**
 * How the batch window's run ends (rule 17; step-07 follow-up): a run where every project went
 * through ends on the small result, its title alone. Every ending waits for Close (owner,
 * 2026-11-17, walk F195), and closing refreshes the list.
 */

import { act, screen, within } from '@testing-library/react';
import {
    openOn,
    PROJECTS_BATCH_OPERATION_ID,
    push,
    resetBatchMocks,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';
import { deleteQuestions } from '../../../../helpers/projectsBatchFixtures';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const ID = PROJECTS_BATCH_OPERATION_ID;
const DELETE: PrepareEnvelope = {
    success: true,
    data: deleteQuestions([
        { path: '/p/a', name: asDisplayName('A') },
        { path: '/p/b', name: asDisplayName('B') },
    ]),
};

async function running() {
    const opened = await openOn('delete', DELETE);
    await opened.user.click(await screen.findByRole('button', { name: 'Delete 2 Projects' }));
    await push('operationProgress', { id: ID, state: 'running' });
    return opened;
}

async function glance(): Promise<void> {
    await act(async () => {
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
    });
}

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: how the run ends', () => {
    it('keeps the small clean result until Close, which refreshes the list (walk F195)', async () => {
        const { onClosed, user } = await running();
        for (const path of ['/p/a', '/p/b']) await push('projectsBatchRow', { path, state: 'done' });
        await push('operationProgress', { id: ID, state: 'succeeded' });
        expect(screen.getByRole('dialog', { name: 'Projects Deleted' })).toHaveAttribute('data-size', 'S');

        await glance();

        expect(onClosed).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: keeps a run with a line to read open', async () => {
        const { onClosed } = await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'done', message: 'Saved to My Luma.' });
        await push('projectsBatchRow', { path: '/p/b', state: 'done' });
        await push('operationProgress', { id: ID, state: 'succeeded' });

        await glance();
        await glance();

        expect(onClosed).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Projects Deleted' })).toBeInTheDocument();
    });
});

/** Each row's lines under its name: the second-line slot and anything after it. */
function linesUnder(row: Element): string[] {
    const text = row.querySelector('.work-row-text') as HTMLElement;
    return Array.from(text.children)
        .filter((child) => !child.classList.contains('checkbox-row-label') && !child.classList.contains('work-row-time'))
        .map((child) => child.className);
}

describe('ProjectsBatchModal: what a row ends with takes its working line', () => {
    const rowOf = (name: string): HTMLElement =>
        Array.from(document.querySelectorAll('.work-row')).find(
            (row) => row.querySelector('.checkbox-row-label')?.textContent === name,
        ) as HTMLElement;

    it('CONTROL: a waiting row has its one second line', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'waiting' });

        expect(linesUnder(rowOf('A'))).toEqual(['work-row-detail']);
    });

    it('says where the changes were saved in place of Finished', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'done', message: 'Saved to My Luma.' });

        const a = rowOf('A');
        expect(linesUnder(a)).toEqual(['work-row-detail']);
        expect(within(a).getByText('Saved to My Luma.')).toHaveClass('work-row-detail');
        expect(within(a).queryByText('Finished')).toBeNull();
    });

    it('draws what a finished project went around as one orange line, the whole on hover', async () => {
        await running();
        const warnings = ['The code could not be published.', 'Its datapack was not uninstalled.'];
        await push('projectsBatchRow', { path: '/p/a', state: 'done', warnings });

        const a = rowOf('A');
        expect(linesUnder(a)).toEqual(['dialog-problem text-notice work-row-problem']);
        const line = a.querySelector('.work-row-problem') as HTMLElement;
        expect(line).toHaveTextContent('The code could not be published. Its datapack was not uninstalled.');
        expect(line).toHaveAttribute('title', 'The code could not be published. Its datapack was not uninstalled.');
    });

    it('draws a failed project\'s reason as one red line, what became of its datapack after it', async () => {
        await running();
        await push('projectsBatchRow', {
            path: '/p/a',
            state: 'failed',
            message: 'git clone failed',
            warnings: ['Its datapack was uninstalled.'],
        });

        const a = rowOf('A');
        expect(linesUnder(a)).toEqual(['dialog-problem text-negative work-row-problem']);
        expect(a.querySelector('.work-row-problem')).toHaveTextContent('git clone failed Its datapack was uninstalled.');
    });

    // Owner walk, 2026-11-16: once the run has ended, a reason shows whole; while it goes, one line.
    it('shows a failed project\'s reason whole once the run has ended', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'failed', message: 'git clone failed' });
        expect(rowOf('A').querySelector('.work-row-problem')).not.toHaveClass('work-row-problem--whole');

        await push('projectsBatchRow', { path: '/p/b', state: 'done' });
        await push('operationProgress', { id: ID, state: 'failed', error: 'git clone failed' });

        expect(rowOf('A').querySelector('.work-row-problem')).toHaveClass('work-row-problem--whole');
    });

    // "Took 2 minutes" arrives at the end of a long run: its line is held while the run goes, as the
    // shared foot holds it (`RunFoot`'s held line, walk F116).
    it('holds the Took line\'s room under the rows while the run goes', async () => {
        await running();

        const foot = document.querySelector('.projects-batch-took');
        expect(foot).not.toBeNull();
        expect(foot?.querySelector('.dialog-note')).not.toBeNull();
    });
});
