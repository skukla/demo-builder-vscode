/**
 * ProjectDashboardScreen - Action Buttons Tests
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';

jest.mock('@/features/dashboard/ui/components/share/ShareModal', () => ({
    // The real dialog renders the core Modal, whose Spectrum pieces this suite's
    // partial Spectrum mock does not carry (same reason the Add a demo package dialog is
    // stubbed in the demo-source suite). Its own suite renders it real.
    ShareModal: ({ onClose }: any) => (
        <div role="dialog" aria-label="Share Demo">
            <button onClick={onClose}>Close</button>
        </div>
    ),
}));

jest.mock('@/features/projects-dashboard/ui/components/ProjectsBatchModal', () => ({
    // The batch window renders the core Modal, which this suite's partial Spectrum mock does not
    // carry; its words on this screen are pinned by useDashboardResetDelete.test.tsx, real.
    ProjectsBatchModal: () => <div role="dialog" aria-label="Batch window" />,
}));

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
        // The mesh has not deployed from an ActionGrid tile since D3 Step 08, and
        // since the integrations-grid cutover its Redeploy lives in the card's
        // detail drawer. That routing pin (deployMesh, never the keyed message)
        // is owned by ProjectDashboardScreen-integrations.test.tsx.

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

        // Delete opens the projects list on its one-row Delete window (owner, 2026-11-13, P5-Q2):
        // the dashboard closes when its project is deleted, so the window cannot live here.
        it('hands Delete over to the projects list, and asks nothing here', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            await user.click(screen.getByText('Delete'));

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('deleteFromProjectsList');
            expect(ctx.mockRequest).not.toHaveBeenCalledWith('deleteProject', expect.anything());
            expect(screen.queryByRole('dialog', { name: 'Batch window' })).toBeNull();
        });

        it('should send editProject message when Edit clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            await user.click(screen.getByText('Edit'));

            expect(ctx.mockPostMessage).toHaveBeenCalledWith('editProject');
        });

        it('opens the Share dialog when Share Demo clicked, and posts nothing by itself', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            await user.click(screen.getByText('Share Demo'));
            expect(screen.getByRole('dialog', { name: 'Share Demo' })).toBeInTheDocument();
            expect(ctx.mockPostMessage).not.toHaveBeenCalledWith('exportProject');
        });

        // Reset opens the batch window here, on this project as its one row (owner, 2026-11-13,
        // P5-Q2). Its path is the one the latest status names: a rename moves the folder.
        it("opens the batch window on this project's current folder", async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard({ project: { name: asDisplayName('Test Project'), path: '/test/old-path' } });
            ctx.triggerMessage('statusUpdate', {
                name: 'Renamed Project',
                path: '/test/renamed-project',
                status: 'stopped',
            });

            await user.click(screen.getByText('Reset'));

            expect(ctx.mockRequest).toHaveBeenCalledWith('prepareProjectsBatch', {
                action: 'reset',
                projectPaths: ['/test/renamed-project'],
            });
            expect(ctx.mockRequest).not.toHaveBeenCalledWith('resetProject', expect.anything());
            expect(screen.getByRole('dialog', { name: 'Batch window' })).toBeInTheDocument();
        });

        it('before any status, opens it on the folder the dashboard was opened on', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard({ project: { name: asDisplayName('Test Project'), path: '/test/path' } });

            await user.click(screen.getByText('Reset'));

            expect(ctx.mockRequest).toHaveBeenCalledWith('prepareProjectsBatch', {
                action: 'reset',
                projectPaths: ['/test/path'],
            });
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
