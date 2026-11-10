/**
 * The screen that selects from the store, as Save and Save As open it (datapack-engine step 14,
 * `.rptc/plans/datapack-save-as/`). The kinds on the left; clicking one shows its checklist on the right, its items asked of
 * `list-datapack-export-items` (less what the pack being saved holds); selections kept across kinds
 * and counted on each row; Save hands them on.
 *
 * A save from a pack has no picks screen (walk F85): Save Changes is one sentence and Save As New
 * Datapack the name, each with Add Unused Items for what the demo does not use yet. The picks screen is
 * Create Datapack's, from nothing.
 *
 * The list answers are `StoreItemPage`s, typed to the handler's own interface.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PICKABLE_KINDS, type StoreItemPage } from '@/features/data-installer/pickableKinds';
import { SaveFromStoreModal } from '@/features/data-installer/ui/components/SaveFromStoreModal';
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
const UNUSED_GROUPS: StoreItemPage = { items: [{ id: '31', displayName: 'Live Demo', key: 'Live Demo' }], totalCount: 1, excludedCount: 0, inPackCount: 0 };
const PACK = { id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', source: 'library' as const };

function answer(pages: Record<string, StoreItemPage>) {
    mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) =>
        type === 'list-datapack-export-items' ? { success: true, data: pages[payload?.dataType ?? ''] ?? NONE } : { success: true, data: null },
    );
}

const listCalls = () => mockRequest.mock.calls.filter((c) => c[0] === 'list-datapack-export-items').map((c) => c[1]);
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const button = (name: string) => screen.getByRole('button', { name });

async function open(props: Partial<React.ComponentProps<typeof SaveFromStoreModal>> = {}) {
    const onSave = jest.fn();
    render(<SaveFromStoreModal onClose={jest.fn()} onSave={onSave} {...props} />);
    await settle();
    return onSave;
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

    it('says what selecting also saves, on the kinds that bring something', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES, customers: RULES });
        await open();
        expect(screen.getByText('Includes related categories, attributes and stock.')).toBeInTheDocument();

        await press(row('Cart Rules'));
        expect(screen.getByText('Includes related coupons.')).toBeInTheDocument();

        await press(row('Customers'));
        expect(screen.queryByText(/^Includes/)).not.toBeInTheDocument();
    });

    it('keeps the same layout on a short list with a note: filter, count, Select All, rows, then the note', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();
        await press(row('Cart Rules'));

        const order = [
            screen.getByRole('searchbox', { name: 'Filter cart rules' }),
            screen.getByText('1 cart rule'),
            screen.getByRole('checkbox', { name: 'Select All' }),
            screen.getByRole('checkbox', { name: /Spring Sale/ }),
            screen.getByText('Includes related coupons.'),
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

    // Owner, 2026-11-09 (walk F85): from a pack there is nothing to tick.
    it('says a save into the pack makes a new version of it, with Add Unused Items, Save As New and Save, and nothing to tick', async () => {
        answer({ products: PRODUCTS });
        await open({ pack: PACK });

        expect(screen.getByRole('heading', { name: 'Save Changes' })).toBeInTheDocument();
        expect(screen.getByText('Saves everything this demo uses as a new version of Bodea.')).toBeInTheDocument();
        expect(button('Add Unused Items')).toBeInTheDocument();
        expect(button('Save As New')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(listCalls()).toStrictEqual([]);
    });

    it('says what to include from a store with no pack, and offers no Save As New', async () => {
        answer({ products: PRODUCTS });
        await open();
        expect(screen.getByText("Select what to include from this demo's Commerce instance.")).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save As New' })).not.toBeInTheDocument();
    });
});

describe('selecting the items', () => {
    it('lists the first kind on opening, with no pack named for a store Demo Builder did not fill', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(listCalls()).toEqual([{ dataType: 'products' }]);
        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
    });

    it('counts on the row as items are selected, and does not read a kind twice', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(row('Products')).toHaveTextContent('1 selected');
        expect(row('Categories')).not.toHaveTextContent('selected');

        await press(row('Cart Rules'));
        await press(row('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeChecked();
        expect(listCalls().filter((c) => c.dataType === 'products')).toHaveLength(1);
    });

    it('keeps the selections of every kind, and hands them all to Save', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open();

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(row('Cart Rules'));
        await press(screen.getByRole('checkbox', { name: /Spring Sale/ }));
        await press(button('Create'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'], cart_rules: ['7'] });
    });

    it('ticks every item the filter shows with Select All, showing a dash for some', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(screen.getByRole('checkbox', { name: 'Select All' })).toBePartiallyChecked();

        await press(screen.getByRole('checkbox', { name: 'Select All' }));
        await press(button('Create'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'] });
    });

    it('writes a large count with separators', async () => {
        const items = Array.from({ length: 1284 }, (_, i) => ({ id: `s${i}`, displayName: `Item ${i}`, key: `s${i}` }));
        answer({ products: { items, totalCount: 1284, excludedCount: 0, inPackCount: 0 } });
        await open();

        await press(screen.getByRole('checkbox', { name: 'Select All' }));

        expect(row('Products')).toHaveTextContent('1,284 selected');
    });

    // Owner, 2026-11-08 (F79): the pane's bare spinner said nothing; it waits in the house rows.
    it('reads in its pane, saying what it reads, keeping the rows and Save, so a slow read costs nothing', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: {} });
            return payload?.dataType === 'products' ? Promise.resolve({ success: true, data: PRODUCTS }) : new Promise(() => undefined);
        });
        await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        await press(row('Cart Rules'));

        expect(screen.getByText('Reading cart rules')).toBeInTheDocument();
        expect(screen.getByText('From Commerce')).toBeInTheDocument();
        expect(button('Create')).toHaveAttribute('aria-disabled', 'false');

        await press(row('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeChecked();
    });

    it("does not take a late answer for another kind's", async () => {
        const late: { resolve?: (value: unknown) => void } = {};
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: {} });
            if (payload?.dataType === 'giftcards') return new Promise((resolve) => { late.resolve = resolve; });
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : RULES });
        });
        await open();
        await press(row('Gift Cards'));
        await press(row('Cart Rules'));

        late.resolve?.({ success: true, data: PRODUCTS });
        await settle();

        expect(screen.getByRole('checkbox', { name: /Spring Sale/ })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /VR Rack/ })).not.toBeInTheDocument();
    });
});

describe('a kind with nothing to select', () => {
    it('keeps its row clickable until a read has answered, then greys it out and moves on', async () => {
        answer({ products: PRODUCTS, customers: RULES });
        await open();
        expect(row('Gift Cards')).toBeEnabled();

        await press(row('Gift Cards'));

        expect(row('Gift Cards')).toBeDisabled();
        expect(row('Gift Cards')).toHaveTextContent('None available');
        expect(row('Categories')).not.toHaveAttribute('aria-current', 'false');
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

describe('Save', () => {
    it('cannot save nothing from a store Demo Builder did not fill', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(button('Create')).toHaveAttribute('aria-disabled', 'true');
    });

    it('is off again when the last selection is taken away', async () => {
        answer({ products: PRODUCTS });
        await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(button('Create')).toHaveAttribute('aria-disabled', 'false');

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(button('Create')).toHaveAttribute('aria-disabled', 'true');
    });

    it('can save a pack Demo Builder installed with nothing selected', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open({ pack: { ...PACK, source: 'installer' } });

        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({});
    });
});

describe('Save As', () => {
    it("asks the new pack's name, starting from the one given, and saves from there", async () => {
        answer({});
        const onSave = await open({ pack: PACK, saveAsName: 'Bodea Copy' });

        expect(screen.getByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        expect(screen.getByText("Saves this demo's data as a new datapack.")).toBeInTheDocument();
        const name = screen.getByRole('textbox', { name: /Datapack Name/ });
        expect(name).toHaveValue('Bodea Copy');
        fireEvent.change(name, { target: { value: 'My Bodea' } });
        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({}, 'My Bodea');
    });

    it('branches off with Save As New: the name, keeping what Add Unused Items added', async () => {
        answer({ customer_groups: UNUSED_GROUPS });
        const onSave = await open({ pack: PACK });
        await press(button('Add Unused Items'));
        await press(screen.getByRole('checkbox', { name: /Live Demo/ }));
        await press(button('Add'));

        await press(button('Save As New'));
        expect(screen.getByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        expect(screen.getByText("Saves this demo's data as a new datapack.")).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox', { name: /Datapack Name/ }), { target: { value: 'Bodea Retail' } });
        expect(screen.queryByRole('button', { name: 'Save As New' })).not.toBeInTheDocument();
        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({ customer_groups: ['31'] }, 'Bodea Retail');
    });

    it('will not go on without a name, from nothing', async () => {
        answer({ products: PRODUCTS });
        await open({ saveAsName: '' });

        expect(button('Continue')).toHaveAttribute('aria-disabled', 'true');
    });
});

describe('Add Unused Items (walk F85)', () => {
    it("opens over the save, adds what is ticked, and says how many on its button", async () => {
        answer({ customer_groups: UNUSED_GROUPS });
        const onSave = await open({ pack: PACK });

        await press(button('Add Unused Items'));
        expect(screen.getByRole('heading', { name: 'Add Unused Items' })).toBeInTheDocument();
        expect(screen.getByText("This demo doesn't use these yet. Select any to include.")).toBeInTheDocument();
        await press(screen.getByRole('checkbox', { name: /Live Demo/ }));
        await press(button('Add'));

        expect(screen.getByRole('heading', { name: 'Save Changes' })).toBeInTheDocument();
        await press(button('Add Unused Items (1)'));
        expect(screen.getByRole('checkbox', { name: /Live Demo/ })).toBeChecked();
        await press(button('Add'));
        await press(button('Save'));
        expect(onSave).toHaveBeenCalledWith({ customer_groups: ['31'] });
    });

    it('puts the selections back as they were on Cancel, and returns to the save', async () => {
        answer({ customer_groups: UNUSED_GROUPS });
        const onSave = await open({ pack: PACK });

        await press(button('Add Unused Items'));
        await press(screen.getByRole('checkbox', { name: /Live Demo/ }));
        await press(button('Cancel'));

        expect(screen.getByRole('heading', { name: 'Save Changes' })).toBeInTheDocument();
        expect(button('Add Unused Items')).toBeInTheDocument();
        await press(button('Save'));
        expect(onSave).toHaveBeenCalledWith({});
    });
});

describe('Select All Data (2026-11-03)', () => {
    const everything = () => screen.getByRole('checkbox', { name: 'Select All Data' });

    it('reads the kinds not opened yet, ticks every item of every kind, and hands them all to Save', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open();
        expect(everything()).not.toBeChecked();

        await press(everything());
        await settle();

        // Every kind that may have something was asked for, once each.
        expect(listCalls().map((call) => call.dataType)).toEqual(expect.arrayContaining(['products', 'cart_rules', 'customers']));
        expect(everything()).toBeChecked();
        expect(row('Products')).toHaveTextContent('2 selected');
        expect(row('Cart Rules')).toHaveTextContent('1 selected');
        await press(button('Create'));
        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'], cart_rules: ['7'] });
    });

    it('shows the dash when only some are ticked, and clears every kind when unticked', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open();

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(everything()).toHaveAttribute('aria-checked', 'mixed');

        await press(everything());
        await settle();
        expect(everything()).toBeChecked();
        await press(everything());

        expect(everything()).not.toBeChecked();
        expect(row('Products')).not.toHaveTextContent('selected');
    });

    it('shows the spinner and waits while it reads, then ticks what answered', async () => {
        let answerCustomers: (value: unknown) => void = () => undefined;
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: null });
            if (payload?.dataType === 'customers') return new Promise((resolve) => (answerCustomers = resolve));
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : NONE });
        });
        await open();

        await press(screen.getByRole('checkbox', { name: /^Select All Data/ }));

        expect(screen.getByRole('progressbar', { name: 'Reading the data to select' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /^Select All Data/ })).toBeDisabled();
        await act(async () => answerCustomers({ success: true, data: RULES }));
        await settle();
        expect(screen.queryByRole('progressbar', { name: 'Reading the data to select' })).not.toBeInTheDocument();
        expect(everything()).toBeChecked();
    });

    it("says on a kind's row when its list could not be read, and ticks the rest", async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: null });
            if (payload?.dataType === 'customers') return Promise.resolve({ success: false, error: 'No answer.' });
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : NONE });
        });
        await open();

        await press(everything());
        await settle();

        expect(row('Customers')).toHaveTextContent("Couldn't be read");
        expect(row('Products')).toHaveTextContent('2 selected');
    });
});
