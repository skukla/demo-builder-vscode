import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockRequestAuth,
    baseState,
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

describe('AdobeAuthStep - Messaging and Edge Cases', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupTests();
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

        it('forward-navigates to the org picker on Switch Organizations (no force-login)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onNext = jest.fn();
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
                    onNext={onNext}
                />
            );

            const switchButton = screen.getByText('Switch Organizations');

            // Org switching is a normal pick-from-list step now: forward-nav,
            // not a forced re-login. Repeated clicks just re-issue navigation.
            await user.click(switchButton);
            await user.click(switchButton);

            expect(onNext).toHaveBeenCalled();
            expect(mockRequestAuth).not.toHaveBeenCalled();
        });
    });
});
