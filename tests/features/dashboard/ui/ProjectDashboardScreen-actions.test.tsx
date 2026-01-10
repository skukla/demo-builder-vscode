/**
 * ProjectDashboardScreen - Action Buttons Tests
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - Action Buttons', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    describe('Action Buttons - Stopped State', () => {
        it('should render Start button when stopped', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            expect(screen.getByText('Start')).toBeInTheDocument();
        });

        it('should send startDemo message when Start clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            const startButton = screen.getByText('Start');
            await user.click(startButton);

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('startDemo');
        });

        it('should have Open button disabled when stopped', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });
    });

    describe('Action Buttons - Running State', () => {
        it('should render Stop button when running', async () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(() => {
                expect(screen.getByText('Stop')).toBeInTheDocument();
            });
        });

        it('should send stopDemo message when Stop clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(async () => {
                const stopButton = screen.getByText('Stop');
                await user.click(stopButton);
            });

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('stopDemo');
        });

        it('should have Open button enabled when running', async () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(() => {
                const openButton = screen.getByText('Open in Browser').closest('button');
                expect(openButton).not.toBeDisabled();
            });
        });
    });

    describe('Common Actions', () => {
        it('should send viewLogs message when Logs clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            const logsButton = screen.getByText('Logs');
            await user.click(logsButton);

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('viewLogs');
        });

        it('should send deployMesh message when Deploy Mesh clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            const deployButton = screen.getByText('Deploy Mesh');
            await user.click(deployButton);

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('deployMesh');
        });

        it('should send configure message when Configure clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            const configureButton = screen.getByText('Configure');
            await user.click(configureButton);

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('configure');
        });

        it('should send openBrowser message when Open clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(async () => {
                const openButton = screen.getByText('Open in Browser');
                await user.click(openButton);
            });

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('openBrowser');
        });

        it('should send deleteProject message when Delete clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            const deleteButton = screen.getByText('Delete');
            await user.click(deleteButton);

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('deleteProject');
        });
    });
});
