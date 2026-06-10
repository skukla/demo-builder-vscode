/**
 * ProjectDashboardScreen — content (satellite) hides upstream-mutating actions (Step 7).
 *
 * A repoless satellite references the upstream's code; it does NOT own that repo.
 * So the EDS actions that push to the repo — Sync Storefront and Refresh Block
 * Library — are hidden for a content-flow project. Commerce EDS is unchanged.
 */

import { screen } from '@testing-library/react';
import { setupTestContext, renderDashboard } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen — content flow (upstream-mutating actions hidden)', () => {
    beforeEach(() => {
        setupTestContext();
    });

    it('hides Sync Storefront and Refresh Block Library for a content (satellite) project', () => {
        renderDashboard({ isEds: true, isContentFlow: true });
        expect(screen.queryByText('Sync Storefront')).not.toBeInTheDocument();
        expect(screen.queryByText('Refresh Block Library')).not.toBeInTheDocument();
    });

    it('shows Sync Storefront and Refresh Block Library for a commerce EDS project (regression)', () => {
        renderDashboard({ isEds: true });
        expect(screen.getByText('Sync Storefront')).toBeInTheDocument();
        expect(screen.getByText('Refresh Block Library')).toBeInTheDocument();
    });
});
