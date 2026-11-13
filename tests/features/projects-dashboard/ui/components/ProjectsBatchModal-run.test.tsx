/**
 * The batch window's run: a row per project in the order the extension tells them, the running
 * row saying its step, a failed row saying why, a question under the running row with its answers
 * as the buttons, the end as the title with its icon, and a close mid-run handed to a notification.
 * Every close after a run refreshes the list.
 */

import { act, screen, within } from '@testing-library/react';
import {
    mockPostMessage,
    mockRequest,
    openOn,
    PROJECTS_BATCH_OPERATION_ID,
    push,
    resetBatchMocks,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';
import type { OperationPrompt } from '@/types/webviewPayloads';
import { deleteQuestions, resetQuestions } from '../../../../helpers/projectsBatchFixtures';
import { createProjectsDashboardProject } from '../../testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';

const DELETE: PrepareEnvelope = {
    success: true,
    data: deleteQuestions([
            { path: '/p/a', name: asDisplayName('A') },
            { path: '/p/b', name: asDisplayName('B') },
            { path: '/p/c', name: asDisplayName('C') },
        ]),
};

const ID = PROJECTS_BATCH_OPERATION_ID;

/** The DA.live sign-in as the extension asks it: a heading, two steps, two fields. */
const SIGN_IN: OperationPrompt = {
    title: 'Sign In to DA.live',
    message: 'Your DA.live session has expired.',
    steps: ['Open DA.live and run the bookmarklet.', 'Paste the token it copies.'],
    actions: ['Sign In', 'Open DA.live'],
    fields: [
        { id: 'orgName', label: 'DA.live Namespace', value: 'acme' },
        { id: 'token', label: 'Token', secret: true },
    ],
};

/** The window open on the questions, then Delete pressed: the run under way. */
async function running() {
    const opened = await openOn('delete', DELETE);
    await screen.findByRole('dialog', { name: /^Delete \d+ Projects?\?$/ });
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

    // Every row two lines, so none changes height as the run goes (owner, 2026-11-04): waiting,
    // the step, Finished, or why it failed.
    it('says under each name where it stands: Waiting, its step, Finished, or why it failed', async () => {
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
        expect(within(a).getByText('Finished')).toHaveClass('work-row-detail');
        expect(within(b).getByText('The repository could not be deleted.')).toHaveClass('work-row-why');
        expect(b.querySelector('.work-row-detail')).toBeNull();
        expect(within(c).getByText('Deleting the DA.live site')).toHaveClass('work-row-detail');
    });

    // Org headings only when a batch spans several orgs (owner, 2026-11-04): one org needs none.
    it('heads each org of a reset only when there is more than one', async () => {
        const reset: PrepareEnvelope = {
            success: true,
            data: resetQuestions([
                    { path: '/p/a', name: asDisplayName('A'), org: 'Demo Org' },
                    { path: '/p/c', name: asDisplayName('C'), org: 'Demo Org' },
                    { path: '/p/b', name: asDisplayName('B'), org: 'Sandbox' },
                ]),
        };
        const opened = await openOn('reset', reset);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await opened.user.click(screen.getByRole('button', { name: 'Reset 3 Projects' }));
        await push('operationProgress', { id: ID, state: 'running' });

        const headings = Array.from(document.querySelectorAll('.projects-batch-org')).map((h) => h.textContent);
        expect(headings).toEqual(['Demo Org', 'Sandbox']);
    });

    // A project file can record no org (patch-canary-b2b, owner 2026-11-04): unknown is not a
    // second org, so one known org beside it draws no heading.
    it('draws no org heading for one known org beside a project that records none', async () => {
        const reset: PrepareEnvelope = {
            success: true,
            data: resetQuestions([{ path: '/p/a', name: asDisplayName('A') }, { path: '/p/b', name: asDisplayName('B'), org: 'Demo Org' }]),
        };
        const opened = await openOn('reset', reset);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await opened.user.click(screen.getByRole('button', { name: 'Reset 2 Projects' }));
        await push('operationProgress', { id: ID, state: 'running' });

        expect(document.querySelector('.projects-batch-org')).toBeNull();
    });

    it('heads an unrecorded org as unknown when there are two known orgs', async () => {
        const reset: PrepareEnvelope = {
            success: true,
            data: resetQuestions([{ path: '/p/a', name: asDisplayName('A'), org: 'Demo Org' }, { path: '/p/b', name: asDisplayName('B') }, { path: '/p/c', name: asDisplayName('C'), org: 'Sandbox' }]),
        };
        const opened = await openOn('reset', reset);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await opened.user.click(screen.getByRole('button', { name: 'Reset 3 Projects' }));
        await push('operationProgress', { id: ID, state: 'running' });

        const headings = Array.from(document.querySelectorAll('.projects-batch-org')).map((h) => h.textContent);
        expect(headings).toEqual(['Demo Org', 'Organization Unknown', 'Sandbox']);
    });

    it('draws no org heading when every project is in one org', async () => {
        const reset: PrepareEnvelope = {
            success: true,
            data: resetQuestions([{ path: '/p/a', name: asDisplayName('A'), org: 'Demo Org' }, { path: '/p/b', name: asDisplayName('B'), org: 'Demo Org' }]),
        };
        const opened = await openOn('reset', reset);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await opened.user.click(screen.getByRole('button', { name: 'Reset 2 Projects' }));
        await push('operationProgress', { id: ID, state: 'running' });

        expect(document.querySelector('.projects-batch-org')).toBeNull();
    });

    // How long each project has taken, as the single progress window keeps its clock (owner,
    // 2026-11-04): counting on the running row, kept on a finished one, at the row's end.
    it("counts the running row's time and keeps a finished row's", async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });
        await act(async () => {
            jest.advanceTimersByTime(65_000);
        });

        const a = () => document.querySelector('.work-row') as HTMLElement;
        expect(within(a()).getByText('1 minute, 5 seconds')).toHaveClass('work-row-time');

        await push('projectsBatchRow', { path: '/p/a', state: 'done' });
        await act(async () => {
            jest.advanceTimersByTime(30_000);
        });
        expect(within(a()).getByText('1 minute, 5 seconds')).toHaveClass('work-row-time');
    });

    it('shows no time on a row not yet started', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'waiting' });

        expect(document.querySelector('.work-row-time')).toBeNull();
    });

    it('says how long a long run took, under the rows, once it ends', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'done' });
        await push('operationProgress', { id: ID, state: 'succeeded', tookMs: 125_000 });

        expect(screen.getByText('Took 2 minutes, 5 seconds')).toHaveClass('dialog-note');
    });

    it('says Waiting under a project not yet started', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });

        const waiting = document.querySelector('.work-row[data-state="waiting"]') as HTMLElement;
        expect(within(waiting).getByText('Waiting')).toHaveClass('work-row-detail');
    });

    // A question about the project is asked under its row (the Updates run's rule, 2026-10-21).
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
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Stop It' })).toBeInTheDocument();
    });

    // The Adobe sign-in asks with buttons only, its way out among them (owner, 2026-11-04: it
    // showed Sign In alone, the Cancel dropped as though the dismiss carried it).
    it('keeps a question\'s own Cancel when the dismiss is hidden', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });
        await push('operationProgress', {
            id: ID,
            state: 'running',
            prompt: { title: 'Sign In to Adobe', message: 'Your Adobe sign-in has expired. Sign in to continue.', actions: ['Sign In', 'Cancel'] },
        });

        const dialog = screen.getByRole('dialog', { name: 'Sign In to Adobe' });
        expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Cancel', 'Sign In']);
    });

    // Resets run side by side (owner, 2026-11-04): with two rows running a question is about no one
    // row we can tell, so it is asked once, above the list, not under every running row.
    it('asks a question once, above the rows, when several are running', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });
        await push('projectsBatchRow', { path: '/p/b', state: 'running' });
        await push('operationProgress', {
            id: ID,
            state: 'running',
            prompt: { message: 'Stop the demo first?', actions: ['Stop It', 'Skip'] },
        });

        expect(screen.getAllByText('Stop the demo first?')).toHaveLength(1);
        const runningRows = Array.from(document.querySelectorAll('.work-row[data-state="running"]'));
        runningRows.forEach((row) => expect(row).not.toHaveTextContent('Stop the demo first?'));
    });

    // A sign-in is a task about no one project (owner, 2026-11-04, layout A): it takes the window.
    // The question is the run's, not the project's (owner, 2026-11-04): it names no project.
    it('a sign-in takes the window: its heading, amber, no project named, and Cancel', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });
        await push('operationProgress', { id: ID, state: 'running', prompt: SIGN_IN });

        const dialog = screen.getByRole('dialog', { name: 'Sign In to DA.live' });
        expect(dialog).toHaveAttribute('data-status', 'warning');
        expect(document.querySelector('.work-row')).toBeNull();
        expect(screen.getByRole('group', { name: 'Question' })).not.toHaveTextContent('A, project');
        const names = within(dialog).getAllByRole('button').map((button) => button.textContent);
        expect(names).toEqual(['Cancel', 'Open DA.live', 'Sign In']);
    });

    it('Cancel answers the sign-in as nothing chosen, and the window stays for the rest', async () => {
        const { user } = await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'running' });
        await push('operationProgress', { id: ID, state: 'running', prompt: SIGN_IN });

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockPostMessage).toHaveBeenCalledWith('answerOperationPrompt', { id: ID, answer: undefined, values: { orgName: 'acme', token: '' } });
        expect(mockPostMessage).not.toHaveBeenCalledWith('backgroundOperation', expect.anything());
        expect(screen.getByRole('dialog', { name: 'Sign In to DA.live' })).toBeInTheDocument();
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

    // Walk F134 (owner, 2026-11-10): every project through hands off to the small result, the
    // title alone; a run with a problem stays on its rows.
    it('hands a run where every project went through to the small result, the title alone', async () => {
        const { user, onClosed } = await running();
        for (const path of ['/p/a', '/p/b', '/p/c']) await push('projectsBatchRow', { path, state: 'done' });
        await push('operationProgress', { id: ID, state: 'succeeded', tookMs: 125_000 });

        const dialog = screen.getByRole('dialog', { name: 'Projects Deleted' });
        expect(dialog).toHaveAttribute('data-size', 'S');
        expect(dialog).not.toHaveAttribute('data-wide');
        expect(dialog).toHaveAttribute('data-status', 'success');
        expect(document.querySelector('.work-row')).toBeNull();
        expect(screen.queryByText(/^Took /u)).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: a run where a project failed stays on its rows, at its full width', async () => {
        await running();
        await push('projectsBatchRow', { path: '/p/a', state: 'done' });
        await push('projectsBatchRow', { path: '/p/b', state: 'failed', message: 'GitHub refused the delete.' });
        await push('projectsBatchRow', { path: '/p/c', state: 'done' });
        await push('operationProgress', { id: ID, state: 'succeeded', warning: '1 project not deleted.' });

        const dialog = screen.getByRole('dialog', { name: "Couldn't Delete Projects" });
        expect(dialog).toHaveAttribute('data-size', 'L');
        expect(screen.getByText('GitHub refused the delete.')).toHaveClass('work-row-why');
    });

    // A reset that finished around something (the code not published, a datapack that stayed) said
    // nothing on its row until 2026-11-13: each line is an orange note, and the run keeps its rows.
    it("a reset that finished around something keeps its rows, each warning an orange note under it", async () => {
        const reset: PrepareEnvelope = {
            success: true,
            data: resetQuestions([
                { path: '/p/a', name: asDisplayName('A') },
                { path: '/p/b', name: asDisplayName('B') },
            ]),
        };
        const opened = await openOn('reset', reset);
        await screen.findByRole('dialog', { name: /^Reset \d+ Projects?\?$/ });
        await opened.user.click(screen.getByRole('button', { name: 'Reset 2 Projects' }));
        await push('operationProgress', { id: ID, state: 'running' });
        const warnings = ['The code could not be published.', 'Its datapack was not uninstalled: Its changes could not be saved.'];
        await push('projectsBatchRow', { path: '/p/a', state: 'done', warnings });
        await push('projectsBatchRow', { path: '/p/b', state: 'done' });
        await push('operationProgress', { id: ID, state: 'succeeded' });

        const dialog = screen.getByRole('dialog', { name: 'Projects Reset' });
        expect(dialog).toHaveAttribute('data-size', 'L');
        for (const line of warnings) expect(screen.getByText(line)).toHaveClass('dialog-problem', 'text-notice');
        expect(rows()).toEqual([
            ['A', 'done'],
            ['B', 'done'],
        ]);
    });

    it('a failed row says why in red and what became of the datapack in orange; a repeated line shows twice', async () => {
        await running();
        await push('projectsBatchRow', {
            path: '/p/a',
            state: 'failed',
            message: 'git clone failed',
            warnings: ['Its datapack was uninstalled.', 'Its datapack was uninstalled.'],
        });

        expect(screen.getByText('git clone failed')).toHaveClass('work-row-why');
        const notes = screen.getAllByText('Its datapack was uninstalled.');
        expect(notes).toHaveLength(2);
        for (const note of notes) expect(note).toHaveClass('dialog-problem', 'text-notice');
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

/**
 * One project, from a card's Reset or Delete: the same window with one row, its words naming the
 * project (decisions J7-1; step-05 P5-Q1's recommendation): "Reset Kukla Luma?", the button the bare
 * verb, the run "Resetting Kukla Luma", the end "Kukla Luma Reset" (the thing first).
 */
describe('ProjectsBatchModal: one project, its words by name', () => {
    // The slug differs from the title, so a window that read the slug would fail here.
    const KUKLA = createProjectsDashboardProject({ name: 'kukla-luma', title: 'Kukla Luma', path: '/p/kukla' });
    const ONE_ROW = { path: '/p/kukla', name: asDisplayName('Kukla Luma') };
    const ONE: Record<'reset' | 'delete', PrepareEnvelope> = {
        reset: { success: true, data: resetQuestions([ONE_ROW]) },
        delete: { success: true, data: deleteQuestions([ONE_ROW]) },
    };
    const WORDS = {
        reset: { verb: 'Reset', running: 'Resetting Kukla Luma', done: 'Kukla Luma Reset', failed: "Couldn't Reset Kukla Luma" },
        delete: { verb: 'Delete', running: 'Deleting Kukla Luma', done: 'Kukla Luma Deleted', failed: "Couldn't Delete Kukla Luma" },
    } as const;

    /** The one-row window on its questions, then its red button pressed. */
    async function runningOne(action: 'reset' | 'delete') {
        const opened = await openOn(action, ONE[action], [KUKLA]);
        await opened.user.click(await screen.findByRole('button', { name: WORDS[action].verb }));
        await push('operationProgress', { id: ID, state: 'running' });
        return opened;
    }

    describe.each(['reset', 'delete'] as const)('%s', (action) => {
        const words = WORDS[action];

        it('titles the read wait by the project\'s name', async () => {
            await openOn(action, null, [KUKLA]);

            expect(screen.getByRole('dialog', { name: `${words.verb} Kukla Luma?` })).toBeInTheDocument();
        });

        it('asks by name, the red button the bare verb, and nothing runs before it is pressed', async () => {
            await openOn(action, ONE[action], [KUKLA]);

            const dialog = await screen.findByRole('dialog', { name: `${words.verb} Kukla Luma?` });
            expect(dialog).toHaveAttribute('data-status', 'warning');
            expect(screen.getByRole('button', { name: words.verb })).toHaveAttribute('data-variant', 'negative');
            expect(screen.queryByRole('button', { name: /1 Project/u })).toBeNull();
            expect(mockRequest).not.toHaveBeenCalledWith('runProjectsBatch', expect.anything());
        });

        it('runs under the project\'s name', async () => {
            await runningOne(action);

            expect(screen.getByRole('dialog', { name: words.running })).toBeInTheDocument();
            expect(mockRequest).toHaveBeenCalledWith('runProjectsBatch', expect.objectContaining({ action }));
        });

        it('ends with the project first, then what happened to it', async () => {
            await runningOne(action);
            await push('projectsBatchRow', { path: '/p/kukla', state: 'done' });
            await push('operationProgress', { id: ID, state: 'succeeded' });

            expect(screen.getByRole('dialog', { name: words.done })).toHaveAttribute('data-status', 'success');
        });

        it('a run that did not go through says which project it could not', async () => {
            await runningOne(action);
            await push('operationProgress', { id: ID, state: 'failed', error: 'GitHub refused.' });

            expect(screen.getByRole('dialog', { name: words.failed })).toHaveAttribute('data-status', 'error');
        });

        it('closing mid-run hands it to a notification under the same name', async () => {
            const { user } = await runningOne(action);

            await user.click(screen.getByRole('button', { name: 'Run in Background' }));

            expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', { id: ID, title: words.running });
        });
    });
});
