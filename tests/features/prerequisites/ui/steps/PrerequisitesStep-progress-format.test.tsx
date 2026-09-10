import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderLoadedStep, setupScrollMock, resetAllMocks } from './PrerequisitesStep.testUtils';

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
    beforeAll(() => {
        setupScrollMock();
    });

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
    });

    it('should display unified progress format with step and detail', async () => {
        const { fireStatus } = await renderLoadedStep(
            [{ id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }],
            'Node.js'
        );

        // Simulate prerequisite checking with unified progress (no separate milestone counters)
        fireStatus({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 2,
                    stepName: 'Installing Node.js',
                },
                command: {
                    type: 'determinate' as const,
                    percent: 25,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const,
                },
            },
        });

        // Check for unified format: "Step X/Y: Task Name - Detail"
        await waitFor(() => {
            expect(
                screen.getByText(/Step 1\/2: Installing Node\.js - Installing Node\.js 20/)
            ).toBeInTheDocument();
        });
    });

    it('should display unified format without detail text', async () => {
        const { fireStatus } = await renderLoadedStep(
            [{ id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }],
            'Node.js'
        );

        // Simulate progress without detail text (detail is empty)
        fireStatus({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 1,
                    stepName: 'Installing Node.js',
                },
                command: {
                    type: 'determinate' as const,
                    percent: 25,
                    detail: '',
                    confidence: 'exact' as const,
                },
            },
        });

        // Check for format without detail: "Step X/Y: Task Name"
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js$/)).toBeInTheDocument();
        });
    });

    it('should handle single step format correctly', async () => {
        const { fireStatus } = await renderLoadedStep(
            [{ id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }],
            'Node.js'
        );

        fireStatus({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 1,
                    stepName: 'Installing Node.js',
                },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Installing Node.js 20',
                    confidence: 'exact' as const,
                },
            },
        });

        // Check unified format for single step
        await waitFor(() => {
            expect(
                screen.getByText(/Step 1\/1: Installing Node\.js - Installing Node\.js 20/)
            ).toBeInTheDocument();
        });
    });

    it('should display unified format with or without detail', async () => {
        const { fireStatus } = await renderLoadedStep(
            [{ id: 'node', name: 'Node.js', description: 'JavaScript runtime', optional: false }],
            'Node.js'
        );

        // Progress with detail text
        fireStatus({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 1,
                    stepName: 'Installing Node.js',
                },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: 'Downloading packages',
                    confidence: 'exact' as const,
                },
            },
        });

        // Should display with detail
        await waitFor(() => {
            expect(
                screen.getByText(/Step 1\/1: Installing Node\.js - Downloading packages/)
            ).toBeInTheDocument();
        });

        // Progress without detail text (empty string)
        fireStatus({
            index: 0,
            status: 'checking',
            message: 'Installing...',
            unifiedProgress: {
                overall: {
                    percent: 50,
                    currentStep: 1,
                    totalSteps: 1,
                    stepName: 'Installing Node.js',
                },
                command: {
                    type: 'determinate' as const,
                    percent: 50,
                    detail: '',
                    confidence: 'exact' as const,
                },
            },
        });

        // Should display without detail (no hyphen)
        await waitFor(() => {
            expect(screen.getByText(/Step 1\/1: Installing Node\.js$/)).toBeInTheDocument();
        });
    });
});
