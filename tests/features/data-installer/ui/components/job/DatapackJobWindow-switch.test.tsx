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
import { ErrorCode } from '@/types/errorCodes';

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
        // No answer about changes (C3 review): the host reads them again, so none made since is dropped unasked.
        expect(sent('start-datapack-import')).not.toHaveProperty('changes');
        expect(sent('start-datapack-import')).toMatchObject({
            datapackName: 'bodea',
            version: 'main',
        });
        expect(await heading('Switching to Bodea')).toBeInTheDocument();
        expect(tipCalls()).toHaveLength(0);
    });

    // C3 re-review: sent with no answer, the host found changes made since in a pack not the SC's.
    it('asks "Save Your Changes First?" over the changes read again when the host refuses for an answer, and sends the answer given', async () => {
        holding(NOTHING);
        await openSwitch();
        const refusal = { success: false, error: 'You changed 3 things since it was installed.', code: ErrorCode.CHANGES_NEED_ANSWER };
        holding(CHANGED_THEIRS, { start: refusal });

        await press(button('Switch'));
        await settle();

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(sends('get-datapack-removal-changes')).toBe(1);
        await press(button('Switch Without Saving'));
        const starts = mockRequest.mock.calls.filter(([type]) => type === 'start-datapack-import').map(([, body]) => body as Record<string, unknown>);
        expect(starts[0]).not.toHaveProperty('changes');
        expect(starts[1]).toMatchObject({ changes: 'drop' });
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

/**
 * Another version of the datapack the project holds (step 03, S7): the switch's flow, check,
 * question, save question and a run that uninstalls first, in Install's words: "Install Bodea,
 * eds-compatible?", Install, "Installing Bodea, eds-compatible" (never walked; the plan parks it as
 * Q11). Ported from `ImportDatapackModal-replace.test.tsx`: the old version's changes read in its
 * store, the save answers riding on the start, the save step from the press, a save never named by
 * its id.
 */
describe('another version of the held datapack', () => {
    const BODEA_MAIN: ProjectDatapack = { name: 'bodea', version: 'main', store: 'library' };
    const HOLDS_MAIN = {
        success: true,
        data: { ...TARGET.data, datapack: BODEA_MAIN, heldName: 'Bodea' },
    };
    const VERSIONING = record({ version: 'eds-compatible', replaces: 'Bodea, main', replacesVersion: 'main' });

    function holdingMain(changes: DatapackRemovalChanges, over: Parameters<typeof answer>[0] = {}, never: string[] = []) {
        answer({ target: HOLDS_MAIN, changes: { success: true, data: changes }, ...over }, never);
    }

    async function openVersion(version = 'eds-compatible') {
        const view = renderWindow({
            id: { name: 'bodea', version },
            switching: { ownNames: [], verb: 'Install' },
        });
        await settle();
        await settle();
        await settle();
        return view;
    }

    it("reads the held version's changes in its store, then asks in Install's words with a blue Install", async () => {
        holdingMain(NOTHING);
        await openVersion();

        expect(await heading('Install Bodea, eds-compatible?')).toBeInTheDocument();
        expect(sent('get-datapack-removal-changes')).toEqual({ datapackName: 'bodea', version: 'main', source: 'library' });
        expect(button('Install')).toHaveClass('modal-button-primary');
        expect(button('Review Records')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Switch' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Dry Run' })).toBeNull();
    });

    it('never names a save by its id', async () => {
        holdingMain(NOTHING);
        await openVersion('20261112-090000');

        expect(await heading('Install Bodea?')).toBeInTheDocument();
        expect(screen.queryByText(/20261112/u)).toBeNull();
    });

    it('with nothing changed, starts at once, titled "Installing Bodea, eds-compatible", and hands over under it', async () => {
        holdingMain(NOTHING, { statusAfter: VERSIONING });
        const { onClose } = await openVersion();
        await heading('Install Bodea, eds-compatible?');

        await press(button('Install'));

        expect(sent('start-datapack-import')).toMatchObject({ datapackName: 'bodea', version: 'eds-compatible' });
        expect(sent('start-datapack-import')).not.toHaveProperty('changes');
        expect(await heading('Installing Bodea, eds-compatible')).toBeInTheDocument();
        await press(button('Run in Background'));
        expect(mockPostMessage.mock.calls).toStrictEqual([
            ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Installing Bodea, eds-compatible' }],
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('with changes asks "Save Your Changes First?" in Install\'s words, the losing choice apart at the start', async () => {
        holdingMain(CHANGED_MINE);
        await openVersion();
        await heading('Install Bodea, eds-compatible?');

        await press(button('Install'));

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(button('Install Without Saving').closest('.modal-footer-start')).not.toBeNull();
        expect(button('Save and Install').closest('.modal-footer-start')).toBeNull();
        expect(sends('start-datapack-import')).toBe(0);
    });

    it('Install Without Saving starts the install, losing them, waiting as long as a save can take', async () => {
        holdingMain(CHANGED_MINE);
        await openVersion();
        await heading('Install Bodea, eds-compatible?');
        await press(button('Install'));

        await press(button('Install Without Saving'));

        const call = mockRequest.mock.calls.find(([type]) => type === 'start-datapack-import');
        expect(call?.[1]).toMatchObject({ version: 'eds-compatible', changes: 'drop' });
        expect(call?.[2]).toBe(TIMEOUTS.DATAPACK_SAVE_THEN_WRITE);
        expect(sends('reset-datapack')).toBe(0);
    });

    it('Save and Install draws Save Your Changes from the press', async () => {
        holdingMain(CHANGED_MINE, {}, ['start-datapack-import']);
        await openVersion();
        await heading('Install Bodea, eds-compatible?');
        await press(button('Install'));

        await press(button('Save and Install'));

        expect(sent('start-datapack-import')).toMatchObject({ changes: 'keep' });
        expect(await heading('Installing Bodea, eds-compatible')).toBeInTheDocument();
        expect(screen.getAllByText('Save Your Changes').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Starting').length).toBeGreaterThan(0);
    });
});
