import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
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
            <>
                <PrerequisitesStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </>
        );

        expect(screen.getByText('Recheck')).toBeInTheDocument();
    });

    it('should trigger recheck when button clicked', async () => {
        const user = userEvent.setup();
        render(
            <>
                <PrerequisitesStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </>
        );

        const recheckButton = screen.getByText('Recheck');
        await user.click(recheckButton);

        // Should trigger at least 2 checks (initial + recheck)
        // Initial check uses isRecheck: false, recheck uses isRecheck: true
        expect(mockPostMessage).toHaveBeenCalledWith('check-prerequisites', expect.objectContaining({ isRecheck: expect.any(Boolean) }));
    });

    it('should disable recheck during checking', async () => {
        let loadedCallback: (data: any) => void = () => {};
        let checkStoppedCallback: () => void = () => {};

        mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
            if (type === 'prerequisites-loaded') {
                loadedCallback = callback;
            }
            if (type === 'prerequisite-check-stopped') {
                checkStoppedCallback = callback;
            }
            return jest.fn();
        });

        render(
            <>
                <PrerequisitesStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </>
        );

        // Wrap state update in act() to properly handle React state changes
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

        // Simulate check completion by triggering 'prerequisite-check-stopped' message
        await act(async () => {
            checkStoppedCallback();
        });

        // Wait for the button to become enabled after check is stopped
        await waitFor(() => {
            const recheckButton = screen.getByText('Recheck');
            expect(recheckButton).not.toBeDisabled();
        });
    });
});
