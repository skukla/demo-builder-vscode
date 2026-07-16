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
        // Since D3 Step 08 the mesh deploys from its integrations-list row
        // (MeshComponentRow), not an ActionGrid tile — same deployMesh message.
        it('should send deployMesh message when the mesh row Redeploy is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard({ hasMesh: true, hasAdobeContext: true });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: { status: 'deployed' },
            });

            const redeployButton = await screen.findByRole('button', { name: /^redeploy$/i });
            await user.click(redeployButton);

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

        it('should send editProject message when Edit clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            await user.click(screen.getByText('Edit'));

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('editProject');
        });

        it('should send exportProject message when Export clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            await user.click(screen.getByText('Export'));

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('exportProject');
        });

        it('should send resetProject message when Reset clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            await user.click(screen.getByText('Reset'));

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('resetProject');
        });
    });

    describe('Inline title rename', () => {
        it('renames in place from the header pencil (renameProject via request)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const { webviewClient } = require('@/core/ui/utils/WebviewClient');
            const mockRequest = webviewClient.request as jest.Mock;
            mockRequest.mockImplementation((type: string) =>
                type === 'renameProject'
                    ? Promise.resolve({ success: true })
                    : new Promise(() => {})
            );
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            await user.click(screen.getByRole('button', { name: 'Rename Test Project' }));
            const input = screen.getByRole('textbox', { name: 'New project name' });
            await user.clear(input);
            await user.type(input, 'renamed-project');
            await user.keyboard('{Enter}');

            expect(mockRequest).toHaveBeenCalledWith('renameProject', {
                newName: 'renamed-project',
            });
        });

        it('offers no Rename item anywhere (the More menu lost it)', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            expect(screen.queryByText('Rename')).not.toBeInTheDocument();
        });
    });
});
