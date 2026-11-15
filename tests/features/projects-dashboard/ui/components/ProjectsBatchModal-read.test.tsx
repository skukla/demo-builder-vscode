/**
 * The batch window's read (step-05 S3; rule 14, "A window never grows once on screen"): while
 * `prepare-projects-batch` reads, the wait is a small window of its own (the Steps layout's `ready`,
 * as a datapack install's check waits; owner, 2026-11-15). Once the read answers, it becomes the
 * questions' window at their height, and holds it. So
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

        // A wait with no window round it, drawn over the cards, did not read as one (owner,
        // 2026-11-15): the read waits in a small window of its own.
        it('waits for the read in a small window of its own, titled as the questions will be', async () => {
            await openOn(action, null, projects);
            act(() => {
                jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
            });

            const dialog = screen.getByRole('dialog', { name: title });
            expect(dialog).not.toHaveAttribute('data-measuring');
            expect(dialog).toHaveAttribute('data-size', 'S');
            // Today's words, from `WAIT_STAGES`.
            expect(within(dialog).getByText(wait)).toBeInTheDocument();
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

        // The run is the Progress layout's window (step-07 Win1): a new window, so it is not held at
        // the questions' height, and it holds its own from its first frame (rule 14).
        it('runs in a window of its own, holding its own height from the first frame', async () => {
            const { user } = await openOn(action, answerFor(action, count), projects);
            const questions = screen.getByRole('dialog', { name: title });
            await user.click(screen.getByRole('button', { name: button }));

            const run = screen.getByRole('dialog');
            expect(run).not.toBe(questions);
            expect(questions).not.toBeInTheDocument();
            expect(run).toHaveAttribute('data-locked', 'true');
            expect(run).not.toHaveAttribute('data-measuring');
        });

        it('says a failed read in the result, as before', async () => {
            await openOn(action, { success: false, error: 'No such project' }, projects);

            const dialog = screen.getByRole('dialog', { name: "Couldn't Read Projects" });
            expect(dialog).toHaveAttribute('data-status', 'error');
            // A result, at the Result layout's small size (it was the run's large window).
            expect(dialog).toHaveAttribute('data-size', 'S');
            expect(dialog).not.toHaveAttribute('data-measuring');
            expect(within(dialog).getByText('No such project')).toBeInTheDocument();
        });
    }
);

// One project is named, not counted (live run 6, 2026-11-15): Reset Scratch 1028 read "From each
// selected project" and "Each project returns to how it was set up." The wait's way out is Cancel,
// as the questions' is: nothing has started.
describe('ProjectsBatchModal: one project, by name', () => {
    it('names it in the wait, with Cancel, and in what a reset does', async () => {
        await openOn('reset', null, PROJECTS.slice(0, 1));
        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });
        const wait = screen.getByRole('dialog', { name: 'Reset A?' });
        expect(within(wait).getByText('From A')).toBeInTheDocument();
        expect(within(wait).queryByText('From each selected project')).toBeNull();
        expect(within(wait).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('says what a reset does to that project', async () => {
        await openOn('reset', answerFor('reset', 1), PROJECTS.slice(0, 1));

        expect(
            screen.getByText('A returns to how it was set up. Code changes are lost.')
        ).toBeInTheDocument();
    });

    it('CONTROL: several are still "each"', async () => {
        await openOn('reset', answerFor('reset', 3), PROJECTS.slice(0, 3));

        expect(
            screen.getByText('Each project returns to how it was set up. Code changes are lost.')
        ).toBeInTheDocument();
    });
});
