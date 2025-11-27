/**
 * WebviewApp Component Tests
 *
 * Tests the shared root component for all VS Code webview applications.
 * This is CRITICAL infrastructure - handles theme sync, handshake, and Provider setup.
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

        it('subscribes to theme-changed message', () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            expect(mockOnMessage).toHaveBeenCalledWith('theme-changed', expect.any(Function));
        });

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

    describe('theme handling', () => {
        it('applies vscode-dark class to body initially', () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            expect(document.body.classList.contains('vscode-dark')).toBe(true);
        });

        it('applies dark theme from init message', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(document.body.classList.contains('vscode-dark')).toBe(true);
                expect(document.body.classList.contains('vscode-light')).toBe(false);
            });
        });

        it('applies light theme from init message', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'light' });

            await waitFor(() => {
                expect(document.body.classList.contains('vscode-light')).toBe(true);
                expect(document.body.classList.contains('vscode-dark')).toBe(false);
            });
        });

        it('updates theme on theme-changed message', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            // Initialize with dark theme
            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            // Change to light theme
            triggerMessage('theme-changed', { theme: 'light' });

            await waitFor(() => {
                expect(document.body.classList.contains('vscode-light')).toBe(true);
                expect(document.body.classList.contains('vscode-dark')).toBe(false);
            });
        });
    });

    describe('render props pattern', () => {
        it('supports function children (render props)', async () => {
            render(
                <WebviewApp>
                    {(data) => <div>Data: {data?.theme || 'none'}</div>}
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(screen.getByText('Data: dark')).toBeInTheDocument();
            });
        });

        it('passes init data to render function', async () => {
            render(
                <WebviewApp>
                    {(data) => <div>Custom: {(data as any)?.customProp || 'missing'}</div>}
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark', customProp: 'hello' });

            await waitFor(() => {
                expect(screen.getByText('Custom: hello')).toBeInTheDocument();
            });
        });

        it('passes null data initially to render function after init', async () => {
            const renderFn = jest.fn((data) => <div>Rendered</div>);

            render(
                <WebviewApp>
                    {renderFn}
                </WebviewApp>
            );

            // Trigger init
            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(renderFn).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
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

            triggerMessage('init', { theme: 'dark', extra: 'data' });

            await waitFor(() => {
                expect(onInit).toHaveBeenCalledWith(
                    expect.objectContaining({
                        theme: 'dark',
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
        it('unsubscribes from messages on unmount', () => {
            const unsubscribeInit = jest.fn();
            const unsubscribeTheme = jest.fn();

            mockOnMessage.mockImplementation((type: string) => {
                if (type === 'init') return unsubscribeInit;
                if (type === 'theme-changed') return unsubscribeTheme;
                return jest.fn();
            });

            const { unmount } = render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            unmount();

            expect(unsubscribeInit).toHaveBeenCalled();
            expect(unsubscribeTheme).toHaveBeenCalled();
        });
    });

    describe('Spectrum Provider', () => {
        it('renders with Spectrum Provider', async () => {
            render(
                <WebviewApp>
                    <div data-testid="spectrum-content">Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                // Content is rendered inside Spectrum Provider
                expect(screen.getByTestId('spectrum-content')).toBeInTheDocument();
            });
        });

        it('uses dark colorScheme for dark theme', async () => {
            const { container } = render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            triggerMessage('init', { theme: 'dark' });

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });

            // Spectrum Provider applies colorScheme
            // We verify the Provider rendered by checking for Spectrum classes
            const spectrumContainer = container.querySelector('[class*="spectrum"]');
            expect(spectrumContainer).toBeInTheDocument();
        });
    });
});
