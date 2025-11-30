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

        it('should request status on mount', () => {
            renderDashboard();
            expect(ctx.mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });

        it('should render Demo status card', () => {
            renderDashboard();
            expect(screen.getByText(/Demo:/i)).toBeInTheDocument();
        });
    });

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

        it('should display "Restart needed" when running with config changes', async () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
                port: 3000,
                frontendConfigChanged: true,
            });

            await waitFor(() => {
                expect(screen.getByText(/Restart needed/i)).toBeInTheDocument();
            });
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

        it('should hide mesh status after status update confirms no mesh', async () => {
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
