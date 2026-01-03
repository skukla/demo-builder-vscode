import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ApiMeshStep } from '@/features/mesh/ui/steps/ApiMeshStep';
import { WizardState } from '@/types/webview';

// Mock WebviewClient
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn());
export const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
        request: (...args: any[]) => mockRequest(...args),
    },
}));

// Mock LoadingDisplay
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
        <div data-testid="loading-display">
            <div>{message}</div>
            {subMessage && <div>{subMessage}</div>}
        </div>
    ),
}));

// Mock FadeTransition
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock ConfigurationSummary
jest.mock('@/core/ui/components/wizard', () => ({
    ConfigurationSummary: () => <div data-testid="config-summary">Summary</div>,
}));

// Mock TwoColumnLayout
jest.mock('@/core/ui/components/layout/TwoColumnLayout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-content">{leftContent}</div>
            <div data-testid="right-content">{rightContent}</div>
        </div>
    ),
}));

// Mock Modal and other complex components
jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/core/ui/components/ui/NumberedInstructions', () => ({
    NumberedInstructions: () => <div>Instructions</div>,
}));

/**
 * Factory for creating base wizard state
 */
export const createBaseState = (overrides?: Partial<WizardState>): WizardState => ({
    currentStep: 'api-mesh',
    adobeAuth: {
        isAuthenticated: true,
        isChecking: false,
    },
    adobeOrg: {
        id: 'org-123',
        code: 'TEST_ORG',
        name: 'Test Organization',
    },
    adobeWorkspace: {
        id: 'workspace-123',
        name: 'Test Workspace',
    },
    apiMesh: undefined,
    ...overrides,
} as WizardState);

/**
 * Renders ApiMeshStep with test providers
 */
export const renderApiMeshStep = (
    state: WizardState,
    updateState = jest.fn(),
    setCanProceed = jest.fn(),
    onBack = jest.fn()
) => {
    return render(
        <>
            <ApiMeshStep
                state={state}
                updateState={updateState}
                setCanProceed={setCanProceed}
                onBack={onBack}
            />
        </>
    );
};

/**
 * Factory for creating mock mesh check responses
 */
export const createMeshCheckResponse = (overrides?: any) => ({
    success: true,
    apiEnabled: true,
    meshExists: true,
    meshId: 'mesh-123',
    meshStatus: 'deployed',
    endpoint: 'https://mesh.adobe.io/endpoint',
    ...overrides,
});

/**
 * Factory for creating mock mesh creation responses
 */
export const createMeshCreationResponse = (overrides?: any) => ({
    success: true,
    meshId: 'new-mesh-123',
    endpoint: 'https://mesh.adobe.io/new',
    ...overrides,
});

/**
 * Factory for creating error responses
 */
export const createErrorResponse = (error: string) => ({
    success: false,
    apiEnabled: false,
    error,
});

/**
 * Setup mocks before each test
 */
export const setupMocks = () => {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
    mockRequest.mockResolvedValue({ success: false });
};

/**
 * Cleanup function to be called in afterEach
 * Unmounts React components and resets mocks to prevent test pollution
 */
export const cleanupTests = () => {
    cleanup(); // Unmount React components to stop any running effects/timers
    jest.clearAllMocks();
    jest.useRealTimers(); // Ensure real timers are restored
};
