/**
 * The body of the final wizard step, one view per phase, rendered directly with
 * the flags the step would derive. The step's own suites still reach these views
 * through the step; this one pins each branch of `StepContentArea` on its own,
 * which is what lets the mutation run see the file (EDS-8, 2026-10-08).
 *
 * `GitHubAppInstallDialog` is stubbed to print the props it is handed: the real one
 * polls for the install.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import type { CreationProgress } from '@/types/webview';

jest.mock('@/features/eds/ui/components/GitHubAppInstallDialog', () => ({
    GitHubAppInstallDialog: (props: {
        owner: string;
        repo: string;
        installUrl: string;
        message: string;
        onInstallDetected: () => void;
    }) => (
        <div data-testid="install-dialog">
            <span data-testid="dialog-owner">{String(props.owner)}</span>
            <span data-testid="dialog-repo">{String(props.repo)}</span>
            <span data-testid="dialog-url">{String(props.installUrl)}</span>
            <span data-testid="dialog-message">{String(props.message)}</span>
            <button onClick={props.onInstallDetected}>installed</button>
        </div>
    ),
}));

// Below the mock on purpose: `jest.mock` hoists above this file's imports only.
import { StepContentArea } from '@/features/project-creation/ui/steps/projectCreationStepContent';

const BASE = {
    phase: 'creating' as const,
    progress: undefined,
    isActive: false,
    isCompleted: false,
    isOpeningProject: false,
    showGenericError: false,
    isCancelled: false,
    githubAppInstallData: null,
    onGitHubAppInstalled: jest.fn(),
};

type Props = React.ComponentProps<typeof StepContentArea>;

const renderContent = (overrides: Partial<Props>) =>
    render(
        <Provider theme={defaultTheme}>
            <StepContentArea {...BASE} {...overrides} />
        </Provider>
    );

/** A creation-progress event with the fields the body does not read filled in. */
const progressOf = (overrides: Partial<CreationProgress>): CreationProgress => ({
    currentOperation: 'Creating project directory',
    progress: 10,
    message: 'Setting up project structure...',
    logs: [],
    ...overrides,
});

const INSTALL = {
    owner: 'acme',
    repo: 'storefront',
    installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
    message: 'GitHub App installation required for code sync',
};

describe('StepContentArea', () => {
    describe('the install dialog', () => {
        it('renders the dialog with the data the pre-flight decided', () => {
            const onInstalled = jest.fn();
            renderContent({
                phase: 'github-app-install',
                githubAppInstallData: INSTALL,
                onGitHubAppInstalled: onInstalled,
            });

            expect(screen.getByTestId('dialog-owner')).toHaveTextContent('acme');
            expect(screen.getByTestId('dialog-repo')).toHaveTextContent('storefront');
            expect(screen.getByTestId('dialog-url')).toHaveTextContent(INSTALL.installUrl);
            expect(screen.getByTestId('dialog-message')).toHaveTextContent(INSTALL.message);
            screen.getByRole('button', { name: 'installed' }).click();
            expect(onInstalled).toHaveBeenCalledTimes(1);
        });

        it('does not render the dialog in the install phase without its data', () => {
            const { container } = renderContent({ phase: 'github-app-install' });

            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
            expect(container.textContent).toBe('');
        });
    });

    describe('while creation runs', () => {
        it('shows the operation, its detail and the stage expectation from the shared table', () => {
            renderContent({
                isActive: true,
                progress: progressOf({
                    currentOperation: 'Getting the code',
                    message: 'git clone…',
                }),
            });

            expect(screen.getByText('Getting the code')).toBeInTheDocument();
            expect(screen.getByText('git clone…')).toBeInTheDocument();
            expect(screen.getByText('Usually under a minute')).toBeInTheDocument();
            expect(screen.queryByText('This could take up to 3 minutes')).not.toBeInTheDocument();
        });

        it('falls back to the whole-run estimate for a stage the table does not name', () => {
            renderContent({
                isActive: true,
                progress: progressOf({ currentOperation: 'Doing something new' }),
            });

            expect(screen.getByText('This could take up to 3 minutes')).toBeInTheDocument();
        });

        it('reads Processing when the operation is blank', () => {
            renderContent({ isActive: true, progress: progressOf({ currentOperation: '' }) });

            expect(screen.getByText('Processing')).toBeInTheDocument();
        });

        it('is not the running view without a progress event, even when active', () => {
            renderContent({ isActive: true, progress: undefined });

            expect(screen.getByText('Initializing')).toBeInTheDocument();
        });
    });

    describe('when creation finished', () => {
        it('shows the success view', () => {
            renderContent({ isCompleted: true, progress: progressOf({ currentOperation: 'Project Created' }) });

            expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();
            expect(screen.getByText('Click below to view your projects')).toBeInTheDocument();
        });

        it('shows the loading transition while the project is being opened', () => {
            renderContent({ isCompleted: true, isOpeningProject: true });

            expect(screen.getByText('Loading your projects')).toBeInTheDocument();
            expect(screen.queryByText('Project Created Successfully')).not.toBeInTheDocument();
        });

        it('gives way to the error view when the finished progress carries an error', () => {
            renderContent({
                isCompleted: true,
                showGenericError: true,
                progress: progressOf({ error: 'boom' }),
            });

            expect(screen.getByText('Project Creation Failed')).toBeInTheDocument();
            expect(screen.getByText('boom')).toBeInTheDocument();
            expect(screen.queryByText('Project Created Successfully')).not.toBeInTheDocument();
        });
    });

    describe('when creation failed or was cancelled', () => {
        it('shows the failure with its reason as a detail line', () => {
            const { container } = renderContent({
                showGenericError: true,
                progress: progressOf({ error: 'npm ERR! network timeout' }),
            });

            expect(screen.getByText('Project Creation Failed')).toBeInTheDocument();
            expect(screen.getByText('npm ERR! network timeout')).toHaveClass('text-gray-600');
            expect(container.querySelectorAll('.text-gray-600')).toHaveLength(1);
        });

        it('shows the cancelled heading with no detail line', () => {
            const { container } = renderContent({
                showGenericError: true,
                isCancelled: true,
                progress: progressOf({ currentOperation: 'Cancelled' }),
            });

            expect(screen.getByText('Project Creation Cancelled')).toBeInTheDocument();
            expect(container.querySelectorAll('.text-gray-600')).toHaveLength(0);
        });
    });

    describe('the starting window', () => {
        it('shows Initializing before the first progress event', () => {
            renderContent({ phase: 'creating', progress: undefined });

            expect(screen.getByText('Initializing')).toBeInTheDocument();
            expect(screen.getByText('Preparing to create your project')).toBeInTheDocument();
        });

        it('renders nothing for a phase no view covers', () => {
            const { container } = renderContent({ phase: 'failed', progress: undefined });

            expect(container.textContent).toBe('');
        });
    });
});
