/**
 * Unit Tests: useGitHubAuth Hook
 *
 * Tests for the GitHub OAuth state management hook.
 *
 * Coverage: 4 tests
 * - Initial state check (1 test)
 * - Auth status updates (1 test)
 * - OAuth flow state (1 test)
 * - Error handling (1 test)
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { WizardState, EDSConfig } from '@/types/webview';

// Mock webviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn(() => jest.fn()); // Return unsubscribe function
let messageHandlers: Map<string, (data: unknown) => void> = new Map();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: jest.fn((type: string, handler: (data: unknown) => void) => {
            messageHandlers.set(type, handler);
            return () => messageHandlers.delete(type);
        }),
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock webviewLogger
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Default wizard state for hook tests
const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'settings',
    projectName: 'test-project',
    projectTemplate: 'citisignal',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    edsConfig: {
        accsHost: 'https://accs.example.com',
        storeViewCode: 'default',
        customerGroup: 'general',
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
        ...overrides,
    },
});

describe('useGitHubAuth Hook', () => {
    let mockUpdateState: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        mockUpdateState = jest.fn();
    });

    it('should check GitHub auth status on mount', async () => {
        // Given: Default state without GitHub auth
        const state = createDefaultState();

        // When: Hook is mounted
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Then: Should send check-github-auth message
        expect(mockPostMessage).toHaveBeenCalledWith('check-github-auth');
    });

    it('should update state when auth-status received', async () => {
        // Given: Default state
        const state = createDefaultState();

        // When: Hook receives auth-status message
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Simulate receiving auth status
        const authHandler = messageHandlers.get('github-auth-status');
        expect(authHandler).toBeDefined();

        act(() => {
            authHandler?.({
                isAuthenticated: true,
                user: { login: 'testuser', avatarUrl: 'https://example.com/avatar' },
            });
        });

        // Then: Should update state with auth info
        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({
                            isAuthenticated: true,
                            user: expect.objectContaining({ login: 'testuser' }),
                        }),
                    }),
                })
            );
        });
    });

    it('should set isAuthenticating during OAuth flow', async () => {
        // Given: Default state
        const state = createDefaultState();

        // When: OAuth is initiated
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        const { result } = renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Trigger OAuth
        act(() => {
            result.current.startOAuth();
        });

        // Then: Should set authenticating state and send message
        expect(mockUpdateState).toHaveBeenCalledWith(
            expect.objectContaining({
                edsConfig: expect.objectContaining({
                    githubAuth: expect.objectContaining({
                        isAuthenticating: true,
                    }),
                }),
            })
        );
        expect(mockPostMessage).toHaveBeenCalledWith('github-oauth');
    });

    it('should handle OAuth error response', async () => {
        // Given: Default state
        const state = createDefaultState();

        // When: OAuth error is received
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Simulate receiving OAuth error
        const errorHandler = messageHandlers.get('github-oauth-error');
        expect(errorHandler).toBeDefined();

        act(() => {
            errorHandler?.({
                error: 'OAuth failed: User cancelled',
            });
        });

        // Then: Should update state with error
        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({
                            isAuthenticated: false,
                            isAuthenticating: false,
                            error: expect.stringContaining('cancelled'),
                        }),
                    }),
                })
            );
        });
    });
});
