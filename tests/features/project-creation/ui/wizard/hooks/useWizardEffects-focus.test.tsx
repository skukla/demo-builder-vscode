/**
 * useWizardEffects — the focus it gives a step when the step changes.
 *
 * A step with a search filter focuses nothing on load (owner, 2026-10-01); any other
 * step still gets its first control focused. The rule reads the step's DOM, because
 * whether a filter shows depends on how long the list is.
 */

import '../../../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';
import { useWizardEffects } from '@/features/project-creation/ui/wizard/hooks/useWizardEffects';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { WizardState } from '@/types/webview';

// The component-data load awaits this; it never settles here, so nothing logs.
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { request: jest.fn(() => new Promise(() => undefined)) },
}));

const STATE: WizardState = {
    currentStep: 'welcome',
    projectName: 'test-project',
    adobeAuth: { isAuthenticated: true, isChecking: false },
};

/** A step body holding a button, and a search filter when asked. */
function stepContent(withSearch: boolean): HTMLDivElement {
    const root = document.createElement('div');
    if (withSearch) {
        const search = document.createElement('input');
        search.type = 'search';
        root.appendChild(search);
    }
    const button = document.createElement('button');
    button.textContent = 'first control';
    root.appendChild(button);
    document.body.appendChild(root);
    return root;
}

function runEffects(content: HTMLDivElement): void {
    renderHook(() =>
        useWizardEffects({
            state: STATE,
            setState: jest.fn(),
            WIZARD_STEPS: [],
            completedSteps: [],
            confirmedSteps: [],
            stepContentRef: { current: content },
            setComponentsData: jest.fn(),
        }),
    );
    act(() => {
        jest.advanceTimersByTime(TIMEOUTS.STEP_CONTENT_FOCUS);
    });
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('useWizardEffects — focus on a step change', () => {
    it('focuses nothing on a step with a search filter', () => {
        runEffects(stepContent(true));

        expect(document.activeElement).toBe(document.body);
    });

    // The control: without a filter the same step still gets its first control.
    it('focuses the first control on a step without one', () => {
        const content = stepContent(false);

        runEffects(content);

        expect(document.activeElement).toBe(content.querySelector('button'));
    });
});
