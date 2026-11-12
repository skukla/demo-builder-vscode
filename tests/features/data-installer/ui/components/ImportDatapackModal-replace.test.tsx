/**
 * Importing another version over the one the demo uses, through the real modal (walk F97): the form
 * says what it replaces (walk F101) and starts with every data type ticked (F103); Import reads the
 * SC's changes to the old version first, and with changes asks "Save Your Changes First?" (F106),
 * whose buttons start the IMPORT with the answer; with none, the import starts at once. Importing what
 * the demo already uses asks nothing.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    awaitForm,
    defaultResponse,
    mockRequest,
    press,
    renderModal,
    resetModalMocks,
    settle,
} from './ImportDatapackModal.testUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import type { HandlerResponse } from '@/types/handlers';

const OLD = { name: 'bodea', version: '20261101-120000', store: 'library' as const };
const SENTENCE = '2 items changed since install: 2 products.';
/** A team pack: saving makes a new pack of the SC's, under a name they give. */
const CHANGED_TEAM: DatapackRemovalChanges = {
    count: 2,
    kinds: [{ kind: 'products', count: 2, names: ['A', 'B'] }],
    sentence: SENTENCE,
    alwaysSave: false,
};
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };
const REPLACES = "Replaces this demo's data with the main version.";

const startCalls = () =>
    mockRequest.mock.calls.filter(([type]) => type === 'start-datapack-import');
const resetCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'reset-datapack');
const readCalls = () =>
    mockRequest.mock.calls.filter(([type]) => type === 'get-datapack-removal-changes');

/** The project uses `held`, which Demo Builder installed; the read of its changes answers `read`. */
function holding(held: typeof OLD, read: DatapackRemovalChanges): void {
    mockRequest.mockImplementation(async (type: string): Promise<unknown> => {
        if (type === 'get-datapack-import-target') {
            return {
                success: true,
                data: {
                    instance: 'inst',
                    projectName: 'demo-1',
                    datapack: held,
                    installedAt: '2026-11-01T00:00:00.000Z',
                    heldName: 'Bodea',
                },
            };
        }
        if (type === 'get-datapack-removal-changes')
            return { success: true, data: read } satisfies HandlerResponse;
        if (type === 'start-datapack-import')
            return { success: true, data: { activationId: 'act-1' } } satisfies HandlerResponse;
        return defaultResponse(type);
    });
}

async function pressImport(): Promise<void> {
    renderModal({ availableTypes: ['categories'] });
    await awaitForm();
    // A one-type pack starts ticked.
    await press(screen.getByRole('button', { name: 'Install' }));
    await settle();
}

beforeEach(() => resetModalMocks());

describe('importing another version over the one the demo uses', () => {
    it('says on the form what it replaces, never naming a save by its id', async () => {
        holding(OLD, NOTHING);
        renderModal({ availableTypes: ['categories'] });
        await awaitForm();

        expect(screen.getByText(REPLACES)).toBeInTheDocument();
        expect(screen.queryByText(/20261101/u)).not.toBeInTheDocument();
    });

    // Walk F103: it opened with nothing ticked, so there was no Import to press.
    it('starts with every data type ticked, so Import can be pressed', async () => {
        holding(OLD, NOTHING);
        renderModal({ availableTypes: ['categories', 'products'] });
        await awaitForm();
        await settle();

        expect(screen.getByRole('checkbox', { name: /^Categories/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Products/ })).toBeChecked();
        expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
    });

    it('CONTROL: an import replacing nothing still starts with nothing ticked', async () => {
        holding({ ...OLD, version: 'main' }, NOTHING);
        renderModal({ availableTypes: ['categories', 'products'] });
        await awaitForm();
        await settle();

        expect(screen.getByRole('checkbox', { name: /^Categories/ })).not.toBeChecked();
    });

    it('with changes, reads them for the old version and asks first, titled for it, listing them', async () => {
        holding(OLD, CHANGED_TEAM);

        await pressImport();

        expect(readCalls()[0][1]).toEqual({
            datapackName: 'bodea',
            version: '20261101-120000',
            source: 'library',
        });
        expect(screen.getByRole('heading', { name: 'Save Your Changes First?' })).toBeInTheDocument();
        // A lead sentence, then a row per data type (walk F110).
        expect(screen.getByText('Installing replaces these changes.')).toBeInTheDocument();
        const rows = Array.from(document.querySelectorAll('.fact-list dt')).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
        expect(rows).toStrictEqual([['Products', 'A, B']]);
        expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save As New and Install' })).toBeInTheDocument();
        expect(startCalls()).toHaveLength(0);
    });

    // The button that loses the changes stands apart, at the footer's start (walk F111).
    it('puts Install Without Saving at the footer\'s start, Cancel and the save at its end', async () => {
        holding(OLD, CHANGED_TEAM);

        await pressImport();

        expect(screen.getByRole('button', { name: 'Install Without Saving' }).closest('.modal-footer-start')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Save As New and Install' }).closest('.modal-footer-start')).toBeNull();
        expect(screen.getByRole('button', { name: 'Cancel' }).closest('.modal-footer-start')).toBeNull();
    });

    // While it checks, the title names the work (walk F108), in the one check's words (F114).
    it('checks for the changes first under the import\'s title, with no question yet', async () => {
        holding(OLD, CHANGED_TEAM);
        const answer = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string) =>
            type === 'get-datapack-removal-changes' ? new Promise(() => undefined) : answer?.(type),
        );

        await pressImport();

        expect(screen.getByRole('heading', { name: 'Install Bodea' })).toBeInTheDocument();
        expect(screen.getByText('Checking for your changes')).toBeInTheDocument();
        expect(screen.queryByText("Since this demo's last save")).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).not.toBeInTheDocument();
        expect(startCalls()).toHaveLength(0);
    });

    it('Install Without Saving starts the import, losing the changes, and removes nothing on its own', async () => {
        holding(OLD, CHANGED_TEAM);
        await pressImport();

        await press(screen.getByRole('button', { name: 'Install Without Saving' }));

        expect(startCalls()[0][1]).toMatchObject({
            datapackName: 'bodea',
            version: 'main',
            changes: 'drop',
        });
        // Walk F105: the start may save first, so it waits as long as a save can take, not 30 s.
        expect(startCalls()[0][2]).toBe(TIMEOUTS.DATAPACK_SAVE_THEN_WRITE);
        expect(resetCalls()).toHaveLength(0);
    });

    // Walk F129: the save step was missing until its first stage came, 15 seconds in, and the window grew.
    it('shows Save Your Changes as the first step from the moment the save is pressed', async () => {
        // The SC's own pack: its changes save into it, with no name to give.
        holding(OLD, { ...CHANGED_TEAM, packName: 'Bodea' });
        const answer = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string) =>
            type === 'start-datapack-import' ? new Promise(() => undefined) : answer?.(type),
        );
        await pressImport();

        await press(screen.getByRole('button', { name: 'Save and Install' }));

        expect(screen.getByText('Save Your Changes')).toBeInTheDocument();
        expect(screen.getByText('Starting')).toBeInTheDocument();
    });

    it('Cancel goes back to the form, starting nothing', async () => {
        holding(OLD, CHANGED_TEAM);
        await pressImport();

        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
        expect(startCalls()).toHaveLength(0);
        expect(resetCalls()).toHaveLength(0);
    });

    it('CONTROL: with no changes, the import starts at once, asking nothing', async () => {
        holding(OLD, NOTHING);

        await pressImport();

        expect(screen.queryByRole('heading', { name: /First\?$/ })).not.toBeInTheDocument();
        expect(startCalls()[0][1]).toMatchObject({
            datapackName: 'bodea',
            version: 'main',
            changes: 'drop',
        });
    });
});

// Step 03, S2: the running title says what the start is (`jobWords`), before its record answers.
describe('the title while the install starts', () => {
    /** The start stays out, so the window holds its starting view. */
    async function startingOver(held: typeof OLD): Promise<void> {
        holding(held, NOTHING);
        const answer = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string) =>
            type === 'start-datapack-import' ? new Promise(() => undefined) : answer?.(type),
        );
        await pressImport();
    }

    it('is "Switching to" over another datapack', async () => {
        await startingOver({ ...OLD, name: 'luma' });

        expect(screen.getByRole('heading', { name: 'Switching to Bodea' })).toBeInTheDocument();
    });

    it('CONTROL: is "Installing" over another version of the same datapack', async () => {
        await startingOver(OLD);

        expect(screen.getByRole('heading', { name: 'Installing Bodea' })).toBeInTheDocument();
    });
});

describe('importing the version the demo already uses', () => {
    it('CONTROL: says nothing of replacing, reads no changes, and starts at once', async () => {
        holding({ ...OLD, version: 'main' }, CHANGED_TEAM);

        await pressImport();

        expect(screen.queryByText(REPLACES)).not.toBeInTheDocument();
        expect(readCalls()).toHaveLength(0);
        expect(startCalls()[0][1]).not.toHaveProperty('changes');
    });
});
