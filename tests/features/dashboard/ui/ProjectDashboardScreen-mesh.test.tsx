/**
 * ProjectDashboardScreen - Mesh Status Display Tests
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - Mesh Status Display', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    describe('Initial Mesh Status', () => {
        it('should display "Checking status..." initially before projectStatus loads', () => {
            renderDashboard();
            expect(screen.getByText(/API Mesh.*Checking status/i)).toBeInTheDocument();
        });

        it('should display "Checking status..." when hasMesh is true', () => {
            renderDashboard({ hasMesh: true });
            expect(screen.getByText(/API Mesh.*Checking status/i)).toBeInTheDocument();
        });

        it('should hide mesh status after projectStatus confirms no mesh', async () => {
            renderDashboard();

            expect(screen.getByText(/Checking status/i)).toBeInTheDocument();

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
                expect(screen.getByText(/API Mesh.*Deployed/i)).toBeInTheDocument();
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

            await waitFor(() => expect(screen.getByText(/API Mesh.*Not deployed/i)).toBeInTheDocument());
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

        it('should display "Redeploy needed" for config-changed status', async () => {
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
                expect(screen.getByText(/Redeploy needed/i)).toBeInTheDocument();
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

    describe('Authentication Required', () => {
        it('should display "Session expired" with Sign in button for needs-auth', async () => {
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
                expect(screen.getByText('Sign in')).toBeInTheDocument();
            });
        });

        it('should send re-authenticate message when Sign in clicked', async () => {
            const user = userEvent.setup();
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'needs-auth',
                },
            });

            await waitFor(async () => {
                const signInButton = screen.getByText('Sign in');
                await user.click(signInButton);
            });

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('re-authenticate');
        });
    });
});
