/**
 * Delete Selected's window: it reads the projects first, then asks with a table offering only the
 * boxes each project has, each column's header its Select All (all, some, none), and sends one
 * answer per project from what is ticked. A refusal from the read is said in the window.
 *
 * Uninstall Datapack (walk F96): unticked, beside the pack's name, a note instead of a box where
 * the changes could not be read, and Reset Selected's step 2 for a ticked pack that is not the SC's.
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
        const dialog = await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        expect(dialog).toHaveAttribute('data-status', 'warning');
        // Extra-wide, so three columns of names fit on one line (owner, 2026-11-05).
        expect(dialog).toHaveAttribute('data-wide', 'true');
        expect(screen.queryByText('Reading projects')).toBeNull();
    });

    it('shows the wait while the read is out', async () => {
        await openOn('delete', null);

        expect(screen.getByRole('dialog', { name: /^Delete \d+ Projects?\?$/ })).toBeInTheDocument();
        expect(screen.getByText('Reading projects')).toBeInTheDocument();
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
        await screen.findByRole('dialog', { name: /^Delete \d+ Projects?\?$/ });

        expect(box('Delete Repository, A')).toBeChecked();
        expect(box('Delete DA.live Site, A')).toBeChecked();
        expect(box('Delete Repository, B')).not.toBeChecked();
        expect(screen.queryByRole('checkbox', { name: 'Delete DA.live Site, B' })).toBeNull();
        const rowC = screen.getByText('C').closest('tr') as HTMLElement;
        expect(within(rowC).queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.queryByText('Uninstall Datapack')).toBeNull();
    });

    // What goes whatever is ticked, then each box beside what it deletes (owner, 2026-11-05).
    it('says the files go, names each project alone, and names what each box deletes beside it', async () => {
        await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });

        expect(screen.getByText('Project files are removed from this machine.')).toBeInTheDocument();
        expect(screen.getByText('Project')).toBeInTheDocument();
        expect(within(box('Delete Repository, A').closest('td') as HTMLElement).getByText('me/a')).toBeInTheDocument();
        expect(within(box('Delete DA.live Site, A').closest('td') as HTMLElement).getByText('org/a')).toBeInTheDocument();
        const nameCell = screen.getByText('A').closest('th') as HTMLElement;
        expect(nameCell).toHaveTextContent(/^A$/);
        // A long list scrolls under its header with the Updates window's fade (owner, 2026-11-05).
        expect(nameCell.closest('.batch-delete')).toHaveClass('scroll-fade');
    });

    it('asks for one project, in the same words', async () => {
        const one: PrepareEnvelope = {
            success: true,
            data: { action: 'delete', rows: [{ path: '/p/a', name: asDisplayName('A'), repo: { name: 'me/a', ticked: false } }] },
        };
        await openOn('delete', one);

        expect(await screen.findByRole('dialog', { name: 'Delete 1 Project?' })).toBeInTheDocument();
        expect(screen.getByText('Project files are removed from this machine.')).toBeInTheDocument();
    });

    it("a column's header shows some, ticks all, then ticks none, over only the rows that have it", async () => {
        const { user } = await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: /^Delete \d+ Projects?\?$/ });
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
        await screen.findByRole('dialog', { name: /^Delete \d+ Projects?\?$/ });
        await user.click(box('Delete DA.live Site, A'));
        await user.click(box('Delete Repository, B'));
        const run = screen.getByRole('button', { name: 'Delete 3 Projects' });

        expect(run).toHaveAttribute('data-variant', 'negative');
        await user.click(run);

        expect(runRequest()).toEqual({
            action: 'delete',
            answers: [
                { path: '/p/a', deleteGitHubRepo: true, deleteDaLiveSite: false, removeDatapackData: false },
                { path: '/p/b', deleteGitHubRepo: true, deleteDaLiveSite: false, removeDatapackData: false },
                { path: '/p/c', deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: false },
            ],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
        expect(await screen.findByRole('dialog', { name: 'Deleting Projects' })).toBeInTheDocument();
    });

    it('Cancel closes the window and runs nothing', async () => {
        const { user, onClosed } = await openOn('delete', DELETE);
        await screen.findByRole('dialog', { name: /^Delete \d+ Projects?\?$/ });

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

const WITH_DATA: PrepareEnvelope = {
    success: true,
    data: {
        action: 'delete',
        rows: [
            { path: '/p/a', name: asDisplayName('A'), datapack: { name: 'Frescopa', changes: 'asks' } },
            { path: '/p/b', name: asDisplayName('B'), datapack: { name: 'My Bodea', changes: 'saves' } },
            { path: '/p/c', name: asDisplayName('C'), datapack: { name: 'Unread', changes: 'unchecked' } },
        ],
    },
};

describe('ProjectsBatchModal: Delete Selected, Uninstall Datapack', () => {
    it("offers each pack's data unticked, says it stays unless removed, and keeps one whose changes were not read", async () => {
        await openOn('delete', WITH_DATA);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });

        expect(
            screen.getByText("Project files are removed from this machine. Datapacks stay installed in Commerce unless you uninstall them."),
        ).toBeInTheDocument();
        expect(box('Uninstall Datapack, A')).not.toBeChecked();
        expect(within(box('Uninstall Datapack, A').closest('td') as HTMLElement).getByText('Frescopa')).toBeInTheDocument();
        const rowC = screen.getByText('C').closest('tr') as HTMLElement;
        expect(within(rowC).queryAllByRole('checkbox')).toHaveLength(0);
        expect(within(rowC).getByText("Couldn't check for changes. Datapack kept.")).toBeInTheDocument();
    });

    it("removes the SC's own pack's data with no second step", async () => {
        const { user } = await openOn('delete', WITH_DATA);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        await user.click(box('Uninstall Datapack, B'));

        await user.click(screen.getByRole('button', { name: 'Delete 3 Projects' }));

        expect(runRequest()).toMatchObject({
            answers: [
                { path: '/p/a', removeDatapackData: false },
                { path: '/p/b', removeDatapackData: true },
                { path: '/p/c', removeDatapackData: false },
            ],
        });
    });

    it("Continues to Datapack Changes for a pack that is not the SC's, and sends the name given", async () => {
        const { user } = await openOn('delete', WITH_DATA);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        await user.click(box('Uninstall Datapack, A'));

        await user.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByRole('dialog', { name: 'Datapack Changes' })).toBeInTheDocument();
        const run = screen.getByRole('button', { name: 'Delete 3 Projects' });
        expect(run).toBeDisabled();
        await user.type(screen.getByRole('textbox', { name: 'New datapack name, A' }), 'My Frescopa');
        await user.click(run);

        expect(runRequest()).toMatchObject({
            answers: [
                { path: '/p/a', removeDatapackData: true, changes: { saveAs: 'My Frescopa' } },
                { path: '/p/b', removeDatapackData: false },
                { path: '/p/c', removeDatapackData: false },
            ],
        });
    });
});
