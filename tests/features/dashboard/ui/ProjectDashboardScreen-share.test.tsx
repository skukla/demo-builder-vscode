/**
 * ProjectDashboardScreen — ONE Share tile and ONE Share dialog (owner,
 * 2026-10-22). Export and Save as demo package were two tiles for one job; the
 * Save as Package tile and its dialog are gone, not hidden.
 */

import { fireEvent, screen } from '@testing-library/react';
import { renderDashboard, setupTestContext } from './ProjectDashboardScreen.testUtils';

// The dialog renders the core Modal, whose Spectrum pieces this suite's partial
// Spectrum mock does not carry (same reason the Add a demo package dialog is
// stubbed in the demo-source suite). Its own suite renders it real.
const mockShareModal = jest.fn();
jest.mock('@/features/dashboard/ui/components/share/ShareModal', () => ({
    ShareModal: (props: { onClose: () => void; isEds: boolean }) => {
        mockShareModal(props);
        return (
            <div role="dialog" aria-label="Share Demo">
                <button onClick={props.onClose}>Close</button>
            </div>
        );
    },
}));

describe('ProjectDashboardScreen - share', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupTestContext();
    });

    it('opens Share Demo from its tile for every project, with the project kind, and closes it', () => {
        renderDashboard({ isEds: false });
        fireEvent.click(screen.getByText('Share Demo'));
        expect(screen.getByRole('dialog', { name: 'Share Demo' })).toBeInTheDocument();
        expect(mockShareModal).toHaveBeenLastCalledWith(expect.objectContaining({ isEds: false }));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: 'Share Demo' })).not.toBeInTheDocument();
    });

    it('has no Save as Package tile and no Export tile, on any project', () => {
        const headless = renderDashboard({ isEds: false });
        expect(screen.queryByText('Save as Package')).not.toBeInTheDocument();
        expect(screen.queryByText('Export')).not.toBeInTheDocument();
        headless.unmount();

        renderDashboard({ isEds: true });
        expect(screen.queryByText('Save as Package')).not.toBeInTheDocument();
        expect(screen.queryByText('Export')).not.toBeInTheDocument();
        // Positive control: the zone that held them is on screen.
        expect(screen.getByText('Share Demo')).toBeInTheDocument();
    });
});
