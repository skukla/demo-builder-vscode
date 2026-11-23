/**
 * One project's questions (owner, 2026-11-17, walk F213): the title names the project, so the body
 * draws no table of one row repeating it. Reset says the repository in its sentence; Delete names
 * the online name once and its boxes say where each thing lives, a box keeping a name under it only
 * where that name differs (a datapack, a site named apart from its repository); "Save Your Changes
 * First?" drops the project line under the pack. Several projects keep their tables
 * (`ProjectsBatchModal-delete` / `-reset`).
 */

import { screen } from '@testing-library/react';
import {
    openOn,
    PROJECTS_BATCH_OPERATION_ID,
    resetBatchMocks,
    runRequest,
    type PrepareEnvelope,
} from './ProjectsBatchModal.testUtils';
import { deleteQuestions, resetQuestions } from '../../../../helpers/projectsBatchFixtures';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { BatchDeleteRow, BatchResetRow } from '@/types/projectsBatch';

const NAME = asDisplayName('Scratch B');
const REPO = 'me/scratch-b';

const resetOf = (row: Partial<BatchResetRow>): PrepareEnvelope => ({
    success: true,
    data: resetQuestions([{ path: '/p/b', name: NAME, ...row }]),
});
const deleteOf = (row: Partial<BatchDeleteRow>): PrepareEnvelope => ({
    success: true,
    data: deleteQuestions([{ path: '/p/b', name: NAME, ...row }]),
});

beforeEach(() => {
    resetBatchMocks();
});

describe('ProjectsBatchModal: one project to reset', () => {
    it('says the repository in its sentence and draws no table repeating the project', async () => {
        await openOn(
            'reset',
            resetOf({ repository: REPO, summary: 'Starter, Edge Delivery + ACCS' })
        );
        const dialog = await screen.findByRole('dialog', { name: 'Reset Scratch B?' });

        expect(
            screen.getByText(
                `Scratch B returns to how it was set up. Code changes in ${REPO} are lost.`
            )
        ).toBeInTheDocument();
        expect(dialog.querySelector('table')).toBeNull();
        expect(screen.queryByText('Starter, Edge Delivery + ACCS')).toBeNull();
        expect(screen.queryByText('Scratch B')).toBeNull();
    });

    it('keeps the plain sentence for a project with no repository', async () => {
        await openOn('reset', resetOf({}));
        await screen.findByRole('dialog', { name: 'Reset Scratch B?' });

        expect(
            screen.getByText('Scratch B returns to how it was set up. Code changes are lost.')
        ).toBeInTheDocument();
    });

    it("offers its datapack as one box beside the pack's name, and sends what it says", async () => {
        const { user } = await openOn(
            'reset',
            resetOf({ repository: REPO, datapack: { name: 'Frescopa' } })
        );
        await screen.findByRole('dialog', { name: 'Reset Scratch B?' });
        const box = screen.getByRole('checkbox', { name: /Uninstall Datapack/ });

        expect(box.closest('label')).toHaveTextContent('Uninstall DatapackFrescopa');
        expect(box).toBeChecked();
        await user.click(box);
        await user.click(screen.getByRole('button', { name: 'Reset' }));

        expect(runRequest()).toEqual({
            action: 'reset',
            answers: [{ path: '/p/b', removeDatapack: false }],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
    });

    it('says a pack whose changes could not be read is kept, with no box', async () => {
        await openOn('reset', resetOf({ datapack: { name: 'Frescopa', changes: 'unchecked' } }));
        await screen.findByRole('dialog', { name: 'Reset Scratch B?' });

        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.getByText("Couldn't check for changes. Datapack kept.")).toBeInTheDocument();
    });
});

describe('ProjectsBatchModal: one project to delete', () => {
    const BOTH = { repo: { name: REPO, ticked: false }, site: { name: REPO, ticked: false } };

    it('names the online name once, and the boxes say where each thing lives', async () => {
        await openOn('delete', deleteOf(BOTH));
        const dialog = await screen.findByRole('dialog', { name: 'Delete Scratch B?' });

        expect(
            screen.getByText(
                `Project files are removed from this machine. You can also delete ${REPO} online.`
            )
        ).toBeInTheDocument();
        expect(dialog.querySelector('table')).toBeNull();
        expect(
            screen.getByRole('checkbox', { name: 'Delete GitHub Repository' })
        ).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Delete DA.live Site' })).not.toBeChecked();
        expect(screen.getAllByText(new RegExp(REPO))).toHaveLength(1);
    });

    it('keeps a name under a box only where it differs from the one in the sentence', async () => {
        await openOn(
            'delete',
            deleteOf({
                ...BOTH,
                site: { name: 'org/other', ticked: false },
                datapack: { name: 'Frescopa' },
            })
        );
        await screen.findByRole('dialog', { name: 'Delete Scratch B?' });

        expect(
            screen.getByRole('checkbox', { name: 'Delete GitHub Repository' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: /Delete DA.live Site/ }).closest('label')
        ).toHaveTextContent('org/other');
        expect(
            screen.getByRole('checkbox', { name: /Uninstall Datapack/ }).closest('label')
        ).toHaveTextContent('Frescopa');
        expect(
            screen.getByText(/Datapacks stay installed in Commerce unless you uninstall them\.$/)
        ).toBeInTheDocument();
    });

    it('sends what the boxes say', async () => {
        const { user } = await openOn('delete', deleteOf(BOTH));
        await screen.findByRole('dialog', { name: 'Delete Scratch B?' });

        await user.click(screen.getByRole('checkbox', { name: 'Delete GitHub Repository' }));
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        expect(runRequest()).toEqual({
            action: 'delete',
            answers: [
                {
                    path: '/p/b',
                    deleteGitHubRepo: true,
                    deleteDaLiveSite: false,
                    removeDatapackData: false,
                },
            ],
            id: PROJECTS_BATCH_OPERATION_ID,
            progress: 'modal',
        });
    });

    it('says only the files go for a project with nothing online', async () => {
        await openOn('delete', deleteOf({}));
        await screen.findByRole('dialog', { name: 'Delete Scratch B?' });

        expect(
            screen.getByText('Project files are removed from this machine.')
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).toBeNull();
    });
});

describe('ProjectsBatchModal: one project, Save Your Changes First?', () => {
    it('names the pack without the project under it', async () => {
        const { user } = await openOn(
            'reset',
            resetOf({ datapack: { name: 'Frescopa', changes: 'asks' } })
        );
        await screen.findByRole('dialog', { name: 'Reset Scratch B?' });

        await user.click(screen.getByRole('button', { name: 'Reset' }));

        const window = await screen.findByRole('dialog', { name: 'Save Your Changes First?' });
        expect(window).toHaveTextContent('Frescopa');
        expect(window.querySelector('.work-row-detail')).toBeNull();
    });
});
