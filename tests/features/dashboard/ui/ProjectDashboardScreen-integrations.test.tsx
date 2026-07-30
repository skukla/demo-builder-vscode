/**
 * ProjectDashboardScreen — Integrations grid wiring (integrations-grid Step 07)
 *
 * SCREEN-LEVEL wiring only (the grid's own behavior is pinned by
 * IntegrationsGrid.test.tsx): the screen destructures the keyed
 * `appBuilderComponents` map + catalog that showDashboard has always passed,
 * and IntegrationsBlock renders the card grid with the mesh as its FIRST card:
 *   - the grid renders when appBuilderComponents are present (gated on
 *     hasAdobeContext)
 *   - the mesh appears as a CARD in the primary column, NOT as a masthead badge
 *   - the mesh card's Redeploy posts 'deployMesh' (the existing mesh path),
 *     never the keyed aio-deploy messages, and offers no Manage APIs / Remove
 *   - integration cards still dispatch id-scoped messages beside the mesh card
 *   - the ActionGrid no longer renders a "Deploy Mesh" tile
 *   - the add tile IS the empty state (the "No integrations yet." copy is gone)
 */

import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';
import type { AppBuilderComponentState } from '@/types/base';

jest.mock('@spectrum-icons/workflow/Close', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-close" />,
}));

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

/** Any integration/mesh card tile (the grid's div-cards carry role=button). */
function cards(namePattern: RegExp): HTMLElement[] {
    return screen.getAllByRole('button', { name: namePattern });
}

/** The mesh card tile (accessible name is `API Mesh, <live status text>`). */
function meshCard(): HTMLElement {
    return screen.getByRole('button', { name: /^API Mesh,/ });
}

describe('ProjectDashboardScreen - Integrations grid (Step 07)', () => {
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

    it('renders the integrations grid with one card per integration', async () => {
        renderDashboard({
            hasAdobeContext: true,
            appBuilderComponents: INTEGRATIONS,
        });

        expect(screen.getByRole('heading', { name: /integrations/i })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /^erp-sync,/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^firefly-shell,/ })).toBeInTheDocument();
    });

    it('does NOT render the integrations grid without hasAdobeContext', () => {
        renderDashboard({ appBuilderComponents: INTEGRATIONS });

        expect(screen.queryByRole('heading', { name: /integrations/i })).not.toBeInTheDocument();
    });

    it('renders the mesh as a grid CARD — and NOT as a masthead badge', async () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });
        sendMeshStatus('deployed', { endpoint: 'https://mesh.endpoint.com' });

        await waitFor(() => {
            // Exactly ONE mesh card on the whole screen.
            expect(cards(/^API Mesh,/)).toHaveLength(1);
        });
        const masthead = screen.getByTestId('control-panel-masthead');
        expect(within(masthead).queryByRole('button', { name: /^API Mesh,/ })).not.toBeInTheDocument();
        const primary = screen.getByTestId('control-panel-primary');
        expect(within(primary).getByRole('button', { name: /^API Mesh,/ })).toBeInTheDocument();
    });

    it('renders the mesh card FIRST, before the integration cards', async () => {
        renderDashboard({
            hasAdobeContext: true,
            hasMesh: true,
            appBuilderComponents: INTEGRATIONS,
        });
        sendMeshStatus('deployed');

        await waitFor(() => expect(cards(/^API Mesh,/)).toHaveLength(1));
        const mesh = meshCard();
        const integration = screen.getByRole('button', { name: /^erp-sync,/ });
        expect(
            mesh.compareDocumentPosition(integration) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it('routes the mesh card Redeploy to the EXISTING mesh deploy path (deployMesh)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDashboard({ hasAdobeContext: true, hasMesh: true });
        sendMeshStatus('deployed');

        await waitFor(() => expect(cards(/^API Mesh,/)).toHaveLength(1));
        await user.click(meshCard());
        const drawer = screen.getByRole('dialog', { name: /API Mesh details/i });
        await user.click(within(drawer).getByRole('button', { name: /^redeploy$/i }));

        expect(ctx.mockPostMessage).toHaveBeenCalledWith('deployMesh');
        expect(ctx.mockPostMessage).not.toHaveBeenCalledWith(
            'redeployAppBuilderComponent',
            expect.anything(),
        );
    });

    it('offers no Manage APIs and no Remove on the mesh card', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDashboard({ hasAdobeContext: true, hasMesh: true });
        sendMeshStatus('deployed');

        await waitFor(() => expect(cards(/^API Mesh,/)).toHaveLength(1));
        await user.click(meshCard());
        const drawer = screen.getByRole('dialog', { name: /API Mesh details/i });

        expect(
            within(drawer).queryByRole('button', { name: /manage apis/i }),
        ).not.toBeInTheDocument();
        expect(within(drawer).queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    });

    it('integration cards still dispatch id-scoped messages beside the mesh card', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDashboard({
            hasAdobeContext: true,
            hasMesh: true,
            appBuilderComponents: INTEGRATIONS,
        });
        sendMeshStatus('deployed');

        await waitFor(() => expect(cards(/^API Mesh,/)).toHaveLength(1));
        await user.click(screen.getByRole('button', { name: /^erp-sync,/ }));
        const drawer = screen.getByRole('dialog', { name: /erp-sync details/i });
        await user.click(within(drawer).getByRole('button', { name: /^redeploy$/i }));

        expect(ctx.mockPostMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', {
            id: 'erp-sync',
        });
    });

    it('does not render a Deploy Mesh tile in the ActionGrid anymore', () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: true });

        expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
    });

    it('shows the add tile as the empty state when there are no integrations and no mesh', async () => {
        renderDashboard({ hasAdobeContext: true, hasMesh: false });
        // Resolve the mesh "Loading status..." to no-mesh.
        ctx.triggerMessage('statusUpdate', {
            name: 'Test Project',
            path: '/test/path',
            status: 'ready',
        });

        await waitFor(() => {
            expect(screen.getByTestId('integration-add-tile')).toBeInTheDocument();
        });
        expect(screen.queryByText(/no integrations yet/i)).not.toBeInTheDocument();
    });
});
