/**
 * WizardContainer ErrorBoundary Tests
 *
 * Tests that the ErrorBoundary catches step rendering errors.
 * Uses default ErrorBoundary fallback - no custom UI needed.
 *
 * Updated in Step 3 - Welcome step removed, tests use AdobeAuthStep.
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

// Mock demoPackageLoader to prevent JSON import issues in tests
jest.mock('@/features/project-creation/ui/helpers/demoPackageLoader', () => {
    const testPackages = [
        {
            id: 'test-package',
            name: 'Test Package',
            description: 'Test',
            configDefaults: {},
            storefronts: {},
        },
    ];
    return {
        __esModule: true,
        loadDemoPackages: async () => testPackages,
        getSelectablePackages: async () => testPackages,
    };
});

// Mock brandStackLoader for loadStacks()
jest.mock('@/features/project-creation/ui/helpers/brandStackLoader', () => ({
    __esModule: true,
    loadStacks: async () => [
        {
            id: 'test-stack',
            name: 'Test Stack',
            frontend: 'test-frontend',
            backend: 'test-backend',
        },
    ],
}));

// Store mock implementations so we can change them per test
let authStepImpl: (props: { setCanProceed: (val: boolean) => void }) => React.ReactElement;

// Mock the first step (welcome / Demo Setup) so a test can make it throw. The
// standalone adobe-auth step is retired; welcome is the real first step.
jest.mock('@/features/project-creation/ui/steps/WelcomeStep', () => ({
    WelcomeStep: (props: { setCanProceed: (val: boolean) => void }) => authStepImpl(props),
}));

jest.mock('@/features/prerequisites/ui/steps/PrerequisitesStep', () => ({
    PrerequisitesStep: ({ setCanProceed }: { setCanProceed: (val: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="prereq-step">Prerequisites Step</div>;
    },
}));

// Note: ApiMeshStep was removed from the wizard - mesh deployment now uses MeshDeploymentStep
// which is handled separately (not a wizard step). No mock needed here.

jest.mock('@/features/project-creation/ui/steps/ReviewStep', () => ({
    ReviewStep: () => <div data-testid="review-step">Review Step</div>,
}));

jest.mock('@/features/project-creation/ui/steps/ProjectCreationStep', () => ({
    ProjectCreationStep: () => <div data-testid="creation-step">Creation Step</div>,
}));

// Import after mocks are set up
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';

// Note: Welcome step removed in Step 3 - wizard starts at welcome
const defaultWizardSteps = [
    { id: 'welcome', name: 'Adobe Auth', enabled: true },
    { id: 'component-selection', name: 'Components', enabled: true },
    { id: 'prerequisites', name: 'Prerequisites', enabled: true },
    { id: 'review', name: 'Review', enabled: true },
];

describe('WizardContainer ErrorBoundary', () => {
    afterAll(() => {
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        // ABSORB the expected errors — an error boundary catching a throw is
        // the component working. In beforeEach, NOT beforeAll: the console gate
        // wraps console in a beforeEach registered by the setup file, so a
        // beforeAll spy is wrapped BY the gate and still counted, while this one
        // replaces the gate's wrapper.
        jest.spyOn(console, 'error').mockImplementation(() => {});
        setupTest();
        // Reset AdobeAuthStep to normal behavior
        authStepImpl = ({ setCanProceed }) => {
            React.useEffect(() => setCanProceed(true), [setCanProceed]);
            return <div data-testid="welcome-step">Adobe Auth Step</div>;
        };
    });

    it('renders step content when no error', () => {
        render(<WizardContainer wizardSteps={defaultWizardSteps} />);

        expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
    });

    it('catches error and shows fallback UI when step throws', async () => {
        authStepImpl = () => {
            throw new Error('Step render failed');
        };

        render(<WizardContainer wizardSteps={defaultWizardSteps} />);

        // ErrorBoundary's default fallback shows "Something went wrong" heading
        await waitFor(() => {
            expect(
                screen.getByRole('heading', { name: 'Something went wrong' })
            ).toBeInTheDocument();
        });
    });

    it('logs error to console via onError callback', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        authStepImpl = () => {
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
