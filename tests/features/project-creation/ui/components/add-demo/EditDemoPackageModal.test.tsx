/**
 * Edit demo package: Save shows its own spinner rather than an "-ing" label, and a failed save is
 * the dialog's title with its icon and a note under the form, which stays filled in.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { settle } from '../../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

// Below the mock on purpose (webview-test-authoring §3).
import { EditDemoPackageModal } from '@/features/project-creation/ui/components/add-demo/EditDemoPackageModal';
import { makeAddedDemo } from '../../../../../helpers/demoPackageFixtures';

const DEMO = makeAddedDemo();

function renderModal() {
    const onClose = jest.fn();
    const onSaved = jest.fn();
    render(<EditDemoPackageModal demo={DEMO} onClose={onClose} onSaved={onSaved} />);
    return { onClose, onSaved };
}

async function pressSave(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
}

describe('EditDemoPackageModal', () => {
    beforeEach(() => mockRequest.mockReset());

    it('shows the spinner on Save while it works, and never a "Saving" label', async () => {
        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        renderModal();

        await pressSave();

        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByText('Saving')).not.toBeInTheDocument();
        // Busy is not unavailable: it does not dim.
        expect(save).not.toHaveClass('modal-button-disabled');

        await act(async () => {
            release({ success: false, error: 'done' });
        });
    });

    it('saves through the host, hands back the row, and closes', async () => {
        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: DEMO } });
        const { onClose, onSaved } = renderModal();

        await pressSave();

        expect(mockRequest).toHaveBeenCalledWith('edit-added-demo', expect.objectContaining({ name: DEMO.name }));
        expect(onSaved).toHaveBeenCalledWith(DEMO);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Phase 1b: on the Form layout the reason is the house failure line above the fields, plain,
    // and the title carries the red (dialog design rules), where it was a red note under them.
    it('titles a failure with its red icon, and says why on the failure line, not a box', async () => {
        mockRequest.mockResolvedValueOnce({ success: false, error: 'The settings could not be saved.' });
        const { onClose } = renderModal();

        await pressSave();

        const title = screen.getByRole('heading', { name: "Couldn't Save the Changes" });
        expect(title.innerHTML).toContain('text-negative');
        const note = screen.getByRole('alert');
        expect(note).toHaveTextContent('The settings could not be saved.');
        expect(note).toHaveClass('dialog-line');
        expect(document.querySelector('.inline-notice')).toBeNull();
        expect(screen.getByLabelText('Demo Name', { selector: 'input' })).toHaveValue(DEMO.name);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not repeat the title when a failure gives no reason', async () => {
        mockRequest.mockResolvedValueOnce({ success: false });
        renderModal();

        await pressSave();

        expect(screen.getByRole('alert')).toHaveTextContent(/^Try again\.$/);
    });

    it('goes back to the plain title on the next try', async () => {
        mockRequest.mockResolvedValueOnce({ success: false, error: 'No.' });
        renderModal();
        await pressSave();

        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        await pressSave();

        expect(screen.getByRole('heading', { name: 'Edit Demo Package' }).innerHTML).not.toContain('text-negative');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await act(async () => {
            release({ success: false, error: 'done' });
        });
    });
});
