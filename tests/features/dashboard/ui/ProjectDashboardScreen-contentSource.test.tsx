/**
 * ProjectDashboardScreen — content-source marker (Slice 2, Step 08).
 *
 * An AEM-Sites satellite shows a small read-only "Content source: AEM Sites"
 * marker (in the header subtitle, beside brand/stack) so the source swap is
 * visible where Slice 1 surfaces satellite state. DA.live / legacy projects
 * (absent contentSourceType) render exactly as before.
 */

import { screen } from '@testing-library/react';
import { setupTestContext, renderDashboard } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen — content-source marker', () => {
    beforeEach(() => {
        setupTestContext();
    });

    it('renders "Content source: AEM Sites" for an aem-sites satellite', () => {
        renderDashboard({ isEds: true, isContentFlow: true, contentSourceType: 'aem-sites' });
        expect(screen.getByText(/Content source: AEM Sites/)).toBeInTheDocument();
    });

    it('renders NO marker for a DA.live satellite (regression)', () => {
        renderDashboard({ isEds: true, isContentFlow: true, contentSourceType: 'da-live' });
        expect(screen.queryByText(/Content source/)).not.toBeInTheDocument();
    });

    it('renders NO marker when contentSourceType is absent (legacy projects)', () => {
        renderDashboard({ isEds: true });
        expect(screen.queryByText(/Content source/)).not.toBeInTheDocument();
    });
});
