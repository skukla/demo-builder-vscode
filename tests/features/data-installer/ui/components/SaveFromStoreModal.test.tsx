/**
 * The screens that pick from the store, as "Save store changes to this pack" opens them, starting at
 * what goes in it (datapack-engine step 14). A card per kind; clicking one opens its checklist, its
 * items asked of `list-datapack-export-items` (less what the pack being saved holds); Back returns
 * with the count updated; picks kept across kinds; Save hands them on.
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
const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const button = (name: string) => screen.getByRole('button', { name });

async function open(props: Partial<React.ComponentProps<typeof SaveFromStoreModal>> = {}) {
    const onSave = jest.fn();
    render(<SaveFromStoreModal onClose={jest.fn()} onSave={onSave} {...props} />);
    await settle();
    return onSave;
}

beforeEach(() => mockRequest.mockReset());

describe('what goes in it', () => {
    it('starts here under its own title, with one card per kind in order, reading nothing', async () => {
        await open();

        expect(screen.getByRole('heading', { name: 'Choose what goes in the pack' })).toBeInTheDocument();
        const names = screen.getAllByRole('button').filter((b) => b.classList.contains('choice-card')).map((b) => b.querySelector('.choice-card-name')?.textContent);
        expect(names).toEqual(PICKABLE_KINDS.map(dataTypeLabel));
        expect(listCalls()).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Commerce datapack/ })).not.toBeInTheDocument();
    });

    it('says what a picked thing brings on the card it is about, and on no other', async () => {
        await open();

        expect(card('Products')).toHaveTextContent('Brings its categories, attributes and stock.');
        expect(card('Cart rules')).toHaveTextContent('Brings its coupons.');
        expect(card('B2B companies')).toHaveTextContent('Brings its admin.');
        expect(screen.getAllByText(/^Brings/)).toHaveLength(3);
    });

    it('has nothing to go back to', async () => {
        await open();

        expect(button('Back')).toHaveAttribute('aria-disabled', 'true');
    });

    it('says what saving a held pack does, and not otherwise', async () => {
        await open({ pack: PACK });
        expect(screen.getByText(/Saves this store's copy of Bodea as a new version/)).toBeInTheDocument();
    });

    it('has no opening paragraph for a store with no pack', async () => {
        await open();
        expect(screen.queryByText(/as a new version/)).not.toBeInTheDocument();
    });
});

describe('picking the items', () => {
    it("lists a kind when its card is clicked, with no pack named for a store Demo Builder did not fill", async () => {
        answer({ products: PRODUCTS });
        await open();

        await press(card('Products'));

        expect(listCalls()).toEqual([{ dataType: 'products' }]);
        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
    });

    it('asks for the kind less what the pack being saved holds, and says how many it holds', async () => {
        answer({ products: PRODUCTS });
        await open({ pack: PACK });

        await press(card('Products'));

        expect(listCalls()).toEqual([{ dataType: 'products', datapackName: 'bodea', version: 'main', source: 'library' }]);
        expect(screen.getByText('2 more are in the pack already and are saved with it.')).toBeInTheDocument();
    });

    it('returns to the cards with the count updated, and does not read a kind twice', async () => {
        answer({ products: PRODUCTS });
        await open();
        await press(card('Products'));
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        await press(button('Back'));

        expect(card('Products')).toHaveTextContent('1 picked');
        expect(card('Products')).toHaveAttribute('data-selected', 'true');
        expect(card('Categories')).toHaveAttribute('data-selected', 'false');

        await press(card('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeChecked();
        expect(listCalls()).toHaveLength(1);
    });

    it('keeps the picks of every kind, and hands them all to Save', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open();

        await press(card('Products'));
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(button('Back'));
        await press(card('Cart rules'));
        await press(screen.getByRole('checkbox', { name: /Spring Sale/ }));
        await press(button('Save with 2 picked'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'], cart_rules: ['7'] });
    });

    it('ticks every item the filter shows with Select all', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open();
        await press(card('Products'));

        await press(button('Select all'));
        await press(button('Save with 2 picked'));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'] });
    });

    it('writes a large count with separators', async () => {
        const items = Array.from({ length: 1284 }, (_, i) => ({ id: `s${i}`, displayName: `Item ${i}`, key: `s${i}` }));
        answer({ products: { items, totalCount: 1284, excludedCount: 0, inPackCount: 0 } });
        await open();
        await press(card('Products'));

        await press(button('Select all'));

        expect(button('Save with 1,284 picked')).toBeInTheDocument();
    });

    it('reads with a silent spinner, keeping Back and Save, so a slow read costs no picks', async () => {
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) =>
            payload?.dataType === 'products' ? Promise.resolve({ success: true, data: PRODUCTS }) : new Promise(() => undefined),
        );
        await open();
        await press(card('Products'));
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(button('Back'));

        await press(card('Cart rules'));

        expect(screen.getByRole('progressbar', { name: /Loading the store's cart rules/ })).toBeInTheDocument();
        expect(screen.queryByText(/Loading the store's/)).not.toBeInTheDocument();
        expect(button('Save with 1 picked')).toBeInTheDocument();

        await press(button('Back'));

        expect(card('Products')).toHaveTextContent('1 picked');
    });

    it("does not take a late answer for another kind's", async () => {
        const late: { resolve?: (value: unknown) => void } = {};
        mockRequest.mockImplementation((_type: string, payload?: { dataType?: string }) =>
            payload?.dataType === 'products'
                ? new Promise((resolve) => { late.resolve = resolve; })
                : Promise.resolve({ success: true, data: RULES }),
        );
        await open();
        await press(card('Products'));
        await press(button('Back'));
        await press(card('Cart rules'));

        late.resolve?.({ success: true, data: PRODUCTS });
        await settle();

        expect(screen.getByRole('checkbox', { name: /Spring Sale/ })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /VR Rack/ })).not.toBeInTheDocument();
    });
});

describe('a kind with nothing to pick', () => {
    it('keeps its card clickable until a read has answered, then greys it out', async () => {
        answer({});
        await open();
        expect(card('Gift cards')).toBeEnabled();

        await press(card('Gift cards'));

        expect(card('Gift cards')).toBeDisabled();
        expect(card('Gift cards')).toHaveTextContent('None in this store');
        expect(screen.queryByText(/of its own to pick/)).not.toBeInTheDocument();
        expect(listCalls()).toHaveLength(1);
    });

    it('cannot be opened again once greyed out', async () => {
        answer({});
        await open();
        await press(card('Gift cards'));

        fireEvent.click(card('Gift cards'));
        await settle();

        expect(listCalls()).toHaveLength(1);
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('says how many the pack holds when that is why', async () => {
        answer({ products: { items: [], totalCount: 1040, excludedCount: 0, inPackCount: 1040 } });
        await open({ pack: PACK });

        await press(card('Products'));

        expect(card('Products')).toBeDisabled();
        expect(card('Products')).toHaveTextContent('1,040 in the pack already');
    });
});

describe('a read that fails', () => {
    /** The first list read is refused; the counts, read before it, are not. */
    function refuseFirst() {
        const answering = mockRequest.getMockImplementation();
        let refused = false;
        mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items' || refused) return answering?.(type, payload);
            refused = true;
            return { success: false, error: 'The install target names no website.' };
        });
    }

    it('says why, and leaves the card clickable', async () => {
        answer({ products: PRODUCTS });
        refuseFirst();
        await open();

        await press(card('Products'));

        expect(screen.getByText("The store's products could not be listed: The install target names no website.")).toBeInTheDocument();

        await press(button('Back'));

        expect(card('Products')).toBeEnabled();
    });

    it('reads again when the card is clicked again', async () => {
        answer({ products: PRODUCTS });
        refuseFirst();
        await open();
        await press(card('Products'));
        await press(button('Back'));

        await press(card('Products'));

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).toBeInTheDocument();
        expect(listCalls()).toHaveLength(2);
    });
});

describe('Save', () => {
    it('cannot save nothing from a store Demo Builder did not fill', async () => {
        await open();

        expect(button('Save')).toHaveAttribute('aria-disabled', 'true');
    });

    it('is off again when the last pick is taken away', async () => {
        answer({ products: PRODUCTS });
        await open();
        await press(card('Products'));
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        expect(button('Save with 1 picked')).toHaveAttribute('aria-disabled', 'false');

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));

        expect(button('Save')).toHaveAttribute('aria-disabled', 'true');
    });

    it('can save a pack Demo Builder installed with nothing picked', async () => {
        const onSave = await open({ pack: { ...PACK, source: 'installer' } });

        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith({});
    });
});
