/**
 * A switch in the job window (step 03, S6; decisions J2-3, J8-1): the project holds another
 * datapack Demo Builder installed. The check reads the new datapack's preview and the held one's
 * changes together; "Switch to Bodea?" goes straight from its title to the type table, with a blue
 * Switch. With changes, "Save Your Changes First?" asks next: the changes counted by type, no names,
 * no box, Switch Without Saving at the start, Cancel and Save and Switch at the end. Without
 * changes, Switch starts the run, titled "Switching to Bodea". Answering the save question asks the
 * extension for the one-time tip about the setting.
 *
 * Ported from `ImportDatapackModal-replace.test.tsx` for the path that moved here: the read of the
 * held datapack in its store, the save-first answers riding on the start, the start waiting as long
 * as a save can take, the save step shown from the press, and the "Switching to" title.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    answer,
    mockPostMessage,
    press,
    record,
    renderWindow,
    sends,
    sent,
    settle,
    mockRequest,
} from './DatapackJobWindow.testUtils';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import type { ProjectDatapack } from '@/types/datapack';

const LUMA: ProjectDatapack = { name: 'luma', version: 'v1', store: 'library' };
const TARGET = {
    success: true,
    data: {
        instance: 'inst',
        projectName: 'demo-1',
        datapack: LUMA,
        installedAt: '2026-11-01T00:00:00.000Z',
        heldName: 'Luma',
    },
};
const KINDS = [
    { kind: 'products', count: 2, names: ['24-MB01', '24-MB02'] },
    { kind: 'categories', count: 1, names: ['Gear'] },
];
/** Changes in a datapack that is not the SC's: saving makes a new one, by a name. */
const CHANGED_THEIRS: DatapackRemovalChanges = {
    count: 3,
    kinds: KINDS,
    sentence: '3 items changed since install: 2 products, and the category Gear.',
    alwaysSave: false,
};
/** Changes in the SC's own datapack: saving goes into it. */
const CHANGED_MINE: DatapackRemovalChanges = { ...CHANGED_THEIRS, packName: 'My Luma' };
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };
/** The switch's job, as the extension records it. */
const SWITCHING = record({ purpose: 'switch', replaces: 'Luma' });

const TIP = 'datapack-save-question-answered';
const button = (name: string) => screen.getByRole('button', { name });
const heading = (name: string) => screen.findByRole('heading', { name });
const tipCalls = () => mockPostMessage.mock.calls.filter(([type]) => type === TIP);

function holding(
    changes: DatapackRemovalChanges | object,
    over: Parameters<typeof answer>[0] = {}
) {
    answer({
        target: TARGET,
        changes: 'success' in changes ? changes : { success: true, data: changes },
        ...over,
    });
}

async function openSwitch(ownNames: string[] = []) {
    const view = renderWindow({ switching: { ownNames } });
    // The target answers, then the held datapack's changes are read.
    await settle();
    await settle();
    await settle();
    return view;
}

beforeEach(() => mockPostMessage.mockClear());

describe('the check', () => {
    it("reads the new datapack and the held one's changes together, under the switch's title", async () => {
        answer({ target: TARGET }, ['get-datapack-removal-changes']);
        renderWindow({ switching: { ownNames: [] } });
        await settle();
        await settle();

        expect(screen.getByRole('heading', { name: 'Switch to Bodea' })).toBeInTheDocument();
        expect(screen.getAllByText('Checking for your changes').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument();
        expect(sent('preview-datapack-changes')).toEqual({
            datapackName: 'bodea',
            version: 'main',
        });
        expect(sent('get-datapack-removal-changes')).toEqual({
            datapackName: 'luma',
            version: 'v1',
            source: 'library',
        });
    });
});

describe('the summary', () => {
    it('asks "Switch to Bodea?" over the type table alone, with Review Records and a blue Switch', async () => {
        holding(NOTHING);
        await openSwitch();

        expect(await heading('Switch to Bodea?')).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
        expect(within(screen.getByRole('table')).getByText('Categories')).toBeInTheDocument();
        expect(button('Review Records')).toBeInTheDocument();
        expect(button('Switch')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Dry Run' })).not.toBeInTheDocument();
        expect(screen.queryByText(/Replaces/u)).not.toBeInTheDocument();
    });

    it('says when the changes could not be checked, and still offers Switch', async () => {
        holding({ success: false, error: 'Commerce could not be read.' });
        await openSwitch();

        expect(await heading('Switch to Bodea?')).toBeInTheDocument();
        expect(screen.getByText("Your changes couldn't be checked.")).toBeInTheDocument();
        expect(button('Switch')).toBeInTheDocument();
    });
});

describe('Switch with nothing changed', () => {
    it('starts the run at once, losing nothing, titled "Switching to Bodea"', async () => {
        holding(NOTHING, { statusAfter: SWITCHING });
        await openSwitch();

        await press(button('Switch'));

        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).toBeNull();
        expect(sent('start-datapack-import')).toMatchObject({
            datapackName: 'bodea',
            version: 'main',
            changes: 'drop',
        });
        expect(await heading('Switching to Bodea')).toBeInTheDocument();
        expect(tipCalls()).toHaveLength(0);
    });

    it('hands the run to a notification titled for the switch', async () => {
        holding(NOTHING, { statusAfter: SWITCHING });
        const { onClose } = await openSwitch();
        await press(button('Switch'));

        await press(button('Run in Background'));

        expect(mockPostMessage.mock.calls).toStrictEqual([
            ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Switching to Bodea' }],
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Walk F105: the start may save first, so it waits as long as a save can take.
    it('waits as long as a save can take for the start', async () => {
        holding(NOTHING);
        await openSwitch();

        await press(button('Switch'));

        const call = mockRequest.mock.calls.find(([type]) => type === 'start-datapack-import');
        expect(call?.[2]).toBe(TIMEOUTS.DATAPACK_SAVE_THEN_WRITE);
    });
});

describe('Switch when the setting saves without asking', () => {
    it("saves into the SC's own datapack and starts, asking nothing", async () => {
        holding({ ...CHANGED_MINE, alwaysSave: true });
        await openSwitch();

        await press(button('Switch'));

        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).toBeNull();
        expect(sent('start-datapack-import')).toMatchObject({ changes: 'keep' });
        expect(sent('start-datapack-import')).not.toHaveProperty('saveAs');
        expect(tipCalls()).toHaveLength(0);
    });

    it("still asks for a datapack that is not the SC's: a save needs a name", async () => {
        holding({ ...CHANGED_THEIRS, alwaysSave: true });
        await openSwitch();

        await press(button('Switch'));

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(sends('start-datapack-import')).toBe(0);
    });
});

describe('Save Your Changes First?', () => {
    it('counts the changes by type under the one line, with no names, no box and no name field', async () => {
        holding(CHANGED_MINE);
        await openSwitch();

        await press(button('Switch'));

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(
            screen.getByText("Your changes will be lost if you don't save them.")
        ).toBeInTheDocument();
        const rows = within(screen.getByRole('table'))
            .getAllByRole('row')
            .map((row) => row.textContent);
        expect(rows).toStrictEqual(['Products2', 'Categories1']);
        expect(screen.queryByText(/24-MB01/u)).toBeNull();
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(sends('start-datapack-import')).toBe(0);
    });

    it('puts Switch Without Saving at the start, Cancel and Save and Switch at the end, and no other close', async () => {
        holding(CHANGED_MINE);
        await openSwitch();
        await press(button('Switch'));

        expect(button('Switch Without Saving').closest('.modal-footer-start')).not.toBeNull();
        expect(button('Cancel').closest('.modal-footer-start')).toBeNull();
        expect(button('Save and Switch').closest('.modal-footer-start')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('Save and Switch keeps them, shows the save step from the press, and asks for the tip', async () => {
        holding(CHANGED_MINE);
        answer({ target: TARGET, changes: { success: true, data: CHANGED_MINE } }, [
            'start-datapack-import',
        ]);
        await openSwitch();
        await press(button('Switch'));

        await press(button('Save and Switch'));

        expect(sent('start-datapack-import')).toMatchObject({
            datapackName: 'bodea',
            changes: 'keep',
        });
        expect(sent('start-datapack-import')).not.toHaveProperty('saveAs');
        expect(await heading('Switching to Bodea')).toBeInTheDocument();
        expect(screen.getAllByText('Save Your Changes').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Starting').length).toBeGreaterThan(0);
        expect(tipCalls()).toStrictEqual([[TIP]]);
    });

    it('Switch Without Saving drops them and asks for the tip', async () => {
        holding(CHANGED_MINE);
        await openSwitch();
        await press(button('Switch'));

        await press(button('Switch Without Saving'));

        expect(sent('start-datapack-import')).toMatchObject({ changes: 'drop' });
        expect(tipCalls()).toStrictEqual([[TIP]]);
    });

    it('Cancel closes the window, starting nothing and asking for no tip', async () => {
        holding(CHANGED_MINE);
        const { onClose } = await openSwitch();
        await press(button('Switch'));

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(sends('start-datapack-import')).toBe(0);
        expect(tipCalls()).toHaveLength(0);
    });

    it('asks after a check that failed, since nothing is known', async () => {
        holding({ success: false, error: 'Commerce could not be read.' });
        await openSwitch();

        await press(button('Switch'));

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(screen.getByText("Your changes couldn't be checked.")).toBeInTheDocument();
    });
});

describe("Save Your Changes First? for a datapack that is not the SC's", () => {
    const field = () => screen.getByRole('textbox', { name: 'Save As' });

    it('names the new datapack "My Luma", and saves it under that name', async () => {
        holding(CHANGED_THEIRS);
        await openSwitch(['My Bodea']);
        await press(button('Switch'));

        expect(field()).toHaveValue('My Luma');
        await press(button('Save and Switch'));

        expect(sent('start-datapack-import')).toMatchObject({
            changes: 'keep',
            saveAs: { displayName: 'My Luma' },
        });
    });

    it('counts on past a name the SC already has', async () => {
        holding(CHANGED_THEIRS);
        await openSwitch(['My Luma']);
        await press(button('Switch'));

        expect(field()).toHaveValue('My Luma 2');
    });

    it('refuses a taken name with the problem line, and Save and Switch waits', async () => {
        holding(CHANGED_THEIRS);
        await openSwitch(['My Luma', 'Demo Copy']);
        await press(button('Switch'));

        const input = field();
        fireEvent.change(input, { target: { value: 'demo copy' } });
        await settle();

        expect(
            screen.getByText('You already have a datapack named demo copy.')
        ).toBeInTheDocument();
        expect(button('Save and Switch')).toHaveAttribute('aria-disabled', 'true');
        expect(button('Switch Without Saving')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('refuses an empty name', async () => {
        holding(CHANGED_THEIRS);
        await openSwitch();
        await press(button('Switch'));
        fireEvent.change(field(), { target: { value: '  ' } });
        await settle();

        expect(screen.getByText('Give it a name.')).toBeInTheDocument();
        expect(button('Save and Switch')).toHaveAttribute('aria-disabled', 'true');
    });
});
