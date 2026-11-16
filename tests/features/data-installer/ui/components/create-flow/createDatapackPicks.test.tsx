/**
 * Create Datapack's pick screen (datapack-engine step 14, `.rptc/plans/datapack-save-as/`): the kinds
 * on the left; clicking one shows its checklist on the right, its items asked of
 * `list-datapack-export-items`; selections kept across kinds and counted on each row ("1 of 2
 * selected", "All selected" for a kind ticked whole and unread; step-07 S3-b); Next goes on to the
 * name at once, reading nothing, and Create hands on the ids picked and the kinds ticked whole, which
 * the save lists itself (step-07 E2, S3-a). Create is two windows (step-04 S3; decisions Phase 7b,
 * J3-2): what it holds, everything ticked to start (overview 7b), then the name.
 *
 * Ported from `SaveFromStoreModal.test.tsx` (deleted in step-04 S2) for what is still true of
 * Create. A save from a datapack is no longer this dialog: Save Changes and Save As New are their own
 * windows (`components/save/`), and Add Unused Items was removed (overview 7b, 2026-11-10).
 *
 * The list answers are `StoreItemPage`s, typed to the handler's own interface.
 */

import '../../../../../helpers/webviewClientMock';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StorePicks } from '@/features/data-installer/pickableKinds';
import { DatapackFlowDialog } from '@/features/data-installer/ui/components/create-flow/DatapackFlowDialog';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';

const mockRequest = webviewClient.request as jest.Mock;

const PRODUCTS: StoreItemPage = {
    items: [
        { id: 'VR-Rack', displayName: 'VR Rack', detail: 'VR-Rack', key: 'VR-Rack' },
        { id: 'Cable-Tray', displayName: 'Cable Tray', detail: 'Cable-Tray', key: 'Cable-Tray' },
    ],
    totalCount: 4,
    excludedCount: 0,
    inPackCount: 2,
};
const RULES: StoreItemPage = { items: [{ id: '7', displayName: 'Spring Sale', key: 'Spring Sale' }], totalCount: 1, excludedCount: 0, inPackCount: 0 };
const NONE: StoreItemPage = { items: [], totalCount: 0, excludedCount: 0, inPackCount: 0 };

function answer(pages: Record<string, StoreItemPage>) {
    mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) =>
        type === 'list-datapack-export-items' ? { success: true, data: pages[payload?.dataType ?? ''] ?? NONE } : { success: true, data: null },
    );
}

const listCalls = () => mockRequest.mock.calls.filter((c) => c[0] === 'list-datapack-export-items').map((c) => c[1]);
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const button = (name: string) => screen.getByRole('button', { name });
const everything = () => screen.getByRole('checkbox', { name: 'Select All Data' });
const NO_NAMES: readonly string[] = [];

/** What Create hands on: the ids picked, and the kinds ticked whole. */
const chose = (picks: StorePicks, wholeKinds: readonly PickableKind[] = []) => ({ picks, wholeKinds });

async function open(props: Partial<React.ComponentProps<typeof DatapackFlowDialog>> = {}) {
    const onSave = jest.fn();
    render(<DatapackFlowDialog title="Create Datapack" ownNames={NO_NAMES} onClose={jest.fn()} onSave={onSave} {...props} />);
    await settle();
    return onSave;
}

/** Open with nothing ticked, to tick by hand. */
async function openCleared() {
    const onSave = await open();
    await press(everything());
    return onSave;
}

/** Next, then name it and Create. */
async function create(name = 'Hand Built') {
    await press(button('Next'));
    fireEvent.change(screen.getByRole('textbox', { name: /Datapack Name/ }), { target: { value: name } });
    await press(button('Create'));
}

beforeEach(() => mockRequest.mockReset());

describe('the screen', () => {
    it('has its own title, and one row per kind in order', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(screen.getByRole('heading', { name: 'Create Datapack' })).toBeInTheDocument();
        const names = screen.getAllByRole('button').filter((b) => b.classList.contains('datapack-picks-kind')).map((b) => b.firstChild?.textContent);
        expect(names).toEqual(PICKABLE_KINDS.map(dataTypeLabel));
        expect(screen.queryByRole('button', { name: /Commerce Datapack/ })).not.toBeInTheDocument();
    });

    // Prototype conventions rules 1 and 2: no grey line under a row, no "Includes related" line.
    it('says nothing of what selecting also saves, and draws no detail under an item', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();
        // CONTROL: the item is drawn.
        expect(screen.getByRole('checkbox', { name: 'VR Rack' })).toBeInTheDocument();
        expect(screen.queryByText('VR-Rack')).not.toBeInTheDocument();
        expect(screen.queryByText(/^Includes/)).not.toBeInTheDocument();

        await press(row('Cart Rules'));
        expect(screen.queryByText(/^Includes/)).not.toBeInTheDocument();
    });

    it('keeps the same layout on a short list: filter, count, Select All, then the rows', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();
        await press(row('Cart Rules'));

        const order = [
            screen.getByRole('searchbox', { name: 'Filter cart rules' }),
            screen.getByText('1 cart rule'),
            screen.getByRole('checkbox', { name: 'Select All' }),
            screen.getByRole('checkbox', { name: /Spring Sale/ }),
        ];
        order.slice(1).forEach((later, i) => {
            expect(order[i].compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });
    });

    it('has nothing to go back to, so no Back', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });

    it('offers Cancel, not Close, while nothing has happened', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(button('Cancel')).toBeInTheDocument();
    });

    // J3-2: the picker has no heading or intro line; its buttons are Cancel and Next.
    it('has no intro line, and offers Cancel and Next only', async () => {
        answer({ products: PRODUCTS });
        await open();
        expect(screen.queryByText("Select what to include from this demo's Commerce instance.")).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save As New' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
        expect(button('Next')).toBeInTheDocument();
    });
});

describe('selecting the items', () => {
    // Owner, 2026-11-16: the window opens complete, every kind's list read in its opening wait.
    it('reads every kind\'s list on opening, naming no datapack', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(listCalls()).toEqual(PICKABLE_KINDS.map((dataType) => ({ dataType })));
        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
    });

    it('counts on the row as items are selected, and does not read a kind twice', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(row('Products')).toHaveTextContent('1 of 2 selected');
        expect(row('Categories')).not.toHaveTextContent('selected');

        await press(row('Cart Rules'));
        await press(row('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeChecked();
        expect(listCalls().filter((c) => c.dataType === 'products')).toHaveLength(1);
    });

    it('keeps the selections of every kind, and hands them all to Create', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await openCleared();

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(row('Cart Rules'));
        await press(screen.getByRole('checkbox', { name: /Spring Sale/ }));
        await create();

        expect(onSave).toHaveBeenCalledWith(chose({ products: ['VR-Rack'], cart_rules: ['7'] }), 'Hand Built');
    });

    it('ticks every item the filter shows with Select All, showing a dash for some', async () => {
        answer({ products: PRODUCTS });
        const onSave = await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(screen.getByRole('checkbox', { name: 'Select All' })).toBePartiallyChecked();

        await press(screen.getByRole('checkbox', { name: 'Select All' }));
        await create();

        expect(onSave).toHaveBeenCalledWith(chose({ products: ['VR-Rack', 'Cable-Tray'] }), 'Hand Built');
    });

    it('writes a large count with separators', async () => {
        const items = Array.from({ length: 1284 }, (_, i) => ({ id: `s${i}`, displayName: `Item ${i}`, key: `s${i}` }));
        answer({ products: { items, totalCount: 1284, excludedCount: 0, inPackCount: 0 } });
        await open();

        expect(row('Products')).toHaveTextContent('1,284 of 1,284 selected');
    });

    // Owner, 2026-11-08 (F79): the pane's bare spinner said nothing; it waits in the house rows. Every
    // list is read before the window opens (owner, 2026-11-16), so the pane reads only a kind whose
    // opening read failed, again, when it is opened.
    it('reads a failed kind again in its pane, saying what it reads, keeping the rows and Next', async () => {
        const ruleReads = { count: 0 };
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: {} });
            if (payload?.dataType !== 'cart_rules') return Promise.resolve({ success: true, data: PRODUCTS });
            ruleReads.count += 1;
            return ruleReads.count === 1 ? Promise.resolve({ success: false, error: 'No answer.' }) : new Promise(() => undefined);
        });
        await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(row('Cart Rules')).toHaveTextContent("Couldn't be read");

        await press(row('Cart Rules'));

        expect(screen.getByText('Reading cart rules')).toBeInTheDocument();
        expect(screen.getByText('From Commerce')).toBeInTheDocument();
        expect(button('Next')).toHaveAttribute('aria-disabled', 'false');

        await press(row('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeChecked();
    });

    // Still true with the opening reads: a failed kind's retry belongs to its pane, so its answer
    // arriving after the SC has moved on is not taken for the kind now shown.
    it("does not take a late answer for another kind's", async () => {
        const late: { resolve?: (value: unknown) => void } = {};
        const giftReads = { count: 0 };
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: {} });
            if (payload?.dataType === 'giftcards') {
                giftReads.count += 1;
                if (giftReads.count === 1) return Promise.resolve({ success: false, error: 'No answer.' });
                return new Promise((resolve) => { late.resolve = resolve; });
            }
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : RULES });
        });
        await open();
        await press(row('Gift Cards'));
        // Ticked whole, with no count and no list while it reads again.
        expect(row('Gift Cards')).toHaveTextContent('All selected');
        await press(row('Cart Rules'));

        late.resolve?.({ success: true, data: PRODUCTS });
        await settle();

        expect(screen.getByRole('checkbox', { name: /Spring Sale/ })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /VR Rack/ })).not.toBeInTheDocument();
    });
});

describe('a kind with nothing to select', () => {
    // Every list is read before the window opens (owner, 2026-11-16), so a kind whose list left
    // nothing is greyed out from the first frame, and the kind shown is the first with something.
    it('is greyed out from the first frame, and the window opens on the first kind with something', async () => {
        answer({ customers: RULES });
        await open();

        expect(row('Gift Cards')).toBeDisabled();
        expect(row('Gift Cards')).toHaveTextContent('None available');
        expect(row('Products')).toBeDisabled();
        expect(row('Customers')).toHaveAttribute('aria-current', 'true');
        expect(screen.getByRole('checkbox', { name: /Spring Sale/ })).toBeInTheDocument();
    });

    it('cannot be opened again once greyed out', async () => {
        answer({ products: PRODUCTS, categories: RULES });
        await open();
        await press(row('Gift Cards'));
        const reads = listCalls().length;

        fireEvent.click(row('Gift Cards'));
        await settle();

        expect(listCalls()).toHaveLength(reads);
    });
});

describe('a read that fails', () => {
    /** The products list is refused until `recovered` is set; the counts and other lists are not. */
    function refuseProducts() {
        const answering = mockRequest.getMockImplementation();
        const state = { recovered: false };
        mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items' || payload?.dataType !== 'products' || state.recovered) return answering?.(type, payload);
            return { success: false, error: 'The install target names no website.' };
        });
        return state;
    }

    it('says why, in the colour of a failure, and leaves the row clickable', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        refuseProducts();
        await open();

        const line = screen.getByText("Couldn't load products: The install target names no website.");
        expect(line).toHaveClass('dialog-problem', 'text-negative');
        expect(row('Products')).toBeEnabled();
    });

    it('reads again when the SC comes back to it', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const products = refuseProducts();
        await open();

        await press(row('Cart Rules'));
        products.recovered = true;
        await press(row('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
    });
});

describe('Next', () => {
    it('cannot go on with nothing ticked', async () => {
        answer({ products: PRODUCTS });
        await openCleared();

        expect(button('Next')).toHaveAttribute('aria-disabled', 'true');
    });

    it('is off again when the last selection is taken away', async () => {
        answer({ products: PRODUCTS });
        await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(button('Next')).toHaveAttribute('aria-disabled', 'false');

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(button('Next')).toHaveAttribute('aria-disabled', 'true');
    });
});

// J3-2: the second window, also "Create Datapack": the name, with Back, Cancel and Create.
describe('the name, second', () => {
    it('opens on the name, empty, with Back, Cancel and Create, and no picks', async () => {
        answer({ products: PRODUCTS });
        await open();

        await press(button('Next'));

        expect(screen.getByRole('heading', { name: 'Create Datapack' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toHaveValue('');
        expect(['Back', 'Cancel', 'Create'].map((name) => button(name))).toHaveLength(3);
        expect(screen.queryByRole('checkbox', { name: 'Select All Data' })).not.toBeInTheDocument();
    });

    it('goes back to the picks with them kept', async () => {
        answer({ products: PRODUCTS });
        await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(button('Next'));

        await press(button('Back'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Cable Tray/ })).not.toBeChecked();
    });

    it('hands the picks and the name, trimmed, to Create', async () => {
        answer({ products: PRODUCTS });
        const onSave = await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        await create(' Hand Built ');

        expect(onSave).toHaveBeenCalledWith(chose({ products: ['VR-Rack'] }), 'Hand Built');
    });

    // Save As New's rules (`nameProblem`), under the field.
    it.each([
        ['', 'Give it a name.'],
        ['my luma', 'You already have a datapack named my luma.'],
    ])('refuses "%s" under the field, and creates nothing', async (name, problem) => {
        answer({ products: PRODUCTS });
        const onSave = await open({ ownNames: ['My Luma'] });

        await create(name);

        expect(screen.getByText(problem)).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });
});

describe('Select All Data (2026-11-03; ticked to start, overview 7b)', () => {
    // step-07 E2 (S3-a): a kind ticked whole is handed on as a kind, listed by the save itself. Every
    // list is read in the opening wait (owner, 2026-11-16), so every row counts from the first frame.
    it('starts ticked, reads every list in the opening wait, and hands on whole every kind with something', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES, customers: RULES });
        const onSave = await open();
        expect(everything()).toBeChecked();
        expect(listCalls()).toEqual(PICKABLE_KINDS.map((dataType) => ({ dataType })));
        expect(row('Products')).toHaveTextContent('2 of 2 selected');
        expect(row('Customers')).toHaveTextContent('1 of 1 selected');
        expect(row('Cart Rules')).toHaveTextContent('1 of 1 selected');
        expect(row('Gift Cards')).toHaveTextContent('None available');

        await create();

        // Nothing more was read: the save lists each kind itself.
        expect(listCalls()).toHaveLength(PICKABLE_KINDS.length);
        expect(onSave).toHaveBeenCalledWith(chose({}, ['products', 'cart_rules', 'customers']), 'Hand Built');
    });

    it('shows the dash when only some are ticked, and clears every kind when unticked', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(everything()).toHaveAttribute('aria-checked', 'mixed');

        await press(everything());
        expect(everything()).toBeChecked();
        await press(everything());

        expect(everything()).not.toBeChecked();
        expect(row('Products')).not.toHaveTextContent('selected');
    });

    it('ticks everything again without reading anything', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await openCleared();
        const reads = listCalls().length;

        await press(everything());

        expect(everything()).toBeChecked();
        expect(listCalls()).toHaveLength(reads);
    });

    it('goes on to the name at once on Next, reading nothing and showing no spinner', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();
        const reads = listCalls().length;

        await press(button('Next'));

        expect(reads).toBe(PICKABLE_KINDS.length);
        expect(listCalls()).toHaveLength(reads);
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toBeInTheDocument();
    });

    it('hands on whole every kind ticked that may have something: only none available is left out', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: null });
            if (payload?.dataType === 'giftcards') return Promise.resolve({ success: false, error: 'No answer.' });
            if (payload?.dataType === 'categories') return Promise.resolve({ success: true, data: NONE });
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : RULES });
        });
        const onSave = await open();
        await press(row('Gift Cards'));
        await press(row('Categories'));

        await create();

        // Gift cards' read failed but its row stays ticked, so it goes; the save decides (review, 2026-11-14).
        const left = PICKABLE_KINDS.filter((kind) => kind !== 'categories');
        expect(onSave).toHaveBeenCalledWith(chose({}, left), 'Hand Built');
    });

    it('hands on a whole kind\'s ticks as ids once some are taken away', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open();
        await press(screen.getByRole('checkbox', { name: /Cable Tray/ }));

        await create();

        // The other whole kind with something still goes as a kind; the kinds with none are left out.
        expect(onSave).toHaveBeenCalledWith(chose({ products: ['VR-Rack'] }, ['cart_rules']), 'Hand Built');
    });
});
