/**
 * AdobeAuthStep hosted in a dialog (the Add Integration flow's sign-in stage): real render, the
 * only double is the callback the dialog hands in.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AdobeAuthStep, baseState, cleanupTests, resetMocks, setupAuthStatusMock } from './AdobeAuthStep.testUtils';
import type { WizardState } from '@/types/webview';

// In a dialog, the outcome is its title and the actions are its footer (dialog design rules): the
// large centred view is for a whole wizard screen, which passes no `onOutcome`.
describe('AdobeAuthStep hosted in a dialog', () => {
    const renderInDialog = (adobeAuth: Partial<WizardState['adobeAuth']>) => {
        const onOutcome = jest.fn();
        const pushAuthStatus = setupAuthStatusMock();
        render(
            <AdobeAuthStep
                state={{ ...baseState, adobeAuth: { ...baseState.adobeAuth, ...adobeAuth } } as WizardState}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
                onOutcome={onOutcome}
            />,
        );
        // The extension's answer to the check the hook sends as it mounts: it clears the wait.
        pushAuthStatus({ isAuthenticated: false, isChecking: false, message: '', ...adobeAuth });
        return { onOutcome, outcome: () => onOutcome.mock.lastCall?.[0] };
    };

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => cleanupTests());

    it('reports signed out as an amber title that offers sign-in, never a retry', () => {
        const { outcome } = renderInDialog({ isAuthenticated: false, isChecking: false });

        expect(outcome()).toMatchObject({
            title: 'Sign in to Adobe',
            status: 'warning',
            lines: ['Connect your Adobe account to create and deploy App Builder applications.'],
            actions: [{ label: 'Sign In with Adobe' }],
        });
        expect(screen.queryByRole('button', { name: 'Sign In with Adobe' })).toBeNull();
    });

    it('reports a sign-in that failed in red, with the main action last', () => {
        const { outcome } = renderInDialog({ isAuthenticated: false, isChecking: false, error: 'network' });

        expect(outcome().status).toBe('error');
        expect(outcome().actions.map((action: { label: string }) => action.label)).toEqual(['Try Again', 'Sign In Again']);
    });

    it('CONTROL: a whole wizard screen keeps its large view, with the button in the body', () => {
        render(
            <AdobeAuthStep
                state={{ ...baseState, adobeAuth: { isAuthenticated: false, isChecking: false } } as WizardState}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: 'Sign In with Adobe' })).toBeInTheDocument();
    });
});
