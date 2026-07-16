/**
 * ProjectDashboardScreen - Mesh Status Display Tests
 *
 * Since ADR-011 D3 Step 08 the mesh status renders as a ROW in the dashboard
 * integrations list (StatusCard "API Mesh"), not as a masthead badge — so the
 * mesh display is gated on hasAdobeContext like the rest of the list. The
 * status vocabulary (Loading status… / Deployed / Not deployed / deploying
 * message / Redeploy Mesh / Session expired + Sign in) is unchanged.
 */

import { screen, waitFor } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - Mesh Status Display', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    describe('Initial Mesh Status', () => {
        it('should display "Loading status..." initially before projectStatus loads', () => {
            renderDashboard({ hasAdobeContext: true });
            expect(screen.getByText(/Loading status/i)).toBeInTheDocument();
        });

        it('should display "Loading status..." when hasMesh is true', () => {
            renderDashboard({ hasAdobeContext: true, hasMesh: true });
            expect(screen.getByText(/Loading status/i)).toBeInTheDocument();
        });

        it('should hide mesh status after projectStatus confirms no mesh', async () => {
            renderDashboard({ hasAdobeContext: true });

            expect(screen.getByText(/Loading status/i)).toBeInTheDocument();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });

            await waitFor(() => {
                expect(screen.queryByText(/API Mesh/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Mesh Status Updates', () => {
        it('should display mesh status when status update received', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'deployed',
                    endpoint: 'https://mesh.endpoint.com',
                },
            });

            await waitFor(() => {
                expect(screen.getByText(/Deployed/i)).toBeInTheDocument();
            });
        });

        it('should display "Not deployed" for not-deployed status', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'not-deployed',
                },
            });

            await waitFor(() => expect(screen.getByText(/Not deployed/i)).toBeInTheDocument());
        });

        it('should display "Deploying..." with message', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'deploying',
                    message: 'Building mesh configuration...',
                },
            });

            await waitFor(() => {
                expect(screen.getByText(/Building mesh configuration/i)).toBeInTheDocument();
            });
        });

        it('should display "Redeploy Mesh" for config-changed status', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'config-changed',
                },
            });

            await waitFor(() => {
                expect(screen.getByText(/Redeploy Mesh/i)).toBeInTheDocument();
            });
        });

        it('should update mesh status via meshStatusUpdate message', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'not-deployed',
                },
            });

            ctx.triggerMessage('meshStatusUpdate', {
                status: 'deployed',
                endpoint: 'https://mesh.endpoint.com',
            });

            await waitFor(() => {
                expect(screen.getByText(/Deployed/i)).toBeInTheDocument();
            });
        });
    });

    describe('Mesh surface placement (Step 08)', () => {
        // The Deploy Mesh tile is retired: the list's mesh row is the one mesh
        // surface, and its Deploy/Redeploy routes to the same deployMesh path.
        it('never renders a Deploy Mesh tile, even when the project has a mesh', () => {
            renderDashboard({ hasAdobeContext: true, hasMesh: true });
            expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
        });

        it('does not render a mesh row without Adobe context', () => {
            renderDashboard({ hasMesh: true });
            expect(screen.queryByText(/Loading status/i)).not.toBeInTheDocument();
            expect(screen.queryByTestId('status-card-API Mesh')).not.toBeInTheDocument();
        });
    });

    describe('Authentication Required', () => {
        it('should display "Session expired" status for needs-auth', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'needs-auth',
                },
            });

            await waitFor(() => {
                expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
            });
        });

        it('should display "Sign in" link when authentication required', async () => {
            renderDashboard({ hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'needs-auth',
                },
            });

            await waitFor(() => {
                expect(screen.getByText(/Sign in/i)).toBeInTheDocument();
            });
        });
    });
});
