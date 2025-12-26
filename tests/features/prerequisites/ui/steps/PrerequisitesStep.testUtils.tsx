import { render } from '@testing-library/react';
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

// State with components (edit project or after component selection)
export const baseStateWithComponents: Partial<WizardState> = {
    currentStep: 'prerequisites',
    components: {
        frontend: 'headless',
        backend: 'commerce-paas',
    },
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
 * Setup message callbacks for prerequisites-loaded and prerequisite-status
 */
export const setupMessageCallbacks = () => {
    let loadedCallback: (data: any) => void = () => {};
    let statusCallback: (data: any) => void = () => {};

    mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
        if (type === 'prerequisites-loaded') {
            loadedCallback = callback;
        } else if (type === 'prerequisite-status') {
            statusCallback = callback;
        }
        return jest.fn();
    });

    return { loadedCallback, statusCallback };
};

/**
 * Setup message callback for prerequisites-loaded only
 */
export const setupLoadedCallback = () => {
    let loadedCallback: (data: any) => void = () => {};

    mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
        if (type === 'prerequisites-loaded') {
            loadedCallback = callback;
        }
        return jest.fn();
    });

    return loadedCallback;
};

/**
 * Setup message callback for prerequisite-status only
 */
export const setupStatusCallback = () => {
    let statusCallback: (data: any) => void = () => {};

    mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
        if (type === 'prerequisite-status') {
            statusCallback = callback;
        }
        return jest.fn();
    });

    return statusCallback;
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
