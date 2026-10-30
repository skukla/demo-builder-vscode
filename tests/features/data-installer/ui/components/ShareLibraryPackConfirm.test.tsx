/**
 * Share / Stop sharing (owner, 2026-10-30): the confirmation the flyout's menu row opens, for the
 * SC's own library pack. Share asks with the owner's sentence; Stop sharing asks only the house
 * confirm. Each sends the one request, confirmed, and says when the pack changed.
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
import { ShareLibraryPackConfirm } from '@/features/data-installer/ui/components/ShareLibraryPackConfirm';

const ID = { name: 'acme-1a2b3c', version: '20261029-183005' };
const SENTENCE = 'Everyone with access to the datapack library can see and install this pack.';

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.value = null;
    mockRequest.failure = null;
});

const onDone = jest.fn();

it('asks with the sentence on a private pack, and shares only when Share is pressed', () => {
    render(<ShareLibraryPackConfirm id={ID} shared={false} onDone={onDone} />);

    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(mockLoad).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, shared: true, confirm: true });
});

it('asks with no explanation on a shared pack, and stops sharing on Stop sharing', () => {
    render(<ShareLibraryPackConfirm id={ID} shared onDone={onDone} />);

    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(mockLoad).toHaveBeenCalledWith({ datapackName: ID.name, shared: false, confirm: true });
});

it('changes nothing on Cancel, and hands the actions back', () => {
    render(<ShareLibraryPackConfirm id={ID} shared={false} onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockLoad).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
});

it('tells the screen once the pack has changed, so the card and flyout are read again, then closes', () => {
    const onChanged = jest.fn();
    mockRequest.value = { shared: true };

    render(<ShareLibraryPackConfirm id={ID} shared={false} onChanged={onChanged} onDone={onDone} />);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
});

it('says why when the library refused', () => {
    mockRequest.failure = { message: 'not yours' };

    render(<ShareLibraryPackConfirm id={ID} shared={false} onDone={onDone} />);

    expect(screen.getByText('It could not be changed: not yours')).toBeInTheDocument();
});

it('never says Public, Unshare or Make shared', () => {
    const { container } = render(<ShareLibraryPackConfirm id={ID} shared onDone={onDone} />);

    expect(container.textContent).not.toMatch(/Public|Unshare|Make shared/u);
});
