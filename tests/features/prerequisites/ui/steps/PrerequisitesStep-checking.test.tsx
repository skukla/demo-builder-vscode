import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import '@testing-library/jest-dom';
import {
    mockPostMessage,
    mockOnMessage,
    baseState,
    baseStateWithSelectedStack,
    createMockFunctions,
    renderPrerequisitesStep,
    setupMessageCallbacks,
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
 * PrerequisitesStep - Happy Path Checking Tests
 * Tests the basic checking flow when prerequisites are validated
 */
describe('PrerequisitesStep - Happy Path Checking', () => {
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

    it('should render loading state initially', () => {
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

        expect(screen.getByText('Checking required tools. Missing tools can be installed automatically.')).toBeInTheDocument();
    });

    it('should trigger check on mount without selectedStack when no stack selected', () => {
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

        expect(mockPostMessage).toHaveBeenCalledWith('check-prerequisites', {
            isRecheck: false,
            selectedStack: undefined,
        });
    });

    it('should pass selectedStack when stack is in state (after stack selection)', () => {
        render(
            <Provider theme={defaultTheme}>
                <PrerequisitesStep
                    state={baseStateWithSelectedStack as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    currentStep="prerequisites"
                />
            </Provider>
        );

        // Handler derives componentSelection from selectedStack via stacks.json
        expect(mockPostMessage).toHaveBeenCalledWith('check-prerequisites', {
            isRecheck: false,
            selectedStack: 'headless-paas',
        });
    });

    it('should display loaded prerequisites', async () => {
        let loadedCallback: (data: any) => void = () => {};
        mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
            if (type === 'prerequisites-loaded') {
                loadedCallback = callback;
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

        loadedCallback({
            prerequisites: [
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false },
                { id: 'docker', name: 'Docker', description: 'Container platform', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
            expect(screen.getByText('Docker')).toBeInTheDocument();
        });
    });

    it('should show success icons when prerequisites pass', async () => {
        let statusCallback: (data: any) => void = () => {};
        mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
            if (type === 'prerequisite-status') {
                statusCallback = callback;
            }
            return jest.fn();
        });

        const { container } = render(
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

        // Simulate prerequisite success
        statusCallback({
            index: 0,
            status: 'success',
            message: 'Installed',
            version: '20.0.0'
        });

        await waitFor(() => {
            expect(screen.getByText('Installed')).toBeInTheDocument();
        });
    });

    it('should enable continue when all required prerequisites pass', async () => {
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

        loadedCallback({
            prerequisites: [
                { id: 'node', name: 'Node.js', description: 'Runtime', optional: false },
                { id: 'npm', name: 'npm', description: 'Package manager', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Mark both as success
        statusCallback({ index: 0, status: 'success', message: 'Installed' });
        statusCallback({ index: 1, status: 'success', message: 'Installed' });

        await waitFor(() => {
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });
});
