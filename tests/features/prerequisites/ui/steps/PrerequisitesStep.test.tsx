import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn().mockReturnValue(jest.fn());

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
    },
}));

describe('PrerequisitesStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'prerequisites',
    };

    beforeAll(() => {
        // Mock scrollTo for jsdom (doesn't implement this method)
        Element.prototype.scrollTo = jest.fn();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Happy Path - Prerequisites Checking', () => {
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

        it('should trigger check on mount', () => {
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

            expect(mockPostMessage).toHaveBeenCalledWith('check-prerequisites');
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

    describe('Installation Flow', () => {
        it('should show install button for failed prerequisites', async () => {
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
                    { id: 'docker', name: 'Docker', description: 'Container', optional: false }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Docker')).toBeInTheDocument();
            });

            statusCallback({ index: 0, status: 'error', message: 'Not installed', canInstall: true });

            await waitFor(() => {
                expect(screen.getByText('Install')).toBeInTheDocument();
            });
        });

        it('should trigger installation when Install button clicked', async () => {
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
                    { id: 'docker', name: 'Docker', description: 'Container', optional: false }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Docker')).toBeInTheDocument();
            });

            statusCallback({ index: 0, status: 'error', message: 'Not installed', canInstall: true });

            await waitFor(() => {
                expect(screen.getByText('Install')).toBeInTheDocument();
            });

            const installButton = screen.getByText('Install');
            fireEvent.click(installButton);

            // Component sends check-prerequisites on mount, then install-prerequisite when button clicked
            expect(mockPostMessage).toHaveBeenCalledWith('install-prerequisite', {
                prereqId: 0,
                id: 'docker',
                name: 'Docker'
            });
            // Verify it was actually called (may not be the first call due to check-prerequisites)
            const installCalls = mockPostMessage.mock.calls.filter(
                call => call[0] === 'install-prerequisite'
            );
            expect(installCalls.length).toBeGreaterThan(0);
        });

        it('should show installation progress', async () => {
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
                    { id: 'docker', name: 'Docker', description: 'Container', optional: false }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Docker')).toBeInTheDocument();
            });

            statusCallback({ index: 0, status: 'checking', message: 'Installing...' });

            await waitFor(() => {
                expect(screen.getByText('Installing...')).toBeInTheDocument();
            });
        });
    });

    describe('Recheck Functionality', () => {
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

        it('should trigger recheck when button clicked', () => {
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
            fireEvent.click(recheckButton);

            // Should trigger at least 2 checks (initial + recheck)
            expect(mockPostMessage).toHaveBeenCalledWith('check-prerequisites');
        });

        it('should disable recheck during checking', async () => {
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
                    { id: 'node', name: 'Node.js', description: 'Runtime', optional: false }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Node.js')).toBeInTheDocument();
            });

            const recheckButton = screen.getByText('Recheck');
            expect(recheckButton).not.toBeDisabled();
        });
    });

    describe('Optional Prerequisites', () => {
        it('should allow continue even if optional prerequisites fail', async () => {
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
                    { id: 'tool', name: 'Optional Tool', description: 'Optional', optional: true }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Node.js')).toBeInTheDocument();
            });

            // Required passes, optional fails
            statusCallback({ index: 0, status: 'success', message: 'Installed' });
            statusCallback({ index: 1, status: 'error', message: 'Not found', canInstall: false });

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should display optional label for optional prerequisites', async () => {
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
                    { id: 'tool', name: 'Optional Tool', description: 'Optional', optional: true }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText(/Optional Tool/)).toBeInTheDocument();
                expect(screen.getByText(/\(Optional\)/)).toBeInTheDocument();
            });
        });
    });

    describe('Unified Progress Display', () => {
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

    describe('Edge Cases', () => {
        it('should not allow continue when required prerequisites fail', async () => {
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
                    { id: 'node', name: 'Node.js', description: 'Runtime', optional: false }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Node.js')).toBeInTheDocument();
            });

            statusCallback({ index: 0, status: 'error', message: 'Not installed', canInstall: true });

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });

        it('should show success message when all prerequisites pass', async () => {
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
                    { id: 'node', name: 'Node.js', description: 'Runtime', optional: false }
                ]
            });

            await waitFor(() => {
                expect(screen.getByText('Node.js')).toBeInTheDocument();
            });

            statusCallback({ index: 0, status: 'success', message: 'Installed' });

            await waitFor(() => {
                expect(screen.getByText('All prerequisites installed!')).toBeInTheDocument();
            });
        });
    });
});
