import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
    },
}));

// Mock useSelectionStep hook
jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock ConfigurationSummary component
jest.mock('@/core/ui/components/wizard', () => ({
    ConfigurationSummary: () => <div data-testid="config-summary">Configuration Summary</div>,
}));

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

// Mock FadeTransition component
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import {
    mockPostMessage,
    mockOnMessage,
    mockWorkspaces,
    baseState,
    createMockUseSelectionStepReturn,
    createStateWithWorkspace,
} from './AdobeWorkspaceStep.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspaceStep - Selection', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Happy Path - Workspace Selection', () => {
        it('should render workspace selection UI', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Check for workspace list (now uses listbox role after React Aria migration)
            expect(screen.getByRole('listbox', { name: /workspaces/i })).toBeInTheDocument();
        });

        it('should display all workspaces in list', async () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            expect(await screen.findByText('Stage')).toBeInTheDocument();
            expect(screen.getByText('Production')).toBeInTheDocument();
            expect(screen.getByText('Development')).toBeInTheDocument();
        });

        it('should auto-select "Stage" workspace when available', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Verify autoSelectCustom was provided to find "Stage"
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const autoSelectCustom = useSelectionStepCall.autoSelectCustom;
            const selected = autoSelectCustom(mockWorkspaces);

            expect(selected?.name).toBe('Stage');
        });

        it('should enable proceed when workspace is selected', () => {
            const stateWithWorkspace = createStateWithWorkspace(mockWorkspaces[0]);

            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <>
                    <AdobeWorkspaceStep
                        state={stateWithWorkspace as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should disable proceed when no workspace is selected', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });
});
