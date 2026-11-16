/**
 * One project's run (owner, 2026-11-15): a reset or delete of a single project shows the progress
 * window's three rows, centred, as every other single operation does (what it is doing, what on,
 * how long that usually takes, with its clock), not a list of one row. Several projects keep their
 * rows (`ProjectsBatchModal-run.test.tsx`), and so does one whose run ended with something to read.
 */

import { screen, within } from '@testing-library/react';
import {
    openOn,
    PROJECTS_BATCH_OPERATION_ID,
    push,
    resetBatchMocks,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';
import { resetQuestions } from '../../../../helpers/projectsBatchFixtures';
import { asDisplayName } from '@/core/utils/projectDisplayName';

const ID = PROJECTS_BATCH_OPERATION_ID;

function questionsFor(names: string[]): PrepareEnvelope {
    return {
        success: true,
        data: resetQuestions(
            names.map((name) => ({ path: `/p/${name.toLowerCase()}`, name: asDisplayName(name) }))
        ),
    };
}

/** The window open on the questions, the red button pressed: the run under way. */
async function running(names: string[], button: string) {
    const opened = await openOn('reset', questionsFor(names));
    await opened.user.click(await screen.findByRole('button', { name: button }));
    await push('operationProgress', { id: ID, state: 'running' });
    return opened;
}

const COPYING = {
    state: 'running' as const,
    message: 'Copying the content',
    step: '40 of 112 files',
    expectation: 'Usually under a minute',
};

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: one project running', () => {
    it('shows the three rows, centred: the step, what it is doing now, and how long it usually takes', async () => {
        await running(['A'], 'Reset');

        await push('projectsBatchRow', { path: '/p/a', ...COPYING });

        const dialog = screen.getByRole('dialog', { name: 'Resetting A' });
        expect(dialog.querySelector('.modal-wait-progress')).not.toBeNull();
        expect(within(dialog).getByText('Copying the content')).toBeInTheDocument();
        expect(within(dialog).getByText('40 of 112 files')).toBeInTheDocument();
        expect(within(dialog).getByText(/Usually under a minute/)).toBeInTheDocument();
        expect(dialog.querySelector('.work-row')).toBeNull();
    });

    it('says Starting before the first step arrives', async () => {
        await running(['A'], 'Reset');

        await push('projectsBatchRow', { path: '/p/a', state: 'waiting' });

        const dialog = screen.getByRole('dialog', { name: 'Resetting A' });
        expect(within(dialog).getByText('Starting')).toBeInTheDocument();
        expect(dialog.querySelector('.work-row')).toBeNull();
    });

    it('keeps its row when the run ends with something to read', async () => {
        await running(['A'], 'Reset');
        await push('projectsBatchRow', { path: '/p/a', ...COPYING });

        await push('projectsBatchRow', {
            path: '/p/a',
            state: 'failed',
            message: 'git clone failed',
        });
        await push('operationProgress', { id: ID, state: 'failed', error: 'git clone failed' });

        expect(screen.getByText('git clone failed')).toHaveClass('work-row-problem');
    });

    it('CONTROL: several projects keep a row each', async () => {
        await running(['A', 'B'], 'Reset 2 Projects');

        await push('projectsBatchRow', { path: '/p/a', ...COPYING });
        await push('projectsBatchRow', { path: '/p/b', state: 'waiting' });

        expect(document.querySelectorAll('.work-row')).toHaveLength(2);
        expect(document.querySelector('.modal-wait-progress')).toBeNull();
    });
});
