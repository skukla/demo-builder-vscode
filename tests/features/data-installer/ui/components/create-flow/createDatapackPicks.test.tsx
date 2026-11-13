/**
 * Create Datapack's pick screen (datapack-engine step 14, `.rptc/plans/datapack-save-as/`): the kinds
 * on the left; clicking one shows its checklist on the right, its items asked of
 * `list-datapack-export-items`; selections kept across kinds and counted on each row; Next goes on to
 * the name, and Create hands both on. Create is two windows (step-04 S3; decisions Phase 7b, J3-2):
 * what it holds, everything ticked to start (overview 7b), then the name.
 *
 * Ported from `SaveFromStoreModal.test.tsx` (deleted in step-04 S2) for what is still true of
 * Create. A save from a datapack is no longer this dialog: Save Changes and Save As New are their own
 * windows (`components/save/`), and Add Unused Items was removed (overview 7b, 2026-11-10).
 *
 * The list answers are `StoreItemPage`s, typed to the handler's own interface.
 */

import '../../../../../helpers/webviewClientMock';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PICKABLE_KINDS, type StoreItemPage } from '@/features/data-installer/pickableKinds';
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
    it('lists the first kind on opening, naming no datapack', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(listCalls()).toEqual([{ dataType: 'products' }]);
        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
    });

    it('counts on the row as items are selected, and does not read a kind twice', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(row('Products')).toHaveTextContent('1 selected');
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

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'], cart_rules: ['7'] }, 'Hand Built');
    });

    it('ticks every item the filter shows with Select All, showing a dash for some', async () => {
        answer({ products: PRODUCTS });
        const onSave = await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(screen.getByRole('checkbox', { name: 'Select All' })).toBePartiallyChecked();

        await press(screen.getByRole('checkbox', { name: 'Select All' }));
        await create();

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'] }, 'Hand Built');
    });

    it('writes a large count with separators', async () => {
        const items = Array.from({ length: 1284 }, (_, i) => ({ id: `s${i}`, displayName: `Item ${i}`, key: `s${i}` }));
        answer({ products: { items, totalCount: 1284, excludedCount: 0, inPackCount: 0 } });
        await open();

        expect(row('Products')).toHaveTextContent('1,284 selected');
    });

    // Owner, 2026-11-08 (F79): the pane's bare spinner said nothing; it waits in the house rows.
    it('reads in its pane, saying what it reads, keeping the rows and Next, so a slow read costs nothing', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: {} });
            return payload?.dataType === 'products' ? Promise.resolve({ success: true, data: PRODUCTS }) : new Promise(() => undefined);
        });
        await openCleared();
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        await press(row('Cart Rules'));

        expect(screen.getByText('Reading cart rules')).toBeInTheDocument();
        expect(screen.getByText('From Commerce')).toBeInTheDocument();
        expect(button('Next')).toHaveAttribute('aria-disabled', 'false');

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

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'] }, 'Hand Built');
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
    it('starts ticked, reads only the kind shown, and hands every item of every kind to Create', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open();
        expect(everything()).toBeChecked();
        expect(listCalls()).toEqual([{ dataType: 'products' }]);
        expect(row('Products')).toHaveTextContent('2 selected');

        await create();

        // Every kind that may have something was asked for, once each, at Next.
        expect(listCalls().map((call) => call.dataType)).toEqual(PICKABLE_KINDS);
        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'], cart_rules: ['7'] }, 'Hand Built');
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

    it('shows the spinner on Next while it reads the kinds not yet read, then goes on', async () => {
        let answerCustomers: (value: unknown) => void = () => undefined;
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: null });
            if (payload?.dataType === 'customers') return new Promise((resolve) => (answerCustomers = resolve));
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : NONE });
        });
        await open();

        await press(button('Next'));

        expect(screen.getByRole('button', { name: /^Next/ })).toHaveAttribute('aria-busy', 'true');
        await act(async () => answerCustomers({ success: true, data: RULES }));
        await settle();
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toBeInTheDocument();
    });

    it('hands on what was read when one kind could not be read at Next', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: null });
            if (payload?.dataType === 'customers') return Promise.resolve({ success: false, error: 'No answer.' });
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : NONE });
        });
        const onSave = await open();

        await create();
        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'] }, 'Hand Built');
    });

    it("stays on the picks when Next finds nothing to hand on, saying so on the kind's row", async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return Promise.resolve({ success: true, data: null });
            if (payload?.dataType === 'customers') return Promise.resolve({ success: false, error: 'No answer.' });
            return Promise.resolve({ success: true, data: payload?.dataType === 'products' ? PRODUCTS : NONE });
        });
        await open();
        await press(row('Products'));
        await press(screen.getByRole('checkbox', { name: 'Select All' }));

        await press(button('Next'));

        expect(screen.queryByRole('textbox', { name: /Datapack Name/ })).not.toBeInTheDocument();
        expect(row('Customers')).toHaveTextContent("Couldn't be read");
    });
});
