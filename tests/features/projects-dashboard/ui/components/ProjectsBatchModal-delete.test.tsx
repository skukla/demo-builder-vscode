/**
 * Delete Selected's window: it reads the projects first, then asks with a table offering only the
 * boxes each project has, each column's header its Select All (all, some, none), and sends one
 * answer per project from what is ticked. A refusal from the read is said in the window.
 *
 * Uninstall Datapack (walk F96): unticked, beside the pack's name, a note instead of a box where
 * the changes could not be read, and Reset Selected's "Save Your Changes First?" for a ticked pack
 * with changes, its verb Delete (step-05 S1, J7-3).
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
import { deleteQuestions } from '../../../../helpers/projectsBatchFixtures';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { BatchDeleteRow, BatchSaveNames } from '@/types/projectsBatch';

const prepared = (rows: BatchDeleteRow[], save: Partial<BatchSaveNames> = {}): PrepareEnvelope => ({ success: true, data: deleteQuestions(rows, save) });

const DELETE = prepared([
    { path: '/p/a', name: asDisplayName('A'), repo: { name: 'me/a', ticked: true }, site: { name: 'org/a', ticked: true } },
    { path: '/p/b', name: asDisplayName('B'), repo: { name: 'me/b', ticked: false } },
    { path: '/p/c', name: asDisplayName('C') },
]);

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
        const one = prepared([{ path: '/p/a', name: asDisplayName('A'), repo: { name: 'me/a', ticked: false } }]);
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

const DATA_ROWS: BatchDeleteRow[] = [
    { path: '/p/a', name: asDisplayName('A'), datapack: { name: 'Frescopa', changes: 'asks' } },
    { path: '/p/b', name: asDisplayName('B'), datapack: { name: 'My Bodea', changes: 'saves' } },
    { path: '/p/c', name: asDisplayName('C'), datapack: { name: 'Unread', changes: 'unchecked' } },
];

const WITH_DATA = prepared(DATA_ROWS, { ownNames: ['My Bodea'] });

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

    it("asks before removing the SC's own pack's data, and Save and Delete saves into it, sending nothing", async () => {
        const { user } = await openOn('delete', WITH_DATA);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        await user.click(box('Uninstall Datapack, B'));

        await user.click(screen.getByRole('button', { name: 'Delete 3 Projects' }));
        expect(screen.getByRole('dialog', { name: 'Save Your Changes First?' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Save As, B' })).toHaveValue('My Bodea');
        const window = screen.getByRole('dialog', { name: 'Save Your Changes First?' });
        expect(within(window).getAllByRole('button').map((b) => b.textContent)).toStrictEqual(['Delete Without Saving', 'Cancel', 'Save and Delete']);
        await user.click(screen.getByRole('button', { name: 'Save and Delete' }));

        expect(runRequest()).toMatchObject({
            answers: [
                { path: '/p/a', removeDatapackData: false },
                { path: '/p/b', removeDatapackData: true },
                { path: '/p/c', removeDatapackData: false },
            ],
        });
        expect((runRequest() as { answers: object[] }).answers[1]).not.toHaveProperty('changes');
    });

    it("removes the SC's own pack's data with no question when the setting saves it", async () => {
        const { user } = await openOn('delete', prepared(DATA_ROWS, { ownNames: ['My Bodea'], alwaysSave: true }));
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        await user.click(box('Uninstall Datapack, B'));

        await user.click(screen.getByRole('button', { name: 'Delete 3 Projects' }));

        expect(screen.queryByRole('dialog', { name: 'Save Your Changes First?' })).toBeNull();
        expect((runRequest() as { answers: object[] }).answers[1]).toStrictEqual({
            path: '/p/b',
            deleteGitHubRepo: false,
            deleteDaLiveSite: false,
            removeDatapackData: true,
        });
    });

    it("saves a pack that is not the SC's under the name given, or drops it with Delete Without Saving", async () => {
        const { user } = await openOn('delete', WITH_DATA);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        await user.click(box('Uninstall Datapack, A'));
        await user.click(screen.getByRole('button', { name: 'Delete 3 Projects' }));

        const field = screen.getByRole('textbox', { name: 'Save As, A' });
        expect(field).toHaveValue('My Frescopa');
        await user.clear(field);
        await user.type(field, 'Frescopa Copy');
        await user.click(screen.getByRole('button', { name: 'Save and Delete' }));

        expect(runRequest()).toMatchObject({
            answers: [
                { path: '/p/a', removeDatapackData: true, changes: { saveAs: 'Frescopa Copy' } },
                { path: '/p/b', removeDatapackData: false },
                { path: '/p/c', removeDatapackData: false },
            ],
        });
    });

    it("Delete Without Saving sends 'drop' for every pack whose data goes", async () => {
        const { user } = await openOn('delete', WITH_DATA);
        await screen.findByRole('dialog', { name: 'Delete 3 Projects?' });
        await user.click(box('Uninstall Datapack'));
        await user.click(screen.getByRole('button', { name: 'Delete 3 Projects' }));

        await user.click(screen.getByRole('button', { name: 'Delete Without Saving' }));

        expect(runRequest()).toMatchObject({
            answers: [
                { path: '/p/a', removeDatapackData: true, changes: 'drop' },
                { path: '/p/b', removeDatapackData: true, changes: 'drop' },
                { path: '/p/c', removeDatapackData: false },
            ],
        });
        expect((runRequest() as { answers: object[] }).answers[2]).not.toHaveProperty('changes');
    });
});
