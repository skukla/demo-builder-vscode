/**
 * "Create datapack": one window, one question per screen (owner, 2026-11-02). The first screen,
 * which route each engine and pack type takes, and Demo Builder's engine through to the save. The
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

describe('the first screen', () => {
    it('asks one question, with two cards in one window', async () => {
        await renderCreate('demo-builder');

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('heading', { name: 'Create datapack' })).toBeInTheDocument();
        expect(card('Commerce datapack')).toBeInTheDocument();
        expect(card('ACO datapack')).toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        expect(screen.queryByText(/as a new version/)).not.toBeInTheDocument();
    });

    it('reads nothing until a pack type is chosen and Continue pressed', async () => {
        await renderCreate('demo-builder');
        await press(card('ACO datapack'));

        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('draws Cancel first, Back off, and Continue off until a card is clicked', async () => {
        await renderCreate('demo-builder');

        const footer = screen.getAllByRole('button').filter((b) => ['Cancel', 'Back', 'Continue'].includes(b.textContent ?? ''));
        expect(footer.map((b) => b.textContent)).toEqual(['Cancel', 'Back', 'Continue']);
        expect(isOff('Back')).toBe(true);
        expect(isOff('Continue')).toBe(true);

        await press(card('Commerce datapack'));

        expect(isOff('Continue')).toBe(false);
    });

    it('marks the card clicked, and only that one', async () => {
        await renderCreate('demo-builder');

        await press(card('Commerce datapack'));
        expect(card('Commerce datapack')).toHaveAttribute('data-selected', 'true');
        expect(card('ACO datapack')).toHaveAttribute('data-selected', 'false');

        await press(card('ACO datapack'));
        expect(card('Commerce datapack')).toHaveAttribute('data-selected', 'false');
        expect(card('ACO datapack')).toHaveAttribute('data-selected', 'true');
    });

    it.each([
        ['demo-builder', "Save selected data from this store to this project's datapack."],
        ['service', 'Export data types from this store to the shared catalog.'],
        [undefined, 'Export data types from this store to the shared catalog.'],
    ] as const)('with the %s engine, says where a Commerce pack goes', async (engine, line) => {
        await renderCreate(engine);

        expect(screen.getByText(line)).toBeInTheDocument();
    });
});

describe('which route each engine and pack type takes', () => {
    it("Commerce with Demo Builder's engine goes to the selection, reading the counts and the first kind", async () => {
        await renderCreate('demo-builder');
        await press(card('Commerce datapack'));
        await press(button('Continue'));

        expect(card('Products')).toBeInTheDocument();
        expect(card('Attribute sets')).toBeInTheDocument();
        expect(mockRequest.mock.calls.map((c) => c[0]).sort()).toEqual(['count-datapack-export-items', 'list-datapack-export-items']);
    });

    it.each([['service'], [undefined]] as const)("Commerce with the %s engine goes to the service's data types", async (engine) => {
        const { onSaveFromStore } = await renderCreate(engine);
        await press(card('Commerce datapack'));
        await press(button('Continue'));

        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-data-types')).toBe(true);
        expect(check('Attribute sets')).not.toBeChecked();
        expect(screen.queryByRole('button', { name: /^Products/ })).not.toBeInTheDocument();
        expect(onSaveFromStore).not.toHaveBeenCalled();
    });

    it.each([['service'], ['demo-builder']] as const)('ACO with the %s engine goes to the store views', async (engine) => {
        const { onSaveFromStore } = await renderCreate(engine);
        await press(card('ACO datapack'));
        await press(button('Continue'));

        expect(check('Default Store View')).toBeChecked();
        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-export-items')).toBe(false);
        expect(onSaveFromStore).not.toHaveBeenCalled();
    });
});

describe("Commerce with Demo Builder's engine", () => {
    it('Create starts the save with what is selected, then closes', async () => {
        const { onClose, onSaveFromStore } = await renderCreate('demo-builder');
        await press(card('Commerce datapack'));
        await press(button('Continue'));
        expect(isOff('Create')).toBe(true);

        await press(screen.getByRole('checkbox', { name: /VR Rack/ }));
        await press(button('Create'));

        expect(onSaveFromStore).toHaveBeenCalledWith({ products: ['VR-Rack'] });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('goes back from the selection to the first screen, keeping the choice', async () => {
        await renderCreate('demo-builder');
        await press(card('Commerce datapack'));
        await press(button('Continue'));

        await press(button('Back'));

        expect(card('Commerce datapack')).toHaveAttribute('data-selected', 'true');
        expect(isOff('Back')).toBe(true);
    });
});

describe('closing and reopening', () => {
    it('closes without making anything', async () => {
        const { onClose, onSaveFromStore } = await renderCreate('demo-builder');

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSaveFromStore).not.toHaveBeenCalled();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('starts at the first screen when reopened', async () => {
        const { unmount } = await renderCreate('demo-builder');
        await press(card('Commerce datapack'));
        await press(button('Continue'));
        unmount();

        render(<CreateDatapackModal engine="demo-builder" onClose={jest.fn()} onSaveFromStore={jest.fn()} />);
        await settle();

        expect(card('Commerce datapack')).toHaveAttribute('data-selected', 'false');
        expect(isOff('Continue')).toBe(true);
    });

    it('stays on one dialog through every screen', async () => {
        await renderCreate('service');
        fireEvent.click(card('ACO datapack'));
        fireEvent.click(button('Continue'));
        await settle();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
});
