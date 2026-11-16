/**
 * The kinds' rows as the store's counts arrive (`count-datapack-export-items`): shown at once and
 * clickable while they are read, greyed with no click by a count of none, and left alone by a count
 * that failed or was not none. A kind's list, once answered, decides. The kind shown moves on from
 * one with nothing to select.
 *
 * Drawn in Create Datapack's dialog. A save from a datapack has no kinds to tick (walk F85), and Add
 * Unused Items was removed (overview 7b, 2026-11-10).
 */

import '../../../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PICKABLE_KINDS, type StoreItemPage, type StoreKindCounts } from '@/features/data-installer/pickableKinds';
import { DatapackFlowDialog } from '@/features/data-installer/ui/components/create-flow/DatapackFlowDialog';

const mockRequest = webviewClient.request as jest.Mock;

const COUNT = 'count-datapack-export-items';
const LIST = 'list-datapack-export-items';
const NONE_NOTE = 'None available';
const NO_NAMES: readonly string[] = [];
const PRODUCTS: StoreItemPage = { items: [{ id: 'VR-Rack', displayName: 'VR Rack', detail: 'VR-Rack', key: 'VR-Rack' }], totalCount: 1, excludedCount: 0, inPackCount: 0 };
const NOTHING_LEFT: StoreItemPage = { items: [], totalCount: 3, excludedCount: 0, inPackCount: 0 };

function answer(counts: unknown, pages: Record<string, StoreItemPage> = {}) {
    mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) => {
        if (type === COUNT) return counts;
        return type === LIST ? { success: true, data: pages[payload?.dataType ?? ''] ?? PRODUCTS } : { success: true, data: null };
    });
}

const counted = (counts: StoreKindCounts) => ({ success: true, data: counts });
const callsOf = (type: string) => mockRequest.mock.calls.filter((c) => c[0] === type);
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const rows = () => screen.getAllByRole('button').filter((b) => b.classList.contains('datapack-picks-kind'));
const shown = () => rows().find((b) => b.getAttribute('aria-current') === 'true');

async function open() {
    render(<DatapackFlowDialog title="Create Datapack" ownNames={NO_NAMES} onClose={jest.fn()} onSave={jest.fn()} />);
    await settle();
}

beforeEach(() => mockRequest.mockReset());

describe('before both columns are ready', () => {
    const noRows = () => screen.getAllByRole('button').filter((b) => b.classList.contains('datapack-picks-kind'));

    it('shows only the wait while the counts are read, and reads no list yet', async () => {
        mockRequest.mockImplementation(() => new Promise(() => undefined));
        await open();

        expect(noRows()).toHaveLength(0);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(callsOf(LIST)).toHaveLength(0);
    });

    // Owner, 2026-11-05: waiting the whole dialog for the first list too made the wait too long.
    // Owner walk, 2026-11-16: the window opened, then its first list read in a second wait. The first
    // list is read in the opening wait, and the window opens with it shown.
    it('reads the first list in the opening wait, and shows no rows until it has answered', async () => {
        mockRequest.mockImplementation((type: string) => (type === COUNT ? Promise.resolve(counted({ products: 2 })) : new Promise(() => undefined)));
        await open();

        expect(noRows()).toHaveLength(0);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(callsOf(LIST).map((c) => c[1])).toEqual([{ dataType: 'products' }]);
    });

    it('shows both columns together, every row in its final state', async () => {
        answer(counted({ products: 2, giftcards: 0 }));
        await open();

        expect(rows()).toHaveLength(PICKABLE_KINDS.length);
        expect(row('Gift Cards')).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('never goes back to waiting the whole dialog when another kind is opened', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type === COUNT) return Promise.resolve(counted({ products: 2 }));
            return payload?.dataType === 'products' ? Promise.resolve({ success: true, data: PRODUCTS }) : new Promise(() => undefined);
        });
        await open();

        await press(row('Customers'));

        expect(rows()).toHaveLength(PICKABLE_KINDS.length);
        expect(screen.getByText('Reading customers')).toBeInTheDocument();
    });
});

describe('a count of none', () => {
    it('greys its row out with no click, and reads no list of it', async () => {
        answer(counted({ giftcards: 0, products: 139 }));
        await open();

        expect(row('Gift Cards')).toBeDisabled();
        expect(row('Gift Cards')).toHaveTextContent(NONE_NOTE);
        expect(callsOf(LIST).map((c) => c[1])).toEqual([{ dataType: 'products' }]);
    });

    it('leaves a row with some clickable, and says no number', async () => {
        answer(counted({ giftcards: 0, products: 139 }));
        await open();

        expect(row('Products')).toBeEnabled();
        expect(row('Products')).not.toHaveTextContent('139');
    });
});

describe('the kind shown', () => {
    it('starts at Products', async () => {
        answer(counted({ products: 139 }));
        await open();

        expect(shown()).toBe(row('Products'));
    });

    it('moves on from a kind the counts say is empty', async () => {
        answer(counted({ products: 0, giftcards: 2 }));
        await open();

        expect(shown()).toBe(row('Gift Cards'));
    });

    it('moves on from a kind whose list left nothing to select', async () => {
        answer(counted({ products: 3 }), { products: NOTHING_LEFT });
        await open();

        expect(shown()).not.toBe(row('Products'));
        expect(row('Products')).toBeDisabled();
    });

    it('says so when the store has nothing of any kind', async () => {
        answer(counted(Object.fromEntries(PICKABLE_KINDS.map((kind) => [kind, 0]))));
        await open();

        expect(shown()).toBeUndefined();
        expect(screen.getByText('Commerce has nothing to select.')).toBeInTheDocument();
        expect(callsOf(LIST).filter((c) => c[1].dataType !== 'products')).toHaveLength(0);
    });
});

describe('a count that failed', () => {
    it('leaves every row clickable and shows nothing: a refusal', async () => {
        answer({ success: false, error: 'Sign in first.' });
        await open();

        rows().forEach((r) => expect(r).toBeEnabled());
        expect(screen.queryByText(/Sign in first/)).not.toBeInTheDocument();
    });

    it('leaves every row clickable and shows nothing: no answer at all', async () => {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === COUNT) throw new Error('Request timed out');
            return { success: true, data: PRODUCTS };
        });
        await open();

        rows().forEach((r) => expect(r).toBeEnabled());
        expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();
    });

    it('leaves the one kind it could not count clickable', async () => {
        answer(counted({ products: 0 }));
        await open();

        expect(row('Products')).toBeDisabled();
        expect(row('Customers')).toBeEnabled();
    });

    it('asks once, however many kinds are opened', async () => {
        answer({ success: false, error: 'Sign in first.' });
        await open();

        await press(row('Customers'));
        await press(row('Products'));

        expect(callsOf(COUNT)).toHaveLength(1);
    });
});

describe('a count and a list', () => {
    it('says none are available when its list left nothing to select', async () => {
        answer(counted({ products: 3 }), { products: NOTHING_LEFT });
        await open();

        expect(row('Products')).toHaveTextContent(NONE_NOTE);
    });

    // Overview 7b: everything starts ticked, so a listed kind's row counts all of it at once, "N of M
    // selected" as the projects list counts (step-07 Q3, S3-b); a kind ticked whole and unread says
    // "All selected", since nothing was read to count.
    it('says how many of how many are selected, on a read row and on an unread whole one by its count', async () => {
        const TWO: StoreItemPage = { ...PRODUCTS, items: [...PRODUCTS.items, { id: 'Tray', displayName: 'Cable Tray', key: 'Tray' }], totalCount: 2 };
        answer(counted({ products: 2, customers: 5 }), { products: TWO });
        await open();
        expect(row('Products')).toHaveTextContent('2 of 2 selected');
        // Owner walk, 2026-11-16: its count, not "All selected".
        expect(row('Customers')).toHaveTextContent('5 of 5 selected');

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(row('Products')).toHaveTextContent('1 of 2 selected');
        expect(callsOf(COUNT)).toHaveLength(1);
    });
});

// Owner walk, 2026-11-16: B2B Companies read "All selected", then "None available" once opened. Its
// count is the instance's and its list the website's, so its list is read at once, and the row
// claims nothing until it answers.
describe('a kind whose count is only a ceiling', () => {
    const NONE_HERE: StoreItemPage = { items: [], totalCount: 0, excludedCount: 0, inPackCount: 0 };

    it('reads its list as soon as the counts are in, and says what the website holds without being opened', async () => {
        answer(counted({ products: 1, b2b_companies: 3 }), { products: PRODUCTS, b2b_companies: NONE_HERE });
        await open();

        expect(callsOf(LIST).some((c) => (c[1] as { dataType?: string })?.dataType === 'b2b_companies')).toBe(true);
        expect(row('B2B Companies')).toHaveTextContent(NONE_NOTE);
        expect(row('B2B Companies')).not.toHaveTextContent('All selected');
    });

    // Owner walk, 2026-11-16: the window opened, then the row filled in a second or two later. It
    // waits for the list too, and opens complete.
    it('keeps the window on its wait until that list has answered', async () => {
        mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) => {
            if (type === COUNT) return counted({ products: 1, b2b_companies: 3 });
            if (type === LIST && payload?.dataType === 'b2b_companies') return new Promise(() => undefined);
            return type === LIST ? { success: true, data: PRODUCTS } : { success: true, data: null };
        });
        await open();

        expect(rows()).toHaveLength(0);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
});

describe('what the count is asked of', () => {
    it('names no datapack', async () => {
        answer(counted({}));
        await open();

        expect(callsOf(COUNT)[0][1]).toStrictEqual({});
    });
});
