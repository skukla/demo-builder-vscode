/**
 * WebviewApp Component Tests
 *
 * Tests the shared root component for all VS Code webview applications.
 * This is CRITICAL infrastructure - handles theme sync, handshake, and wrapper div setup.
 * Note: Spectrum Provider was removed in Step 9 of React Aria migration.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Create mocks that can be accessed before Jest hoisting
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        ready: jest.fn(),
    },
}));

// Import after mock is set up
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

// Cast to jest.Mock for type safety
const mockPostMessage = webviewClient.postMessage as jest.Mock;
const mockOnMessage = webviewClient.onMessage as jest.Mock;
const mockReady = webviewClient.ready as jest.Mock;

describe('WebviewApp', () => {
    // Store captured message handlers
    const messageHandlers = new Map<string, (data: unknown) => void>();

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();

        // Setup onMessage to capture handlers and return unsubscribe
        mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
            messageHandlers.set(type, handler);
            return jest.fn(); // unsubscribe function
        });

        // Default: ready resolves immediately
        mockReady.mockResolvedValue(undefined);

        // Clear body classes
        document.body.className = '';
    });

    // Helper to trigger a message
    const triggerMessage = (type: string, data: unknown) => {
        const handler = messageHandlers.get(type);
        if (handler) {
            handler(data);
        }
    };

    describe('initialization', () => {
        it('shows loading content while waiting for init', () => {
            render(
                <WebviewApp loadingContent={<div>Loading...</div>}>
                    <div>App content</div>
                </WebviewApp>
            );

            expect(screen.getByText('Loading...')).toBeInTheDocument();
            expect(screen.queryByText('App content')).not.toBeInTheDocument();
        });

        it('shows nothing when no loadingContent and not ready', () => {
            render(
                <WebviewApp>
                    <div>App content</div>
                </WebviewApp>
            );

            expect(screen.queryByText('App content')).not.toBeInTheDocument();
        });

        it('renders children after init message received', async () => {
            render(
                <WebviewApp>
                    <div>App content</div>
                </WebviewApp>
            );

            // Trigger init message
            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(screen.getByText('App content')).toBeInTheDocument();
            });
        });

        it('subscribes to init message', () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            expect(mockOnMessage).toHaveBeenCalledWith('init', expect.any(Function));
        });

        // Note: theme-changed subscription removed in unified theme system (always dark)

        it('sends ready message after handshake', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            await waitFor(() => {
                expect(mockReady).toHaveBeenCalled();
            });

            await waitFor(() => {
                expect(mockPostMessage).toHaveBeenCalledWith('ready');
            });
        });
    });

    describe('theme handling (unified theme system)', () => {
        // Unified theme system: Always uses dark mode, ignores VS Code theme preferences

        it('applies vscode-dark class to body (unified theme always dark)', () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            expect(document.body.classList.contains('vscode-dark')).toBe(true);
        });

        it('maintains dark theme regardless of init theme value', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            // Even if init sends 'light', we stay dark (unified theme system)
            triggerMessage('init', { theme: 'light' });

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            // Body stays vscode-dark (unified theme ignores user preferences)
            expect(document.body.classList.contains('vscode-dark')).toBe(true);
        });

        it('does not respond to theme-changed messages (unified theme system)', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            // Initialize
            triggerMessage('init', {});

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            // Verify we stay dark even if theme-changed would be sent
            // (theme-changed handler was removed, so this is a no-op)
            expect(document.body.classList.contains('vscode-dark')).toBe(true);
        });
    });

    describe('render props pattern', () => {
        it('supports function children (render props)', async () => {
            render(
                <WebviewApp>
                    {(data) => <div>Data: {data?.customProp || 'none'}</div>}
                </WebviewApp>
            );

            triggerMessage('init', { customProp: 'test-value' });

            await waitFor(() => {
                expect(screen.getByText('Data: test-value')).toBeInTheDocument();
            });
        });

        it('passes init data to render function', async () => {
            render(
                <WebviewApp>
                    {(data) => <div>Custom: {(data as any)?.customProp || 'missing'}</div>}
                </WebviewApp>
            );

            triggerMessage('init', { customProp: 'hello' });

            await waitFor(() => {
                expect(screen.getByText('Custom: hello')).toBeInTheDocument();
            });
        });

        it('passes init data to render function after init', async () => {
            const renderFn = jest.fn((data) => <div>Rendered</div>);

            render(
                <WebviewApp>
                    {renderFn}
                </WebviewApp>
            );

            // Trigger init
            triggerMessage('init', { project: 'test-project' });

            await waitFor(() => {
                expect(renderFn).toHaveBeenCalledWith(expect.objectContaining({ project: 'test-project' }));
            });
        });
    });

    describe('onInit callback', () => {
        it('calls onInit when init message received', async () => {
            const onInit = jest.fn();

            render(
                <WebviewApp onInit={onInit}>
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { project: 'test', extra: 'data' });

            await waitFor(() => {
                expect(onInit).toHaveBeenCalledWith(
                    expect.objectContaining({
                        project: 'test',
                        extra: 'data',
                    })
                );
            });
        });

        it('does not call onInit before init message', () => {
            const onInit = jest.fn();

            render(
                <WebviewApp onInit={onInit}>
                    <div>Content</div>
                </WebviewApp>
            );

            expect(onInit).not.toHaveBeenCalled();
        });
    });

    describe('className prop', () => {
        it('applies default className', async () => {
            const { container } = render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            // The Provider should have the default className
            const provider = container.querySelector('.app-container');
            expect(provider).toBeInTheDocument();
        });

        it('applies custom className', async () => {
            const { container } = render(
                <WebviewApp className="custom-class">
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            const provider = container.querySelector('.custom-class');
            expect(provider).toBeInTheDocument();
        });
    });

    describe('cleanup', () => {
        it('unsubscribes from init message on unmount', () => {
            const unsubscribeInit = jest.fn();

            mockOnMessage.mockImplementation((type: string) => {
                if (type === 'init') return unsubscribeInit;
                return jest.fn();
            });

            const { unmount } = render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            unmount();

            expect(unsubscribeInit).toHaveBeenCalled();
        });
    });

    describe('wrapper div', () => {
        it('renders content in wrapper div', async () => {
            render(
                <WebviewApp>
                    <div data-testid="app-content">Content</div>
                </WebviewApp>
            );

            triggerMessage('init', {});

            await waitFor(() => {
                // Content is rendered inside wrapper div
                expect(screen.getByTestId('app-content')).toBeInTheDocument();
            });
        });

        it('applies webview-app class to wrapper (unified theme system)', async () => {
            const { container } = render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', {});

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            // Wrapper div has webview-app class (Spectrum Provider removed)
            const wrapperDiv = container.querySelector('.webview-app');
            expect(wrapperDiv).toBeInTheDocument();
        });
    });
});
