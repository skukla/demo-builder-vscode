/**
 * The pre-flight half of the final wizard step: which repository the GitHub App
 * check is asked about, what each answer does, and the install dialog the
 * extension can push the step into after creation has already failed.
 *
 * None of this ran before — the whole `extractGitHubRepoInfo` /
 * `checkGitHubApp` / `handleCreationFailedMessage` path was uncovered, so the
 * step could have asked about the wrong repository and no test would have said
 * anything. The assertions are therefore on the ARGUMENTS the check receives,
 * not on the answer it is fed.
 *
 * `GitHubAppInstallDialog` is stubbed to print the props it is handed. The real
 * one drops `message` on the floor and polls for the install, so it can neither
 * show what the step decided nor be told the install finished.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import type { EDSConfig, WizardState } from '@/types/webview';
import type { CreationFailedPayload } from '@/types/webviewPayloads';

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

// Below the mocks on purpose: `jest.mock` hoists above the imports of this file,
// so the step must be imported after them to bind to the stubs.
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';

/** The GitHub user an EDS config is signed in as, where a test needs one. */
const githubAuth = (login: string): EDSConfig['githubAuth'] => ({
    isAuthenticated: true,
    user: { login, email: null, name: null, avatarUrl: null },
});

const EDS_STACK = 'eds-accs';

const stateWith = (overrides: Partial<WizardState>): WizardState =>
    ({
        currentStep: 'create-project',
        projectName: 'my-demo-project',
        selectedStack: EDS_STACK,
        // `buildProjectConfig` warns when a stack is chosen with no package, and
        // the console gate turns that warning into a failure.
        selectedPackage: 'citisignal',
        ...overrides,
    }) as WizardState;

const renderStep = (state: WizardState) =>
    render(
        <Provider theme={defaultTheme}>
            <ProjectCreationStep state={state} updateState={jest.fn()} onBack={jest.fn()} />
        </Provider>
    );

/** The payload of the `check-github-app` request, or undefined if none was made. */
const checkedRepo = () =>
    mockWebviewClientRequest.mock.calls.find((call) => call[0] === 'check-github-app')?.[1];

describe('ProjectCreationStep pre-flight GitHub App check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWebviewClientRequest.mockReset();
        mockOnMessage.mockReturnValue(jest.fn());
        mockWebviewClientRequest.mockResolvedValue({ success: true, isInstalled: true });
    });

    describe('which repository it asks about', () => {
        it('should split an owner/repo string out of the existing-repo field', async () => {
            renderStep(stateWith({ edsConfig: { existingRepo: 'acme/storefront' } }));

            await waitFor(() =>
                expect(checkedRepo()).toEqual({ owner: 'acme', repo: 'storefront' })
            );
        });

        it('should prefer the selected repository when existing-repo is not a path', async () => {
            renderStep(
                stateWith({
                    edsConfig: {
                        existingRepo: 'storefront',
                        githubAuth: { isAuthenticated: true },
                        selectedRepo: {
                            id: 'acme/picked',
                            name: 'picked',
                            owner: 'acme',
                            fullName: 'acme/picked',
                            htmlUrl: 'https://github.com/acme/picked',
                        },
                    },
                })
            );

            await waitFor(() => expect(checkedRepo()).toEqual({ owner: 'acme', repo: 'picked' }));
        });

        it('should pair a new repo name with the signed-in GitHub user', async () => {
            renderStep(
                stateWith({
                    edsConfig: { repoName: 'brand-new', githubAuth: githubAuth('octocat') },
                })
            );

            await waitFor(() =>
                expect(checkedRepo()).toEqual({ owner: 'octocat', repo: 'brand-new' })
            );
        });

        it('should skip the check when the repository path names an owner but no repo', async () => {
            // 'acme/' splits into an owner and an empty name. Half a repository is
            // not something the App check can answer about, so it must be skipped
            // rather than asked with a blank name.
            renderStep(stateWith({ edsConfig: { existingRepo: 'acme/' } }));

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(checkedRepo()).toBeUndefined();
        });

        it('should skip the check and start creation when no repository can be named', async () => {
            renderStep(stateWith({ edsConfig: { repoName: 'brand-new' } }));

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(checkedRepo()).toBeUndefined();
        });
    });

    describe('when the check does not apply', () => {
        it('should skip the check for a non-EDS stack', async () => {
            renderStep(
                stateWith({
                    selectedStack: 'headless-paas',
                    edsConfig: { existingRepo: 'acme/storefront' },
                })
            );

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(checkedRepo()).toBeUndefined();
        });

        it('should skip the check when no stack has been selected', async () => {
            renderStep(
                stateWith({
                    selectedStack: undefined,
                    edsConfig: { existingRepo: 'acme/storefront' },
                })
            );

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(checkedRepo()).toBeUndefined();
        });

        it('should skip the check for an EDS stack with no EDS config', async () => {
            renderStep(stateWith({ edsConfig: undefined }));

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(checkedRepo()).toBeUndefined();
        });
    });

    describe('what each answer does', () => {
        const edsState = () => stateWith({ edsConfig: { existingRepo: 'acme/storefront' } });

        it('should start creation when the App is already installed', async () => {
            mockWebviewClientRequest.mockResolvedValue({ success: true, isInstalled: true });

            renderStep(edsState());

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
        });

        it('should show the install dialog and hold creation when the App is missing', async () => {
            mockWebviewClientRequest.mockResolvedValue({
                success: true,
                isInstalled: false,
                installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            });

            renderStep(edsState());

            await waitFor(() => expect(screen.getByTestId('install-dialog')).toBeInTheDocument());
            expect(screen.getByTestId('dialog-owner')).toHaveTextContent('acme');
            expect(screen.getByTestId('dialog-repo')).toHaveTextContent('storefront');
            expect(screen.getByTestId('dialog-url')).toHaveTextContent(
                'https://github.com/apps/aem-code-sync/installations/new'
            );
            expect(screen.getByTestId('dialog-message')).toHaveTextContent(
                'GitHub App installation required for code sync'
            );
            expect(mockCreateProject).not.toHaveBeenCalled();
            // The step draws its own footer, so a state with no footer is a state
            // the SC cannot leave.
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        });

        it('should start creation when the check itself failed', async () => {
            mockWebviewClientRequest.mockResolvedValue({
                success: false,
                isInstalled: false,
                installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            });

            renderStep(edsState());

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
        });

        it('should start creation when AEM never answered, rather than blaming the App', async () => {
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
            mockWebviewClientRequest.mockResolvedValue({
                undetermined: true,
                reason: 'status endpoint 404',
                success: true,
                isInstalled: false,
                installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            });

            renderStep(edsState());

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
            warn.mockRestore();
        });

        it('should start creation when the check request rejects', async () => {
            const error = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockWebviewClientRequest.mockRejectedValue(new Error('offline'));

            renderStep(edsState());

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
            error.mockRestore();
        });
    });

    describe('a creation failure that names the GitHub App', () => {
        const details = {
            owner: 'acme',
            repo: 'storefront',
            installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
        };

        /**
         * A failure shape the wire can deliver but `CreationFailedPayload` cannot
         * express — an error type the step does not special-case, or details with
         * a field missing. Both are exactly what the step's guards are for.
         */
        type OffContractFailure = {
            error: string;
            errorType?: string;
            errorDetails?: Partial<NonNullable<CreationFailedPayload['errorDetails']>>;
        };

        /** Deliver a `creationFailed` push to the listener the step registered. */
        const pushCreationFailed = async (payload: CreationFailedPayload | OffContractFailure) => {
            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            const listener = mockOnMessage.mock.calls.find(
                (call) => call[0] === 'creationFailed'
            )?.[1] as (data: unknown) => void;
            expect(listener).toBeDefined();
            // The extension pushes this from outside React, so the state it sets
            // has to be flushed inside act() by the test instead.
            await act(async () => listener(payload));
        };

        it('should switch to the install dialog', async () => {
            renderStep(stateWith({}));

            await pushCreationFailed({
                error: 'creation failed',
                errorType: 'GITHUB_APP_NOT_INSTALLED',
                errorDetails: details,
            });

            await waitFor(() => expect(screen.getByTestId('install-dialog')).toBeInTheDocument());
            expect(screen.getByTestId('dialog-owner')).toHaveTextContent('acme');
            expect(screen.getByTestId('dialog-repo')).toHaveTextContent('storefront');
            expect(screen.getByTestId('dialog-message')).toHaveTextContent(
                'GitHub App installation required for code sync'
            );
        });

        it('should give way to the failed view when creation then reports an error', async () => {
            const { rerender } = renderStep(stateWith({}));

            await pushCreationFailed({
                error: 'creation failed',
                errorType: 'GITHUB_APP_NOT_INSTALLED',
                errorDetails: details,
            });
            await waitFor(() => expect(screen.getByTestId('install-dialog')).toBeInTheDocument());

            rerender(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={stateWith({
                            creationProgress: {
                                currentOperation: 'Failed',
                                progress: 50,
                                message: 'Failed',
                                logs: [],
                                error: 'boom',
                            },
                        })}
                        updateState={jest.fn()}
                        onBack={jest.fn()}
                    />
                </Provider>
            );

            await waitFor(() =>
                expect(screen.getByText('Project Creation Failed')).toBeInTheDocument()
            );
            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
        });

        it('should ignore a failure of any other kind', async () => {
            renderStep(stateWith({}));

            await pushCreationFailed({
                error: 'creation failed',
                errorType: 'SOMETHING_ELSE',
                errorDetails: details,
            });

            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
        });

        it('should ignore an App failure whose details do not name a repository', async () => {
            renderStep(stateWith({}));

            await pushCreationFailed({
                error: 'creation failed',
                errorType: 'GITHUB_APP_NOT_INSTALLED',
                errorDetails: { ...details, owner: undefined },
            });

            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
        });

        it('should ignore an App failure with no details at all', async () => {
            renderStep(stateWith({}));

            await pushCreationFailed({
                error: 'creation failed',
                errorType: 'GITHUB_APP_NOT_INSTALLED',
            });

            expect(screen.queryByTestId('install-dialog')).not.toBeInTheDocument();
        });
    });

    describe('after the install is detected', () => {
        it('should start creation from the state as it stands, not as it was at mount', async () => {
            mockWebviewClientRequest.mockResolvedValue({
                success: true,
                isInstalled: false,
                installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            });
            const { rerender } = renderStep(
                stateWith({ edsConfig: { existingRepo: 'acme/storefront' } })
            );

            await waitFor(() => expect(screen.getByTestId('install-dialog')).toBeInTheDocument());
            rerender(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={stateWith({
                            projectName: 'renamed-after-mount',
                            edsConfig: { existingRepo: 'acme/storefront' },
                        })}
                        updateState={jest.fn()}
                        onBack={jest.fn()}
                    />
                </Provider>
            );
            fireEvent.click(screen.getByRole('button', { name: 'installed' }));

            await waitFor(() => expect(mockCreateProject).toHaveBeenCalled());
            expect(mockCreateProject.mock.calls[0][0]).toMatchObject({
                projectName: 'renamed-after-mount',
            });
        });
    });
});
