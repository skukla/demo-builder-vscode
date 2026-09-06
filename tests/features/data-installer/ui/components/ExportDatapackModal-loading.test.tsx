/**
 * ExportDatapackModal — the state before anything has come back.
 *
 * FRAME 1 IS A REAL STATE AND IT SHIPPED WRONG ONCE: `loading` starts false and
 * the fetch runs from a useEffect, so the first render has neither a request in
 * flight nor an answer — and a loading-only guard falls straight past it and
 * draws an empty type grid. That is why the guard reads `!settled` as well, and
 * why the two conditions are ORed rather than ANDed.
 *
 * The request hook is doubled here, and only here, because that combination
 * (not loading, not settled) cannot be reached through the real hook once
 * Testing Library has flushed the mount effects. Everything else about this
 * modal is driven through the real hook in its sibling suites.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import type { DataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

const mockRequestState = jest.fn();

jest.mock('@/features/data-installer/ui/hooks/useDataInstallerRequest', () => ({
    useDataInstallerRequest: (type: string) => mockRequestState(type),
}));

import { ExportDatapackModal } from '@/features/data-installer/ui/components/ExportDatapackModal';

/** An idle request: nothing sent, nothing back. */
function idle<T>(over: Partial<DataInstallerRequest<T>> = {}): DataInstallerRequest<T> {
    return {
        load: jest.fn(),
        loading: false,
        settled: false,
        value: null,
        failure: null,
        ...over,
    } as DataInstallerRequest<T>;
}

function renderWithTypes(types: Partial<DataInstallerRequest<unknown>>) {
    mockRequestState.mockImplementation((type: string) =>
        type === 'list-datapack-data-types' ? idle(types) : idle()
    );
    return render(<ExportDatapackModal onClose={jest.fn()} />);
}

beforeEach(() => {
    mockRequestState.mockReset();
});

describe('ExportDatapackModal — before the type list arrives', () => {
    // Neither in flight nor answered. Loading alone would say "no", and the grid
    // would render over an empty list.
    it('says it is finding out when nothing has been sent yet', () => {
        renderWithTypes({ loading: false, settled: false });

        expect(screen.getByText(/loading what can be exported/i)).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('still says so while the request is in flight', () => {
        renderWithTypes({ loading: true, settled: false });

        expect(screen.getByText(/loading what can be exported/i)).toBeInTheDocument();
    });

    // The control: once an answer is in, the note goes and the grid takes over.
    it('hands over to the grid once an answer is in', () => {
        renderWithTypes({
            loading: false,
            settled: true,
            value: { dataTypes: ['attribute_sets'] },
        });

        expect(screen.queryByText(/loading what can be exported/i)).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Attribute sets' })).toBeInTheDocument();
    });
});
