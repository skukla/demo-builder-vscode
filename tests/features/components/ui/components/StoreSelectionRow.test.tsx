/**
 * StoreSelectionRow Component Tests
 *
 * Tests cascade auto-selection logic:
 * - Selecting a website with one store group auto-selects the store group
 * - Selecting a website where the auto-selected store group has one store view
 *   also auto-selects the store view
 * - Selecting a store group with one store view auto-selects the store view
 * - Multiple options at any level → no auto-select at that level
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StoreSelectionRow } from '@/features/components/ui/components/StoreSelectionRow';
import type { ServiceGroup, UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

// Mock StoreStructureSelector to render one button per item for DOM-based testing.
// Testid format: "{label-lowercase-hyphenated}-{item.code}"  e.g. "website-base"
//
// Note: this couples the tests to the internal import path and picker labels.
// If StoreStructureSelector is renamed or moved, update this mock accordingly.
// The tradeoff is accepted to keep cascade logic tests stable without pulling
// in Spectrum's full rendering stack.
jest.mock('@/features/components/ui/components/StoreStructureSelector', () => ({
    StoreStructureSelector: ({
        label,
        items,
        onSelect,
    }: {
        label: string;
        items: Array<{ code: string; name: string }>;
        selectedCode: string;
        onSelect: (code: string) => void;
        isRequired?: boolean;
    }) => {
        const prefix = label.toLowerCase().replace(/\s+/g, '-');
        return (
            <div data-testid={`picker-${prefix}`}>
                {items.map(item => (
                    <button
                        key={item.code}
                        data-testid={`${prefix}-${item.code}`}
                        onClick={() => onSelect(item.code)}
                    >
                        {item.name}
                    </button>
                ))}
            </div>
        );
    },
}));

// Mock lookupComponentConfigValue
jest.mock('@/features/components/services/envVarHelpers', () => ({
    lookupComponentConfigValue: jest.fn(() => ''),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeField = (key: string): UniqueField => ({
    key,
    label: key,
    type: 'text',
    required: false,
});

const ACCS_WEBSITE_KEY = 'ACCS_WEBSITE_CODE';
const ACCS_STORE_KEY = 'ACCS_STORE_CODE';
const ACCS_STORE_VIEW_KEY = 'ACCS_STORE_VIEW_CODE';

const accsGroup: ServiceGroup = {
    id: 'accs',
    label: 'ACCS',
    fields: [
        makeField(ACCS_WEBSITE_KEY),
        makeField(ACCS_STORE_KEY),
        makeField(ACCS_STORE_VIEW_KEY),
    ],
};

const singleStore = [{ code: 'main', name: 'Main Store', numericId: 1 }];
const singleView = [{ code: 'default', name: 'Default View', numericId: 1 }];
const multiStore = [
    { code: 'store_a', name: 'Store A', numericId: 1 },
    { code: 'store_b', name: 'Store B', numericId: 2 },
];
const multiView = [
    { code: 'view_a', name: 'View A', numericId: 1 },
    { code: 'view_b', name: 'View B', numericId: 2 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProps(overrides?: {
    getStoreGroupItems?: (code: string) => typeof singleStore;
    getStoreViewItems?: (code: string) => typeof singleView;
    updateField?: jest.Mock;
}) {
    return {
        group: accsGroup,
        getFieldValue: jest.fn(() => ''),
        updateField: overrides?.updateField ?? jest.fn(),
        getWebsiteItems: jest.fn(() => [{ code: 'base', name: 'Base', numericId: 1 }]),
        getStoreGroupItems: overrides?.getStoreGroupItems ?? jest.fn(() => []),
        getStoreViewItems: overrides?.getStoreViewItems ?? jest.fn(() => []),
        componentConfigs: {},
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoreSelectionRow cascade auto-selection', () => {
    describe('website selection cascade', () => {
        it('auto-selects the store group when website has exactly one store group', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => singleStore,
                getStoreViewItems: () => [],
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('website-base'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_WEBSITE_KEY }),
                'base',
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'main',
            );
        });

        it('auto-selects store view when website→store→view chain has one option each', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => singleStore,
                getStoreViewItems: () => singleView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('website-base'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_WEBSITE_KEY }),
                'base',
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'main',
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                'default',
            );
            expect(updateField).toHaveBeenCalledTimes(3);
        });

        it('does not auto-select store group when website has multiple store groups', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => multiStore,
                getStoreViewItems: () => singleView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('website-base'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_WEBSITE_KEY }),
                'base',
            );
            expect(updateField).not.toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                expect.anything(),
            );
            expect(updateField).toHaveBeenCalledTimes(1);
        });

        it('auto-selects store group but not store view when store group has multiple views', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => singleStore,
                getStoreViewItems: () => multiView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('website-base'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'main',
            );
            expect(updateField).not.toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                expect.anything(),
            );
            expect(updateField).toHaveBeenCalledTimes(2);
        });

        it('does not cascade when website has no store groups', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => [],
                getStoreViewItems: () => singleView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('website-base'));

            expect(updateField).toHaveBeenCalledTimes(1);
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_WEBSITE_KEY }),
                'base',
            );
        });
    });

    describe('store group selection cascade', () => {
        it('auto-selects store view when store group has exactly one store view', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => multiStore,
                getStoreViewItems: () => singleView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('store-store_a'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'store_a',
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                'default',
            );
            expect(updateField).toHaveBeenCalledTimes(2);
        });

        it('does not auto-select store view when store group has multiple views', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => multiStore,
                getStoreViewItems: () => multiView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('store-store_a'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'store_a',
            );
            expect(updateField).not.toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                expect.anything(),
            );
            expect(updateField).toHaveBeenCalledTimes(1);
        });

        it('does not auto-select store view when store group has no views', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreGroupItems: () => multiStore,
                getStoreViewItems: () => [],
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('store-store_a'));

            expect(updateField).toHaveBeenCalledTimes(1);
        });
    });

    describe('store view selection', () => {
        it('only updates store view field with no further cascade', () => {
            const updateField = jest.fn();
            const props = buildProps({
                updateField,
                getStoreViewItems: () => singleView,
            });

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('store-view-default'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                'default',
            );
            expect(updateField).toHaveBeenCalledTimes(1);
        });
    });
});
