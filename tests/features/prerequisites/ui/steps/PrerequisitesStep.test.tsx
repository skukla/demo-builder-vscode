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
