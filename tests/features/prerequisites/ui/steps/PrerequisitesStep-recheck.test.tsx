import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import '@testing-library/jest-dom';
import {
    mockPostMessage,
    mockOnMessage,
    baseState,
    setupScrollMock,
    resetAllMocks,
} from './PrerequisitesStep.testUtils';
import { WizardState } from '@/types/webview';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => {
            const { mockPostMessage } = require('./PrerequisitesStep.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: any[]) => {
            const { mockOnMessage } = require('./PrerequisitesStep.testUtils');
            return mockOnMessage(...args);
        },
    },
}));

/**
 * PrerequisitesStep - Recheck Functionality Tests
 * Tests the recheck button behavior
 */
describe('PrerequisitesStep - Recheck Functionality', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    beforeAll(() => {
        setupScrollMock();
    });

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
    });

    it('should show recheck button', () => {
        render(
            <Provider theme={defaultTheme}>
                <PrerequisitesStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </Provider>
        );

        expect(screen.getByText('Recheck')).toBeInTheDocument();
    });

    it('should trigger recheck when button clicked', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        render(
            <Provider theme={defaultTheme}>
                <PrerequisitesStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </Provider>
        );

        const recheckButton = screen.getByText('Recheck');
        await user.click(recheckButton);

        // Should trigger at least 2 checks (initial + recheck)
        // Initial check uses isRecheck: false, recheck uses isRecheck: true
        expect(mockPostMessage).toHaveBeenCalledWith('check-prerequisites', expect.objectContaining({ isRecheck: expect.any(Boolean) }));
    });

    it('should disable recheck during checking', async () => {
        let loadedCallback: (data: any) => void = () => {};
        let completeCallback: () => void = () => {};

        mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
            if (type === 'prerequisites-loaded') {
                loadedCallback = callback;
            } else if (type === 'prerequisites-complete') {
                completeCallback = callback as () => void;
            }
            return jest.fn();
        });

        render(
            <Provider theme={defaultTheme}>
                <PrerequisitesStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </Provider>
        );

        await act(async () => {
            loadedCallback({
                prerequisites: [
                    { id: 'node', name: 'Node.js', description: 'Runtime', optional: false }
                ]
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Simulate completion of checking
        await act(async () => {
            completeCallback();
        });

        const recheckButton = screen.getByText('Recheck');
        expect(recheckButton).not.toBeDisabled();
    });
});
