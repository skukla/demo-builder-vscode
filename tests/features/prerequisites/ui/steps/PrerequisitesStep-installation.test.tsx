import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import '@testing-library/jest-dom';
import {
    baseState,
    mockPostMessage,
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
 * PrerequisitesStep - Installation Flow Tests
 * Tests the installation process for missing prerequisites
 */
describe('PrerequisitesStep - Installation Flow', () => {
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

    it('should show install button for failed prerequisites', async () => {
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
                { id: 'docker', name: 'Docker', description: 'Container', optional: false },
            ],
        });

        await waitFor(() => {
            expect(screen.getByText('Docker')).toBeInTheDocument();
        });

        fire.fireStatus({ index: 0, status: 'error', message: 'Not installed', canInstall: true });

        await waitFor(() => {
            expect(screen.getByText('Install')).toBeInTheDocument();
        });
    });

    it('should trigger installation when Install button clicked', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
                { id: 'docker', name: 'Docker', description: 'Container', optional: false },
            ],
        });

        await waitFor(() => {
            expect(screen.getByText('Docker')).toBeInTheDocument();
        });

        fire.fireStatus({ index: 0, status: 'error', message: 'Not installed', canInstall: true });

        await waitFor(() => {
            expect(screen.getByText('Install')).toBeInTheDocument();
        });

        const installButton = screen.getByText('Install');
        await user.click(installButton);

        // Component sends check-prerequisites on mount, then install-prerequisite when button clicked.
        // The handler resolves the target from prereqId alone; the id/name echo
        // was a pair of dead fields deleted by the 2026-08-21 channel inventory.
        expect(mockPostMessage).toHaveBeenCalledWith('install-prerequisite', {
            prereqId: 0,
        });
        // Verify it was actually called (may not be the first call due to check-prerequisites)
        const installCalls = mockPostMessage.mock.calls.filter(
            (call) => call[0] === 'install-prerequisite'
        );
        expect(installCalls.length).toBeGreaterThan(0);
    });

    it('should show installation progress', async () => {
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
                { id: 'docker', name: 'Docker', description: 'Container', optional: false },
            ],
        });

        await waitFor(() => {
            expect(screen.getByText('Docker')).toBeInTheDocument();
        });

        fire.fireStatus({ index: 0, status: 'checking', message: 'Installing...' });

        await waitFor(() => {
            expect(screen.getByText('Installing...')).toBeInTheDocument();
        });
    });
});
