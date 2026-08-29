import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import '@testing-library/jest-dom';
import {
    baseState,
    resetAllMocks,
    setupMessageCallbacks,
    setupScrollMock,
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
 * PrerequisitesStep - Edge Cases Tests
 * Tests edge cases and boundary conditions
 */
describe('PrerequisitesStep - Edge Cases', () => {
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

    it('should not allow continue when required prerequisites fail', async () => {
        const fire = setupMessageCallbacks();

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

        fire.fireLoaded({
            prerequisites: [
                { id: 'node', name: 'Node.js', description: 'Runtime', optional: false },
            ],
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        fire.fireStatus({ index: 0, status: 'error', message: 'Not installed', canInstall: true });

        await waitFor(() => {
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    it('should enable continue when all prerequisites pass', async () => {
        const fire = setupMessageCallbacks();

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

        fire.fireLoaded({
            prerequisites: [
                { id: 'node', name: 'Node.js', description: 'Runtime', optional: false },
            ],
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        fire.fireStatus({ index: 0, status: 'success', message: 'Installed' });

        // When all prerequisites pass, navigation should be enabled
        await waitFor(() => {
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });
});
