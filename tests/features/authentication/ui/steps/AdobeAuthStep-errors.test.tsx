import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockPostMessage,
    mockRequestAuth,
    baseState,
    setupAuthStatusMock,
    resetMocks,
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

describe('AdobeAuthStep - Error Handling', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
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
            const messageCallback = setupAuthStatusMock();

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
            const messageCallback = setupAuthStatusMock();

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
});
