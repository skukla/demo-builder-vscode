/**
 * Uninstall in the job window (step 03, S7; decisions J5-1, J5-2): the check, then "Uninstall My
 * Luma?" over what its install record lists, counted by type, with a red Uninstall and Cancel (rule
 * 20); with unsaved changes "Save Your Changes First?" next, its verb Uninstall; then the run drawn
 * as steps (Save Your Changes when saving first, then Uninstall My Luma), titled "Uninstalling My
 * Luma"; a clean end "My Luma Uninstalled", which closes itself; a stop "Couldn't Uninstall My Luma"
 * on its steps with Retry. The title names no store (the owner's J5-1; plan Q7).
 *
 * Ported from `ImportDatapackModal-removal.test.tsx`, `-decisions`, `.lifecycle` and
 * `ImportDatapackModalBody-confirm.test.tsx` for what is still true of Uninstall: the read of what
 * changed, for the pack and in its store, sent once; nothing removed before the question is
 * answered; `confirm` sent only from the press; Cancel closes, sending nothing; the save answers
 * riding on the removal; the setting saving into the SC's own datapack without asking; a save that
 * failed saying nothing was uninstalled, Back returning to the question without reading again; a
 * running removal handed to a notification named for it; the kept root's Admin step.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    answer,
    mockPostMessage,
    mockRequest,
    press,
    record,
    renderWindow,
    sends,
    sent,
    settle,
} from './DatapackJobWindow.testUtils';
import { webviewClientHandlers } from '../../../../../helpers/webviewClientMock';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type {
    DatapackRemovalChanges,
    DatapackRemovalScope,
} from '@/features/data-installer/removalChanges';
import { ErrorCode } from '@/types/errorCodes';

const LUMA = { name: 'luma', version: 'v1' };
const SCOPE: DatapackRemovalScope = {
    kinds: [
        { kind: 'categories', count: 21 },
        { kind: 'products', count: 1200 },
    ],
};
const KINDS = [
    { kind: 'products', count: 2, names: ['24-MB01', '24-MB02'] },
    { kind: 'categories', count: 1, names: ['Gear'] },
];
/** Changes in the SC's own datapack: saving goes into it. */
const CHANGED_MINE: DatapackRemovalChanges = {
    count: 3,
    kinds: KINDS,
    sentence: '3 items changed since install: 2 products, and the category Gear.',
    packName: 'My Luma',
    alwaysSave: false,
};
/** Changes in a datapack that is not the SC's: saving makes a new one, by a name. */
const CHANGED_THEIRS: DatapackRemovalChanges = { ...CHANGED_MINE, packName: undefined };
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };
/** The uninstall's job, as the extension records it. */
const UNINSTALLING = record({
    datapackName: 'luma',
    version: 'v1',
    operation: 'reset',
    purpose: 'uninstall',
});

const button = (name: string) => screen.getByRole('button', { name });
const heading = (name: string) => screen.findByRole('heading', { name });

function holding(
    changes: DatapackRemovalChanges | object,
    over: Parameters<typeof answer>[0] = {},
    never: string[] = []
) {
    answer(
        {
            scope: { success: true, data: SCOPE },
            changes: 'success' in changes ? changes : { success: true, data: changes },
            ...over,
        },
        never
    );
}

async function openUninstall(over: Parameters<typeof renderWindow>[0] = {}) {
    const view = renderWindow({
        id: LUMA,
        displayName: 'My Luma',
        source: 'library',
        uninstalling: { ownNames: ['My Luma'] },
        ...over,
    });
    await settle();
    await settle();
    await settle();
    return view;
}

beforeEach(() => mockPostMessage.mockClear());

describe('the check', () => {
    it('reads what the record lists and what changed, for the pack in its store, once, under "Uninstall My Luma"', async () => {
        holding(NOTHING, {}, ['get-datapack-removal-changes']);
        await openUninstall();

        expect(screen.getByRole('heading', { name: 'Uninstall My Luma' })).toBeInTheDocument();
        expect(screen.getAllByText('Checking for your changes').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Uninstall' })).toBeNull();
        expect(sent('get-datapack-removal-scope')).toEqual({ datapackName: 'luma', version: 'v1' });
        expect(sent('get-datapack-removal-changes')).toEqual({
            datapackName: 'luma',
            version: 'v1',
            source: 'library',
        });
        expect(sends('get-datapack-removal-changes')).toBe(1);
        expect(sends('preview-datapack-changes')).toBe(0);
        expect(sends('reset-datapack')).toBe(0);
    });

    it('Cancel during the check closes the window and nothing is sent', async () => {
        holding(NOTHING, {}, ['get-datapack-removal-changes']);
        const { onClose } = await openUninstall();

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(sends('reset-datapack')).toBe(0);
    });
});

describe('the question', () => {
    it('asks "Uninstall My Luma?" over what the record lists by type, naming no store, with a red Uninstall and Cancel', async () => {
        holding(NOTHING);
        await openUninstall();

        expect(await heading('Uninstall My Luma?')).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
        const rows = within(screen.getByRole('table'))
            .getAllByRole('row')
            .map((row) => row.textContent);
        expect(rows).toStrictEqual(['Categories21', 'Products1,200']);
        expect(button('Uninstall')).toHaveClass('modal-button-negative');
        expect(button('Cancel')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Review Records' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Dry Run' })).toBeNull();
        expect(screen.queryByText(/Permanently deletes/u)).toBeNull();
        expect(sends('reset-datapack')).toBe(0);
    });

    it('Cancel removes nothing and closes the window', async () => {
        holding(CHANGED_MINE);
        const { onClose } = await openUninstall();
        await heading('Uninstall My Luma?');

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(sends('reset-datapack')).toBe(0);
    });
});

describe('Uninstall with nothing changed', () => {
    it('removes at once, confirmed from the press alone, the record deciding what goes and where', async () => {
        holding(NOTHING, { statusAfter: UNINSTALLING });
        await openUninstall();
        await heading('Uninstall My Luma?');

        await press(button('Uninstall'));

        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).toBeNull();
        expect(sent('reset-datapack')).toStrictEqual({
            datapackName: 'luma',
            version: 'v1',
            commerceInstance: 'inst',
            source: 'library',
            confirm: true,
            changes: 'drop',
        });
        const call = mockRequest.mock.calls.find(([type]) => type === 'reset-datapack');
        expect(call?.[2]).toBe(TIMEOUTS.DATAPACK_SAVE_THEN_WRITE);
    });

    it('runs as steps, Uninstall My Luma, titled "Uninstalling My Luma", and hands over to a notification named for it', async () => {
        holding(NOTHING, { statusAfter: UNINSTALLING });
        const { onClose } = await openUninstall();
        await heading('Uninstall My Luma?');
        await press(button('Uninstall'));

        expect(await heading('Uninstalling My Luma')).toBeInTheDocument();
        const run = screen.getByTestId('import-run');
        expect(within(run).getByText('Uninstall My Luma')).toBeInTheDocument();
        expect(within(run).queryByText('Save Your Changes')).toBeNull();
        expect(within(run).queryByText(/^Install /u)).toBeNull();

        await press(button('Run in Background'));

        expect(mockPostMessage.mock.calls).toStrictEqual([
            ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Uninstalling My Luma' }],
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ends clean on "My Luma Uninstalled", which closes itself', async () => {
        holding(NOTHING, {
            statusAfter: {
                ...UNINSTALLING,
                outcome: 'success',
                perType: { categories: 'success', products: 'success' },
            },
        });
        const { onClose } = await openUninstall();
        await heading('Uninstall My Luma?');
        await press(button('Uninstall'));

        expect(await heading('My Luma Uninstalled')).toBeInTheDocument();
        expect(screen.queryByTestId('import-run')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ends a stop as "Couldn\'t Uninstall My Luma" on its steps, the reason on the row, and Retry uninstalls again', async () => {
        holding(NOTHING, {
            statusAfter: {
                ...UNINSTALLING,
                outcome: 'error',
                reason: 'Commerce refused the category Gear.',
            },
        });
        await openUninstall();
        await heading('Uninstall My Luma?');
        await press(button('Uninstall'));

        expect(await heading("Couldn't Uninstall My Luma")).toBeInTheDocument();
        expect(
            within(screen.getByTestId('import-run')).getByText(
                'Commerce refused the category Gear.'
            )
        ).toBeInTheDocument();

        await press(button('Retry'));

        const resets = mockRequest.mock.calls.filter(([type]) => type === 'reset-datapack');
        expect(resets).toHaveLength(2);
        // The record names what is left to take out: a save made first moved it there.
        expect(resets[1][1]).toMatchObject({
            datapackName: 'luma',
            version: 'v1',
            confirm: true,
            changes: 'drop',
        });
    });

    it('keeps the Admin step open when the store kept the root', async () => {
        const keptRoot = {
            store: 'Justrite Test Store',
            category: 'ZZ Root',
            restore: 'Justrite Catalog',
        };
        holding(NOTHING, { statusAfter: { ...UNINSTALLING, outcome: 'success', keptRoot } });
        const { onClose } = await openUninstall();
        await heading('Uninstall My Luma?');
        await press(button('Uninstall'));

        expect(await heading('One Step Left to Uninstall My Luma')).toBeInTheDocument();
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('shows a refused start verbatim, with Back to the question', async () => {
        holding(NOTHING, { reset: { success: false, error: 'The service said no.' } });
        await openUninstall();
        await heading('Uninstall My Luma?');
        await press(button('Uninstall'));

        expect(await heading("Couldn't Uninstall My Luma")).toBeInTheDocument();
        expect(screen.getByText('The service said no.')).toBeInTheDocument();
        await press(button('Back'));
        expect(await heading('Uninstall My Luma?')).toBeInTheDocument();
    });
});

describe('Save Your Changes First?', () => {
    async function asked(
        changes: DatapackRemovalChanges | object,
        over: Parameters<typeof answer>[0] = {},
        never: string[] = []
    ) {
        holding(changes, over, never);
        const view = await openUninstall();
        await heading('Uninstall My Luma?');
        await press(button('Uninstall'));
        return view;
    }

    it('asks with the changes counted by type, Uninstall Without Saving at the start, Cancel and Save and Uninstall at the end', async () => {
        await asked(CHANGED_MINE);

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        const rows = within(screen.getByRole('table'))
            .getAllByRole('row')
            .map((row) => row.textContent);
        expect(rows).toStrictEqual(['Products2', 'Categories1']);
        expect(button('Uninstall Without Saving').closest('.modal-footer-start')).not.toBeNull();
        expect(button('Save and Uninstall').closest('.modal-footer-start')).toBeNull();
        expect(sends('reset-datapack')).toBe(0);
    });

    it('Save and Uninstall keeps them, and the run draws Save Your Changes from the press, then Uninstall My Luma', async () => {
        await asked(CHANGED_MINE, {}, ['reset-datapack']);

        await press(button('Save and Uninstall'));

        expect(sent('reset-datapack')).toMatchObject({ confirm: true, changes: 'keep' });
        expect(sent('reset-datapack')).not.toHaveProperty('saveAs');
        expect(await heading('Uninstalling My Luma')).toBeInTheDocument();
        const run = screen.getByTestId('import-run');
        const labels = within(run)
            .getAllByText(/^(Save Your Changes|Uninstall My Luma)$/u)
            .map((el) => el.textContent);
        expect(labels).toStrictEqual(['Save Your Changes', 'Uninstall My Luma']);
        expect(within(run).getByText('Starting')).toBeInTheDocument();
    });

    it("says each stage of the save on its row, and ignores another operation's progress", async () => {
        await asked(CHANGED_MINE, {}, ['reset-datapack']);
        await press(button('Save and Uninstall'));
        const push = (id: string, stage: string) =>
            act(() => {
                webviewClientHandlers.get('operationProgress')?.({ id, state: 'running', stage });
            });

        push(DATAPACK_OPERATION_ID, 'Saving to the library');
        push('something-else', 'Deploying the mesh');

        const run = screen.getByTestId('import-run');
        expect(within(run).getByText('Saving to the library').closest('.work-row')).toHaveTextContent('Save Your Changes');
        expect(screen.queryByText('Deploying the mesh')).toBeNull();
    });

    it('once its job runs, the save step says where the changes went', async () => {
        await asked(CHANGED_MINE, { statusAfter: UNINSTALLING });

        await press(button('Save and Uninstall'));
        await settle();

        const run = screen.getByTestId('import-run');
        expect(within(run).getByText('Saved to My Luma')).toBeInTheDocument();
    });

    it('closing while it saves hands it to a notification rather than stopping it', async () => {
        const { onClose } = await asked(CHANGED_MINE, {}, ['reset-datapack']);
        await press(button('Save and Uninstall'));

        await press(button('Run in Background'));

        expect(mockPostMessage.mock.calls).toContainEqual([
            'backgroundOperation',
            { id: DATAPACK_OPERATION_ID, title: 'Uninstalling My Luma' },
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Uninstall Without Saving drops them', async () => {
        await asked(CHANGED_MINE);

        await press(button('Uninstall Without Saving'));

        expect(sent('reset-datapack')).toMatchObject({ confirm: true, changes: 'drop' });
    });

    it('Cancel removes nothing, and closes the window', async () => {
        const { onClose } = await asked(CHANGED_MINE);

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(sends('reset-datapack')).toBe(0);
    });

    it('asks after a check that failed, since nothing is known', async () => {
        await asked({ success: false, error: 'Commerce could not be read.' });

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(screen.getByText("Your changes couldn't be checked.")).toBeInTheDocument();
    });

    it('a save that failed says nothing was uninstalled, and Back returns to the question without reading again', async () => {
        await asked(CHANGED_MINE, {
            reset: {
                success: false,
                error: 'The library is not answering.',
                code: ErrorCode.CHANGES_NOT_SAVED,
            },
        });
        await press(button('Save and Uninstall'));

        expect(await heading("Couldn't Save Changes")).toBeInTheDocument();
        expect(screen.getByText('Nothing was uninstalled.')).toBeInTheDocument();
        await press(button('Back'));

        expect(await heading('Uninstall My Luma?')).toBeInTheDocument();
        expect(sends('get-datapack-removal-changes')).toBe(1);
    });
});

describe('the setting saves without asking', () => {
    it("saves into the SC's own datapack and uninstalls, asking nothing", async () => {
        holding({ ...CHANGED_MINE, alwaysSave: true });
        await openUninstall();
        await heading('Uninstall My Luma?');

        await press(button('Uninstall'));

        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).toBeNull();
        expect(sent('reset-datapack')).toMatchObject({ changes: 'keep' });
        expect(sent('reset-datapack')).not.toHaveProperty('saveAs');
    });
});

describe("a datapack that is not the SC's", () => {
    it('names the new datapack "My Luma" in the question, and saves it under that name', async () => {
        holding({ ...CHANGED_THEIRS, alwaysSave: true });
        await openUninstall({ displayName: 'Luma', uninstalling: { ownNames: [] } });
        await heading('Uninstall Luma?');
        await press(button('Uninstall'));

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Save As' })).toHaveValue('My Luma');
        fireEvent.change(screen.getByRole('textbox', { name: 'Save As' }), {
            target: { value: 'Luma for Acme' },
        });
        await press(button('Save and Uninstall'));

        expect(sent('reset-datapack')).toMatchObject({
            changes: 'keep',
            saveAs: { displayName: 'Luma for Acme' },
        });
    });
});
