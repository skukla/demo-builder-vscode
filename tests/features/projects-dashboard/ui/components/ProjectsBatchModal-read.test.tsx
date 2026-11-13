/**
 * The batch window's read (step-05 S3; rule 14, "A window never grows once on screen"): while
 * `prepare-projects-batch` reads, the questions' window is drawn but unseen and only its wait shows,
 * where it will open (the Steps layout's `ready`, as a datapack install's check waits). Once the
 * read answers, the window is seen for the first time, at the questions' height, and holds it. So
 * Reset 3 Projects no longer opens at the wait's height and grows to the questions' (319px to
 * 446px, decisions Open, 2026-11-12). The run that follows is a window of its own, at its own size.
 *
 * jsdom has no layout, so the height itself is a visual check; this pins the structure that keeps
 * it: unseen (`measuring`) while reading, held (`lockHeight`) from the moment it is seen.
 */

import { act, screen, within } from '@testing-library/react';
import {
    openOn,
    resetBatchMocks,
    PROJECTS,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';
import { deleteQuestions, resetQuestions } from '../../../../helpers/projectsBatchFixtures';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import type { ProjectsBatchAction } from '@/types/projectsBatch';

const NAMES = ['A', 'B', 'C'];

/** The read's answer for these projects: questions with no boxes ticked, so the button runs at once. */
function answerFor(action: ProjectsBatchAction, count: number): PrepareEnvelope {
    const rows = NAMES.slice(0, count).map((name) => ({
        path: `/p/${name.toLowerCase()}`,
        name: asDisplayName(name),
    }));
    return {
        success: true,
        data: action === 'reset' ? resetQuestions(rows) : deleteQuestions(rows),
    };
}

const CASES: Array<{
    action: ProjectsBatchAction;
    count: number;
    title: string;
    wait: string;
    button: string;
}> = [
    {
        action: 'reset',
        count: 3,
        title: 'Reset 3 Projects?',
        wait: 'Reading demo data',
        button: 'Reset 3 Projects',
    },
    { action: 'reset', count: 1, title: 'Reset A?', wait: 'Reading demo data', button: 'Reset' },
    {
        action: 'delete',
        count: 3,
        title: 'Delete 3 Projects?',
        wait: 'Reading projects',
        button: 'Delete 3 Projects',
    },
    { action: 'delete', count: 1, title: 'Delete A?', wait: 'Reading projects', button: 'Delete' },
];

beforeEach(() => {
    resetBatchMocks();
});

describe.each(CASES)(
    'ProjectsBatchModal: the read before $title',
    ({ action, count, title, wait, button }) => {
        const projects = PROJECTS.slice(0, count);

        it('keeps the window unseen while the read is out, showing only the wait where it will open', async () => {
            await openOn(action, null, projects);
            act(() => {
                jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
            });

            const dialog = screen.getByRole('dialog', { name: title });
            expect(dialog).toHaveAttribute('data-measuring', 'true');
            expect(dialog).not.toHaveAttribute('data-locked');
            // The wait the SC sees while the window is unseen: today's words, from `WAIT_STAGES`.
            const shown = within(dialog)
                .getAllByRole('status')
                .find((status) => status.classList.contains('modal-steps-pending'));
            expect(shown).toBeDefined();
            expect(within(shown as HTMLElement).getByText(wait)).toBeInTheDocument();
            // A wait shows nothing else (modal-waits).
            expect(within(dialog).queryByRole('checkbox')).toBeNull();
            expect(within(dialog).queryByRole('button', { name: button })).toBeNull();
        });

        it('is first seen once the read has answered, with the questions, and holds that height', async () => {
            await openOn(action, answerFor(action, count), projects);

            const dialog = screen.getByRole('dialog', { name: title });
            expect(dialog).not.toHaveAttribute('data-measuring');
            expect(dialog).toHaveAttribute('data-locked', 'true');
            expect(within(dialog).queryByText(wait)).toBeNull();
            expect(within(dialog).getByRole('button', { name: button })).toBeInTheDocument();
        });

        it('runs in a window of its own, not held at the height of the questions', async () => {
            const { user } = await openOn(action, answerFor(action, count), projects);
            await user.click(screen.getByRole('button', { name: button }));

            const run = screen.getByRole('dialog');
            expect(run).not.toHaveAttribute('data-locked');
            expect(run).not.toHaveAttribute('data-measuring');
        });

        it('says a failed read in the result, as before', async () => {
            await openOn(action, { success: false, error: 'No such project' }, projects);

            const dialog = screen.getByRole('dialog', { name: "Couldn't Read Projects" });
            expect(dialog).toHaveAttribute('data-status', 'error');
            expect(dialog).not.toHaveAttribute('data-measuring');
            expect(within(dialog).getByText('No such project')).toBeInTheDocument();
        });
    }
);
