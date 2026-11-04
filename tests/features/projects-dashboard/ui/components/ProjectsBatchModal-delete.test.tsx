/**
 * Delete Selected's window: it reads the projects first, then asks with a table offering only the
 * boxes each project has, each column's header its Select All (all, some, none), and sends one
 * answer per project from what is ticked. A refusal from the read is said in the window.
 */

import { act, screen, within } from '@testing-library/react';
import {
    openOn,
    PROJECTS_BATCH_OPERATION_ID,
    mockRequest,
    resetBatchMocks,
    runRequest,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';

const DELETE: PrepareEnvelope = {
    success: true,
    data: {
        action: 'delete',
        rows: [
            { path: '/p/a', name: asDisplayName('A'), repo: { name: asDisplayName('me/a'), ticked: true }, site: { name: asDisplayName('org/a'), ticked: true } },
            { path: '/p/b', name: asDisplayName('B'), repo: { name: asDisplayName('me/b'), ticked: false } },
            { path: '/p/c', name: asDisplayName('C') },
        ],
    },
};

const box = (name: string) => screen.getByRole('checkbox', { name });

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: Delete Selected', () => {
    it('reads the projects picked, saying so, then asks under the kind of window, the count on its button', async () => {
        await openOn('delete', DELETE);

        expect(mockRequest).toHaveBeenCalledWith('prepareProjectsBatch', { action: 'delete', projectPaths: ['/p/a', '/p/b', '/p/c'] });
        // A dangerous confirm carries the amber icon (dialog design rules).
        expect(await screen.findByRole('dialog', { name: 'Delete Projects' })).toHaveAttribute('data-status', 'warning');
        expect(screen.queryByText('Reading Projects')).toBeNull();
    });

    it('shows the wait while the read is out', async () => {
        await openOn('delete', null);

        expect(screen.getByRole('dialog', { name: 'Delete Projects' })).toBeInTheDocument();
        expect(screen.getByText('Reading Projects')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete 3 Projects' })).toBeNull();
    });

    it('a read answered after the window closed opens nothing', async () => {
        let answer: (envelope: PrepareEnvelope) => void = () => undefined;
        const { user } = await openOn('delete', null);
        mockRequest.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
        await user.click(screen.getByRole('button', { name: 'Close' }));
        await user.click(screen.getByRole('button', { name: 'Open Window' }));
        await user.click(screen.getByRole('button', { name: 'Close' }));

        await act(async () => answer(DELETE));

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('offers a box only where the project has the resource, and no column nobody has', async () => {
        await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: 'Delete Projects' });

        expect(box('Delete Repository, A')).toBeChecked();
        expect(box('Delete DA.live Site, A')).toBeChecked();
        expect(box('Delete Repository, B')).not.toBeChecked();
        expect(screen.queryByRole('checkbox', { name: 'Delete DA.live Site, B' })).toBeNull();
        const rowC = screen.getByText('C').closest('tr') as HTMLElement;
        expect(within(rowC).queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.queryByText('Delete Datapack')).toBeNull();
    });

    it("a column's header shows some, ticks all, then ticks none, over only the rows that have it", async () => {
        const { user } = await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: 'Delete Projects' });
        const header = box('Delete Repository');

        expect(header).toHaveAttribute('aria-checked', 'mixed');
        expect(box('Delete DA.live Site')).toBeChecked();

        await user.click(header);
        expect(box('Delete Repository, A')).toBeChecked();
        expect(box('Delete Repository, B')).toBeChecked();
        expect(box('Delete Repository')).toBeChecked();

        await user.click(box('Delete Repository'));
        expect(box('Delete Repository, A')).not.toBeChecked();
        expect(box('Delete Repository, B')).not.toBeChecked();
        expect(box('Delete Repository')).not.toHaveAttribute('aria-checked', 'mixed');
    });

    it('sends one answer per project from the boxes, on the red button naming the count', async () => {
        const { user } = await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: 'Delete Projects' });
        await user.click(box('Delete DA.live Site, A'));
        await user.click(box('Delete Repository, B'));
        const run = screen.getByRole('button', { name: 'Delete 3 Projects' });

        expect(run).toHaveAttribute('data-variant', 'negative');
        await user.click(run);

        expect(runRequest()).toEqual({
            action: 'delete',
            answers: [
                { path: '/p/a', deleteGitHubRepo: true, deleteDaLiveSite: false, deleteDatapack: false },
                { path: '/p/b', deleteGitHubRepo: true, deleteDaLiveSite: false, deleteDatapack: false },
                { path: '/p/c', deleteGitHubRepo: false, deleteDaLiveSite: false, deleteDatapack: false },
            ],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
        expect(await screen.findByRole('dialog', { name: 'Deleting Projects' })).toBeInTheDocument();
    });

    it('Cancel closes the window and runs nothing', async () => {
        const { user, onClosed } = await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: 'Delete Projects' });

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(runRequest()).toBeUndefined();
        expect(onClosed).not.toHaveBeenCalled();
    });

    it('says a refusal from the read in the window, under its own title', async () => {
        await openOn('delete', { success: false, error: 'Select at least one project.' });

        const dialog = await screen.findByRole('dialog', { name: "Couldn't Read Projects" });
        expect(dialog).toHaveAttribute('data-status', 'error');
        expect(within(dialog).getByText('Select at least one project.')).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /Delete/ })).toBeNull();
    });
});
