/**
 * Shared setup for the AdobeAuthStep suites.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT. Specs import `AdobeAuthStep` from
 * HERE, never from `@/features/...`, and must NOT declare their own `jest.mock`
 * calls for WebviewClient or LoadingDisplay.
 *
 * Why it has to be that way: `babel-plugin-jest-hoist` lifts `jest.mock` above the
 * imports of the module it appears in — not across modules. If a spec imported the
 * component directly, the component could load before this file's mocks were
 * registered and would bind to the REAL WebviewClient. Making this file import and
 * re-export the component removes the ordering question entirely; it is the pattern
 * used by 59 other `.testUtils` files in this repo (`webview-test-authoring` §3).
 *
 * Until 2026-08-30 this file said the OPPOSITE — "Each test file must call
 * jest.mock() at the top level before imports" — and all four specs duly pasted the
 * same 24 lines. The duplication was the documented procedure, which is why no
 * amount of tidying had removed it.
 *
 * The factories reference `mockPostMessage` / `mockRequestAuth` / `mockOnMessage`
 * directly rather than `require()`-ing this module back into itself. That is legal
 * because the `mock` name prefix is on jest-hoist's allow-list, and safe because
 * each reference sits inside an arrow function that does not run until the mocked
 * method is actually called.
 */

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        requestAuth: (...args: any[]) => mockRequestAuth(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
    },
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => {
    const ReactInFactory = require('react');
    return {
        LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) =>
            ReactInFactory.createElement(
                'div',
                { 'data-testid': 'loading-display' },
                ReactInFactory.createElement('div', null, message),
                subMessage ? ReactInFactory.createElement('div', null, subMessage) : null
            ),
    };
});

import { cleanup, act } from '@testing-library/react';
import { WizardState } from '@/types/webview';

// The SUT, re-exported so specs never import it directly — see the header.
export { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';

// Cleanup function that should be called in afterEach
export function cleanupTests() {
    cleanup(); // Unmount React components to stop any running effects/timers
    jest.clearAllMocks();
    jest.useRealTimers(); // Ensure real timers are restored
}

// The shared mock functions the factories above delegate to. Specs import these to
// assert against; they must NOT re-declare the jest.mock calls that use them.
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
