import React from 'react';
import { cleanup, act } from '@testing-library/react';
import { WizardState } from '@/types/webview';

// Cleanup function that should be called in afterEach
export function cleanupTests() {
    cleanup(); // Unmount React components to stop any running effects/timers
    jest.clearAllMocks();
    jest.useRealTimers(); // Ensure real timers are restored
}

// Shared mock functions (exported for test files to import)
// Note: Each test file must call jest.mock() at the top level before imports
export const mockPostMessage = jest.fn();
export const mockRequestAuth = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn()); // Return unsubscribe function

// Base state for tests
export const baseState: Partial<WizardState> = {
    currentStep: 'adobe-auth',
    adobeAuth: {
        isAuthenticated: false,
        isChecking: false,
    },
    adobeOrg: undefined,
};

// Setup function to capture auth-status message callback
export function setupAuthStatusMock() {
    let messageCallback: (data: any) => void = () => {};
    mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
        if (type === 'auth-status') {
            messageCallback = callback;
        }
        return jest.fn();
    });
    // Return a function that calls the captured callback wrapped in act()
    // This prevents React "not wrapped in act()" warnings when simulating messages
    return (data: any) => {
        act(() => {
            messageCallback(data);
        });
    };
}

// Reset all mocks
export function resetMocks() {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
    mockRequestAuth.mockImplementation(() => {});
    mockPostMessage.mockImplementation(() => {});
}

// Loading Display Mock Component (export for test files to use in jest.mock())
export const LoadingDisplayMock = ({ message, subMessage }: { message: string; subMessage?: string }) => (
    <div data-testid="loading-display">
        <div>{message}</div>
        {subMessage && <div>{subMessage}</div>}
    </div>
);
