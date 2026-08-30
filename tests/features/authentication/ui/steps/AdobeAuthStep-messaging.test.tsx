import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    AdobeAuthStep,
    mockRequestAuth,
    baseState,
    resetMocks,
    cleanupTests,
} from './AdobeAuthStep.testUtils';

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

        it('forces a re-login (account switch) on Switch IMS Org', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

            const switchButton = screen.getByText('Switch IMS Org');
            await user.click(switchButton);

            // IMS tokens are org-bound — switching orgs requires a forced re-login
            // (the browser presents the account/org chooser).
            expect(mockRequestAuth).toHaveBeenCalledWith(true);
        });
    });
});
