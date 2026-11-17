/**
 * Update in the job window (step-07 U1, J9-2 to J9-4, as the walked prototype draws it). The flyout's
 * "Update Luma" opens the window on its check, titled "Update Luma" with the check's wait, which sends
 * `update-datapack` without `confirm`. Then:
 * - nothing left: the small result "Luma Is Up to Date", which waits for Close;
 * - what changed: the house type table with a tick on each type and Select All, Review Records (its
 *   Changed and Kept tabs, a type with kept records wearing the notice dot), Cancel and a blue Update,
 *   greyed while nothing is ticked; Update sends it confirmed with the types ticked;
 * - the run "Updating Luma": one Update Luma step with a row per type chosen, working line "Updating
 *   24 of 48", then Verify; ending "Luma Updated", which waits for Close.
 */

import { act, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    answer,
    mockRequest,
    press,
    record,
    renderWindow,
    settle,
    shownStep,
} from './DatapackJobWindow.testUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { UpdateDatapackResult } from '@/types/webviewRequests';

const CHANGED: { success: true; data: UpdateDatapackResult } = {
    success: true,
    data: {
        displayName: 'Luma',
        target: { name: 'luma', version: 'v2' },
        changes: [
            {
                type: 'categories',
                added: 2,
                updated: 0,
                removed: 0,
                changed: ['Trail Running', 'Recovery'],
                kept: [],
            },
            {
                type: 'products',
                added: 12,
                updated: 36,
                removed: 0,
                changed: ['MS-01', 'MH01'],
                kept: ['MJ09', 'WT01'],
            },
            {
                type: 'cart_rules',
                added: 0,
                updated: 1,
                removed: 0,
                changed: ['Spring Sale'],
                kept: [],
            },
        ],
    },
};
/** The update's job, as the extension records it, mid-way through products. */
const UPDATING = record({
    datapackName: 'luma',
    version: 'v2',
    purpose: 'update',
    dataTypes: ['categories', 'products'],
    perType: { categories: 'success', products: 'processing' },
    detail: '24 of 48 products',
});

const button = (name: string) => screen.getByRole('button', { name });
const heading = (name: string) => screen.findByRole('heading', { name });
const updateSends = () =>
    mockRequest.mock.calls.filter(([type]) => type === 'update-datapack').map(([, body]) => body);
const tick = (name: string) => screen.getByRole('checkbox', { name });

async function openUpdate() {
    const view = renderWindow({
        id: { name: 'luma', version: 'v1' },
        displayName: 'Luma',
        source: 'library',
        updating: true,
    });
    await settle();
    await settle();
    await settle();
    return view;
}

it('waits under "Update Luma", sending update-datapack once without confirm', async () => {
    answer({}, ['update-datapack']);
    await openUpdate();

    expect(screen.getByRole('heading', { name: 'Install Luma' })).toBeInTheDocument();
    // Walk F193: installing over the demo's datapack can lose the SC's edits.
    expect(screen.getAllByText('Finding unsaved changes').length).toBeGreaterThan(0);
    expect(updateSends()).toEqual([{ datapackName: 'luma', records: true }]);
    expect(mockRequest.mock.calls.some(([type]) => type === 'preview-datapack-changes')).toBe(
        false
    );
});

// Review U1-1: the check wrote nothing, so the screen confirms the move itself, and only then.
it('nothing to write in a newer version: confirms the move once, with the version checked', async () => {
    answer({ update: { success: true, data: { upToDate: true, displayName: 'Luma', movesTo: 'v2' } } });
    await openUpdate();

    expect(await heading('Luma Is Up to Date')).toBeInTheDocument();
    await settle();
    expect(updateSends()).toEqual([{ datapackName: 'luma', records: true }, { datapackName: 'luma', confirm: true, version: 'v2' }]);
});

it('nothing left to apply: "Luma Is Up to Date", which waits for Close', async () => {
    // CONTROL: up to date with nothing to move confirms nothing.
    answer({ update: { success: true, data: { upToDate: true, displayName: 'Luma' } } });
    const { onClose } = await openUpdate();

    expect(await heading('Luma Is Up to Date')).toBeInTheDocument();
    expect(updateSends()).toHaveLength(1);
    // Walk F195 (owner, 2026-11-17): every result waits for Close.
    await act(async () => {
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
    });
    expect(onClose).not.toHaveBeenCalled();
    await press(button('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
});

describe('what changed', () => {
    it('shows each changed type with a tick and its bare counts, every type ticked, and a blue Update', async () => {
        answer({ update: CHANGED });
        await openUpdate();

        const table = await screen.findByRole('table', { name: 'What the update writes, by type' });
        expect(
            within(table)
                .getAllByRole('row')
                .map((row) => row.textContent)
        ).toEqual(['Categories2 added', 'Products12 added, 36 updated', 'Cart Rules1 updated']);
        expect(tick('Select All')).toBeChecked();
        expect(tick('Products')).toBeChecked();
        expect(button('Review Records')).toBeInTheDocument();
        expect(button('Cancel')).toBeInTheDocument();
        expect(button('Install')).toBeEnabled();
        // Nothing says the SC's edits are kept (rule 6): that is the spot check's Kept tab.
        expect(screen.queryByText(/kept/iu)).toBeNull();
    });

    it('Update sends only the types ticked, confirmed, and runs "Updating Luma"', async () => {
        answer({ update: CHANGED, statusAfter: UPDATING });
        await openUpdate();
        await screen.findByRole('table', { name: 'What the update writes, by type' });

        await press(tick('Cart Rules'));
        await press(button('Install'));
        await settle();

        expect(updateSends()).toEqual([
            { datapackName: 'luma', records: true },
            { datapackName: 'luma', confirm: true, dataTypes: ['categories', 'products'], version: 'v2' },
        ]);
        expect(await heading('Installing Luma')).toBeInTheDocument();
        const shown = shownStep();
        // Line 1 the job, line 2 the type and its count (owner, 2026-11-16).
        expect(shown.getByText('Installing in Commerce')).toBeInTheDocument();
        expect(shown.getByText('Products, 24 of 48')).toBeInTheDocument();
        expect(shown.queryByText(/Updating/u)).toBeNull();
    });

    it('greys Update once nothing is ticked, and Select All ticks every type again', async () => {
        answer({ update: CHANGED });
        await openUpdate();
        await screen.findByRole('table', { name: 'What the update writes, by type' });

        await press(tick('Select All'));
        expect(button('Install')).toHaveAttribute('aria-disabled', 'true');
        await press(tick('Select All'));
        expect(button('Install')).toBeEnabled();
        expect(tick('Cart Rules')).toBeChecked();
    });

    it("Review Records lists what it writes under Changed, and the SC's edits under Kept, with the dot", async () => {
        answer({ update: CHANGED });
        await openUpdate();
        await screen.findByRole('table', { name: 'What the update writes, by type' });

        await press(button('Review Records'));
        await press(await screen.findByRole('button', { name: /^Products/u }));

        expect(screen.getByLabelText('2 kept')).toBeInTheDocument();
        expect(screen.getByText('MS-01')).toBeInTheDocument();
        expect(button('Changed')).toBeInTheDocument();
        await press(button('Kept'));
        expect(screen.getByText('MJ09')).toBeInTheDocument();
        // Back keeps the ticks as they were.
        await press(button('Back'));
        expect(
            await screen.findByRole('table', { name: 'What the update writes, by type' })
        ).toBeInTheDocument();
    });

    it('ends clean on "Luma Updated", which waits for Close', async () => {
        answer({
            update: CHANGED,
            statusAfter: {
                ...UPDATING,
                outcome: 'success',
                perType: { categories: 'success', products: 'success', cart_rules: 'success' },
            },
        });
        const { onClose } = await openUpdate();
        await screen.findByRole('table', { name: 'What the update writes, by type' });

        await press(button('Install'));

        expect(await heading('Luma Installed')).toBeInTheDocument();
        // Walk F195 (owner, 2026-11-17): every result waits for Close.
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        });
        expect(onClose).not.toHaveBeenCalled();
        await press(button('Close'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Review U1-3: after an update that stopped, Retry repeats the UPDATE with the types it asked for,
    // never an install of every type.
    it('a stopped update offers Retry, which sends the same update again', async () => {
        answer({ update: CHANGED, statusAfter: { ...UPDATING, outcome: 'error', perType: { categories: 'success', products: 'error' }, stoppedAt: 'products', reason: 'Commerce refused.', retryable: true } });
        await openUpdate();
        await screen.findByRole('table', { name: 'What the update writes, by type' });
        await press(tick('Cart Rules'));
        await press(button('Install'));
        await settle();

        await press(await screen.findByRole('button', { name: 'Retry' }));
        await settle();

        const confirmed = updateSends().filter((body) => (body as { confirm?: boolean }).confirm === true);
        expect(confirmed).toHaveLength(2);
        expect(confirmed[1]).toEqual(confirmed[0]);
        expect(confirmed[1]).toMatchObject({ dataTypes: ['categories', 'products'], version: 'v2' });
        expect(mockRequest.mock.calls.some(([type]) => type === 'start-datapack-import')).toBe(false);
    });
});
