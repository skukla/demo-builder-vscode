import { render, screen, waitFor, act } from '@testing-library/react';
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
 * PrerequisitesStep - Unified Progress Format Display Tests
 * Tests the unified progress format (Step X/Y: Task - Detail) rendering
 */
describe('PrerequisitesStep - Unified Progress Format Display', () => {
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

        await act(async () => {
            loadedCallback({
                prerequisites: [
                    { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
                ]
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Simulate prerequisite checking with unified progress (no separate milestone counters)
        await act(async () => {
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

        await act(async () => {
            loadedCallback({
                prerequisites: [
                    { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
                ]
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Simulate progress without detail text (detail is empty)
        await act(async () => {
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
        });

        // Check for format without detail: "Step X/Y: Task Name"
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js$/)).toBeInTheDocument();
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

        await act(async () => {
            loadedCallback({
                prerequisites: [
                    { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
                ]
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        await act(async () => {
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

        await act(async () => {
            loadedCallback({
                prerequisites: [
                    { id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }
                ]
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Node.js')).toBeInTheDocument();
        });

        // Progress with detail text
        await act(async () => {
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
        });

        // Should display with detail
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js - Downloading packages/)).toBeInTheDocument();
        });

        // Progress without detail text (empty string)
        await act(async () => {
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
        });

        // Should display without detail (no hyphen)
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js$/)).toBeInTheDocument();
        });
    });
});
