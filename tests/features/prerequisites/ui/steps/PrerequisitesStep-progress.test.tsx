import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import '@testing-library/jest-dom';
import {
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
 * PrerequisitesStep - Unified Progress Display Tests
 * Tests the unified progress format (Step X/Y: Task - Detail)
 */
describe('PrerequisitesStep - Unified Progress Display', () => {
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

    it('should display unified progress format with step and detail', async () => {
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
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Simulate prerequisite checking with unified progress (no separate milestone counters)
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 2,
                    stepName: 'Installing Node.js'
                },
                command: {
                    type: 'determinate' as const,
                    percent: 25,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const
                }
            }
        });

        // Check for unified format: "Step X/Y: Task Name - Detail"
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/2: Installing Node\.js - Installing Node\.js 20/)).toBeInTheDocument();
        });
    });

    it('should display unified format without detail text', async () => {
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
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Simulate progress without detail text (detail is empty)
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 1,
                    stepName: 'Installing Node.js'
                },
                command: {
                    type: 'determinate' as const,
                    percent: 25,
                    detail: '',
                    confidence: 'exact' as const
                }
            }
        });

        // Check for format without detail: "Step X/Y: Task Name"
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js$/)).toBeInTheDocument();
        });
    });

    it('should update detail text dynamically in place', async () => {
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
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // First detail text - Installing Node.js 20
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 25, currentStep: 1, totalSteps: 2, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const
                }
            }
        });

        await waitFor(() => {
            expect(screen.getByText(/Step 1\/2: Installing Node\.js - Installing Node\.js 20/)).toBeInTheDocument();
        });

        // Detail text updates IN PLACE - now showing Installing Node.js 24
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 75, currentStep: 2, totalSteps: 2, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 24',
                    confidence: 'exact' as const
                }
            }
        });

        await waitFor(() => {
            expect(screen.getByText(/Step 2\/2: Installing Node\.js - Installing Node\.js 24/)).toBeInTheDocument();
            // Old text should be replaced
            expect(screen.queryByText(/Installing Node\.js 20/)).not.toBeInTheDocument();
        });
    });

    it('should handle single step format correctly', async () => {
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
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 50, currentStep: 1, totalSteps: 1, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const
                }
            }
        });

        // Check unified format for single step
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js - Installing Node\.js 20/)).toBeInTheDocument();
        });
    });

    it('should display unified format with or without detail', async () => {
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
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Progress with detail text
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 50, currentStep: 1, totalSteps: 1, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Downloading packages',
                    confidence: 'exact' as const
                }
            }
        });

        // Should display with detail
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js - Downloading packages/)).toBeInTheDocument();
        });

        // Progress without detail text (empty string)
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 50, currentStep: 1, totalSteps: 1, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: '',
                    confidence: 'exact' as const
                }
            }
        });

        // Should display without detail (no hyphen)
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js$/)).toBeInTheDocument();
        });
    });

    it('should use 1-based indexing for step display', async () => {
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
                { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Test with step 1 (should display as 1, not 0)
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 33, currentStep: 1, totalSteps: 3, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const
                }
            }
        });

        await waitFor(() => {
            // Should display "Step 1" not "Step 0" (1-based indexing)
            expect(screen.getByText(/Step 1\/3: Installing Node\.js/)).toBeInTheDocument();
            expect(screen.queryByText(/Step 0\/3/)).not.toBeInTheDocument();
        });
    });

    it('should integrate with multi-version Node installation flow', async () => {
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
                { id: 'node', name: 'Node.js (20, 24)', description: 'JavaScript runtime', optional: false }
            ]
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js (20, 24)')).toBeInTheDocument();
        });

        // Installing Node 20 (first of 2 steps)
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 25, currentStep: 1, totalSteps: 2, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const
                }
            }
        });

        // Check unified format shows step 1 with Node 20 detail
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/2: Installing Node\.js - Installing Node\.js 20/)).toBeInTheDocument();
        });

        // Installing Node 24 (second of 2 steps)
        statusCallback({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: { percent: 75, currentStep: 2, totalSteps: 2, stepName: 'Installing Node.js' },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 24',
                    confidence: 'exact' as const
                }
            }
        });

        // Check unified format updated to step 2 with Node 24 detail
        await waitFor(() => {
            expect(screen.getByText(/Step 2\/2: Installing Node\.js - Installing Node\.js 24/)).toBeInTheDocument();
            // Old text should be replaced
            expect(screen.queryByText(/Installing Node\.js 20/)).not.toBeInTheDocument();
        });
    });
});
