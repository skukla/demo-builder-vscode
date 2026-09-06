/**
 * Shared harness for the `StoreConfigFieldRow` suite family.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT — `jest.mock` hoists above the
 * imports of the module it appears in, not across modules, so a spec that
 * imported the row itself could bind to unmocked children.
 *
 * The three doubles all SURFACE WHAT THEY WERE HANDED, because that is the only
 * thing this component decides. It renders nothing of its own: it routes a field
 * to one of three children, or to nothing, and rewrites the field object on the
 * way for a stored secret. A double that showed only which child appeared would
 * agree with every mutation of the rewrite.
 */

import React from 'react';

jest.mock('@/features/components/ui/components/StoreSelectionRow', () => ({
    StoreSelectionRow: () => <div data-testid="store-selection-row" />,
}));

jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({
        field,
        error,
    }: {
        field: { key: string; placeholder?: string; required?: boolean };
        error?: string;
    }) => (
        <div
            data-testid={`config-field-${field.key}`}
            data-placeholder={field.placeholder ?? ''}
            data-required={String(field.required)}
            data-error={error ?? ''}
        />
    ),
}));

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

// Deliberately below the mocks: babel-plugin-jest-hoist lifts them above every
// import, so the row always loads against the doubles.
export { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';

export type { ServiceGroup, UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

/** A field carrying only what the row's routing reads. */
export const makeField = (
    key: string,
    required = false,
): import('@/features/components/ui/hooks/useComponentConfig').UniqueField => ({
    key,
    componentIds: ['test-component'],
    label: key,
    type: 'text',
    required,
});
