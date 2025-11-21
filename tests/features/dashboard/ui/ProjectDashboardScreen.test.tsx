import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ProjectDashboardScreen } from '@/features/dashboard/ui/ProjectDashboardScreen';
import '@testing-library/jest-dom';

// Mock the webview-ui utilities and hooks
jest.mock('@/core/ui/hooks', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

// Mock the WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()), // Return unsubscribe function
    },
}));

describe('ProjectDashboardScreen', () => {
    let mockPostMessage: jest.Mock;
    let mockOnMessage: jest.Mock;
    let messageHandlers: Map<string, (data: any) => void>;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers = new Map();

        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        mockPostMessage = webviewClient.postMessage as jest.Mock;
        mockOnMessage = webviewClient.onMessage as jest.Mock;

        // Setup onMessage to store handlers
        mockOnMessage.mockImplementation((type: string, handler: (data: any) => void) => {
            messageHandlers.set(type, handler);
            return jest.fn(); // Return unsubscribe function
        });
    });

    const triggerMessage = (type: string, data: any) => {
        const handler = messageHandlers.get(type);
        if (handler) {
            handler(data);
        }
    };

    describe('Rendering', () => {
        it('should render project name from props', () => {
            render(<ProjectDashboardScreen project={{ name: 'Test Project', path: '/test/path' }} />);
            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });

        it('should render default name when project prop missing', () => {
            render(<ProjectDashboardScreen />);
            expect(screen.getByText('Demo Project')).toBeInTheDocument();
        });

        it('should request status on mount', () => {
            render(<ProjectDashboardScreen />);
            expect(mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });

        it('should render Demo status card', () => {
            render(<ProjectDashboardScreen />);
            // StatusCard renders "Demo: <status>" combined
            expect(screen.getByText(/Demo:/i)).toBeInTheDocument();
        });
    });

    describe('Server Status Display', () => {
        it('should display "Stopped" status when ready', () => {
            render(<ProjectDashboardScreen />);

            // Simulate status update
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });

            // StatusCard renders "Demo: Stopped" combined
            expect(screen.getByText(/Stopped/i)).toBeInTheDocument();
        });

        it('should display "Running on port 3000" when running', async () => {
            render(<ProjectDashboardScreen />);

            // Simulate status update
            triggerMessage('statusUpdate', {
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
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'starting',
            });

            await waitFor(() => {
                expect(screen.getByText(/Starting/i)).toBeInTheDocument();
            });
        });

        it('should display "Restart needed" when running with config changes', async () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
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
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'error',
            });

            await waitFor(() => {
                // StatusCard renders "Demo: Error" combined
                expect(screen.getByText(/Error/i)).toBeInTheDocument();
            });
        });
    });

    describe('Action Buttons - Stopped State', () => {
        it('should render Start button when stopped', () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            expect(screen.getByText('Start')).toBeInTheDocument();
        });

        it('should send startDemo message when Start clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            const startButton = screen.getByText('Start');
            await user.click(startButton);

            expect(mockPostMessage).toHaveBeenCalledWith('startDemo');
        });

        it('should have Open button disabled when stopped', () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            const openButton = screen.getByText('Open').closest('button');
            expect(openButton).toBeDisabled();
        });
    });

    describe('Action Buttons - Running State', () => {
        it('should render Stop button when running', async () => {
            render(<ProjectDashboardScreen />);

            
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(() => {
                expect(screen.getByText('Stop')).toBeInTheDocument();
            });
        });

        it('should send stopDemo message when Stop clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(async () => {
                const stopButton = screen.getByText('Stop');
                await user.click(stopButton);
            });

            expect(mockPostMessage).toHaveBeenCalledWith('stopDemo');
        });

        it('should have Open button enabled when running', async () => {
            render(<ProjectDashboardScreen />);

            
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(() => {
                const openButton = screen.getByText('Open').closest('button');
                expect(openButton).not.toBeDisabled();
            });
        });
    });

    describe('Common Actions', () => {
        it('should send viewLogs message when Logs clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            const logsButton = screen.getByText('Logs');
            await user.click(logsButton);

            expect(mockPostMessage).toHaveBeenCalledWith('viewLogs');
        });

        it('should send deployMesh message when Deploy Mesh clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            const deployButton = screen.getByText('Deploy Mesh');
            await user.click(deployButton);

            expect(mockPostMessage).toHaveBeenCalledWith('deployMesh');
        });

        it('should send configure message when Configure clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            const configureButton = screen.getByText('Configure');
            await user.click(configureButton);

            expect(mockPostMessage).toHaveBeenCalledWith('configure');
        });

        it('should send openBrowser message when Open clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            // Set to running state first
            
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });

            await waitFor(async () => {
                const openButton = screen.getByText('Open');
                await user.click(openButton);
            });

            expect(mockPostMessage).toHaveBeenCalledWith('openBrowser');
        });

        it('should send openDevConsole message when Dev Console clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            const devConsoleButton = screen.getByText('Dev Console');
            await user.click(devConsoleButton);

            expect(mockPostMessage).toHaveBeenCalledWith('openDevConsole');
        });

        it('should send deleteProject message when Delete clicked', async () => {
            const user = userEvent.setup();
            render(<ProjectDashboardScreen />);

            const deleteButton = screen.getByText('Delete');
            await user.click(deleteButton);

            expect(mockPostMessage).toHaveBeenCalledWith('deleteProject');
        });
    });

    describe('Mesh Status Display', () => {
        it('should display "Checking status..." initially before projectStatus loads', () => {
            render(<ProjectDashboardScreen />);
            // Before projectStatus arrives, show checking state to avoid flash
            // StatusCard renders "API Mesh: Checking status..." combined
            expect(screen.getByText(/API Mesh.*Checking status/i)).toBeInTheDocument();
        });

        it('should display "Checking status..." when hasMesh is true', () => {
            render(<ProjectDashboardScreen hasMesh={true} />);
            expect(screen.getByText(/API Mesh.*Checking status/i)).toBeInTheDocument();
        });

        it('should hide mesh status after projectStatus confirms no mesh', async () => {
            render(<ProjectDashboardScreen />);

            // Initially shows checking
            expect(screen.getByText(/Checking status/i)).toBeInTheDocument();

            // Status update without mesh data
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });

            await waitFor(() => {
                expect(screen.queryByText(/API Mesh/i)).not.toBeInTheDocument();
            });
        });

        it('should display mesh status when status update received', async () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'deployed',
                    endpoint: 'https://mesh.endpoint.com',
                },
            });

            await waitFor(() => {
                // StatusCard renders "API Mesh: Deployed" combined
                expect(screen.getByText(/API Mesh.*Deployed/i)).toBeInTheDocument();
            });
        });

        it('should display "Not deployed" for not-deployed status', async () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
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
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'deploying',
                    message: 'Building mesh configuration...',
                },
            });

            await waitFor(() => {
                // Custom message replaces default status text
                expect(screen.getByText(/Building mesh configuration/i)).toBeInTheDocument();
            });
        });

        it('should display "Session expired" with Sign in button for needs-auth', async () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
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
            render(<ProjectDashboardScreen />);


            triggerMessage('statusUpdate', {
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

            expect(mockPostMessage).toHaveBeenCalledWith('re-authenticate');
        });

        it('should update mesh status via meshStatusUpdate message', async () => {
            render(<ProjectDashboardScreen />);

            // Initial status with mesh
            triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
                mesh: {
                    status: 'not-deployed',
                },
            });

            // Update mesh status
            triggerMessage('meshStatusUpdate', {
                status: 'deployed',
                endpoint: 'https://mesh.endpoint.com',
            });

            await waitFor(() => {
                expect(screen.getByText(/Deployed/i)).toBeInTheDocument();
            });
        });

        it('should display "Redeploy needed" for config-changed status', async () => {
            render(<ProjectDashboardScreen />);

            triggerMessage('statusUpdate', {
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
    });

    describe('Edge Cases', () => {
        it('should handle missing project prop gracefully', () => {
            render(<ProjectDashboardScreen />);
            expect(screen.getByText('Demo Project')).toBeInTheDocument();
        });

        it('should hide mesh status after status update confirms no mesh', async () => {
            render(<ProjectDashboardScreen />);

            // Initially shows checking (before projectStatus loads)
            expect(screen.getByText(/Checking status/i)).toBeInTheDocument();

            triggerMessage('statusUpdate', {
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

            mockOnMessage.mockImplementation((type) => {
                if (type === 'statusUpdate') return unsubscribeStatus;
                if (type === 'meshStatusUpdate') return unsubscribeMesh;
                return jest.fn();
            });

            const { unmount } = render(<ProjectDashboardScreen />);
            unmount();

            expect(unsubscribeStatus).toHaveBeenCalled();
            expect(unsubscribeMesh).toHaveBeenCalled();
        });
    });
});
