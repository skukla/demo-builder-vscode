/**
 * ProjectDashboardScreen — the Catalog Menu tile opens its dialog (EDS-24). Edge Delivery
 * only: a headless project has no storefront pages to write.
 */

import { fireEvent, screen } from '@testing-library/react';
import { renderDashboard, setupTestContext } from './ProjectDashboardScreen.testUtils';

// The dialog renders the core Modal, whose Spectrum pieces this suite's partial Spectrum
// mock does not carry (the export suite's reason). Its own suite renders it real.
jest.mock('@/features/dashboard/ui/components/catalog-menu/CatalogMenuModal', () => ({
    CatalogMenuModal: ({ onClose }: any) => (
        <div role="dialog" aria-label="Catalog Menu">
            <button onClick={onClose}>Close menu</button>
        </div>
    ),
}));

describe('ProjectDashboardScreen - catalog menu', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupTestContext();
    });

    it('offers the Catalog Menu to an Edge Delivery project, opens its dialog and closes it', () => {
        renderDashboard({ isEds: true });
        fireEvent.click(screen.getByText('Catalog Menu'));
        expect(screen.getByRole('dialog', { name: 'Catalog Menu' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
        expect(screen.queryByRole('dialog', { name: 'Catalog Menu' })).not.toBeInTheDocument();
    });

    it('does not offer it to a headless project', () => {
        renderDashboard({ isEds: false });
        expect(screen.queryByText('Catalog Menu')).not.toBeInTheDocument();
    });
});
