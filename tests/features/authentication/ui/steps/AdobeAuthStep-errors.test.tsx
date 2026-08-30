import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardState } from '@/types/webview';
import { ErrorCode } from '@/types/errorCodes';
import '@testing-library/jest-dom';
import {
    AdobeAuthStep,
    mockPostMessage,
    mockRequestAuth,
    baseState,
    setupAuthStatusMock,
    resetMocks,
    cleanupTests,
} from './AdobeAuthStep.testUtils';

describe('AdobeAuthStep - Error Handling', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupTests();
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
                    code: ErrorCode.AUTH_NO_APP_BUILDER, // Use typed error code
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

        it('labels the insufficient-privileges action as an account switch (force-login)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'no_app_builder_access',
                    code: ErrorCode.AUTH_NO_APP_BUILDER,
                },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // The genuine account-switch case keeps force-login, clearly labeled.
            const accountSwitch = screen.getByText('Sign in with a different account');
            expect(accountSwitch).toBeInTheDocument();
            await user.click(accountSwitch);
            expect(mockRequestAuth).toHaveBeenCalledWith(true);
        });

        it('should allow retry on error', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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
            await user.click(tryAgainButton);

            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });

        it('should display timeout error state', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                    code: ErrorCode.TIMEOUT,
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
                code: ErrorCode.TIMEOUT,
                isAuthenticated: false,
                isChecking: false,
            });

            await waitFor(() => {
                expect(screen.getByText('Authentication Timed Out')).toBeInTheDocument();
            });
            expect(screen.getByText(/browser authentication window may have been closed/)).toBeInTheDocument();
        });

        it('should allow retry after timeout', async () => {
            const messageCallback = setupAuthStatusMock();

            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                    code: ErrorCode.TIMEOUT,
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
                code: ErrorCode.TIMEOUT,
                isAuthenticated: false,
                isChecking: false,
            });

            await waitFor(() => {
                expect(screen.getByText('Retry Login')).toBeInTheDocument();
            });

            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const retryButton = screen.getByText('Retry Login');
            await user.click(retryButton);

            expect(mockRequestAuth).toHaveBeenCalledWith(false);
        });
    });
});
