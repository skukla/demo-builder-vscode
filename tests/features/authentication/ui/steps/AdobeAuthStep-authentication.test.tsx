import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockPostMessage,
    mockRequestAuth,
    mockOnMessage,
    baseState,
    setupAuthStatusMock,
    resetMocks,
    cleanupTests,
} from './AdobeAuthStep.testUtils';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => {
    const {
        mockPostMessage,
        mockRequestAuth,
        mockOnMessage,
    } = require('./AdobeAuthStep.testUtils');

    return {
        webviewClient: {
            postMessage: (...args: any[]) => mockPostMessage(...args),
            requestAuth: (...args: any[]) => mockRequestAuth(...args),
            onMessage: (...args: any[]) => mockOnMessage(...args),
        },
    };
});

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => {
    const React = require('react');
    return {
        LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
            <div data-testid="loading-display">
                <div>{message}</div>
                {subMessage && <div>{subMessage}</div>}
            </div>
        ),
    };
});

describe('AdobeAuthStep - Authentication Flow', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    describe('Happy Path - Authentication Flow', () => {
        it('should render authentication prompt when not authenticated', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText('Adobe Authentication')).toBeInTheDocument();
            expect(screen.getByText('Sign In with Adobe')).toBeInTheDocument();
        });

        it('should trigger authentication when Sign In button is clicked', async () => {
            const user = userEvent.setup();
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const signInButton = screen.getByText('Sign In with Adobe');
            await user.click(signInButton);

            expect(mockRequestAuth).toHaveBeenCalledWith(false);
        });

        it('should display success state when authenticated with org', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText('Connected')).toBeInTheDocument();
            expect(screen.getByText('Test Organization')).toBeInTheDocument();
            expect(screen.getByText('Switch Organizations')).toBeInTheDocument();
        });

        it('should update canProceed when authenticated with org', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should not allow proceed when authenticated without org', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Loading States', () => {
        it('should display loading state when checking authentication', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: true },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            expect(screen.getByText('Connecting to Adobe services...')).toBeInTheDocument();
        });

        it('should display custom loading message from auth status', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: true },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate auth status message
            messageCallback({
                isChecking: true,
                message: 'Verifying credentials...',
                subMessage: 'Please wait',
            });

            await waitFor(() => {
                expect(screen.getByText('Verifying credentials...')).toBeInTheDocument();
            });
        });

        it('should check authentication on mount when status is false', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Should always call check-auth on mount to validate token and auto-skip if valid
            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });

        it('should check authentication on mount even when already authenticated', () => {
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Org' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Always validate token on mount, even if already authenticated
            // This ensures token is still valid and provides consistent behavior
            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });
    });

    describe('Auth Status Message Handling', () => {
        it('should update state when auth-status message received', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: true },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate successful auth message
            messageCallback({
                isAuthenticated: true,
                isChecking: false,
                email: 'user@test.com',
                organization: {
                    id: 'org1',
                    code: 'ORG1',
                    name: 'Test Organization',
                },
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeAuth: expect.objectContaining({
                            isAuthenticated: true,
                            isChecking: false,
                            email: 'user@test.com',
                        }),
                        adobeOrg: {
                            id: 'org1',
                            code: 'ORG1',
                            name: 'Test Organization',
                        },
                    })
                );
            });
        });

        it('should clear org when message has no organization', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Org' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate message without org
            messageCallback({
                isAuthenticated: true,
                isChecking: false,
                organization: null,
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeOrg: undefined,
                    })
                );
            });
        });
    });

    describe('UX Message Flash Fix - handleLogin() Message Behavior', () => {
        it('should set authStatus to empty string when Sign In clicked, not optimistic message', async () => {
            const user = userEvent.setup();
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const signInButton = screen.getByText('Sign In with Adobe');
            await user.click(signInButton);

            // Verify authStatus is cleared (empty string), NOT set to optimistic message
            // The optimistic message should NEVER appear after clicking Sign In
            expect(screen.queryByText('Opening browser for Adobe authentication...')).not.toBeInTheDocument();
        });

        it('should clear authSubMessage when handleLogin() called', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate existing subMessage from previous operation
            messageCallback({
                isChecking: false,
                isAuthenticated: false,
                message: 'Previous message',
                subMessage: 'Previous sub-message',
            });

            await waitFor(() => {
                expect(screen.getByText('Previous sub-message')).toBeInTheDocument();
            });

            // Click Sign In - should clear messages
            const user = userEvent.setup();
            const signInButton = screen.getByText('Sign In with Adobe');
            await user.click(signInButton);

            // Sub-message should be cleared
            expect(screen.queryByText('Previous sub-message')).not.toBeInTheDocument();
        });

        it('should allow backend to control first message when authStatus is empty', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Click Sign In
            const user = userEvent.setup();
            const signInButton = screen.getByText('Sign In with Adobe');
            await user.click(signInButton);

            // Simulate backend sending accurate first message
            messageCallback({
                isChecking: true,
                isAuthenticated: false,
                message: 'Already authenticated, selecting organization...',
                subMessage: 'Please choose your organization',
            });

            // Backend message should display (proving no optimistic message conflict)
            await waitFor(() => {
                expect(screen.getByText('Already authenticated, selecting organization...')).toBeInTheDocument();
            });
        });

        it('should not display "Opening browser..." at any point during login flow', async () => {
            const user = userEvent.setup();
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: false, isChecking: false },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const signInButton = screen.getByText('Sign In with Adobe');
            await user.click(signInButton);

            // The optimistic message should NEVER appear
            expect(screen.queryByText('Opening browser for Adobe authentication...')).not.toBeInTheDocument();
            expect(screen.queryByText(/Opening browser/i)).not.toBeInTheDocument();
        });
    });
});
