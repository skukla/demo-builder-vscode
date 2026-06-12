/**
 * ProjectDashboardScreen - Mesh Status Display Tests
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
            renderDashboard();
            expect(screen.getByText(/Loading status/i)).toBeInTheDocument();
        });

        it('should display "Loading status..." when hasMesh is true', () => {
            renderDashboard({ hasMesh: true });
            expect(screen.getByText(/Loading status/i)).toBeInTheDocument();
        });

        it('should hide mesh status after projectStatus confirms no mesh', async () => {
            renderDashboard();

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
            renderDashboard();

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
            renderDashboard();

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
            renderDashboard();

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
            renderDashboard();

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
            renderDashboard();

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

    describe('Deploy Mesh tile gating', () => {
        // Regression: the dashboard rendered ActionGrid without forwarding
        // hasMesh, so ActionGrid's `hasMesh = true` default always showed the
        // Deploy Mesh tile — even for projects with no mesh component.
        it('does not render the Deploy Mesh tile when the project has no mesh', () => {
            renderDashboard({ hasMesh: false });
            expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
        });

        it('renders the Deploy Mesh tile when the project has a mesh', () => {
            renderDashboard({ hasMesh: true });
            expect(screen.getByText('Deploy Mesh')).toBeInTheDocument();
        });
    });

    describe('Authentication Required', () => {
        it('should display "Session expired" status for needs-auth', async () => {
            renderDashboard();

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
            renderDashboard();

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
