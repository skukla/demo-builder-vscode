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
        isDisabled,
        selectedCode,
    }: {
        label: string;
        items: Array<{ code: string; name: string }>;
        selectedCode: string;
        onSelect: (code: string) => void;
        isRequired?: boolean;
        isDisabled?: boolean;
    }) => {
        const prefix = label.toLowerCase().replace(/\s+/g, '-');
        return (
            <div
                data-testid={`picker-${prefix}`}
                data-disabled={isDisabled ? 'true' : 'false'}
                data-selected={selectedCode}
            >
                {items.map((item) => (
                    <button
                        key={item.code}
                        data-testid={`${prefix}-${item.code}`}
                        disabled={isDisabled}
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
    componentIds: ['test-component'],
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
                'base'
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'main'
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
                'base'
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                'main'
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                'default'
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
                'base'
            );
            expect(updateField).not.toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_KEY }),
                expect.anything()
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
                'main'
            );
            expect(updateField).not.toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                expect.anything()
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
                'base'
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
                'store_a'
            );
            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                'default'
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
                'store_a'
            );
            expect(updateField).not.toHaveBeenCalledWith(
                expect.objectContaining({ key: ACCS_STORE_VIEW_KEY }),
                expect.anything()
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
                'default'
            );
            expect(updateField).toHaveBeenCalledTimes(1);
        });
    });

    describe('loading state (render-from-start, no layout shift)', () => {
        it('renders all three pickers disabled while loading (occupies footprint)', () => {
            const props = buildProps({});
            render(<StoreSelectionRow {...props} isLoading />);

            expect(screen.getByTestId('picker-website')).toHaveAttribute('data-disabled', 'true');
            expect(screen.getByTestId('picker-store')).toHaveAttribute('data-disabled', 'true');
            expect(screen.getByTestId('picker-store-view')).toHaveAttribute(
                'data-disabled',
                'true'
            );
        });

        it('renders pickers enabled once loading completes', () => {
            const props = buildProps({});
            render(<StoreSelectionRow {...props} isLoading={false} />);

            expect(screen.getByTestId('picker-website')).toHaveAttribute('data-disabled', 'false');
            expect(screen.getByTestId('picker-store')).toHaveAttribute('data-disabled', 'false');
            expect(screen.getByTestId('picker-store-view')).toHaveAttribute(
                'data-disabled',
                'false'
            );
        });

        it('defaults to enabled when isLoading is omitted (back-compat)', () => {
            const props = buildProps({});
            render(<StoreSelectionRow {...props} />);

            expect(screen.getByTestId('picker-website')).toHaveAttribute('data-disabled', 'false');
        });
    });

    // -----------------------------------------------------------------------
    // Regression: cascade dropdown options must follow the field value
    //
    // Bug (citisignal-b2b): after picking Main Website, the Store and Store View
    // dropdowns kept showing the previous website's children. The option filters
    // read the selected website/store via lookupComponentConfigValue — which
    // scans ALL components and returns the first non-empty value, picking up a
    // stale ACCS_WEBSITE_CODE default from a sibling component. The Website picker
    // reads getFieldValue (scoped to the field), so the two accessors diverged.
    // The fix routes both filters through getFieldValue.
    // -----------------------------------------------------------------------
    // Which env-var keys the row looks for is decided by the group id alone. A
    // PaaS group carries ADOBE_COMMERCE_* fields and an ACCS group ACCS_* ones —
    // resolve the wrong set and every picker silently disappears, because no
    // field matches.
    describe('field key resolution by backend', () => {
        const paasGroup: ServiceGroup = {
            id: 'adobe-commerce',
            label: 'Adobe Commerce',
            fields: [
                makeField('ADOBE_COMMERCE_WEBSITE_CODE'),
                makeField('ADOBE_COMMERCE_STORE_CODE'),
                makeField('ADOBE_COMMERCE_STORE_VIEW_CODE'),
            ],
        };

        it('reads the ADOBE_COMMERCE_* fields for a PaaS group', () => {
            const updateField = jest.fn();
            const props = {
                ...buildProps({ updateField }),
                group: paasGroup,
            };

            render(<StoreSelectionRow {...props} />);
            fireEvent.click(screen.getByTestId('website-base'));

            expect(updateField).toHaveBeenCalledWith(
                expect.objectContaining({ key: 'ADOBE_COMMERCE_WEBSITE_CODE' }),
                'base'
            );
        });

        it('renders nothing for a PaaS group carrying only ACCS fields', () => {
            const props = { ...buildProps({}), group: { ...paasGroup, fields: accsGroup.fields } };

            render(<StoreSelectionRow {...props} />);

            expect(screen.queryByTestId('picker-website')).not.toBeInTheDocument();
            expect(screen.queryByTestId('picker-store')).not.toBeInTheDocument();
            expect(screen.queryByTestId('picker-store-view')).not.toBeInTheDocument();
        });
    });

    // Each picker shows the value of ITS OWN field. This is the selection the SC
    // sees, so it has to be the field's value and not a placeholder standing in
    // for one.
    describe('selected value shown by each picker', () => {
        const selectedOf = (testId: string) =>
            screen.getByTestId(testId).getAttribute('data-selected');

        it('shows each field own current value', () => {
            const values: Record<string, string> = {
                [ACCS_WEBSITE_KEY]: 'base',
                [ACCS_STORE_KEY]: 'main',
                [ACCS_STORE_VIEW_KEY]: 'default',
            };
            const props = {
                ...buildProps({}),
                getFieldValue: jest.fn((field: UniqueField) => values[field.key]),
            };

            render(<StoreSelectionRow {...props} />);

            expect(selectedOf('picker-website')).toBe('base');
            expect(selectedOf('picker-store')).toBe('main');
            expect(selectedOf('picker-store-view')).toBe('default');
        });

        it('shows an empty selection when a field has no value yet', () => {
            const props = {
                ...buildProps({}),
                getFieldValue: jest.fn(() => undefined),
            };

            render(<StoreSelectionRow {...props} />);

            expect(selectedOf('picker-website')).toBe('');
            expect(selectedOf('picker-store')).toBe('');
            expect(selectedOf('picker-store-view')).toBe('');
        });
    });

    describe('cascade dropdown filtering (field value, not stale lookup)', () => {
        const lookup = jest.requireMock('@/features/components/services/envVarHelpers')
            .lookupComponentConfigValue as jest.Mock;

        afterEach(() => {
            lookup.mockReturnValue('');
        });

        it('filters the store dropdown by the website field value, not a stale all-component lookup', () => {
            // Stale value a sibling component would surface via the all-component scan.
            lookup.mockReturnValue('citisignal');

            const getFieldValue = jest.fn((field: UniqueField) =>
                field.key === ACCS_WEBSITE_KEY ? 'base' : ''
            );
            const getStoreGroupItems = jest.fn((code: string) =>
                code === 'base'
                    ? [{ code: 'main_website_store', name: 'Main Website Store', numericId: 2 }]
                    : [{ code: 'citisignal_store', name: 'Citisignal Store', numericId: 1 }]
            );

            const props = { ...buildProps({ getStoreGroupItems }), getFieldValue };
            render(<StoreSelectionRow {...props} />);

            // Website field = 'base' → Store dropdown must list Main Website Store,
            // NOT the stale 'citisignal' website's store.
            expect(screen.getByTestId('store-main_website_store')).toBeInTheDocument();
            expect(screen.queryByTestId('store-citisignal_store')).not.toBeInTheDocument();
        });

        it('filters the store-view dropdown by the store field value, not a stale all-component lookup', () => {
            lookup.mockReturnValue('citisignal_store');

            const getFieldValue = jest.fn((field: UniqueField) =>
                field.key === ACCS_STORE_KEY ? 'main_website_store' : ''
            );
            const getStoreViewItems = jest.fn((code: string) =>
                code === 'main_website_store'
                    ? [{ code: 'default', name: 'Default', numericId: 2 }]
                    : [{ code: 'citisignal_us', name: 'Citisignal US', numericId: 1 }]
            );

            const props = { ...buildProps({ getStoreViewItems }), getFieldValue };
            render(<StoreSelectionRow {...props} />);

            // Store field = 'main_website_store' → Store View dropdown must list
            // Default, NOT the stale 'citisignal_store' store's view.
            expect(screen.getByTestId('store-view-default')).toBeInTheDocument();
            expect(screen.queryByTestId('store-view-citisignal_us')).not.toBeInTheDocument();
        });
    });
});
