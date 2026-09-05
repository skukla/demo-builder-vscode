/**
 * RepoSelectionInline — the create-a-repository flow, driven through the
 * component rather than through its helpers.
 *
 * The helper suites cover the FORM (what a created field looks like) and the
 * verdict functions. What is pinned here is the container's own wiring: which
 * request it sends and with what payload, what it writes back into edsConfig,
 * what each failure shape leaves on screen, and the two mode switches — Browse
 * and New — which have to clear the other mode's leftovers, or a stale
 * `createdRepo` outlives the repository it described.
 *
 * Real Spectrum, like every other suite in this directory: the component's own
 * disabled/validation wiring is part of what is under test here, so stubbing the
 * primitives would remove the thing being measured.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { settle } from '../../../../helpers/reactSettle';
import type { WizardState, EDSConfig } from '@/types/webview';

const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn(() => jest.fn());
const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: mockOnMessage,
        request: mockRequest,
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

const TEMPLATE = { templateOwner: 'adobe', templateRepo: 'aem-boilerplate' };

const CREATED = {
    owner: 'testuser',
    name: 'my-store',
    url: 'https://github.com/testuser/my-store',
    fullName: 'testuser/my-store',
};

const stateWith = (overrides?: Partial<EDSConfig>): WizardState =>
    ({
        currentStep: 'storefront-setup',
        projectName: 'test-project',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        componentConfigs: {},
        edsConfig: {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: '',
            daLiveOrg: '',
            daLiveSite: '',
            repoMode: 'new',
            githubAuth: {
                isAuthenticated: true,
                user: { login: 'testuser', email: null, name: null, avatarUrl: null },
            },
            ...TEMPLATE,
            ...overrides,
        },
    }) as WizardState;

describe('RepoSelectionInline — creating a repository', () => {
    let RepoSelectionInline: typeof import('@/features/eds/ui/steps/RepoSelectionInline').RepoSelectionInline;
    let updateState: jest.Mock;

    beforeAll(async () => {
        ({ RepoSelectionInline } = await import('@/features/eds/ui/steps/RepoSelectionInline'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        updateState = jest.fn();
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({ success: true });
    });

    /** Render the repository phase. No await between render and settle. */
    const renderInline = async (state: WizardState): Promise<void> => {
        render(
            <Provider theme={defaultTheme} colorScheme="light">
                <RepoSelectionInline
                    state={state}
                    updateState={updateState}
                    phase="repository"
                    onRepoValidChange={jest.fn()}
                    onCodeSyncValidChange={jest.fn()}
                />
            </Provider>
        );
        await settle();
    };


    /**
     * Render with the wizard state HELD, so an updateState patch feeds the next
     * render the way the real wizard does. Without this the component's own
     * callbacks always close over the first edsConfig and a stale one is
     * indistinguishable from a fresh one.
     */
    const renderStateful = async (initial: WizardState): Promise<void> => {
        const Harness = (): React.ReactElement => {
            const [state, setState] = React.useState(initial);
            const update = (patch: Partial<WizardState>): void => {
                updateState(patch);
                setState((prev) => {
                    const next = {
                        ...prev,
                        ...patch,
                        edsConfig: { ...prev.edsConfig, ...patch.edsConfig },
                    } as WizardState;
                    // Same value, same object: the wizard's own store does this,
                    // and without it a patch that changes nothing re-runs every
                    // effect that depends on edsConfig, forever.
                    return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
                });
            };
            return (
                <RepoSelectionInline
                    state={state}
                    updateState={update}
                    phase="repository"
                    onRepoValidChange={jest.fn()}
                    onCodeSyncValidChange={jest.fn()}
                />
            );
        };
        render(
            <Provider theme={defaultTheme} colorScheme="light">
                <Harness />
            </Provider>
        );
        await settle();
    };

    const createButton = (): HTMLElement => screen.getByRole('button', { name: /^create$/i });
    const nameField = (): HTMLElement => screen.getByLabelText(/repository name/i);

    /** The last edsConfig patch handed to updateState. */
    const lastEdsConfig = (): Record<string, unknown> =>
        updateState.mock.calls.at(-1)?.[0]?.edsConfig ?? {};

    /**
     * The last patch that actually CARRIED an edsConfig — the hook also posts
     * search-filter patches, and one of those is often the most recent call.
     */
    const lastConfigPatch = (): Record<string, unknown> =>
        [...updateState.mock.calls].reverse().find((c) => c[0]?.edsConfig)?.[0]?.edsConfig ?? {};

    describe('the Create button', () => {
        it('is disabled with no name typed', async () => {
            await renderInline(stateWith({ repoName: '' }));

            expect(createButton()).toBeDisabled();
        });

        it('is disabled for a name the validator rejects', async () => {
            await renderInline(stateWith({ repoName: '-bad-' }));

            expect(createButton()).toBeDisabled();
        });

        it('is disabled when the stack supplies no template owner', async () => {
            await renderInline(stateWith({ repoName: 'my-store', templateOwner: undefined }));

            expect(createButton()).toBeDisabled();
        });

        it('is disabled when the stack supplies no template repository', async () => {
            await renderInline(stateWith({ repoName: 'my-store', templateRepo: undefined }));

            expect(createButton()).toBeDisabled();
        });

        it('is enabled for a valid name against a configured template', async () => {
            await renderInline(stateWith({ repoName: 'my-store' }));

            expect(createButton()).toBeEnabled();
        });
    });

    describe('the create request', () => {
        beforeEach(() => {
            mockRequest.mockResolvedValue({ success: true, data: CREATED });
        });

        it('asks the extension to create the repo from the stack template, publicly', async () => {
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(mockRequest).toHaveBeenCalledWith('create-github-repo', {
                repoName: 'my-store',
                templateOwner: 'adobe',
                templateRepo: 'aem-boilerplate',
                isPrivate: false,
            });
        });

        it('records the created repository in edsConfig, field by field', async () => {
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(lastEdsConfig().createdRepo).toEqual(CREATED);
        });

        it('replaces the Create button once the repository exists', async () => {
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            await waitFor(() => {
                expect(screen.queryByRole('button', { name: /^create$/i })).not.toBeInTheDocument();
            });
        });
    });

    describe('when creation fails', () => {
        beforeEach(() => {
            // The component reports the failure to the webview console; the gate
            // fails a suite that lets one through, and the message is not what is
            // under test here — the error the USER sees is.
            jest.spyOn(console, 'error').mockImplementation(() => undefined);
        });

        afterEach(() => {
            (console.error as jest.Mock).mockRestore();
        });

        it('shows the reason the extension gave', async () => {
            mockRequest.mockResolvedValue({ success: false, error: 'Name already taken' });
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(await screen.findByText('Name already taken')).toBeInTheDocument();
        });

        it('falls back to a generic reason when the extension gave none', async () => {
            mockRequest.mockResolvedValue({ success: false });
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(await screen.findByText('Failed to create repository')).toBeInTheDocument();
        });

        it('treats a success carrying no repository data as a failure', async () => {
            mockRequest.mockResolvedValue({ success: true, error: 'nothing came back' });
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(await screen.findByText('nothing came back')).toBeInTheDocument();
            expect(lastEdsConfig().createdRepo).toBeUndefined();
        });

        it('re-enables the name field so the user can try another name', async () => {
            mockRequest.mockResolvedValue({ success: false, error: 'Name already taken' });
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            await screen.findByText('Name already taken');
            expect(nameField()).not.toBeDisabled();
        });

        it('surfaces a thrown transport error and leaves the Create button in place', async () => {
            mockRequest.mockRejectedValue(new Error('webview disconnected'));
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(await screen.findByText('webview disconnected')).toBeInTheDocument();
            expect(createButton()).toBeInTheDocument();
        });
    });

    describe('the repository name field', () => {
        it('normalizes what is typed and locks daLiveSite to it', async () => {
            await renderInline(stateWith({ repoName: '' }));

            fireEvent.change(nameField(), { target: { value: 'My New Store' } });
            await settle();

            expect(lastEdsConfig()).toMatchObject({
                repoName: 'my-new-store',
                daLiveSite: 'my-new-store',
            });
        });

        it('reports the name error on blur, without changing state', async () => {
            await renderInline(stateWith({ repoName: '-bad-' }));

            fireEvent.blur(nameField());

            expect(
                await screen.findByText(/must start with a letter or number/i)
            ).toBeInTheDocument();
            // Blur validates; it never rewrites the name it just validated.
            expect(
                updateState.mock.calls.some((c) => c[0]?.edsConfig !== undefined)
            ).toBe(false);
        });

        it('leaves a valid name unmarked on blur', async () => {
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.blur(nameField());
            await settle();

            expect(
                screen.queryByText(/must start with a letter or number/i)
            ).not.toBeInTheDocument();
        });
    });

    describe('what the callbacks see after the state moves', () => {
        it('validates the name that is in the field NOW, not the one it mounted with', async () => {
            // Mounted empty (which IS an error); blur must judge what was typed
            // since, or the field goes red the moment it is left.
            await renderStateful(stateWith({ repoName: '' }));

            fireEvent.change(nameField(), { target: { value: 'valid-name' } });
            await settle();
            fireEvent.blur(nameField());
            await settle();

            expect(screen.queryByText(/Repository name is required/i)).not.toBeInTheDocument();
        });

        it('creates the repository the field currently names', async () => {
            mockRequest.mockResolvedValue({ success: true, data: CREATED });
            await renderStateful(stateWith({ repoName: '' }));

            fireEvent.change(nameField(), { target: { value: 'typed-name' } });
            await settle();
            fireEvent.click(createButton());
            await settle();

            expect(mockRequest).toHaveBeenCalledWith('create-github-repo', {
                repoName: 'typed-name',
                templateOwner: 'adobe',
                templateRepo: 'aem-boilerplate',
                isPrivate: false,
            });
        });

        it('keeps the typed name in the patch that records the created repository', async () => {
            mockRequest.mockResolvedValue({ success: true, data: CREATED });
            await renderStateful(stateWith({ repoName: '' }));

            fireEvent.change(nameField(), { target: { value: 'typed-name' } });
            await settle();
            fireEvent.click(createButton());
            await settle();

            const creationPatch = updateState.mock.calls
                .map((c) => c[0]?.edsConfig)
                .find((cfg) => cfg?.createdRepo);
            expect(creationPatch).toMatchObject({
                repoName: 'typed-name',
                createdRepo: CREATED,
            });
        });
    });

    describe('with no EDS configuration at all', () => {
        it('renders the existing-repo body and asks for GitHub auth, rather than throwing', async () => {
            const bare = {
                currentStep: 'storefront-setup',
                projectName: 'test-project',
                adobeAuth: { isAuthenticated: true, isChecking: false },
                componentConfigs: {},
            } as WizardState;

            await renderInline(bare);

            // repoMode defaults to 'existing', and with no githubAuth the load
            // guard refuses — the error body, not a crash and not the new-repo form.
            expect(screen.queryByLabelText(/repository name/i)).not.toBeInTheDocument();
            expect(
                await screen.findByText(/GitHub authentication required/i)
            ).toBeInTheDocument();
        });
    });

    describe('which body each mode renders', () => {
        it('new mode shows the create form and no repository list', async () => {
            const state = stateWith({ repoName: 'my-store' });
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                {
                    id: 'repo-1',
                    name: 'old-repo',
                    fullName: 'testuser/old-repo',
                    htmlUrl: 'https://github.com/testuser/old-repo',
                },
            ];

            await renderInline(state);

            expect(nameField()).toBeInTheDocument();
            expect(screen.queryByText('old-repo')).not.toBeInTheDocument();
        });

        it('existing mode shows the repository list and no create form', async () => {
            const state = stateWith({ repoMode: 'existing' });
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                {
                    id: 'repo-1',
                    name: 'old-repo',
                    fullName: 'testuser/old-repo',
                    htmlUrl: 'https://github.com/testuser/old-repo',
                },
            ];

            await renderInline(state);

            expect(screen.getByText('old-repo')).toBeInTheDocument();
            expect(screen.queryByLabelText(/repository name/i)).not.toBeInTheDocument();
        });
    });

    describe('while the create request is in flight', () => {
        it('disables the name field until the answer arrives', async () => {
            let release: (v: unknown) => void = () => undefined;
            mockRequest.mockReturnValue(
                new Promise((resolve) => {
                    release = resolve;
                })
            );
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(nameField()).toBeDisabled();

            release({ success: true, data: CREATED });
            await settle();
        });

        it('keeps the Create button while the request is out', async () => {
            let release: (v: unknown) => void = () => undefined;
            mockRequest.mockReturnValue(
                new Promise((resolve) => {
                    release = resolve;
                })
            );
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(createButton()).toBeInTheDocument();

            release({ success: true, data: CREATED });
            await settle();
        });

        it('re-enables the field once the repository exists, so the tick shows', async () => {
            mockRequest.mockResolvedValue({ success: true, data: CREATED });
            await renderInline(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            expect(nameField()).not.toBeDisabled();
        });
    });

    describe('after creation, the Code Sync check', () => {
        it('is armed and runs against the repository just created', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'create-github-repo') return { success: true, data: CREATED };
                return { success: true, isInstalled: true };
            });
            await renderStateful(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('check-github-app', {
                    owner: 'testuser',
                    repo: 'my-store',
                    lenient: true,
                    skipTrigger: true,
                });
            });
        });

        it('runs on returning to a step whose repository already exists', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: true });

            await renderInline(stateWith({ repoName: 'my-store', createdRepo: CREATED }));

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('check-github-app', {
                    owner: 'testuser',
                    repo: 'my-store',
                    lenient: true,
                    skipTrigger: true,
                });
            });
        });

        it('is not run for a created repo missing an owner', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: true });

            await renderInline(
                stateWith({
                    repoName: 'my-store',
                    createdRepo: { ...CREATED, owner: '' },
                })
            );
            await settle();

            expect(
                mockRequest.mock.calls.some((c) => c[0] === 'check-github-app')
            ).toBe(false);
        });
    });

    describe('what a handler carries from the CURRENT configuration', () => {
        it('Browse keeps the name typed since mount', async () => {
            await renderStateful(stateWith({ repoName: '' }));

            fireEvent.change(nameField(), { target: { value: 'typed-name' } });
            await settle();
            fireEvent.click(screen.getByRole('button', { name: /browse/i }));
            await settle();

            expect(lastConfigPatch()).toMatchObject({
                repoMode: 'existing',
                repoName: 'typed-name',
            });
        });

        it('a later keystroke keeps what an earlier action recorded', async () => {
            mockRequest.mockResolvedValue({ success: true, data: CREATED });
            await renderStateful(stateWith({ repoName: 'my-store' }));

            fireEvent.click(createButton());
            await settle();
            fireEvent.change(nameField(), { target: { value: 'renamed' } });
            await settle();

            expect(lastConfigPatch()).toMatchObject({
                repoName: 'renamed',
                createdRepo: CREATED,
            });
        });
    });

    describe('switching modes', () => {
        it('Browse returns to the existing-repo list and drops any created repo', async () => {
            await renderInline(stateWith({ repoName: 'my-store', createdRepo: CREATED }));

            fireEvent.click(screen.getByRole('button', { name: /browse/i }));
            await settle();

            expect(lastEdsConfig()).toMatchObject({
                repoMode: 'existing',
                createdRepo: undefined,
            });
        });

        it('Browse then New offers the Create button again (local state reset)', async () => {
            mockRequest.mockResolvedValue({ success: true, data: CREATED });
            const state = stateWith({ repoName: 'my-store' });
            // A populated cache so Browse lands on the list, not its spinner.
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                {
                    id: 'repo-1',
                    name: 'old-repo',
                    fullName: 'testuser/old-repo',
                    htmlUrl: 'https://github.com/testuser/old-repo',
                },
            ];
            await renderStateful(state);

            fireEvent.click(createButton());
            await settle();
            expect(screen.queryByRole('button', { name: /^create$/i })).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: /browse/i }));
            await settle();
            fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
            await settle();

            expect(createButton()).toBeInTheDocument();

            // And it works again: the local creation flags are back to their
            // starting values, not just the configuration.
            fireEvent.change(nameField(), { target: { value: 'second-try' } });
            await settle();
            expect(createButton()).toBeEnabled();
        });

        it('New clears every leftover of the previous selection', async () => {
            const state = stateWith({
                repoMode: 'existing',
                repoName: 'old-repo',
                daLiveSite: 'old-repo',
                selectedRepo: {
                    id: 'repo-1',
                    name: 'old-repo',
                    fullName: 'testuser/old-repo',
                    htmlUrl: 'https://github.com/testuser/old-repo',
                },
                existingRepo: 'testuser/old-repo',
                resetToTemplate: true,
            });
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                {
                    id: 'repo-1',
                    name: 'old-repo',
                    fullName: 'testuser/old-repo',
                    htmlUrl: 'https://github.com/testuser/old-repo',
                },
            ];
            await renderInline(state);

            fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
            await settle();

            expect(lastEdsConfig()).toMatchObject({
                repoMode: 'new',
                repoName: '',
                daLiveSite: '',
                selectedRepo: undefined,
                existingRepo: undefined,
                resetToTemplate: false,
                createdRepo: undefined,
            });
        });
    });
});
