import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockProjects,
    baseState,
    createMockSelectionStep,
    setupBeforeEach,
} from './AdobeProjectStep.testUtils';

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
    LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
        <div data-testid="loading-display">
            <div>{message}</div>
            {subMessage && <div>{subMessage}</div>}
        </div>
    ),
}));

// Mock FadeTransition component
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeProjectStep - Layout', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        setupBeforeEach();
    });

    describe('Two-Column Layout', () => {
        it('should display configuration summary panel', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    hasLoadedOnce: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
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
