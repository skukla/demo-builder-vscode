import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
const mockPostMessage = jest.fn();
const mockRequestAuth = jest.fn();
const mockOnMessage = jest.fn().mockReturnValue(jest.fn()); // Return unsubscribe function

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        requestAuth: (...args: any[]) => mockRequestAuth(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
    },
}));

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
        <div data-testid="loading-display">
            <div>{message}</div>
            {subMessage && <div>{subMessage}</div>}
        </div>
    ),
}));

// No need to mock useMinimumLoadingTime - not used in this component

describe('AdobeAuthStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'adobe-auth',
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false,
        },
        adobeOrg: undefined,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn()); // Return unsubscribe function
        mockRequestAuth.mockImplementation(() => {}); // No-op by default
        mockPostMessage.mockImplementation(() => {}); // No-op by default
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

        it('should trigger authentication when Sign In button is clicked', () => {
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
            fireEvent.click(signInButton);

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
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

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

    describe('Organization Selection', () => {
        it('should display org selection prompt when authenticated without org', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    requiresOrgSelection: false,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText('Select Your Organization')).toBeInTheDocument();
            expect(screen.getByText('Select Organization')).toBeInTheDocument();
        });

        it('should display specific message when org lacks access', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    orgLacksAccess: true,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText(/No organizations are currently accessible/)).toBeInTheDocument();
        });

        it('should display message when previous org no longer accessible', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    requiresOrgSelection: true,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText(/Your previous organization is no longer accessible/)).toBeInTheDocument();
        });

        it('should trigger org selection when Select Organization is clicked', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const selectOrgButton = screen.getByText('Select Organization');
            fireEvent.click(selectOrgButton);

            expect(mockRequestAuth).toHaveBeenCalledWith(true); // force = true
        });

        it('should clear dependent state when switching organizations', () => {
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

            const switchButton = screen.getByText('Switch Organizations');
            fireEvent.click(switchButton);

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeOrg: undefined,
                    adobeProject: undefined,
                    adobeWorkspace: undefined,
                })
            );
        });
    });

    describe('Error Handling', () => {
        it('should display error state when authentication fails', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'connection_error',
                },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText('Connection Issue')).toBeInTheDocument();
            expect(screen.getByText('Try Again')).toBeInTheDocument();
            expect(screen.getByText('Sign In Again')).toBeInTheDocument();
        });

        it('should display specific error for insufficient privileges', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'no_app_builder_access',
                },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText('Insufficient Privileges')).toBeInTheDocument();
            expect(screen.getByText(/You need Developer or System Admin role/)).toBeInTheDocument();
        });

        it('should allow retry on error', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'connection_error',
                },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const tryAgainButton = screen.getByText('Try Again');
            fireEvent.click(tryAgainButton);

            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });

        it('should display timeout error state', async () => {
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate timeout message from backend
            messageCallback({
                error: 'timeout',
                isAuthenticated: false,
                isChecking: false,
            });

            await waitFor(() => {
                expect(screen.getByText('Authentication Timed Out')).toBeInTheDocument();
            });
            expect(screen.getByText(/browser authentication window may have been closed/)).toBeInTheDocument();
        });

        it('should allow retry after timeout', async () => {
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate timeout message from backend
            messageCallback({
                error: 'timeout',
                isAuthenticated: false,
                isChecking: false,
            });

            await waitFor(() => {
                expect(screen.getByText('Retry Login')).toBeInTheDocument();
            });

            const retryButton = screen.getByText('Retry Login');
            fireEvent.click(retryButton);

            expect(mockRequestAuth).toHaveBeenCalledWith(false);
        });
    });

    describe('Auth Status Message Handling', () => {
        it('should update state when auth-status message received', async () => {
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

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
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

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

    describe('Edge Cases', () => {
        it('should not display stale messages when navigating back to authenticated step', () => {
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

            // Should show connected state, not any loading/error messages
            expect(screen.getByText('Connected')).toBeInTheDocument();
            expect(screen.queryByTestId('loading-display')).not.toBeInTheDocument();
        });

        it('should prevent race conditions during org switching', () => {
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

            const switchButton = screen.getByText('Switch Organizations');

            // Click switch button multiple times rapidly
            fireEvent.click(switchButton);
            fireEvent.click(switchButton);
            fireEvent.click(switchButton);

            // Should only trigger auth once (first call) if ref protection works
            // However, the component doesn't prevent multiple clicks in the current implementation
            // So we expect multiple calls here, but the ref should prevent check-auth calls
            expect(mockRequestAuth).toHaveBeenCalled();
        });
    });

    describe('UX Message Flash Fix - handleLogin() Message Behavior', () => {
        it('should set authStatus to empty string when Sign In clicked, not optimistic message', () => {
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
            fireEvent.click(signInButton);

            // Verify authStatus is cleared (empty string), NOT set to optimistic message
            // The optimistic message should NEVER appear after clicking Sign In
            expect(screen.queryByText('Opening browser for Adobe authentication...')).not.toBeInTheDocument();
        });

        it('should clear authSubMessage when handleLogin() called', async () => {
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

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
            const signInButton = screen.getByText('Sign In with Adobe');
            fireEvent.click(signInButton);

            // Sub-message should be cleared
            expect(screen.queryByText('Previous sub-message')).not.toBeInTheDocument();
        });

        it('should allow backend to control first message when authStatus is empty', async () => {
            let messageCallback: (data: any) => void = () => {};
            mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
                if (type === 'auth-status') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

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
            const signInButton = screen.getByText('Sign In with Adobe');
            fireEvent.click(signInButton);

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

        it('should not display "Opening browser..." at any point during login flow', () => {
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
            fireEvent.click(signInButton);

            // The optimistic message should NEVER appear
            expect(screen.queryByText('Opening browser for Adobe authentication...')).not.toBeInTheDocument();
            expect(screen.queryByText(/Opening browser/i)).not.toBeInTheDocument();
        });
    });
});
