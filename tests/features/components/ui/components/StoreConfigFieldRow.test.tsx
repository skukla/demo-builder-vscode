/**
 * StoreConfigFieldRow Component Tests
 *
 * Focus: the website-code branch's loading treatment. While discovery runs (the
 * initial detect OR any Re-detect), a compact spinner+label (LoadingDisplay)
 * anchored under the connection fields stands in for the store-selection row.
 * On success the populated dropdowns ARE the result — there is NO separate
 * "Store structure detected" confirmation.
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
    componentIds: ['test-component'],
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

describe('StoreConfigFieldRow — website-code branch (spinner replaces the row)', () => {
    it('shows the compact spinner+label while detecting (no dropdowns/Re-detect)', () => {
        render(<StoreConfigFieldRow {...buildProps({ isFetching: true, hasStoreData: false })} />);

        expect(screen.getByText('Detecting store structure…')).toBeInTheDocument();
        // The spinner stands in for the whole row — no dropdowns or Re-detect yet.
        expect(screen.queryByTestId('store-selection-row')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /re-detect/i })).not.toBeInTheDocument();
    });

    it('shows the spinner (not stale dropdowns) on a Re-detect — every fetch swaps the row', () => {
        // A Re-detect nulls store data while it re-runs: same spinner branch as the
        // initial detect. The user's selection is preserved in the field values.
        render(<StoreConfigFieldRow {...buildProps({ isFetching: true, hasStoreData: false })} />);

        expect(screen.getByText('Detecting store structure…')).toBeInTheDocument();
        expect(screen.queryByTestId('store-selection-row')).not.toBeInTheDocument();
    });

    it('renders the dropdowns once store data has loaded — and NO "detected" success message', () => {
        render(<StoreConfigFieldRow {...buildProps({ isFetching: false, hasStoreData: true })} />);

        expect(screen.getByTestId('store-selection-row')).toBeInTheDocument();
        // The dropdowns ARE the result — no separate success confirmation.
        expect(screen.queryByText('Store structure detected')).not.toBeInTheDocument();
        expect(screen.queryByText('Detecting store structure…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /re-detect/i })).toBeEnabled();
    });

    it('spinner gives way to the populated dropdowns on success (row swap, no success line)', () => {
        const { rerender } = render(
            <StoreConfigFieldRow {...buildProps({ isFetching: true, hasStoreData: false })} />
        );
        expect(screen.getByText('Detecting store structure…')).toBeInTheDocument();

        rerender(
            <StoreConfigFieldRow {...buildProps({ isFetching: false, hasStoreData: true })} />
        );
        expect(screen.queryByText('Detecting store structure…')).not.toBeInTheDocument();
        expect(screen.getByTestId('store-selection-row')).toBeInTheDocument();
    });

    it('falls back to error text + a fallback field input when fetch fails', () => {
        render(
            <StoreConfigFieldRow
                {...buildProps({ fetchError: 'Discovery failed', hasStoreData: false })}
            />
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
            />
        );

        expect(screen.getByTestId(`config-field-${PAAS_GRAPHQL_ENDPOINT}`)).toBeInTheDocument();
    });
});
