/**
 * StoreConfigFieldRow — every branch below the website-code one.
 *
 * The row is a router: eight rules decide whether a field renders normally,
 * renders as something else, or renders nothing at all. Its sibling suite covers
 * the website-code branch; this one covers the rest, which had no test at all —
 * the stored-secret disclosure, the store-code skip, and the OAuth pair that
 * renders as one unit from the id row.
 *
 * "Renders nothing" is asserted on an EMPTY container rather than on the absence
 * of one testid, because the difference between the skip branches and the
 * fall-through is which element appears, not whether a particular one is missing.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import {
    ACCS_OAUTH_CLIENT_ID,
    ACCS_OAUTH_CLIENT_SECRET,
    ACCS_STORE_CODE,
    ACCS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import type { ServiceGroup, UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

jest.mock('@/features/components/ui/components/StoreSelectionRow', () => ({
    StoreSelectionRow: () => <div data-testid="store-selection-row" />,
}));

/**
 * Surfaces the field OBJECT the row assembled, not just its key: the stored-secret
 * rule rewrites `placeholder` and `required` and drops the error, and none of that
 * is visible from the key alone.
 */
jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({ field, error }: { field: { key: string; placeholder?: string; required?: boolean }; error?: string }) => (
        <div
            data-testid={`config-field-${field.key}`}
            data-placeholder={field.placeholder ?? ''}
            data-required={String(field.required)}
            data-error={error ?? ''}
        />
    ),
}));

/** Surfaces which secret field the row PAIRED with the id it was given. */
jest.mock('@/features/components/ui/components/BrokeredCredentialFields', () => ({
    BrokeredCredentialFields: ({
        idField,
        secretField,
    }: {
        idField: { key: string };
        secretField?: { key: string };
    }) => (
        <div
            data-testid="brokered-credentials"
            data-id-field={idField.key}
            data-secret-field={secretField?.key ?? 'none'}
        />
    ),
}));

const makeField = (key: string): UniqueField => ({
    key,
    componentIds: ['test-component'],
    label: key,
    type: 'text',
    required: true,
});

const DEPENDENT = 'ACCS_CATALOG_API_KEY';

const accsGroup: ServiceGroup = {
    id: 'accs',
    label: 'ACCS',
    fields: [
        makeField(ACCS_OAUTH_CLIENT_ID),
        makeField(ACCS_OAUTH_CLIENT_SECRET),
        makeField(DEPENDENT),
    ],
};

function buildProps(overrides: Partial<Parameters<typeof StoreConfigFieldRow>[0]> = {}) {
    return {
        field: makeField(DEPENDENT),
        group: accsGroup,
        autoDetectKey: 'accs-endpoint',
        isFetching: false,
        hasStoreData: true,
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

function renderRow(overrides: Partial<Parameters<typeof StoreConfigFieldRow>[0]> = {}) {
    return render(<StoreConfigFieldRow {...buildProps(overrides)} />);
}

describe('StoreConfigFieldRow — a secret that is already stored', () => {
    // The value lives in the OS keychain and never reaches the webview, so an
    // untouched required field would render empty — indistinguishable from "not
    // configured", and a save would write the blank over it.
    const STORED = { 'my-component': { [DEPENDENT]: true } };

    it('says the value is saved, stops requiring it, and drops the error', () => {
        renderRow({
            secretFlags: STORED,
            validationErrors: { [DEPENDENT]: 'This field is required' },
        });

        const rendered = screen.getByTestId(`config-field-${DEPENDENT}`);
        expect(rendered).toHaveAttribute('data-placeholder', 'Saved — type to replace');
        expect(rendered).toHaveAttribute('data-required', 'false');
        expect(rendered).toHaveAttribute('data-error', '');
    });

    // The control on the VALUE half: a field the user has typed into is not a
    // stored secret, whatever the flags say.
    it('leaves a field alone once it holds a typed value', () => {
        renderRow({
            secretFlags: STORED,
            getFieldValue: jest.fn(() => 'typed-value'),
            validationErrors: { [DEPENDENT]: 'This field is required' },
        });

        const rendered = screen.getByTestId(`config-field-${DEPENDENT}`);
        expect(rendered).toHaveAttribute('data-placeholder', '');
        expect(rendered).toHaveAttribute('data-required', 'true');
        expect(rendered).toHaveAttribute('data-error', 'This field is required');
    });

    // And the control on the FLAGS half: an empty value on its own proves nothing.
    it('leaves a field alone when no component claims to hold it', () => {
        renderRow({ secretFlags: {} });

        expect(screen.getByTestId(`config-field-${DEPENDENT}`)).toHaveAttribute(
            'data-required',
            'true'
        );
    });

    // A flag that is present and FALSE is a component saying it does NOT hold the
    // secret — the opposite of the claim the disclosure needs.
    it('takes a false flag at its word', () => {
        renderRow({ secretFlags: { 'my-component': { [DEPENDENT]: false } } });

        expect(screen.getByTestId(`config-field-${DEPENDENT}`)).toHaveAttribute(
            'data-required',
            'true'
        );
    });

    // ONE component holding it is enough — the flags map is per component, and a
    // project's other components will not have the same secret.
    it('needs only one of several components to claim it', () => {
        renderRow({
            secretFlags: {
                'other-component': { SOMETHING_ELSE: true },
                'my-component': { [DEPENDENT]: true },
            },
        });

        expect(screen.getByTestId(`config-field-${DEPENDENT}`)).toHaveAttribute(
            'data-required',
            'false'
        );
    });
});

describe('StoreConfigFieldRow — which fields render at all', () => {
    it('shows a field from a group that is not a store group, before any detection', () => {
        const { container } = renderRow({
            group: { id: 'catalog-service', label: 'Catalog', fields: [makeField(DEPENDENT)] },
            isStoreGroup: () => false,
            autoDetectKey: undefined,
        });

        expect(screen.getByTestId(`config-field-${DEPENDENT}`)).toBeInTheDocument();
        expect(container).not.toBeEmptyDOMElement();
    });

    // A store group's dependent fields wait for the connection to be usable —
    // showing them first offers choices that cannot be made yet.
    it('withholds a store group field until the connection is complete', () => {
        const { container } = renderRow({ autoDetectKey: undefined });

        expect(container).toBeEmptyDOMElement();
    });

    // The store and view codes are drawn by StoreSelectionRow off the website-code
    // row, so their own rows must draw nothing rather than a duplicate input.
    it('draws nothing for a store code field — the cascade already has it', () => {
        const { container } = renderRow({ field: makeField(ACCS_STORE_CODE) });

        expect(container).toBeEmptyDOMElement();
    });

    // Except when discovery failed: then the cascade is not there to draw them,
    // and a typed fallback is the only way to finish the form.
    it('falls back to a typed input for a store code field when discovery failed', () => {
        renderRow({ field: makeField(ACCS_STORE_CODE), fetchError: 'Discovery failed' });

        expect(screen.getByTestId(`config-field-${ACCS_STORE_CODE}`)).toBeInTheDocument();
    });

    // The website-code row is chosen by KEY, not by position: an ordinary field
    // must not inherit the detection treatment.
    it('does not give an ordinary field the store-selection treatment', () => {
        renderRow();

        expect(screen.queryByTestId('store-selection-row')).not.toBeInTheDocument();
        expect(screen.getByTestId(`config-field-${DEPENDENT}`)).toBeInTheDocument();
    });

    // Neither fetching nor holding data: the request has not started. Showing the
    // cascade here would draw empty dropdowns.
    it('still detects when a fetch has not started yet', () => {
        renderRow({
            field: makeField(ACCS_WEBSITE_CODE),
            isFetching: false,
            hasStoreData: false,
        });

        expect(screen.getByText('Detecting store structure...')).toBeInTheDocument();
        expect(screen.queryByTestId('store-selection-row')).not.toBeInTheDocument();
    });
});

describe('StoreConfigFieldRow — the brokered OAuth pair', () => {
    const withService = { credentialService: { loading: false, status: undefined } as never };

    it('renders the pair as one unit from the id row', () => {
        renderRow({ ...withService, field: makeField(ACCS_OAUTH_CLIENT_ID) });

        const pair = screen.getByTestId('brokered-credentials');
        expect(pair).toHaveAttribute('data-id-field', ACCS_OAUTH_CLIENT_ID);
        // The SECRET, picked out of the group by key — the pair covers both halves
        // and a sibling row cannot own half a toggle.
        expect(pair).toHaveAttribute('data-secret-field', ACCS_OAUTH_CLIENT_SECRET);
    });

    it('draws nothing for the secret row, which the id row already covers', () => {
        const { container } = renderRow({
            ...withService,
            field: makeField(ACCS_OAUTH_CLIENT_SECRET),
        });

        expect(container).toBeEmptyDOMElement();
    });

    // The pairing is opt-in. A caller that never probes the service — PaaS, and
    // any surface that has not adopted it — gets the two plain inputs it always had.
    it('renders the id as a plain field when no caller offered a service', () => {
        renderRow({ field: makeField(ACCS_OAUTH_CLIENT_ID) });

        expect(screen.queryByTestId('brokered-credentials')).not.toBeInTheDocument();
        expect(screen.getByTestId(`config-field-${ACCS_OAUTH_CLIENT_ID}`)).toBeInTheDocument();
    });

    it('renders the secret as a plain field too', () => {
        renderRow({ field: makeField(ACCS_OAUTH_CLIENT_SECRET) });

        expect(screen.getByTestId(`config-field-${ACCS_OAUTH_CLIENT_SECRET}`)).toBeInTheDocument();
    });

    // And an ordinary field is untouched by the pairing rules even when a service
    // IS offered — both are keyed on the exact OAuth keys, not on the service.
    it('leaves an ordinary field alone while a service is offered', () => {
        renderRow(withService);

        expect(screen.queryByTestId('brokered-credentials')).not.toBeInTheDocument();
        expect(screen.getByTestId(`config-field-${DEPENDENT}`)).toBeInTheDocument();
    });
});
