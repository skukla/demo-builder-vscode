/**
 * "Create datapack": one window, one question per screen (owner, 2026-11-02). The first screen and
 * which screen each engine opens on. The header offers it with the service's engine only; with
 * Demo Builder's a pack is made from the demo's own card (Save As, `ProjectPackSection`). The
 * export routes have their own suites; the screens that pick from the store are also pinned by
 * SaveFromStoreModal.test.tsx, which starts on them.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { press, settle } from '../../../../helpers/reactSettle';
import { button, card, check, CreateDatapackModal, isOff, mockRequest, renderCreate, SCOPES, withService } from './CreateDatapackModal.testUtils';
import type { StoreItemPage } from '@/features/data-installer/pickableKinds';

const PRODUCTS: StoreItemPage = {
    items: [{ id: 'VR-Rack', displayName: 'VR Rack', detail: 'VR-Rack', key: 'VR-Rack' }],
    totalCount: 1,
    excludedCount: 0,
    inPackCount: 0,
};

beforeEach(() => {
    mockRequest.mockReset();
    withService({ ...SCOPES, 'list-datapack-export-items': { success: true, data: PRODUCTS } });
});

// ACO packs are held back until ACO support ships (owner, 2026-11-03), so there is one pack type and
// no screen asking for it: Create opens on the Commerce pack's first screen. The ACO line reverts this.
describe('the first screen', () => {
    it("opens on the Commerce pack's first screen, with no pack type to choose", async () => {
        await renderCreate('demo-builder');

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('heading', { name: 'Create Datapack' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^ACO Datapack/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Commerce Datapack/ })).not.toBeInTheDocument();
        // CONTROL: the Commerce pack's own first screen is there.
        expect(card('Products')).toBeInTheDocument();
    });

    it('draws Cancel first and Back off, since there is no screen before it', async () => {
        await renderCreate('demo-builder');

        const footer = screen.getAllByRole('button').filter((b) => ['Cancel', 'Back', 'Create'].includes(b.textContent ?? ''));
        expect(footer.map((b) => b.textContent)).toEqual(['Cancel', 'Back', 'Create']);
        expect(isOff('Back')).toBe(true);
    });
});

describe('which screen each engine opens on', () => {
    it("Demo Builder's engine opens on the selection, reading the counts and the first kind", async () => {
        await renderCreate('demo-builder');

        expect(card('Products')).toBeInTheDocument();
        expect(card('Attribute Sets')).toBeInTheDocument();
        expect(mockRequest.mock.calls.map((c) => c[0]).sort()).toEqual(['count-datapack-export-items', 'list-datapack-export-items']);
    });

    it.each([['service'], [undefined]] as const)("the %s engine opens on the service's data types", async (engine) => {
        await renderCreate(engine);

        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-data-types')).toBe(true);
        expect(check('Attribute Sets')).not.toBeChecked();
        expect(screen.queryByRole('button', { name: /^Products/ })).not.toBeInTheDocument();
    });
});

describe('closing and reopening', () => {
    it('closes without making anything', async () => {
        const { onClose } = await renderCreate('service');

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockRequest.mock.calls.some((c) => c[0] === 'start-datapack-export')).toBe(false);
    });

    it('starts again with nothing picked when reopened', async () => {
        const { unmount } = await renderCreate('demo-builder');
        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        unmount();

        render(<CreateDatapackModal engine="demo-builder" onClose={jest.fn()} />);
        await settle();

        expect(screen.getByRole('checkbox', { name: /VR Rack/ })).not.toBeChecked();
        expect(isOff('Create')).toBe(true);
    });

    it('stays on one dialog through every screen', async () => {
        await renderCreate('service');
        fireEvent.click(check('Attribute Sets'));
        fireEvent.click(button('Continue'));
        await settle();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
});
