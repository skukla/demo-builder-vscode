/**
 * ProjectDashboardScreen — Integrations list wiring (ADR-011 D3 Step 08)
 *
 * The screen destructures the keyed `appBuilderComponents` map + catalog that
 * showDashboard has always passed, and renders the integrations list with the
 * mesh folded in as its first row:
 *   - list renders when appBuilderComponents present (gated on hasAdobeContext)
 *   - the mesh appears as a ROW (StatusCard "API Mesh"), NOT as a masthead badge
 *   - the mesh row's Deploy/Redeploy posts 'deployMesh' (the existing mesh
 *     path), never the keyed aio-deploy messages, and offers no Manage APIs
 *   - the ActionGrid no longer renders a "Deploy Mesh" tile
 *   - empty state when there are no integrations and no mesh
 */

import { screen, within, waitFor } from '@testing-library/react';
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
        status: 'deployed',
        source: { owner: 'acme', repo: 'firefly-shell' },
    },
};

describe('ProjectDashboardScreen - Integrations list (Step 08)', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    function sendMeshStatus(status: string, extra: Record<string, unknown> = {}) {
        ctx.triggerMessage('statusUpdate', {
            name: 'Test Project',
            path: '/test/path',
            status: 'ready',
            mesh: { status, ...extra },
        });
    }

    it('renders the integrations list with one row per integration', async () => {
        renderDashboard({
            hasAdobeContext: true,
            appBuilderComponents: INTEGRATIONS,
        });

        expect(screen.getByRole('heading', { name: /integrations/i })).toBeInTheDocument();
        // Two deployed integration rows → two per-id Redeploy buttons.
        expect(await screen.findAllByRole('button', { name: /^redeploy$/i })).toHaveLength(2);
    });

    it('does NOT render the integrations list without hasAdobeContext', () => {
        renderDashboard({ appBuilderComponents: INTEGRATIONS });

        expect(screen.queryByRole('heading', { name: /integrations/i })).not.toBeInTheDocument();
    });

    it('renders the mesh as a list row — and NOT as a masthead badge', async () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });
        sendMeshStatus('deployed', { endpoint: 'https://mesh.endpoint.com' });

        await waitFor(() => {
            // Exactly ONE mesh StatusCard on the whole screen: the list row.
            expect(screen.getAllByTestId('status-card-API Mesh')).toHaveLength(1);
        });
        const masthead = screen.getByTestId('control-panel-masthead');
        expect(within(masthead).queryByTestId('status-card-API Mesh')).not.toBeInTheDocument();
        const primary = screen.getByTestId('control-panel-primary');
        expect(within(primary).getByTestId('status-card-API Mesh')).toBeInTheDocument();
    });

    it('routes the mesh row Redeploy to the EXISTING mesh deploy path (deployMesh)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDashboard({ hasAdobeContext: true, hasMesh: true });
        sendMeshStatus('deployed');

        const redeploy = await screen.findByRole('button', { name: /^redeploy$/i });
        await user.click(redeploy);

        expect(ctx.mockPostMessage).toHaveBeenCalledWith('deployMesh');
        expect(ctx.mockPostMessage).not.toHaveBeenCalledWith(
            'redeployAppBuilderComponent',
            expect.anything(),
        );
    });

    it('offers no Manage APIs and no Remove on the mesh row', async () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });
        sendMeshStatus('deployed');

        await screen.findByRole('button', { name: /^redeploy$/i });
        expect(screen.queryByRole('button', { name: /manage apis/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    });

    it('integration rows still dispatch id-scoped messages beside the mesh row', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDashboard({
            hasAdobeContext: true,
            hasMesh: true,
            appBuilderComponents: INTEGRATIONS,
        });
        sendMeshStatus('deployed');

        // Mesh row + two integration rows.
        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: /^redeploy$/i })).toHaveLength(3);
        });

        // Integration rows carry Manage APIs (the mesh row never does) — use one
        // to prove the id-scoped dispatch stays intact beside the mesh row.
        const integrationRedeploys = screen.getAllByRole('button', { name: /^redeploy$/i });
        await user.click(integrationRedeploys[1]);
        expect(ctx.mockPostMessage).toHaveBeenCalledWith(
            'redeployAppBuilderComponent',
            expect.objectContaining({ id: expect.any(String) }),
        );
    });

    it('does not render a Deploy Mesh tile in the ActionGrid anymore', () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });

        expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
    });

    it('shows the empty state when there are no integrations and no mesh', async () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: false });
        // Resolve the mesh "Loading status..." to no-mesh.
        ctx.triggerMessage('statusUpdate', {
            name: 'Test Project',
            path: '/test/path',
            status: 'ready',
        });

        await waitFor(() => {
            expect(screen.getByText(/no integrations yet/i)).toBeInTheDocument();
        });
    });
});
