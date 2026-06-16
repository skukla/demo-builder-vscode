/**
 * StoreConfigFieldRow Component Tests
 *
 * Focus: the website-code branch must NOT shift layout while store discovery
 * runs. The store-selection fields (three pickers) and the Re-detect button slot
 * render from the start in a disabled "detecting" state and populate in place —
 * instead of swapping a short one-line spinner for the tall populated layout.
 *
 * StoreSelectionRow and ConfigFieldRenderer are mocked so these tests assert the
 * branching/footprint contract of StoreConfigFieldRow itself, not Spectrum
 * rendering.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import type { ServiceGroup, UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

// Mock StoreSelectionRow — surface the isLoading prop so we can assert the
// fields render disabled during fetch and enabled after data lands.
interface StoreSelectionRowMockProps {
    isLoading?: boolean;
}
jest.mock('@/features/components/ui/components/StoreSelectionRow', () => ({
    StoreSelectionRow: ({ isLoading }: StoreSelectionRowMockProps) => (
        <div data-testid="store-selection-row" data-loading={isLoading ? 'true' : 'false'} />
    ),
}));

// Mock ConfigFieldRenderer — a simple marker keyed by field for fallback paths.
interface ConfigFieldRendererMockProps {
    field: { key: string };
}
jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({ field }: ConfigFieldRendererMockProps) => (
        <div data-testid={`config-field-${field.key}`} />
    ),
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACCS_WEBSITE_CODE = 'ACCS_WEBSITE_CODE';

const makeField = (key: string): UniqueField => ({
    key,
    label: key,
    type: 'text',
    required: false,
});

const accsGroup: ServiceGroup = {
    id: 'accs',
    label: 'ACCS',
    fields: [makeField(ACCS_WEBSITE_CODE)],
};

function buildProps(overrides: Partial<Parameters<typeof StoreConfigFieldRow>[0]> = {}) {
    return {
        field: makeField(ACCS_WEBSITE_CODE),
        group: accsGroup,
        autoDetectKey: 'accs-endpoint',
        isFetching: false,
        hasStoreData: false,
        fetchError: null,
        isStoreGroup: (groupId: string) => groupId === 'accs',
        getFieldValue: jest.fn(() => ''),
        updateField: jest.fn(),
        validationErrors: {},
        touchedFields: new Set<string>(),
        normalizeUrlField: jest.fn(),
        getWebsiteItems: jest.fn(() => []),
        getStoreGroupItems: jest.fn(() => []),
        getStoreViewItems: jest.fn(() => []),
        onRefresh: jest.fn(),
        ...overrides,
    } as Parameters<typeof StoreConfigFieldRow>[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StoreConfigFieldRow — website-code branch (no layout shift)', () => {
    it('renders the store-selection row from the start while fetching (disabled)', () => {
        render(<StoreConfigFieldRow {...buildProps({ isFetching: true, hasStoreData: false })} />);

        const row = screen.getByTestId('store-selection-row');
        expect(row).toBeInTheDocument();
        expect(row).toHaveAttribute('data-loading', 'true');
    });

    it('renders the store-selection row enabled once store data has loaded', () => {
        render(<StoreConfigFieldRow {...buildProps({ isFetching: false, hasStoreData: true })} />);

        const row = screen.getByTestId('store-selection-row');
        expect(row).toBeInTheDocument();
        expect(row).toHaveAttribute('data-loading', 'false');
    });

    it('reserves the Re-detect button slot during fetch (rendered disabled, not popped in)', () => {
        render(<StoreConfigFieldRow {...buildProps({ isFetching: true, hasStoreData: false })} />);

        const button = screen.getByRole('button', { name: /re-detect/i });
        expect(button).toBeInTheDocument();
        expect(button).toBeDisabled();
    });

    it('enables the Re-detect button once store data has loaded', () => {
        render(<StoreConfigFieldRow {...buildProps({ isFetching: false, hasStoreData: true })} />);

        const button = screen.getByRole('button', { name: /re-detect/i });
        expect(button).toBeEnabled();
    });

    it('does not swap a separate one-line spinner for the populated layout', () => {
        // The footprint is constant: the store-selection row is always present in
        // the detect/data area, so there is no short→tall content swap.
        const { rerender } = render(
            <StoreConfigFieldRow {...buildProps({ isFetching: true, hasStoreData: false })} />,
        );
        expect(screen.getByTestId('store-selection-row')).toBeInTheDocument();

        rerender(<StoreConfigFieldRow {...buildProps({ isFetching: false, hasStoreData: true })} />);
        expect(screen.getByTestId('store-selection-row')).toBeInTheDocument();
    });

    it('falls back to error text + a fallback field input when fetch fails', () => {
        render(
            <StoreConfigFieldRow
                {...buildProps({ fetchError: 'Discovery failed', hasStoreData: false })}
            />,
        );

        expect(screen.getByText('Discovery failed')).toBeInTheDocument();
        expect(screen.getByTestId(`config-field-${ACCS_WEBSITE_CODE}`)).toBeInTheDocument();
        // The store-selection row is not rendered in the error branch.
        expect(screen.queryByTestId('store-selection-row')).not.toBeInTheDocument();
    });
});

describe('StoreConfigFieldRow — GraphQL endpoint is a connection field (no reveal-on-paste jump)', () => {
    const PAAS_GRAPHQL_ENDPOINT = 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT';
    const paasGroup: ServiceGroup = {
        id: 'adobe-commerce',
        label: 'Adobe Commerce',
        fields: [makeField(PAAS_GRAPHQL_ENDPOINT)],
    };

    // Regression: the PaaS GraphQL endpoint lives in the 'adobe-commerce' store group
    // and is auto-derived from the URL. It must render from the start (like the URL and
    // admin credentials), not pop in once credentials complete autoDetectKey — that
    // mid-form insertion caused a layout jump.
    it('renders the PaaS GraphQL endpoint immediately, before autoDetectKey is set', () => {
        render(
            <StoreConfigFieldRow
                {...buildProps({
                    field: makeField(PAAS_GRAPHQL_ENDPOINT),
                    group: paasGroup,
                    autoDetectKey: undefined,
                    isStoreGroup: (id: string) => id === 'adobe-commerce',
                })}
            />,
        );

        expect(screen.getByTestId(`config-field-${PAAS_GRAPHQL_ENDPOINT}`)).toBeInTheDocument();
    });
});
