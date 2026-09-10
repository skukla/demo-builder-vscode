/**
 * Which view the final wizard step shows for each shape of creation progress,
 * and what its two buttons actually do.
 *
 * The step derives its phase from one field — `creationProgress.currentOperation`
 * — plus `creationProgress.error`, and every screen the SC sees at the end of a
 * build hangs off that derivation. This suite drives all five outcomes and the
 * two transitions out of them (cancel, open project).
 *
 * The stack here is deliberately NOT an EDS one, so the GitHub App pre-flight
 * check is skipped and creation starts immediately. The pre-flight path has its
 * own suite.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import type { CreationProgress, WizardState } from '@/types/webview';

/** A creation-progress event with the fields the step does not read filled in. */
const progressOf = (overrides: Partial<CreationProgress>): CreationProgress => ({
    currentOperation: 'Creating project directory',
    progress: 10,
    message: 'Setting up project structure...',
    logs: [],
    ...overrides,
});

const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn();
const mockCreateProject = jest.fn();
const mockWebviewClientRequest = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        onMessage: (...args: unknown[]) => mockOnMessage(...args),
        createProject: (...args: unknown[]) => mockCreateProject(...args),
    },
    webviewClient: {
        request: (...args: unknown[]) => mockWebviewClientRequest(...args),
    },
}));

// Below the mocks on purpose: `jest.mock` hoists above this file's imports only.
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

import { press, settle } from '../../../../helpers/reactSettle';

const stateWith = (progress: WizardState['creationProgress']): WizardState =>
    ({
        currentStep: 'create-project',
        projectName: 'my-demo-project',
        selectedStack: 'headless-paas',
        // `buildProjectConfig` warns when a stack is chosen with no package, and
        // the console gate turns that warning into a failure.
        selectedPackage: 'citisignal',
        creationProgress: progress,
    }) as WizardState;

const step = (state: WizardState) => (
    <Provider theme={defaultTheme}>
        <ProjectCreationStep state={state} updateState={jest.fn()} onBack={jest.fn()} />
    </Provider>
);

const renderStep = async (progress: WizardState['creationProgress']) => {
    const view = render(step(stateWith(progress)));
    await settle();
    return view;
};

/**
 * The muted detail line under an error heading.
 *
 * ErrorContent renders the message inside a `Text`, so the detail is an element
 * and not a bare string — which is the difference between showing the reason and
 * showing it as unstyled body text.
 */
const errorDetails = (container: HTMLElement) => container.querySelectorAll('.text-gray-600');

describe('ProjectCreationStep phases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
        mockWebviewClientRequest.mockResolvedValue({ success: true, isInstalled: true });
    });

    describe('the view each progress shape produces', () => {
        it('should show the initializing view before the first progress event', async () => {
            await renderStep(undefined);

            expect(screen.getByText('Initializing')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        });

        it('should show the running operation while creation is active', async () => {
            await renderStep(progressOf({ currentOperation: 'Cloning components', message: 'git clone…' }));

            expect(screen.getByText('Cloning components')).toBeInTheDocument();
            expect(screen.queryByText('Project Creation Failed')).not.toBeInTheDocument();
            expect(screen.queryByText('Project Creation Cancelled')).not.toBeInTheDocument();
        });

        it('should show the cancelled view, with no detail line, when the operation is Cancelled', async () => {
            const { container } = await renderStep(progressOf({ currentOperation: 'Cancelled' }));

            expect(screen.getByText('Project Creation Cancelled')).toBeInTheDocument();
            expect(errorDetails(container)).toHaveLength(0);
        });

        it('should show the failed view when the operation is Failed with no error text', async () => {
            await renderStep(progressOf({ currentOperation: 'Failed' }));

            expect(screen.getByText('Project Creation Failed')).toBeInTheDocument();
        });

        it('should show the failed view, with the reason, when progress carries an error', async () => {
            const { container } = await renderStep(
                progressOf({
                    currentOperation: 'Installing dependencies',
                    error: 'npm ERR! network timeout',
                })
            );

            expect(screen.getByText('Project Creation Failed')).toBeInTheDocument();
            expect(screen.getByText('npm ERR! network timeout')).toBeInTheDocument();
            expect(errorDetails(container)).toHaveLength(1);
        });

        it('should show the success view when the operation is Project Created', async () => {
            await renderStep(progressOf({ currentOperation: 'Project Created' }));

            expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'View Projects' })).toBeInTheDocument();
        });
    });

    describe('a phase outlives the progress event that set it', () => {
        it('should keep the success view when the progress event is cleared', async () => {
            const { rerender } = await renderStep(progressOf({ currentOperation: 'Project Created' }));
            expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();

            rerender(step(stateWith(undefined)));
            await settle();

            expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();
            // The footer has to agree: losing progress must not put the step back
            // into its starting window, which offers Cancel instead.
            expect(screen.getByRole('button', { name: 'View Projects' })).toBeInTheDocument();
        });

        it('should keep the cancelled view when the progress event is cleared', async () => {
            const { rerender } = await renderStep(progressOf({ currentOperation: 'Cancelled' }));
            expect(screen.getByText('Project Creation Cancelled')).toBeInTheDocument();

            rerender(step(stateWith(undefined)));
            await settle();

            expect(screen.getByText('Project Creation Cancelled')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
        });
    });

    describe('cancelling', () => {
        it('should start enabled, and read Cancelling… once pressed', async () => {
            await renderStep(progressOf({ currentOperation: 'Cloning components' }));
            const cancel = screen.getByRole('button', { name: 'Cancel' });
            expect(cancel).toBeEnabled();

            await press(cancel);

            expect(mockPostMessage).toHaveBeenCalledWith('cancel-project-creation');
            expect(screen.getByRole('button', { name: 'Cancelling...' })).toBeDisabled();
        });
    });

    describe('opening the finished project', () => {
        it('should show the loading view first and post openProject after the transition', async () => {
            await renderStep(progressOf({ currentOperation: 'Project Created' }));

            await press(screen.getByRole('button', { name: 'View Projects' }));

            expect(screen.getByText('Loading your projects...')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'View Projects' })).not.toBeInTheDocument();
            expect(mockPostMessage).not.toHaveBeenCalledWith('openProject');

            await act(async () => {
                jest.advanceTimersByTime(TIMEOUTS.PROJECT_OPEN_TRANSITION);
            });

            expect(mockPostMessage).toHaveBeenCalledWith('openProject');
        });
    });
});
