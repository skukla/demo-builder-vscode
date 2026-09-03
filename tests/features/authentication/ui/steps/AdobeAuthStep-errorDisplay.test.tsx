/**
 * What the error state HANDS StatusDisplay. Its `variant` selects a default icon
 * that the step overrides with its own, so the variant is invisible in the DOM —
 * the sibling suites read the screen and could not tell 'warning' from 'error'.
 * Here the display is the double and the assertions are on its arguments. Every
 * workflow icon is one stub under jest (`moduleNameMapper`), so the icon is told
 * apart by the colour class the step puts on it, not by its type.
 */
import { render } from '@testing-library/react';
import React from 'react';
import type { StatusDisplayProps } from '@/core/ui/components/feedback/StatusDisplay';
import type { WizardState } from '@/types/webview';

const mockStatusDisplay = jest.fn((_props: StatusDisplayProps) => null);
jest.mock('@/core/ui/components/feedback/StatusDisplay', () => ({
    StatusDisplay: (props: StatusDisplayProps) => mockStatusDisplay(props),
}));

// The shared wall (testUtils) is imported before any `@/` value import so the
// SUT it re-exports binds to the mocked WebviewClient; the mock above hoists
// over every import of this module regardless (mock-wall-import-order).
import { AdobeAuthStep, baseState, resetMocks, cleanupTests } from './AdobeAuthStep.testUtils';
import { ErrorCode } from '@/types/errorCodes';

describe('AdobeAuthStep - what the error state hands StatusDisplay', () => {
    function displayProps(code?: ErrorCode): StatusDisplayProps {
        const state = {
            ...baseState,
            adobeAuth: { isAuthenticated: false, isChecking: false, error: 'boom', code },
        };
        render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
            />
        );
        // Mount's own auth check re-renders once; the LAST render is the settled one.
        const last = mockStatusDisplay.mock.calls.at(-1);
        if (!last) throw new Error('StatusDisplay was never rendered');
        return last[0];
    }

    function iconOf(props: StatusDisplayProps): React.ReactElement {
        if (!React.isValidElement(props.icon)) throw new Error('no icon element handed over');
        return props.icon;
    }

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    it('is a red-alert ERROR for a connection failure', () => {
        const props = displayProps(undefined);
        expect(props.variant).toBe('error');
        expect(props.title).toBe('Connection Issue');
        const icon = iconOf(props);
        expect(icon.props).toMatchObject({ UNSAFE_className: 'text-red-500' });
        expect(props.actions?.map((a) => a.label)).toEqual(['Try Again', 'Sign In Again']);
    });

    it('is an orange WARNING when the account merely lacks App Builder', () => {
        const props = displayProps(ErrorCode.AUTH_NO_APP_BUILDER);
        expect(props.variant).toBe('warning');
        expect(props.title).toBe('Insufficient Privileges');
        const icon = iconOf(props);
        expect(icon.props).toMatchObject({ UNSAFE_className: 'text-orange-500' });
        expect(props.actions?.map((a) => a.label)).toEqual(['Sign in with a different account']);
    });
});
