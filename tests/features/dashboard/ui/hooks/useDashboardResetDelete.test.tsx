/**
 * The project dashboard's Reset and Delete (step-05 S4, owner 2026-11-13, P5-Q2).
 *
 * Reset opens the projects list's one-row batch window ON the dashboard, on the dashboard's own
 * project: the same window, the same words ("Reset Kukla Luma?", "Reset", "Resetting Kukla Luma",
 * "Kukla Luma Reset"), and after the run the dashboard stays and asks for its status again.
 *
 * Delete opens the same window on the dashboard too (owner, release test 2.7, 2026-11-16). The
 * dashboard stays while it is open; only once its project is actually deleted does closing the
 * window move to the projects list. Cancel, or a failed delete, leaves the SC where they started.
 *
 * Neither sends the old one-project messages, and nothing runs before the window's press.
 */

// FIRST: the batch window's harness, which registers the webview client double and the Modal stub.
import {
    mockPostMessage,
    mockRequest,
    PROJECTS_BATCH_OPERATION_ID,
    push,
    resetBatchMocks,
    setupUser,
    type PrepareEnvelope,
} from '../../../projects-dashboard/ui/components/ProjectsBatchModal.testUtils';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { deleteQuestions, resetQuestions } from '../../../../helpers/projectsBatchFixtures';
import { ProjectsBatchModal } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import { useDashboardResetDelete } from '@/features/dashboard/ui/hooks/useDashboardResetDelete';
import { asDisplayName } from '@/core/utils/projectDisplayName';

const NAME = asDisplayName('Kukla Luma');
const PATH = '/projects/kukla-luma';
const ONE_ROW = { path: PATH, name: NAME };
const QUESTIONS: PrepareEnvelope = { success: true, data: resetQuestions([ONE_ROW]) };

/** The dashboard's two buttons and the window it hosts. */
function Dashboard({ path = PATH }: { path?: string }) {
    const { batch, handleResetProject, handleDeleteProject } = useDashboardResetDelete(NAME, path);
    return (
        <>
            <button onClick={handleResetProject}>Reset Tile</button>
            <button onClick={handleDeleteProject}>Delete Tile</button>
            <ProjectsBatchModal controls={batch} />
        </>
    );
}

/** The prepare answers as given; the run never answers, it ends on the progress channel. */
function answers(prepare: PrepareEnvelope | null): void {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'prepareProjectsBatch' && prepare) return Promise.resolve(prepare);
        return new Promise(() => undefined);
    });
}

/** Every message type sent, by either channel. */
function sentTypes(): string[] {
    return [...mockRequest.mock.calls, ...mockPostMessage.mock.calls].map(
        ([type]) => type as string
    );
}

beforeEach(() => {
    resetBatchMocks();
});

describe("the dashboard's Reset", () => {
    it("opens the batch window on the dashboard's own project, by its path", async () => {
        answers(null);
        const user = setupUser();
        render(<Dashboard />);

        await user.click(screen.getByRole('button', { name: 'Reset Tile' }));

        expect(mockRequest).toHaveBeenCalledWith('prepareProjectsBatch', {
            action: 'reset',
            projectPaths: [PATH],
        });
        expect(screen.getByRole('dialog', { name: 'Reset Kukla Luma?' })).toBeInTheDocument();
    });

    it('asks by name with the red Reset button, and runs nothing before it is pressed', async () => {
        answers(QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);

        await user.click(screen.getByRole('button', { name: 'Reset Tile' }));

        // The questions, not the read wait before them, which carries the same title.
        await screen.findByRole('button', { name: 'Reset' });
        const dialog = screen.getByRole('dialog', { name: 'Reset Kukla Luma?' });
        expect(dialog).toHaveAttribute('data-status', 'warning');
        expect(screen.getByRole('button', { name: 'Reset' })).toHaveAttribute(
            'data-variant',
            'negative'
        );
        expect(mockRequest).not.toHaveBeenCalledWith('runProjectsBatch', expect.anything());
    });

    it("runs the one row, by its path, under the project's name, and ends with it first", async () => {
        answers(QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);
        await user.click(screen.getByRole('button', { name: 'Reset Tile' }));
        await user.click(await screen.findByRole('button', { name: 'Reset' }));
        await push('operationProgress', { id: PROJECTS_BATCH_OPERATION_ID, state: 'running' });

        expect(mockRequest).toHaveBeenCalledWith('runProjectsBatch', {
            action: 'reset',
            answers: [{ path: PATH, removeDatapack: false }],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
        expect(screen.getByRole('dialog', { name: 'Resetting Kukla Luma' })).toBeInTheDocument();

        await push('projectsBatchRow', { path: PATH, state: 'done' });
        await push('operationProgress', { id: PROJECTS_BATCH_OPERATION_ID, state: 'succeeded' });
        // Walk F222: the title names the project; the outcome is under the large mark.
        expect(screen.getByRole('dialog', { name: 'Kukla Luma' }).querySelector('.result-mark')).toHaveAttribute(
            'data-status',
            'success'
        );
    });

    it('after the run, closing the window keeps the dashboard and asks for its status again', async () => {
        answers(QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);
        await user.click(screen.getByRole('button', { name: 'Reset Tile' }));
        await user.click(await screen.findByRole('button', { name: 'Reset' }));
        await push('operationProgress', { id: PROJECTS_BATCH_OPERATION_ID, state: 'succeeded' });

        await user.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(mockPostMessage).toHaveBeenCalledWith('requestStatus');
        expect(mockPostMessage).not.toHaveBeenCalledWith('navigateBack');
    });

    it('cancelled at the question, it asks for nothing more', async () => {
        answers(QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);
        await user.click(screen.getByRole('button', { name: 'Reset Tile' }));
        await screen.findByRole('button', { name: 'Reset' });

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(sentTypes()).toEqual(['prepareProjectsBatch']);
    });
});

describe("the dashboard's Delete", () => {
    const DELETE_QUESTIONS: PrepareEnvelope = { success: true, data: deleteQuestions([ONE_ROW]) };

    /** The dashboard's Delete, through to the window's red Delete. */
    async function deleteThroughWindow(user: ReturnType<typeof setupUser>): Promise<void> {
        await user.click(screen.getByRole('button', { name: 'Delete Tile' }));
        await user.click(await screen.findByRole('button', { name: 'Delete' }));
        await push('operationProgress', { id: PROJECTS_BATCH_OPERATION_ID, state: 'running' });
    }

    it("opens the batch window here, on the dashboard's own project, and runs nothing before its press", async () => {
        answers(DELETE_QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);

        await user.click(screen.getByRole('button', { name: 'Delete Tile' }));

        expect(mockRequest).toHaveBeenCalledWith('prepareProjectsBatch', { action: 'delete', projectPaths: [PATH] });
        await screen.findByRole('button', { name: 'Delete' });
        expect(screen.getByRole('dialog', { name: 'Delete Kukla Luma?' })).toHaveAttribute('data-status', 'warning');
        expect(mockRequest).not.toHaveBeenCalledWith('runProjectsBatch', expect.anything());
    });

    it('cancelled at the question, it stays on the dashboard and asks for nothing more', async () => {
        answers(DELETE_QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);
        await user.click(screen.getByRole('button', { name: 'Delete Tile' }));
        await screen.findByRole('button', { name: 'Delete' });

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(sentTypes()).toEqual(['prepareProjectsBatch']);
    });

    it('once the project is deleted, closing the window moves to the projects list', async () => {
        answers(DELETE_QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);
        await deleteThroughWindow(user);

        await push('projectsBatchRow', { path: PATH, state: 'done' });
        await push('operationProgress', { id: PROJECTS_BATCH_OPERATION_ID, state: 'succeeded' });
        await user.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(mockPostMessage).toHaveBeenCalledWith('navigateBack'));
        expect(mockPostMessage).not.toHaveBeenCalledWith('requestStatus');
    });

    it('a delete that failed leaves the SC on the dashboard, which asks for its status again', async () => {
        answers(DELETE_QUESTIONS);
        const user = setupUser();
        render(<Dashboard />);
        await deleteThroughWindow(user);

        await push('projectsBatchRow', { path: PATH, state: 'failed', message: 'The folder could not be removed.' });
        await push('operationProgress', { id: PROJECTS_BATCH_OPERATION_ID, state: 'failed' });
        await user.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(mockPostMessage).toHaveBeenCalledWith('requestStatus'));
        expect(mockPostMessage).not.toHaveBeenCalledWith('navigateBack');
    });
});

describe('the old one-project messages', () => {
    it('are never sent', async () => {
        answers(null);
        const user = setupUser();
        render(<Dashboard />);

        await user.click(screen.getByRole('button', { name: 'Reset Tile' }));
        await user.click(screen.getByRole('button', { name: 'Delete Tile' }));

        expect(sentTypes()).not.toContain('resetProject');
        expect(sentTypes()).not.toContain('deleteProject');
    });
});
