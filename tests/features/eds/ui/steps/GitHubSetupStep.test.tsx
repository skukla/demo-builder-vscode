/**
 * Unit Tests: GitHubSetupStep
 *
 * Tests for the GitHub OAuth authentication step.
 *
 * Coverage: 8 tests
 * - Unauthenticated State (2 tests)
 * - Authenticated State (2 tests)
 * - Loading/Authenticating State (1 test)
 * - Error Handling (2 tests)
 * - Navigation State (1 test)
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock webviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn(() => jest.fn()); // Return unsubscribe function

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: mockOnMessage,
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

// Test wrapper with Spectrum provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

// Default wizard state for GitHub authentication
const createDefaultState = (githubAuthOverrides?: Partial<WizardState['edsConfig']>): WizardState => ({
    currentStep: 'github-auth',
    projectName: 'test-project',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    componentConfigs: {},
    edsConfig: {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
        githubAuth: {
            isAuthenticated: false,
            isAuthenticating: false,
        },
        ...githubAuthOverrides,
    },
});

describe('GitHubSetupStep', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();
    });

    describe('Unauthenticated State', () => {
        it('should show sign-in prompt when not authenticated', async () => {
            // Given: User is not authenticated with GitHub
            const state = createDefaultState();

            // When: Component renders (use dynamic import)
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show sign-in button and page heading
            expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /github authentication/i })).toBeInTheDocument();
        });

        it('should initiate OAuth flow on sign-in button click', async () => {
            // Given: User is not authenticated
            const state = createDefaultState();

            // When: User clicks sign-in button
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            const signInButton = screen.getByRole('button', { name: /sign in with github/i });
            await userEvent.click(signInButton);

            // Then: Should post OAuth message
            expect(mockPostMessage).toHaveBeenCalledWith('github-oauth');
        });
    });

    describe('Authenticated State', () => {
        it('should show authenticated state with username', async () => {
            // Given: User is authenticated with GitHub
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'testuser', avatarUrl: 'https://example.com/avatar.png' },
                },
            });

            // When: Component renders
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show authenticated state with username
            expect(screen.getByText(/testuser/i)).toBeInTheDocument();
            expect(screen.getByText(/connected/i)).toBeInTheDocument();
        });

        it('should show Switch Account button when authenticated', async () => {
            // Given: User is authenticated
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'testuser' },
                },
            });

            // When: Component renders
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show Switch Account button
            expect(screen.getByRole('button', { name: /switch account/i })).toBeInTheDocument();
        });
    });

    describe('Loading State', () => {
        it('should show loading indicator during OAuth flow', async () => {
            // Given: OAuth is in progress
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: false,
                    isAuthenticating: true,
                },
            });

            // When: Component renders
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show loading state
            expect(screen.getByText(/connecting to github/i)).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('should display error message on OAuth failure', async () => {
            // Given: OAuth failed with error
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: false,
                    error: 'OAuth cancelled by user',
                },
            });

            // When: Component renders
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show error and retry option
            expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });

        it('should allow retry after OAuth error', async () => {
            // Given: OAuth failed
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: false,
                    error: 'Connection timeout',
                },
            });

            // When: User clicks Try Again
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            const retryButton = screen.getByRole('button', { name: /try again/i });
            await userEvent.click(retryButton);

            // Then: Should initiate OAuth again
            expect(mockPostMessage).toHaveBeenCalledWith('github-oauth');
        });
    });

    describe('Navigation State', () => {
        it('should enable Continue when authenticated', async () => {
            // Given: User is authenticated
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'testuser' },
                },
            });

            // When: Component renders
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should enable Continue
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should disable Continue when not authenticated', async () => {
            // Given: User is not authenticated
            const state = createDefaultState();

            // When: Component renders
            const { GitHubSetupStep } = await import('@/features/eds/ui/steps/GitHubSetupStep');
            render(
                <TestWrapper>
                    <GitHubSetupStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should disable Continue
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });
    });
});
