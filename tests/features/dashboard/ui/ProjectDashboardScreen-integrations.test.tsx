/**
 * ProjectDashboardScreen — Integrations summary tile (integrations surface)
 *
 * The card grid moved to its own webview surface, so the dashboard's ENTIRE
 * integrations footprint is now one tile: count + worst status + a route to the
 * surface. This suite pins the SCREEN-LEVEL wiring only — the tile's own count
 * and severity rules live in IntegrationsSummaryTile.test.tsx, and the grid's
 * behaviour in the IntegrationsGrid suites.
 *
 * Supersedes the grid-on-the-dashboard assertions this file used to carry. The
 * mesh status vocabulary moved down to useDashboardStatus-statusDisplay.test.ts
 * when the mesh card left the dashboard with the grid.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';
import type { AppBuilderComponentState } from '@/types/base';

const INTEGRATIONS: Record<string, AppBuilderComponentState> = {
    'erp-sync': {
        kind: 'integration',
        status: 'deployed',
        source: { owner: 'acme', repo: 'erp-sync' },
    },
    'firefly-shell': {
        kind: 'integration',
        status: 'error',
        source: { owner: 'acme', repo: 'firefly-shell' },
    },
};

describe('ProjectDashboardScreen - Integrations summary tile', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    // The dot is the tile's only content now — the count was cut, so it is also
    // the probe for "did the tile render at all".
    it('renders the tile', async () => {
        renderDashboard({ hasAdobeContext: true, appBuilderComponents: INTEGRATIONS });

        expect(await screen.findByTestId('integrations-tile-dot')).toBeInTheDocument();
    });

    it('does NOT render the tile without hasAdobeContext', () => {
        renderDashboard({ appBuilderComponents: INTEGRATIONS });

        expect(screen.queryByTestId('integrations-tile-dot')).not.toBeInTheDocument();
    });

    it('does NOT render the grid on the dashboard anymore', () => {
        renderDashboard({ hasAdobeContext: true, appBuilderComponents: INTEGRATIONS });

        expect(screen.queryByTestId('integration-add-tile')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^erp-sync,/ })).not.toBeInTheDocument();
    });

    it('surfaces the WORST status across integrations, not the first', async () => {
        renderDashboard({ hasAdobeContext: true, appBuilderComponents: INTEGRATIONS });

        // One deployed + one failed → the failure must win.
        expect(await screen.findByTestId('integrations-tile-dot')).toHaveAttribute(
            'data-variant',
            'error'
        );
    });

    it('routes the tile to the dedicated surface', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDashboard({ hasAdobeContext: true, appBuilderComponents: INTEGRATIONS });

        await user.click(await screen.findByRole('button', { name: /integrations/i }));

        expect(ctx.mockPostMessage).toHaveBeenCalledWith('openIntegrations');
    });

    // Screen-level WIRING only: hasMesh must reach the tile, so a mesh-only
    // project still gets a tile to click through. Which status the mesh
    // contributes is the tile suite's job ("mesh health folds into the same dot").
    it('renders the tile for a mesh-only project (hasMesh threads through)', async () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true, appBuilderComponents: {} });

        await waitFor(() => {
            expect(screen.getByTestId('integrations-tile-dot')).toBeInTheDocument();
        });
    });

    it('does not render a Deploy Mesh tile in the ActionGrid', () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });

        expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
    });
});
