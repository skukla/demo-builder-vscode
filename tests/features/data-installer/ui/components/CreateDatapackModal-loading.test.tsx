/**
 * The service's data types, before anything has come back.
 *
 * FRAME 1 IS A REAL STATE AND IT SHIPPED WRONG ONCE: `loading` starts false and the fetch runs from a
 * useEffect, so the first render has neither a request in flight nor an answer, and a loading-only
 * guard falls straight past it and draws an empty list. That is why the guard reads `!settled` as
 * well, and why the two conditions are ORed rather than ANDed.
 *
 * The request hook is doubled here, and only here, because that combination (not loading, not
 * settled) cannot be reached through the real hook once Testing Library has flushed the mount
 * effects. Everything else is driven through the real hook in the sibling suites.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import type { DataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

const mockRequestState = jest.fn();

jest.mock('@/features/data-installer/ui/hooks/useDataInstallerRequest', () => ({
    useDataInstallerRequest: (type: string) => mockRequestState(type),
}));

import { CreateDatapackModal } from '@/features/data-installer/ui/components/CreateDatapackModal';

/** An idle request: nothing sent, nothing back. */
function idle<T>(over: Partial<DataInstallerRequest<T>> = {}): DataInstallerRequest<T> {
    return { load: jest.fn(), loading: false, settled: false, value: null, failure: null, ...over };
}

function renderToTheTypes(types: Partial<DataInstallerRequest<unknown>>) {
    mockRequestState.mockImplementation((type: string) => (type === 'list-datapack-data-types' ? idle(types) : idle()));
    render(<CreateDatapackModal engine="service" onClose={jest.fn()} onSaveFromStore={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Commerce datapack/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
    mockRequestState.mockReset();
});

describe('before the type list arrives', () => {
    // Neither in flight nor answered. Loading alone would say "no", and the cards would render over
    // an empty list.
    it.each([
        ['nothing has been sent yet', { loading: false, settled: false }],
        ['the request is in flight', { loading: true, settled: false }],
    ])('shows only the wait while %s', (_when, types) => {
        renderToTheTypes(types);

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    });

    // The control: once an answer is in, the wait goes and the cards take over.
    it('hands over to the list once an answer is in', () => {
        renderToTheTypes({ loading: false, settled: true, value: { dataTypes: ['attribute_sets'] } });

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /^Attribute sets/ })).toBeInTheDocument();
    });
});
