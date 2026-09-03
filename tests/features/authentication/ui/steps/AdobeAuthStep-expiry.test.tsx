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

/**
 * The "Session Expiring Soon" state. No suite had rendered it before the mutation
 * run of 2026-09-03: every mutant in its message, its action and the branch that
 * shows it survived or was never reached.
 */
describe('AdobeAuthStep - Session Expiring Soon', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const org = { id: 'org1', code: 'ORG1', name: 'Test Organization' };

    function renderExpiring(tokenExpiresIn: number | undefined) {
        const state = {
            ...baseState,
            adobeAuth: {
                isAuthenticated: true,
                isChecking: false,
                tokenExpiringSoon: true,
                tokenExpiresIn,
            },
            adobeOrg: org,
        };
        return render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );
    }

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    it('shows the warning, with the minutes left, instead of the Connected panel', () => {
        renderExpiring(5);

        expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Your Adobe session expires in 5 minutes. ' +
                    'Please re-authenticate to avoid interruption during project setup.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    it('says "minute" when exactly one is left', () => {
        renderExpiring(1);
        expect(screen.getByText(/expires in 1 minute\. Please/)).toBeInTheDocument();
    });

    it('says "0 minutes" when the backend gave no figure', () => {
        renderExpiring(undefined);
        expect(screen.getByText(/expires in 0 minutes\. Please/)).toBeInTheDocument();
    });

    it('re-authenticates with a FORCED login from the action', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderExpiring(5);

        await user.click(screen.getByText('Re-authenticate Now'));

        expect(mockRequestAuth).toHaveBeenCalledTimes(1);
        expect(mockRequestAuth).toHaveBeenCalledWith(true);
    });

    it('is absent while the session is not expiring', () => {
        const state = {
            ...baseState,
            adobeAuth: { isAuthenticated: true, isChecking: false, tokenExpiringSoon: false },
            adobeOrg: org,
        };
        render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument();
        expect(screen.getByText('Connected')).toBeInTheDocument();
    });
});
