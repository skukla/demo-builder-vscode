/**
 * Mock preamble + SUT import for `BrokeredCredentialFields`.
 *
 * The SUT is imported HERE, not in the spec: `jest.mock` hoists only within its
 * own module, so a spec importing the component directly would bind it to real
 * Spectrum before these mocks apply (`webview-test-authoring` §3).
 */

import { render } from '@testing-library/react';
import React from 'react';

jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children }: any) => <div>{children}</div>,
    Text: ({ children }: any) => <span>{children}</span>,
    // Spectrum's Link uses onPress; jsdom only knows onClick.
    Link: ({ children, onPress, ...props }: any) => (
        <button onClick={onPress} {...props}>
            {children}
        </button>
    ),
}));

// A faithful stand-in: one labelled input per field, plus its description, so both
// "is the field rendered" and "where did the help text land" are asked the way a
// user asks them.
jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({ field, value, onUpdate }: any) => (
        <span>
            <input
                aria-label={field.label}
                value={(value as string) ?? ''}
                onChange={(e) => onUpdate(field, e.target.value)}
            />
            {field.description && <span>{field.description}</span>}
        </span>
    ),
}));

import {
    BrokeredCredentialFields,
    type BrokeredCredentialFieldsProps,
} from '@/features/components/ui/components/BrokeredCredentialFields';
import type { UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

export const ID_FIELD: UniqueField = {
    key: 'ACCS_OAUTH_CLIENT_ID',
    label: 'OAuth client ID',
    type: 'text',
    componentIds: ['commerce-accs'],
};
export const SECRET_FIELD: UniqueField = {
    key: 'ACCS_OAUTH_CLIENT_SECRET',
    label: 'OAuth client secret',
    type: 'password',
    componentIds: ['commerce-accs'],
};

export function renderFields(overrides: Partial<BrokeredCredentialFieldsProps> = {}) {
    const values: Record<string, string> = {};
    const updateField = jest.fn((field: any, value: string | boolean) => {
        values[field.key] = String(value);
    });

    const props: BrokeredCredentialFieldsProps = {
        idField: ID_FIELD,
        secretField: SECRET_FIELD,
        loading: false,
        getFieldValue: (field: any) => values[field.key],
        updateField,
        validationErrors: {},
        touchedFields: new Set<string>(),
        ...overrides,
    };

    return { ...render(<BrokeredCredentialFields {...props} />), updateField, values };
}

export { BrokeredCredentialFields };
