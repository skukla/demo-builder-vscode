import { render, screen, waitFor, act } from '@testing-library/react';

import { settle } from '../../../../helpers/reactSettle';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { WizardState } from '@/types/webview';

/**
 * Shared test utilities for PrerequisitesStep tests
 * Created from test-suite-reorganization-memory-optimization plan
 *
 * NOTE: Each test file must include its own jest.mock() declaration for WebviewClient
 * This file exports the mock functions to be referenced by each test file's mock
 */

// Export mock functions (must be used in each test file's jest.mock())
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn());

// Base state for tests (new project - no components selected yet)
export const baseState: Partial<WizardState> = {
    currentStep: 'prerequisites',
};

// State with selectedStack (after stack selection)
// The handler derives componentSelection from the stack via stacks.json
export const baseStateWithSelectedStack: Partial<WizardState> = {
    currentStep: 'prerequisites',
    selectedStack: 'headless-paas', // Stack config defines frontend/backend/dependencies
};

// Mock functions used across tests
export const createMockFunctions = () => ({
    mockUpdateState: jest.fn(),
    mockSetCanProceed: jest.fn(),
    mockOnNext: jest.fn(),
    mockOnBack: jest.fn(),
});

/**
 * Render PrerequisitesStep with Provider wrapper
 */
export const renderPrerequisitesStep = (
    state: Partial<WizardState> = baseState,
    mocks = createMockFunctions()
) => {
    return {
        ...render(
            <Provider theme={defaultTheme}>
                <PrerequisitesStep
                    state={state as WizardState}
                    updateState={mocks.mockUpdateState}
                    onNext={mocks.mockOnNext}
                    onBack={mocks.mockOnBack}
                    setCanProceed={mocks.mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </Provider>
        ),
        ...mocks,
    };
};

/**
 * Wire the prerequisites-loaded / prerequisite-status message callbacks.
 *
 * Returns stable TRAMPOLINES, not the captured variables: the original
 * version returned `loadedCallback`/`statusCallback` by value at call time,
 * so the closure's later reassignment never reached the caller and the
 * returned functions stayed no-ops forever. That bug is why every spec in
 * this directory inlined its own copy of this wiring instead — 14 clones,
 * the tests-tree's largest cluster (2026-08-27 dedup sweep). The two
 * single-callback variants had the same bug and zero users; deleted.
 */
export const setupMessageCallbacks = () => {
    const current = {
        loaded: (_data: any): void => {},
        status: (_data: any): void => {},
    };
    mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
        if (type === 'prerequisites-loaded') {
            current.loaded = callback;
        } else if (type === 'prerequisite-status') {
            current.status = callback;
        }
        return jest.fn();
    });
    // Wrapped in act(): these push a message straight into the component's
    // subscriber, which is a state update with no React event behind it. Bare,
    // every delivery warned — and the component really was mid-update while the
    // spec asserted. A synchronous act is the right one; the handlers set state
    // directly rather than awaiting anything.
    return {
        fireLoaded: (data: any): void => {
            act(() => current.loaded(data));
        },
        fireStatus: (data: any): void => {
            act(() => current.status(data));
        },
    };
};

/**
 * The arrange ritual the progress specs repeated per test: wire the message
 * callbacks, render the step, deliver the prerequisites, and wait for the
 * first one to appear. Returns the trampolines for the act phase.
 */
export const renderLoadedStep = async (
    prerequisites: Array<Record<string, unknown>>,
    awaitName: string,
    state: Partial<WizardState> = baseState,
) => {
    const fire = setupMessageCallbacks();
    renderPrerequisitesStep(state);
    fire.fireLoaded({ prerequisites });
    // Settle BEFORE the wait, so anything the delivery kicked off lands inside
    // act() rather than in waitFor's yield gap (tests/helpers/reactSettle.ts).
    await settle();
    await waitFor(() => {
        screen.getByText(awaitName);
    });
    return fire;
};

/**
 * Mock scrollTo for jsdom (used in beforeAll)
 */
export const setupScrollMock = () => {
    Element.prototype.scrollTo = jest.fn();
};

/**
 * Reset all mocks (used in beforeEach)
 */
export const resetAllMocks = () => {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
};
