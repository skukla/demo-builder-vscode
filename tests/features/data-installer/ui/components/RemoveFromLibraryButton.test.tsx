/**
 * "Remove it from the library" (datapack-engine step 07): a pack the SC shared in a project
 * file says, before it goes, what deleting it does to anyone who has not created that project
 * yet; one without such a warning is removed on the one press, as it always was (the undo of a
 * load stays one press).
 */

const mockLoad = jest.fn();
const mockRequest = { load: mockLoad, loading: false, value: null as { deleted?: boolean } | null, failure: null, settled: false };
jest.mock('@/features/data-installer/ui/hooks/useDataInstallerRequest', () => ({
    useDataInstallerRequest: () => mockRequest,
}));

// Below the mock on purpose: it hoists above this import.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RemoveFromLibraryButton } from '@/features/data-installer/ui/components/RemoveFromLibraryButton';

const ID = { name: 'acme-1a2b3c', version: '20261029-183005' };
const WARNING = "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get bodea instead.";

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.value = null;
});

it('removes on the one press when there is nothing to warn about', () => {
    render(<RemoveFromLibraryButton id={ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove it from the library' }));

    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, version: ID.version, confirm: true });
});

it('shows the warning first, and removes only on the second press', () => {
    render(<RemoveFromLibraryButton id={ID} warning={WARNING} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove it from the library' }));
    expect(mockLoad).not.toHaveBeenCalled();
    expect(screen.getByText(WARNING)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, version: ID.version, confirm: true });
});

it('keeps the pack when the warning is cancelled', () => {
    render(<RemoveFromLibraryButton id={ID} warning={WARNING} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove it from the library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockLoad).not.toHaveBeenCalled();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove it from the library' })).toBeInTheDocument();
});
