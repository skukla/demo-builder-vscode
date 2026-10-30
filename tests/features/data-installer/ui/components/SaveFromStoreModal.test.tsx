/**
 * The pick screen, "Choose what goes in the pack" (datapack-engine step 14): the export screen with Demo Builder's engine.
 * One kind at a time, its items asked of `list-datapack-export-items` (less what the pack being
 * saved holds), picks kept across kinds, and Save handing them on.
 *
 * The list answers are `StoreItemPage`s, typed to the handler's own interface.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { change, press, settle } from '../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { StoreItemPage } from '@/features/data-installer/pickableKinds';
import { SaveFromStoreModal } from '@/features/data-installer/ui/components/SaveFromStoreModal';

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
const kindPicker = () => screen.getByTestId('spectrum-picker-select');

async function open(props: Partial<React.ComponentProps<typeof SaveFromStoreModal>> = {}) {
    const onSave = jest.fn();
    render(<SaveFromStoreModal onClose={jest.fn()} onSave={onSave} {...props} />);
    await settle();
    return onSave;
}

beforeEach(() => mockRequest.mockReset());

describe('SaveFromStoreModal', () => {
    it("lists the store's products first, with no pack named for a store Demo Builder did not fill", async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(listCalls()).toEqual([{ dataType: 'products' }]);
        expect(screen.getByText('VR Rack')).toBeInTheDocument();
    });

    it('asks for the kind less what the pack being saved holds, and says how many it holds', async () => {
        answer({ products: PRODUCTS });
        await open({ pack: { id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', source: 'library' } });

        expect(listCalls()).toEqual([{ dataType: 'products', datapackName: 'bodea', version: 'main', source: 'library' }]);
        expect(screen.getByText('2 more are in the pack already and are saved with it.')).toBeInTheDocument();
    });

    it('keeps the picks of every kind, and hands them all to Save', async () => {
        answer({ products: PRODUCTS, cart_rules: RULES });
        const onSave = await open();

        await press(screen.getByRole('checkbox', { name: /VR Rack/u }));
        await change(kindPicker(), 'cart_rules');
        await press(await screen.findByRole('checkbox', { name: /Spring Sale/u }));
        await press(screen.getByRole('button', { name: 'Save with 2 picked' }));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'], cart_rules: ['7'] });
    });

    it('ticks every item the filter shows with Select all', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open();

        await press(screen.getByRole('button', { name: 'Select all' }));
        await press(screen.getByRole('button', { name: 'Save with 2 picked' }));

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Cable-Tray'] });
    });

    it('cannot save nothing from a store Demo Builder did not fill', async () => {
        answer({ products: PRODUCTS });
        await open();

        expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('can save a pack Demo Builder installed with nothing picked', async () => {
        answer({ products: PRODUCTS });
        const onSave = await open({ pack: { id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', source: 'installer' } });

        await press(screen.getByRole('button', { name: 'Save' }));

        expect(onSave).toHaveBeenCalledWith({});
    });

    it('says why a kind has nothing to pick, and why a list could not be read', async () => {
        mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) =>
            payload?.dataType === 'products' ? { success: false, error: 'The install target names no website.' } : { success: true, data: NONE },
        );
        await open();

        expect(screen.getByText("The store's products could not be listed: The install target names no website.")).toBeInTheDocument();
        await change(kindPicker(), 'customers');
        expect(await screen.findByText('This store has no customers of its own to pick.')).toBeInTheDocument();
    });
});
