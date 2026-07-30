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

    it('renders the tile with the integration count', async () => {
        renderDashboard({ hasAdobeContext: true, appBuilderComponents: INTEGRATIONS });

        expect(await screen.findByTestId('integrations-tile-count')).toHaveTextContent('2');
    });

    it('does NOT render the tile without hasAdobeContext', () => {
        renderDashboard({ appBuilderComponents: INTEGRATIONS });

        expect(screen.queryByTestId('integrations-tile-count')).not.toBeInTheDocument();
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

    it('counts a mesh as a peer alongside the integrations', async () => {
        renderDashboard({
            hasAdobeContext: true,
            hasMesh: true,
            appBuilderComponents: INTEGRATIONS,
        });

        await waitFor(() => {
            expect(screen.getByTestId('integrations-tile-count')).toHaveTextContent('3');
        });
    });

    it('does not render a Deploy Mesh tile in the ActionGrid', () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });

        expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
    });
});
