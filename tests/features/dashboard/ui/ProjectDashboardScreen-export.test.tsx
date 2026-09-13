/**
 * ProjectDashboardScreen — Export is the umbrella for everything that can leave
 * the project (owner, 2026-09-13). The More-menu row opens the dialog for every
 * project kind; the setup file is saved from inside it; the storefront part is
 * offered to Edge Delivery projects only.
 */

import { fireEvent, screen } from '@testing-library/react';
import { renderDashboard, setupTestContext, type TestContext } from './ProjectDashboardScreen.testUtils';

jest.mock('@/features/dashboard/ui/components/export/ExportModal', () => ({
    // The real dialog renders the core Modal, whose Spectrum pieces this suite's
    // partial Spectrum mock does not carry (same reason the Add a demo dialog is
    // stubbed in the demo-source suite). Its own suite renders it real.
    ExportModal: ({ isEds, onExportSetup, onClose }: any) => (
        <div role="dialog" aria-label="Export">
            <button onClick={onExportSetup}>Save setup file…</button>
            {isEds ? <div data-testid="export-storefront" /> : null}
            <button onClick={onClose}>Close</button>
        </div>
    ),
}));

describe('ProjectDashboardScreen - export', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('opens the dialog from the More menu and saves the setup file from inside it', () => {
        renderDashboard({ isEds: false });
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Export'));
        expect(screen.getByRole('dialog', { name: 'Export' })).toBeInTheDocument();
        expect(ctx.mockPostMessage).not.toHaveBeenCalledWith('exportProject');
        expect(screen.queryByTestId('export-storefront')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Save setup file…' }));
        expect(ctx.mockPostMessage).toHaveBeenCalledWith('exportProject');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument();
    });

    it('offers the storefront part to an Edge Delivery project', () => {
        renderDashboard({ isEds: true });
        fireEvent.click(screen.getByText('Export'));
        expect(screen.getByTestId('export-storefront')).toBeInTheDocument();
    });
});
