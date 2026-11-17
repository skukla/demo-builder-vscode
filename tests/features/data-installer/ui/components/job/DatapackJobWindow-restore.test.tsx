/**
 * Restore in the job window (step 03, S8; step-07 U1, J9-5 to J9-7, as the walked prototype draws
 * it). The flyout's "Restore My Luma" opens the window on its check, titled "Restore My Luma" with the
 * "Preparing to restore" wait, which sends `restore-datapack` without `confirm` (it starts
 * nothing). Then:
 * - up to date: the small result "My Luma Is Up to Date", which waits for Close;
 * - the question, "Restore Luma?" / "Restore My Luma?", Cancel and a blue Restore: one line for a
 *   Demo Builder datapack ("as it ships") or the SC's own with nothing unsaved (its original); the
 *   Last Saved / Original choice over unsaved edits, where Original asks "Save Your Changes First?";
 * - started (once confirmed): the run "Restoring My Luma", ending "My Luma Restored";
 * - refused: its own words, with Close.
 */

import { act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    answer,
    mockPostMessage,
    mockRequest,
    press,
    record,
    renderWindow,
    sends,
    settle,
} from './DatapackJobWindow.testUtils';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { versionLabel } from '@/features/data-installer/packVersions';
import { ErrorCode } from '@/types/errorCodes';
import type { RestoreDatapackResult } from '@/types/webviewRequests';

const LAST_SAVED = '20261110-090000';
const ORIGINAL = '20261103-144000';
const asked = (data: RestoreDatapackResult) => ({ success: true, data });
/** A Demo Builder datapack: one point, as it ships. */
const AS_SHIPS = asked({ asks: true, displayName: 'My Luma' });
/** The SC's own, nothing unsaved: its original alone. */
const OWN_CLEAN = asked({ asks: true, displayName: 'My Luma', own: { original: ORIGINAL } });
/** The SC's own with unsaved edits: Last Saved and Original, and the edits by type. */
const OWN_EDITS = asked({
    asks: true,
    displayName: 'My Luma',
    own: { lastSaved: LAST_SAVED, original: ORIGINAL },
    changes: [{ kind: 'products', count: 3 }],
});
/** The restore's job, as the extension records it. */
const RESTORING = record({ datapackName: 'my-luma', version: 'v2', purpose: 'restore' });

const button = (name: string) => screen.getByRole('button', { name });
const heading = (name: string) => screen.findByRole('heading', { name });
const restoreSends = () =>
    mockRequest.mock.calls.filter(([type]) => type === 'restore-datapack').map(([, body]) => body);

async function openRestore() {
    const view = renderWindow({
        id: { name: 'my-luma', version: 'v1' },
        displayName: 'My Luma',
        source: 'library',
        restoring: true,
    });
    await settle();
    await settle();
    await settle();
    return view;
}

beforeEach(() => mockPostMessage.mockClear());

describe('the check', () => {
    it('waits under "Restore My Luma", sending restore-datapack once without confirm and reading nothing else', async () => {
        answer({}, ['restore-datapack']);
        await openRestore();

        expect(screen.getByRole('heading', { name: 'Restore My Luma' })).toBeInTheDocument();
        expect(screen.getAllByText('Preparing to restore').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
        expect(sends('preview-datapack-changes')).toBe(0);
        expect(sends('start-datapack-import')).toBe(0);
    });

    it('Cancel during the check closes the window, sending nothing more', async () => {
        answer({}, ['restore-datapack']);
        const { onClose } = await openRestore();

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(restoreSends()).toHaveLength(1);
    });
});

it('up to date: says so in the small result, which waits for Close, and starts nothing', async () => {
    answer({ restore: asked({ upToDate: true, displayName: 'My Luma' }) });
    const { onClose } = await openRestore();

    expect(await heading('My Luma Is Up to Date')).toBeInTheDocument();
    expect(screen.queryByTestId('import-run')).toBeNull();
    expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
    // Walk F195 (owner, 2026-11-17): every result waits for Close.
    await act(async () => {
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
    });
    expect(onClose).not.toHaveBeenCalled();
    await press(button('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
});

describe('the question', () => {
    // J9-5: a Demo Builder datapack has one point; no save offer, whatever was edited.
    it('a Demo Builder datapack: one line, Cancel and a blue Restore, which sends it confirmed and runs', async () => {
        answer({ restore: AS_SHIPS, statusAfter: RESTORING });
        await openRestore();

        expect(await heading('Restore My Luma?')).toBeInTheDocument();
        expect(screen.getByText('Commerce goes back to My Luma as it ships.')).toBeInTheDocument();
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.queryByRole('button', { name: /Save/u })).toBeNull();
        await press(button('Restore'));
        await settle();

        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }, { datapackName: 'my-luma', confirm: true }]);
        expect(await heading('Restoring My Luma')).toBeInTheDocument();
        expect(button('Run in Background')).toBeInTheDocument();
    });

    // J9-6: nothing unsaved, so the original is the only point.
    it("the SC's own with nothing unsaved: one line naming the original, and Restore sends it there", async () => {
        answer({ restore: OWN_CLEAN, statusAfter: RESTORING });
        await openRestore();

        expect(await screen.findByText(`Commerce goes back to My Luma's original from ${versionLabel(ORIGINAL)}.`)).toBeInTheDocument();
        await press(button('Restore'));
        await settle();

        expect(restoreSends()[1]).toEqual({ datapackName: 'my-luma', confirm: true, to: 'original' });
    });

    // J9-7: two points over unsaved edits, Last Saved picked first; it goes straight to the run.
    it('over unsaved edits: Last Saved and Original, Last Saved picked, and Restore runs to it with no save question', async () => {
        answer({ restore: OWN_EDITS, statusAfter: RESTORING });
        await openRestore();

        const lastSaved = await screen.findByRole('radio', { name: `Last Saved, ${versionLabel(LAST_SAVED)}` });
        expect(lastSaved).toBeChecked();
        expect(screen.getByRole('radio', { name: `Original, ${versionLabel(ORIGINAL)}` })).not.toBeChecked();
        await press(button('Restore'));
        await settle();

        expect(restoreSends()[1]).toEqual({ datapackName: 'my-luma', confirm: true, to: 'lastSaved' });
        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).toBeNull();
    });

    it('Original over unsaved edits asks "Save Your Changes First?", and Save and Restore saves first', async () => {
        answer({ restore: OWN_EDITS, statusAfter: RESTORING });
        await openRestore();

        await press(await screen.findByRole('radio', { name: `Original, ${versionLabel(ORIGINAL)}` }));
        await press(button('Restore'));

        expect(await heading('Save Your Changes First?')).toBeInTheDocument();
        expect(button('Restore Without Saving')).toBeInTheDocument();
        expect(button('Cancel')).toBeInTheDocument();
        expect(screen.getByRole('table', { name: 'Your changes by type of data' })).toHaveTextContent('Products3');
        await press(button('Save and Restore'));
        await settle();

        expect(restoreSends()[1]).toEqual({ datapackName: 'my-luma', confirm: true, to: 'original', changes: 'keep' });
    });

    it('Restore Without Saving goes to the original, losing the edits', async () => {
        answer({ restore: OWN_EDITS, statusAfter: RESTORING });
        await openRestore();

        await press(await screen.findByRole('radio', { name: `Original, ${versionLabel(ORIGINAL)}` }));
        await press(button('Restore'));
        await press(await screen.findByRole('button', { name: 'Restore Without Saving' }));
        await settle();

        expect(restoreSends()[1]).toEqual({ datapackName: 'my-luma', confirm: true, to: 'original', changes: 'drop' });
    });

    it('Cancel closes the window, sending nothing more and opening no run', async () => {
        answer({ restore: AS_SHIPS });
        const { onClose } = await openRestore();
        await heading('Restore My Luma?');

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
        expect(screen.queryByRole('button', { name: 'Run in Background' })).toBeNull();
    });
});

describe('the run', () => {
    it('ends clean on "My Luma Restored", which waits for Close', async () => {
        answer({
            restore: AS_SHIPS,
            statusAfter: { ...RESTORING, outcome: 'success', perType: { categories: 'success', products: 'success' } },
        });
        const { onClose } = await openRestore();
        await heading('Restore My Luma?');
        await press(button('Restore'));

        expect(await heading('My Luma Restored')).toBeInTheDocument();
        // Walk F195 (owner, 2026-11-17): every result waits for Close.
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        });
        expect(onClose).not.toHaveBeenCalled();
        await press(button('Close'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Run in Background hands the running restore to a notification named for it', async () => {
        answer({ restore: AS_SHIPS, statusAfter: RESTORING });
        const { onClose } = await openRestore();
        await heading('Restore My Luma?');
        await press(button('Restore'));
        await heading('Restoring My Luma');

        await press(button('Run in Background'));

        expect(mockPostMessage.mock.calls).toStrictEqual([
            [
                'backgroundOperation',
                {
                    id: DATAPACK_OPERATION_ID,
                    title: 'Restoring My Luma',
                    doneTitle: 'My Luma Restored',
                    failedTitle: "Couldn't Restore My Luma",
                },
            ],
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

it('a refusal shows its own words with Close, and opens no run', async () => {
    answer({
        restore: {
            success: false,
            error: 'Demo Builder has no record of installing this datapack.',
            code: ErrorCode.INVALID_OPERATION,
        },
    });
    const { onClose } = await openRestore();

    expect(await heading("Couldn't Restore My Luma")).toBeInTheDocument();
    expect(screen.getByText(/no record of installing this datapack/u)).toBeInTheDocument();
    expect(screen.queryByTestId('import-run')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await press(button('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
});
