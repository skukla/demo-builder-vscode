/**
 * WizardContainer ErrorBoundary Tests
 *
 * Tests that the ErrorBoundary catches step rendering errors.
 * Uses default ErrorBoundary fallback - no custom UI needed.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import test utilities and setup mocks
import {
    mockPostMessage,
    mockRequest,
    mockOnMessage,
    setupTest,
} from './WizardContainer.testUtils';

// Mock vscode API - use wrapper functions to avoid hoisting issues
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: (...args: unknown[]) => mockOnMessage(...args),
    },
}));

// Store mock implementations so we can change them per test
let welcomeStepImpl: (props: { setCanProceed: (val: boolean) => void }) => React.ReactElement;

// Mock step components
jest.mock('@/features/project-creation/ui/steps/WelcomeStep', () => ({
    WelcomeStep: (props: { setCanProceed: (val: boolean) => void }) => welcomeStepImpl(props),
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: ({ setCanProceed }: { setCanProceed: (val: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="auth-step">Auth Step</div>;
    },
}));

jest.mock('@/features/components/ui/steps/ComponentSelectionStep', () => ({
    ComponentSelectionStep: ({ setCanProceed }: { setCanProceed: (val: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="component-step">Component Step</div>;
    },
}));

jest.mock('@/features/prerequisites/ui/steps/PrerequisitesStep', () => ({
    PrerequisitesStep: ({ setCanProceed }: { setCanProceed: (val: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="prereq-step">Prerequisites Step</div>;
    },
}));

jest.mock('@/features/authentication/ui/steps/AdobeProjectStep', () => ({
    AdobeProjectStep: () => <div data-testid="project-step">Project Step</div>,
}));

jest.mock('@/features/authentication/ui/steps/AdobeWorkspaceStep', () => ({
    AdobeWorkspaceStep: () => <div data-testid="workspace-step">Workspace Step</div>,
}));

jest.mock('@/features/mesh/ui/steps/ApiMeshStep', () => ({
    ApiMeshStep: () => <div data-testid="mesh-step">Mesh Step</div>,
}));

jest.mock('@/features/components/ui/steps/ComponentConfigStep', () => ({
    ComponentConfigStep: () => <div data-testid="config-step">Config Step</div>,
}));

jest.mock('@/features/project-creation/ui/steps/ReviewStep', () => ({
    ReviewStep: () => <div data-testid="review-step">Review Step</div>,
}));

jest.mock('@/features/project-creation/ui/steps/ProjectCreationStep', () => ({
    ProjectCreationStep: () => <div data-testid="creation-step">Creation Step</div>,
}));

// Import after mocks are set up
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';

const defaultWizardSteps = [
    { id: 'welcome', name: 'Welcome', enabled: true },
    { id: 'component-selection', name: 'Components', enabled: true },
    { id: 'prerequisites', name: 'Prerequisites', enabled: true },
    { id: 'adobe-auth', name: 'Adobe Auth', enabled: true },
];

describe('WizardContainer ErrorBoundary', () => {
    // Suppress console.error for expected errors in these tests
    beforeAll(() => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        setupTest();
        // Reset WelcomeStep to normal behavior
        welcomeStepImpl = ({ setCanProceed }) => {
            React.useEffect(() => setCanProceed(true), [setCanProceed]);
            return <div data-testid="welcome-step">Welcome Step</div>;
        };
    });

    it('renders step content when no error', () => {
        render(<WizardContainer wizardSteps={defaultWizardSteps} />);

        expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
    });

    it('catches error and shows fallback UI when step throws', async () => {
        welcomeStepImpl = () => {
            throw new Error('Step render failed');
        };

        render(<WizardContainer wizardSteps={defaultWizardSteps} />);

        // ErrorBoundary's default fallback shows "Something went wrong" heading
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
        });
    });

    it('logs error to console via onError callback', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        welcomeStepImpl = () => {
            throw new Error('Test error for logging');
        };

        render(<WizardContainer wizardSteps={defaultWizardSteps} />);

        // webviewLogger passes prefix, message, and error.message as separate arguments
        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[WizardContainer]',
                'Step error:',
                'Test error for logging'
            );
        });

        consoleErrorSpy.mockRestore();
    });
});
