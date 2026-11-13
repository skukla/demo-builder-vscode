/**
 * The project dashboard's Reset and Delete (step-05 S4, owner 2026-11-13, P5-Q2).
 *
 * Reset opens the projects list's one-row batch window ON the dashboard, on the dashboard's own
 * project: the same window, the same words ("Reset Kukla Luma?", "Reset", "Resetting Kukla Luma",
 * "Kukla Luma Reset"), and after the run the dashboard stays and asks for its status again.
 *
 * Delete hands over to the projects list, which opens its one-row Delete window there: the
 * dashboard closes when its project is deleted, so the window cannot live on it.
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
import { resetQuestions } from '../../../../helpers/projectsBatchFixtures';
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
        expect(screen.getByRole('dialog', { name: 'Kukla Luma Reset' })).toHaveAttribute(
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
        expect(sentTypes()).not.toContain('deleteFromProjectsList');
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
    it('hands over to the projects list, opening no window here and asking VS Code nothing', async () => {
        const user = setupUser();
        render(<Dashboard />);

        await user.click(screen.getByRole('button', { name: 'Delete Tile' }));

        expect(mockPostMessage).toHaveBeenCalledWith('deleteFromProjectsList');
        expect(sentTypes()).toEqual(['deleteFromProjectsList']);
        expect(screen.queryByRole('dialog')).toBeNull();
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
