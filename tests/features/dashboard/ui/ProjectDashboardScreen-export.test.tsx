/**
 * ProjectDashboardScreen — Export hands the demo to someone else; Save as demo
 * package is the SC's own act. Two rows, two dialogs; Export's link form can
 * open the Save dialog when the storefront is not a package yet.
 */

import { fireEvent, screen } from '@testing-library/react';
import { renderDashboard, setupTestContext } from './ProjectDashboardScreen.testUtils';

// Both dialogs render the core Modal, whose Spectrum pieces this suite's partial
// Spectrum mock does not carry (same reason the Add a demo dialog is stubbed in
// the demo-source suite). Their own suites render them real.
jest.mock('@/features/dashboard/ui/components/export/ExportModal', () => ({
    ExportModal: ({ isEds, onSaveDemoPackage, onClose }: any) => (
        <div role="dialog" aria-label="Export">
            {isEds ? <button onClick={onSaveDemoPackage}>Save as demo package…</button> : null}
            <button onClick={onClose}>Close</button>
        </div>
    ),
}));
jest.mock('@/features/dashboard/ui/components/demo-package/DemoPackageModal', () => ({
    DemoPackageModal: ({ onClose }: any) => (
        <div role="dialog" aria-label="Save as demo package">
            <button onClick={onClose}>Close package</button>
        </div>
    ),
}));

describe('ProjectDashboardScreen - export and save as demo package', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupTestContext();
    });

    it('opens Export from the More menu for every project and closes it', () => {
        renderDashboard({ isEds: false });
        fireEvent.click(screen.getByText('Export'));
        expect(screen.getByRole('dialog', { name: 'Export' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument();
    });

    it('offers Save as demo package to an Edge Delivery project only, and opens its own dialog', () => {
        const headless = renderDashboard({ isEds: false });
        expect(screen.queryByText('Save as demo package')).not.toBeInTheDocument();
        headless.unmount();

        renderDashboard({ isEds: true });
        fireEvent.click(screen.getByText('Save as demo package'));
        expect(screen.getByRole('dialog', { name: 'Save as demo package' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close package' }));
        expect(screen.queryByRole('dialog', { name: 'Save as demo package' })).not.toBeInTheDocument();
    });

    it("hands over from Export's link form to the Save dialog", () => {
        renderDashboard({ isEds: true });
        fireEvent.click(screen.getByText('Export'));
        fireEvent.click(screen.getByRole('button', { name: 'Save as demo package…' }));
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Save as demo package' })).toBeInTheDocument();
    });
});
