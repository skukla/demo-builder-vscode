/**
 * "Remove it from the library" as a load's undo: removed on the one press, as it always was.
 * The flyout's "Remove from library", which asks first for a pack shared in a project file
 * (datapack-engine step 07), is a menu row now and is tested in PackActions.test.tsx.
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

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.value = null;
});

it('removes on the one press when there is nothing to warn about', () => {
    render(<RemoveFromLibraryButton id={ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove it from the library' }));

    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, version: ID.version, confirm: true });
});

it('says it is gone once the library has removed it', () => {
    mockRequest.value = { deleted: true };

    render(<RemoveFromLibraryButton id={ID} />);

    expect(screen.getByText('Removed from the library.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove it from the library' })).not.toBeInTheDocument();
});
