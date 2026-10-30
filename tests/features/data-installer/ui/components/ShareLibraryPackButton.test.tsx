/**
 * Share / Stop sharing (owner, 2026-10-30): one action in the flyout of the SC's own library pack.
 * Share asks once, in the house confirm pattern, with the owner's sentence; Stop sharing asks only
 * the house confirm. Each sends the one request, confirmed, and says when the pack changed.
 */

const mockLoad = jest.fn();
const mockRequest = { load: mockLoad, loading: false, value: null as { shared?: boolean } | null, failure: null as { message: string } | null, settled: false };
jest.mock('@/features/data-installer/ui/hooks/useDataInstallerRequest', () => ({
    useDataInstallerRequest: () => mockRequest,
}));

// Below the mock on purpose: it hoists above this import.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ShareLibraryPackButton } from '@/features/data-installer/ui/components/ShareLibraryPackButton';

const ID = { name: 'acme-1a2b3c', version: '20261029-183005' };
const SENTENCE = 'Everyone with access to the datapack library can see and install this pack.';

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.value = null;
    mockRequest.failure = null;
});

it('reads Share on a private pack, and asks once with the sentence before sharing', () => {
    render(<ShareLibraryPackButton id={ID} shared={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(mockLoad).not.toHaveBeenCalled();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, shared: true, confirm: true });
});

it('reads Stop sharing on a shared pack, and asks with no explanation', () => {
    render(<ShareLibraryPackButton id={ID} shared />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, shared: false, confirm: true });
});

it('changes nothing on Cancel', () => {
    render(<ShareLibraryPackButton id={ID} shared={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockLoad).not.toHaveBeenCalled();
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
});

it('tells the screen once the pack has changed, so the card and flyout are read again', () => {
    const onChanged = jest.fn();
    mockRequest.value = { shared: true };

    render(<ShareLibraryPackButton id={ID} shared={false} onChanged={onChanged} />);

    expect(onChanged).toHaveBeenCalledTimes(1);
});

it('says why when the library refused', () => {
    mockRequest.failure = { message: 'not yours' };

    render(<ShareLibraryPackButton id={ID} shared={false} />);

    expect(screen.getByText('It could not be changed: not yours')).toBeInTheDocument();
});

it('never says Public, Unshare or Make shared', () => {
    const { container } = render(<ShareLibraryPackButton id={ID} shared />);

    expect(container.textContent).not.toMatch(/Public|Unshare|Make shared/u);
});
