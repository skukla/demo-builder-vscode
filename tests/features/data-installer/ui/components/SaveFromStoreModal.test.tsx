/**
 * The screen that selects from the store, as Save and Save As open it (datapack-engine step 14,
 * `.rptc/plans/datapack-save-as/`). The kinds on the left; clicking one shows its checklist on the right, its items asked of
 * `list-datapack-export-items` (less what the pack being saved holds); selections kept across kinds
 * and counted on each row; Save hands them on.
 *
 * The list answers are `StoreItemPage`s, typed to the handler's own interface.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
        await open({ pack: PACK });

        // Save names the pack it writes into (2026-11-03).
        expect(screen.getByRole('heading', { name: 'Save Bodea' })).toBeInTheDocument();
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

    it('has nothing to go back to', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(button('Back')).toHaveAttribute('aria-disabled', 'true');
    });

    it('offers Cancel, not Close, while nothing has happened', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(button('Cancel')).toBeInTheDocument();
    });

    it('says what saving a held pack does, and not otherwise', async () => {
        answer({ products: PRODUCTS });
        await open({ pack: PACK });
        expect(screen.getByText(/Includes what Bodea put in Commerce/)).toBeInTheDocument();
    });

    it('has no opening paragraph for a store with no pack', async () => {
        answer({ products: PRODUCTS });
        await open();
        expect(screen.queryByText(/a new version/)).not.toBeInTheDocument();
    });
});

describe('selecting the items', () => {
    it('lists the first kind on opening, with no pack named for a store Demo Builder did not fill', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(listCalls()).toEqual([{ dataType: 'products' }]);
        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
    });

    it('asks for the kind less what the pack being saved holds, and says how many it holds', async () => {
        answer({ products: PRODUCTS });
        await open({ pack: PACK });

        expect(listCalls()).toEqual([{ dataType: 'products', datapackName: 'bodea', version: 'main', source: 'library' }]);
        expect(screen.getByText('2 more already in the datapack.')).toBeInTheDocument();
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
        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'], cart_rules: ['7'] });
    });

    it('ticks every item the filter shows with Select All, showing a dash for some', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(screen.getByRole('checkbox', { name: 'Select All' })).toBePartiallyChecked();

        await press(screen.getByRole('checkbox', { name: 'Select All' }));
        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'] });
    });

    it('writes a large count with separators', async () => {
        const items = Array.from({ length: 1284 }, (_, i) => ({ id: `s${i}`, displayName: `Item ${i}`, key: `s${i}` }));
        answer({ products: { items, totalCount: 1284, excludedCount: 0, inPackCount: 0 } });
        await open();

        await press(screen.getByRole('checkbox', { name: 'Select All' }));

        expect(row('Products')).toHaveTextContent('1,284 selected');
    });

    it('reads with a silent spinner, keeping the rows and Save, so a slow read costs nothing', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: {} });
            return payload?.dataType === 'products' ? Promise.resolve({ success: true, data: PRODUCTS }) : new Promise(() => undefined);
        });
        await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        await press(row('Cart Rules'));

        expect(screen.getByRole('progressbar', { name: /Loading the store's cart rules/ })).toBeInTheDocument();
        expect(screen.queryByText(/Loading the store's/)).not.toBeInTheDocument();
        expect(button('Save')).toHaveAttribute('aria-disabled', 'false');

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

        expect(button('Save')).toHaveAttribute('aria-disabled', 'true');
    });

    it('is off again when the last selection is taken away', async () => {
        answer({ products: PRODUCTS });
        await open();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(button('Save')).toHaveAttribute('aria-disabled', 'false');

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(button('Save')).toHaveAttribute('aria-disabled', 'true');
    });

    it('can save a pack Demo Builder installed with nothing selected', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open({ pack: { ...PACK, source: 'installer' } });

        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({});
    });
});

describe('Save As', () => {
    it('asks the new pack\'s name first, starting from the one given, then the picks, and hands both on', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open({ pack: PACK, saveAsName: 'Bodea Copy' });

        expect(screen.getByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        const name = screen.getByRole('textbox', { name: /Datapack Name/ });
        expect(name).toHaveValue('Bodea Copy');
        fireEvent.change(name, { target: { value: 'My Bodea' } });
        await press(button('Continue'));
        await settle();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(button('Create'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'] }, 'My Bodea');
    });

    it('will not go on without a name', async () => {
        answer({ products: PRODUCTS });
        await open({ saveAsName: '' });

        expect(button('Continue')).toHaveAttribute('aria-disabled', 'true');
    });
});

describe('Select Everything (2026-11-03)', () => {
    const everything = () => screen.getByRole('checkbox', { name: 'Select Everything' });

    it('reads the kinds not opened yet, ticks every item of every kind, and hands them all to Save', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open({ pack: PACK });
        expect(everything()).not.toBeChecked();

        await press(everything());
        await settle();

        // Every kind that may have something was asked for, once each.
        expect(listCalls().map((call) => call.dataType)).toEqual(expect.arrayContaining(['products', 'cart_rules', 'customers']));
        expect(everything()).toBeChecked();
        expect(row('Products')).toHaveTextContent('2 selected');
        expect(row('Cart Rules')).toHaveTextContent('1 selected');
        await press(button('Save'));
        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'], cart_rules: ['7'] });
    });

    it('shows the dash when only some are ticked, and clears every kind when unticked', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await open({ pack: PACK });

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(everything()).toHaveAttribute('aria-checked', 'mixed');

        await press(everything());
        await settle();
        expect(everything()).toBeChecked();
        await press(everything());

        expect(everything()).not.toBeChecked();
        expect(row('Products')).not.toHaveTextContent('selected');
    });
});
