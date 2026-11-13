/**
 * Restore in the job window (step 03, S8; decisions J4-2 to J4-4). The flyout's "Restore My Luma"
 * opens the window on its check, titled "Restore My Luma" with the "Checking for your changes" wait,
 * which sends `restore-datapack` without `confirm` (it writes nothing unless nothing of the SC's
 * would be lost). Then:
 * - up to date: the small result "My Luma Is Up to Date", which closes itself;
 * - unsaved edits: "Restore My Luma?" (Cancel / Restore, blue), and Restore sends it confirmed;
 * - started (a newer save alone, or once confirmed): the run "Restoring My Luma", ending "My Luma
 *   Restored";
 * - refused: its own words, with Close.
 *
 * Ported from `DatapackCatalogView-restore.test.tsx`, where the flyout ran the check, waited and
 * asked: the check sent once without confirm, the question's words and buttons, Restore sending it
 * confirmed, Cancel sending nothing more, a newer save running with no question, a refusal opening
 * no run.
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
import { ErrorCode } from '@/types/errorCodes';

const ASKS =
    'Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.';
const EDITS = {
    success: false,
    code: ErrorCode.CHANGES_NEED_ANSWER,
    error: `${ASKS} Send confirm:true to proceed.`,
    data: { asks: true, displayName: 'My Luma' },
};
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
        expect(screen.getAllByText('Checking for your changes').length).toBeGreaterThan(0);
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

it('up to date: says so in the small result, which closes itself, and starts nothing', async () => {
    answer({ restore: { success: true, data: { upToDate: true, displayName: 'My Luma' } } });
    const { onClose } = await openRestore();

    expect(await heading('My Luma Is Up to Date')).toBeInTheDocument();
    expect(screen.queryByTestId('import-run')).toBeNull();
    expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
    await act(async () => {
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
});

describe('unsaved edits', () => {
    it('asks "Restore My Luma?" with Cancel and a blue Restore, and Restore sends it confirmed and runs', async () => {
        answer({ restore: EDITS, statusAfter: RESTORING });
        await openRestore();

        expect(await heading('Restore My Luma?')).toBeInTheDocument();
        expect(screen.getByText(ASKS)).toBeInTheDocument();
        expect(button('Cancel')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Save/u })).toBeNull();
        await press(button('Restore'));
        await settle();

        expect(restoreSends()).toEqual([
            { datapackName: 'my-luma' },
            { datapackName: 'my-luma', confirm: true },
        ]);
        expect(await heading('Restoring My Luma')).toBeInTheDocument();
        expect(button('Run in Background')).toBeInTheDocument();
    });

    it('Cancel closes the window, sending nothing more and opening no run', async () => {
        answer({ restore: EDITS });
        const { onClose } = await openRestore();
        await heading('Restore My Luma?');

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
        expect(screen.queryByRole('button', { name: 'Run in Background' })).toBeNull();
    });
});

describe('a newer save alone', () => {
    it('runs from the check with no question, titled "Restoring My Luma"', async () => {
        answer({ statusAfter: RESTORING });
        await openRestore();

        expect(await heading('Restoring My Luma')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Restore My Luma?' })).toBeNull();
        expect(screen.getByTestId('import-run')).toBeInTheDocument();
        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
    });

    it('ends clean on "My Luma Restored", which closes itself', async () => {
        answer({
            statusAfter: {
                ...RESTORING,
                outcome: 'success',
                perType: { categories: 'success', products: 'success' },
            },
        });
        const { onClose } = await openRestore();

        expect(await heading('My Luma Restored')).toBeInTheDocument();
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Run in Background hands the running restore to a notification named for it', async () => {
        answer({ statusAfter: RESTORING });
        const { onClose } = await openRestore();
        await heading('Restoring My Luma');

        await press(button('Run in Background'));

        expect(mockPostMessage.mock.calls).toStrictEqual([
            ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Restoring My Luma' }],
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
