import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
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
jest.mock('@/features/authentication/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock ConfigurationSummary component
jest.mock('@/features/project-creation/ui/components/ConfigurationSummary', () => ({
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

import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';
import {
    mockPostMessage,
    mockOnMessage,
    mockWorkspaces,
    baseState,
    createMockUseSelectionStepReturn,
} from './AdobeWorkspaceStep.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspaceStep - Integration', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Backend Call on Continue Pattern', () => {
        it('should update state immediately without backend call', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Get the onSelect callback from useSelectionStep
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const onSelect = useSelectionStepCall.onSelect;

            // Simulate selecting a workspace
            onSelect(mockWorkspaces[0]);

            // Should update state immediately
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: expect.objectContaining({
                        id: 'workspace1',
                        name: 'Stage',
                    }),
                })
            );

            // Should NOT post message (backend call deferred to Continue button)
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });

    describe('Two-Column Layout', () => {
        it('should display configuration summary panel', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByTestId('config-summary')).toBeInTheDocument();
        });
    });
});
