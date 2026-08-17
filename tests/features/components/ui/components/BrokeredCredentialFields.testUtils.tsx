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
}));

jest.mock('@/core/ui/components/feedback/StatusCard', () => ({
    StatusCard: ({ status, color, action }: any) => (
        <div data-testid="status-card" data-color={color}>
            <span>{status}</span>
            {action && (
                <button data-testid={action.testId} onClick={action.onPress}>
                    {action.label}
                </button>
            )}
        </div>
    ),
}));

// A faithful stand-in: one labelled input per field, so "is the field rendered"
// is asked the way a user asks it.
jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({ field, value, onUpdate }: any) => (
        <input
            aria-label={field.label}
            value={(value as string) ?? ''}
            onChange={(e) => onUpdate(field, e.target.value)}
        />
    ),
}));

import {
    BrokeredCredentialFields,
    type BrokeredCredentialFieldsProps,
} from '@/features/components/ui/components/BrokeredCredentialFields';

export const ID_FIELD = { key: 'ACCS_OAUTH_CLIENT_ID', label: 'OAuth client ID' } as any;
export const SECRET_FIELD = { key: 'ACCS_OAUTH_CLIENT_SECRET', label: 'OAuth client secret' } as any;

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
