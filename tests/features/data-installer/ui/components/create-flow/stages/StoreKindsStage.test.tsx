/**
 * The cards of "What goes in it" as the store's counts arrive (`count-datapack-export-items`):
 * shown at once and clickable while they are read, greyed with no click by a count of none, and
 * left alone by a count that failed or was not none. A kind's list, once answered, decides.
 */

import '../../../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PICKABLE_KINDS, type StoreItemPage, type StoreKindCounts } from '@/features/data-installer/pickableKinds';
import { SaveFromStoreModal } from '@/features/data-installer/ui/components/SaveFromStoreModal';

const mockRequest = webviewClient.request as jest.Mock;

const COUNT = 'count-datapack-export-items';
const LIST = 'list-datapack-export-items';
const NONE_NOTE = 'None in this store';
const PRODUCTS: StoreItemPage = { items: [{ id: 'VR-Rack', displayName: 'VR Rack', detail: 'VR-Rack', key: 'VR-Rack' }], totalCount: 1, excludedCount: 0, inPackCount: 0 };
const ALL_IN_PACK: StoreItemPage = { items: [], totalCount: 3, excludedCount: 0, inPackCount: 3 };
const PACK = { id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', source: 'library' as const };

function answer(counts: unknown, pages: Record<string, StoreItemPage> = {}) {
    mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) => {
        if (type === COUNT) return counts;
        return type === LIST ? { success: true, data: pages[payload?.dataType ?? ''] ?? PRODUCTS } : { success: true, data: null };
    });
}

const counted = (counts: StoreKindCounts) => ({ success: true, data: counts });
const callsOf = (type: string) => mockRequest.mock.calls.filter((c) => c[0] === type);
const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

async function open(props: Partial<React.ComponentProps<typeof SaveFromStoreModal>> = {}) {
    render(<SaveFromStoreModal onClose={jest.fn()} onSave={jest.fn()} {...props} />);
    await settle();
}

beforeEach(() => mockRequest.mockReset());

describe('while the counts are being read', () => {
    it('shows every card at once, clickable', async () => {
        mockRequest.mockImplementation(() => new Promise(() => undefined));
        await open();

        const cards = screen.getAllByRole('button').filter((b) => b.classList.contains('choice-card'));
        expect(cards).toHaveLength(PICKABLE_KINDS.length);
        cards.forEach((c) => expect(c).toBeEnabled());
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});

describe('a count of none', () => {
    it('greys its card out with no click, and reads no list', async () => {
        answer(counted({ giftcards: 0, products: 139 }));
        await open();

        expect(card('Gift cards')).toBeDisabled();
        expect(card('Gift cards')).toHaveTextContent(NONE_NOTE);
        expect(callsOf(LIST)).toHaveLength(0);
    });

    it('drops what the kind would bring, since it brings nothing', async () => {
        answer(counted({ products: 0, cart_rules: 3 }));
        await open();

        expect(card('Products')).not.toHaveTextContent('Brings');
        expect(card('Cart rules')).toHaveTextContent('Brings its coupons.');
    });

    it('leaves a card with some clickable, and says no number', async () => {
        answer(counted({ giftcards: 0, products: 139 }));
        await open();

        expect(card('Products')).toBeEnabled();
        expect(card('Products')).not.toHaveTextContent('139');
    });
});

describe('a count that failed', () => {
    it('leaves every card clickable and shows nothing: a refusal', async () => {
        answer({ success: false, error: 'Sign in first.' });
        await open();

        screen.getAllByRole('button').filter((b) => b.classList.contains('choice-card')).forEach((c) => expect(c).toBeEnabled());
        expect(screen.queryByText(/Sign in first/)).not.toBeInTheDocument();
    });

    it('leaves every card clickable and shows nothing: no answer at all', async () => {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === COUNT) throw new Error('Request timed out');
            return { success: true, data: PRODUCTS };
        });
        await open();

        screen.getAllByRole('button').filter((b) => b.classList.contains('choice-card')).forEach((c) => expect(c).toBeEnabled());
        expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();
    });

    it('leaves the one kind it could not count clickable', async () => {
        answer(counted({ products: 0 }));
        await open();

        expect(card('Products')).toBeDisabled();
        expect(card('Customers')).toBeEnabled();
    });

    it('does not ask again on the way back from a kind', async () => {
        answer({ success: false, error: 'Sign in first.' });
        await open();

        await press(card('Products'));
        await press(screen.getByRole('button', { name: 'Back' }));

        expect(callsOf(COUNT)).toHaveLength(1);
    });
});

describe('a count and a list', () => {
    it('lets the list decide once it has answered: the count said some, the list left none', async () => {
        answer(counted({ products: 3 }), { products: ALL_IN_PACK });
        await open();
        expect(card('Products')).toBeEnabled();

        await press(card('Products'));

        expect(card('Products')).toBeDisabled();
        expect(card('Products')).toHaveTextContent('3 in the pack already');
    });

    it('keeps "2 picked" for a kind with a count above none', async () => {
        const TWO: StoreItemPage = { ...PRODUCTS, items: [...PRODUCTS.items, { id: 'Tray', displayName: 'Cable Tray', key: 'Tray' }], totalCount: 2 };
        answer(counted({ products: 2 }), { products: TWO });
        await open();

        await press(card('Products'));
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(screen.getByRole('checkbox', { name: /Cable Tray/ }));
        await press(screen.getByRole('button', { name: 'Back' }));

        expect(card('Products')).toHaveTextContent('2 picked');
        expect(callsOf(COUNT)).toHaveLength(1);
    });
});

describe('what the count is asked of', () => {
    it('names the pack being saved, as the list does', async () => {
        answer(counted({}));
        await open({ pack: PACK });

        expect(callsOf(COUNT)[0][1]).toEqual({ datapackName: 'bodea', version: 'main', source: 'library' });
    });

    it('names none when no pack is being saved', async () => {
        answer(counted({}));
        await open();

        expect(callsOf(COUNT)[0][1]).toStrictEqual({});
    });
});
