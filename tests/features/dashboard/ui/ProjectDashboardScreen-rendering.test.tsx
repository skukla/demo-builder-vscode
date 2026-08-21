/**
 * ProjectDashboardScreen - Rendering, Server Status, and Edge Cases Tests
 */

import { screen, waitFor } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - Rendering and Status', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    describe('Rendering', () => {
        it('should render project name from props', () => {
            renderDashboard({ project: { name: 'Test Project', path: '/test/path' } });
            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });

        it('should render default name when project prop missing', () => {
            renderDashboard();
            expect(screen.getByText('Demo Project')).toBeInTheDocument();
        });

        // Regression: the wire field is `packageName` (resolvePackageStackNames →
        // demo-packages.json `name`), but the screen prop was `brandName` — a name
        // no producer sends — so the brand half of the subtitle never rendered.
        // The mismatch lived in the untypechecked entry (index.tsx shadowed by
        // index.ts) where `data?.brandName` read undefined forever.
        it('renders the package · stack subtitle from the wire field names', () => {
            renderDashboard({ packageName: 'CitiSignal', stackName: 'Headless + PaaS' });
            expect(screen.getByText('CitiSignal · Headless + PaaS')).toBeInTheDocument();
        });

        it('should request status on mount', () => {
            renderDashboard();
            expect(ctx.mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });

        it('reports the demo through its zone TILE, with no masthead badge', () => {
            // The masthead badge is gone and so is the status row that briefly
            // replaced it — the runtime state is now carried by the Start/Stop
            // tile itself, dotted only for the states it cannot express.
            renderDashboard();

            expect(screen.getByText('Start')).toBeInTheDocument();
            expect(screen.queryByTestId('status-card-Frontend')).not.toBeInTheDocument();
            expect(screen.queryByTestId('status-card-Demo')).not.toBeInTheDocument();
        });
    });

    /**
     * The runtime wording lives in the lifecycle tile's TOOLTIP now, not on the
     * surface. These mocks render tooltips inline, so `getByText` still finds
     * the words — it cannot tell "visible" from "on hover". What that buys is
     * still real: the states are reachable and correctly worded. Whether the
     * tooltip is discoverable enough needs eyes on the running dashboard.
     */
    describe('Server Status Display', () => {
        it('should display "Stopped" status when ready', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });

            expect(screen.getByText(/Stopped/i)).toBeInTheDocument();
        });

        it('should display "Running on port 3000" when running', async () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
                port: 3000,
            });

            await waitFor(() => {
                expect(screen.getByText(/Running on port 3000/i)).toBeInTheDocument();
            });
        });

        it('should display "Starting..." when starting', async () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'starting',
            });

            await waitFor(() => {
                expect(screen.getByText(/Starting/i)).toBeInTheDocument();
            });
        });

        it('offers a dotted Restart tile when running with config changes', async () => {
            // This state used to be words in the masthead with no way to act on
            // it. It is now the fix itself, wearing the amber dot.
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
                port: 3000,
                frontendConfigChanged: true,
            });

            await waitFor(() => {
                expect(screen.getByTestId('restart-tile-dot')).toHaveAttribute(
                    'data-variant',
                    'warning'
                );
            });
            expect(screen.getByText('Restart')).toBeInTheDocument();
        });

        it('should display "Error" status on error', async () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'error',
            });

            await waitFor(() => {
                expect(screen.getByText(/Error/i)).toBeInTheDocument();
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing project prop gracefully', () => {
            renderDashboard();
            expect(screen.getByText('Demo Project')).toBeInTheDocument();
        });

        // The dashboard no longer renders mesh status text at all — the mesh card
        // left with the grid for the dedicated integrations surface, and the
        // dashboard keeps only the summary tile's dot. The equivalent coverage:
        //   - useDashboardStatus-statusDisplay.test.ts — meshStatusDisplay resolves
        //     to null once a status update confirms no mesh
        //   - IntegrationsSummaryTile.test.tsx — "ignores mesh status entirely when
        //     the project has no mesh"

        it('should cleanup subscriptions on unmount', () => {
            const unsubscribeStatus = jest.fn();
            const unsubscribeMesh = jest.fn();

            ctx.mockOnMessage.mockImplementation((type) => {
                if (type === 'statusUpdate') return unsubscribeStatus;
                if (type === 'meshStatusUpdate') return unsubscribeMesh;
                return jest.fn();
            });

            const { unmount } = renderDashboard();
            unmount();

            expect(unsubscribeStatus).toHaveBeenCalled();
            expect(unsubscribeMesh).toHaveBeenCalled();
        });
    });
});
