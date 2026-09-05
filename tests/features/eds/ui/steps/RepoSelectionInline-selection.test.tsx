/**
 * RepoSelectionInline — choosing an existing repository.
 *
 * The container's own wiring around the choice: what selecting a row writes
 * into edsConfig, how the list is loaded and filtered, the cleanup that drops a
 * selection the account no longer has, the pre-load GitHub-auth guard, and the
 * reset-to-template control beside it.
 *
 * The readiness/Code-Sync half lives in RepoSelectionInline-codeSync.test.tsx;
 * both drive the component through the shared harness.
 */

import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { settle } from '../../../../helpers/reactSettle';
import {
    createHarness,
    resetSelectionMocks,
    stateWith,
    mockOnMessage,
    mockPostMessage,
    REPO,
    OTHER,
    type SelectionHarness,
} from './RepoSelectionInline-selection.testUtils';
import type { GitHubRepoItem } from '@/types/webview';

describe('RepoSelectionInline — choosing an existing repository', () => {
    let h: SelectionHarness;

    beforeEach(() => {
        resetSelectionMocks();
        h = createHarness();
    });


    describe('selecting a repository', () => {
        it('locks repoName and daLiveSite to the chosen repo and records the choice', async () => {
            await h.renderInline(stateWith());

            fireEvent.click(screen.getByText('other-store'));
            await settle();

            expect(h.lastEdsConfig()).toMatchObject({
                repoName: 'other-store',
                daLiveSite: 'other-store',
                repoMode: 'existing',
                selectedRepo: OTHER,
                existingRepo: 'testuser/other-store',
            });
        });
    });

    describe('the repository rows', () => {
        it('marks the private repository, and only it', async () => {
            await h.renderInline(stateWith());

            const badges = screen.getAllByText('Private');
            expect(badges).toHaveLength(1);
            // On the private repo's OWN row: the badge and the description are
            // siblings inside one description slot.
            expect(badges[0].parentElement).toHaveTextContent('The other one');
        });

        it('says so when a repository has no description', async () => {
            await h.renderInline(stateWith());

            expect(screen.getByText('No description')).toBeInTheDocument();
            expect(screen.getByText('The other one')).toBeInTheDocument();
        });
    });

    describe('a selection the account no longer has', () => {
        it('is cleared once the repository list has loaded without it', async () => {
            const gone = { ...REPO, id: 'repo-gone', name: 'gone' } as GitHubRepoItem;

            await h.renderInline(stateWith({ selectedRepo: gone, repoName: 'gone' }));

            await waitFor(() => {
                expect(h.lastEdsConfig()).toMatchObject({
                    selectedRepo: undefined,
                    existingRepo: undefined,
                    repoName: '',
                });
            });
        });

        it('is left alone when the list still has it', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO, repoName: 'my-store' }));

            expect(h.clearedSelection()).toBe(false);
        });

        it('is left alone while the list is still empty', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO, repoName: 'my-store' }, []));


            expect(h.clearedSelection()).toBe(false);
        });
    });

    describe('without GitHub authentication', () => {
        it('refuses to load and says to go back and authenticate', async () => {
            await h.renderInline(
                stateWith(
                    {
                        githubAuth: { isAuthenticated: false },
                        selectedRepo: undefined,
                    },
                    null
                )
            );

            expect(await screen.findByText(/GitHub authentication required/i)).toBeInTheDocument();
            expect(h.requestsOf('get-github-repos')).toEqual([]);
            expect(mockPostMessage.mock.calls.some((c) => c[0] === 'get-github-repos')).toBe(
                false
            );
        });
    });

    describe('loading the repository list', () => {
        it('goes ahead when GitHub is authenticated', async () => {
            await h.renderInline(stateWith({}, null));

            await waitFor(() => {
                expect(
                    mockPostMessage.mock.calls.some((c) => c[0] === 'get-github-repos')
                ).toBe(true);
            });
            expect(screen.queryByText(/GitHub authentication required/i)).not.toBeInTheDocument();
        });
    });

    describe('the search filter', () => {
        // The search field appears only above the list's own threshold (5).
        const MANY = Array.from(
            { length: 6 },
            (_, i) =>
                ({
                    id: `bulk-${i}`,
                    name: `bulk-${i}`,
                    fullName: `testuser/bulk-${i}`,
                    htmlUrl: `https://github.com/testuser/bulk-${i}`,
                }) as GitHubRepoItem
        );

        it('filters by repository name', async () => {
            await h.renderInline(stateWith({}, [...MANY, OTHER]));

            fireEvent.change(screen.getByPlaceholderText(/filter repositories/i), {
                target: { value: 'other-store' },
            });
            await settle();

            expect(screen.getByText('other-store')).toBeInTheDocument();
            expect(screen.queryByText('bulk-0')).not.toBeInTheDocument();
        });

        it('filters by full name and description too', async () => {
            await h.renderInline(stateWith({}, [...MANY, OTHER]));

            fireEvent.change(screen.getByPlaceholderText(/filter repositories/i), {
                target: { value: 'The other one' },
            });
            await settle();

            expect(screen.getByText('other-store')).toBeInTheDocument();
            expect(screen.queryByText('bulk-0')).not.toBeInTheDocument();
        });
    });

    describe('a single repository in the list', () => {
        it('is not chosen for the user', async () => {
            await h.renderInline(stateWith({}, [REPO]));

            expect(h.clearedSelection()).toBe(false);
            expect(
                h.updateState.mock.calls.some((c) => c[0]?.edsConfig?.selectedRepo)
            ).toBe(false);
        });
    });

    describe('new-repo mode does not police the existing-repo list', () => {
        it('keeps a selection that is absent from the loaded list', async () => {
            const gone = { ...REPO, id: 'repo-gone', name: 'gone' } as GitHubRepoItem;

            await h.renderInline(stateWith({ repoMode: 'new', selectedRepo: gone }));

            expect(h.clearedSelection()).toBe(false);
        });
    });

    describe('with a list loaded and nothing selected', () => {
        it('leaves the configuration alone', async () => {
            await h.renderInline(stateWith());

            expect(h.clearedSelection()).toBe(false);
        });
    });

    describe('with no GitHub auth block at all', () => {
        it('renders and refuses to load rather than throwing', async () => {
            const state = stateWith({}, null);
            delete (state.edsConfig as { githubAuth?: unknown }).githubAuth;

            await h.renderInline(state);

            expect(await screen.findByText(/GitHub authentication required/i)).toBeInTheDocument();
        });
    });

    describe('when the repository list arrives from a load', () => {
        /** Capture the hook's subscription so a spec can deliver the response. */
        function captureHandlers(): Record<string, (data: unknown) => void> {
            const handlers: Record<string, (data: unknown) => void> = {};
            mockOnMessage.mockImplementation((type, handler) => {
                handlers[type] = handler;
                return () => undefined;
            });
            return handlers;
        }

        it('does not choose the repository for the user, even when there is only one', async () => {
            const handlers = captureHandlers();
            await h.renderInline(stateWith({}, null));

            await act(async () => {
                handlers['get-github-repos']?.([REPO]);
            });
            await settle();

            expect(
                h.updateState.mock.calls.some((c) => c[0]?.edsConfig?.selectedRepo)
            ).toBe(false);
        });

        it('caches what arrived so the list can render it', async () => {
            const handlers = captureHandlers();
            await h.renderInline(stateWith({}, null));

            await act(async () => {
                handlers['get-github-repos']?.([REPO]);
            });
            await settle();

            expect(h.updateState).toHaveBeenCalledWith({ githubReposCache: [REPO] });
        });

        it('reports the error the extension sent instead of a list', async () => {
            const handlers = captureHandlers();
            await h.renderInline(stateWith({}, null));

            await act(async () => {
                handlers['get-github-repos-error']?.({ error: 'Rate limited by GitHub' });
            });
            await settle();

            expect(await screen.findByText('Rate limited by GitHub')).toBeInTheDocument();
        });
    });

    describe('a handler carries the CURRENT configuration', () => {
        it('New keeps the repository chosen a moment earlier', async () => {
            await h.renderStateful(stateWith());

            fireEvent.click(screen.getByText('other-store'));
            await settle();
            fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
            await settle();

            // The New patch clears the selection but must be built on the
            // configuration as it stands now, not as it was at mount.
            expect(h.lastConfigPatch()).toMatchObject({
                repoMode: 'new',
                daLiveSite: '',
            });
            expect(h.updateState.mock.calls.length).toBeGreaterThan(1);
        });

        it('the reset tick is recorded against the repository now chosen', async () => {
            await h.renderStateful(stateWith());

            fireEvent.click(screen.getByText('other-store'));
            await settle();
            fireEvent.click(screen.getByRole('checkbox'));
            await settle();

            expect(h.lastConfigPatch()).toMatchObject({
                resetToTemplate: true,
                existingRepo: 'testuser/other-store',
            });
        });
    });

    describe('the reset-to-template control', () => {
        it('is disabled until a repository is chosen', async () => {
            await h.renderInline(stateWith());

            expect(screen.getByRole('checkbox')).toBeDisabled();
        });

        it('is enabled once a repository is chosen', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO }));

            expect(screen.getByRole('checkbox')).toBeEnabled();
        });

        it('records the choice when ticked', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO }));

            fireEvent.click(screen.getByRole('checkbox'));
            await settle();

            expect(h.lastEdsConfig()).toMatchObject({ resetToTemplate: true });
        });
    });

    describe('the reset-to-template state it starts from', () => {
        it('is ticked when the project already asked for a reset', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO, resetToTemplate: true }));

            expect(screen.getByRole('checkbox')).toBeChecked();
        });

        it('is clear when it did not', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO }));

            expect(screen.getByRole('checkbox')).not.toBeChecked();
        });
    });

    describe('a repository whose default branch is not main', () => {
        const ODD = { ...REPO, defaultBranch: 'develop' } as GitHubRepoItem;
        const MAIN = { ...REPO, defaultBranch: 'main' } as GitHubRepoItem;

        it('is called out by name and branch', async () => {
            await h.renderInline(stateWith({ selectedRepo: ODD }, [ODD, OTHER]));

            expect(screen.getByTestId('default-branch-notice')).toHaveTextContent(
                'testuser/my-store'
            );
            expect(screen.getByTestId('default-branch-notice')).toHaveTextContent('develop');
        });

        it('silences the reset control, which would not fix it', async () => {
            await h.renderInline(stateWith({ selectedRepo: ODD }, [ODD, OTHER]));

            expect(screen.getByRole('checkbox')).toBeDisabled();
        });

        it('says nothing for a repository that defaults to main', async () => {
            await h.renderInline(stateWith({ selectedRepo: MAIN }, [MAIN, OTHER]));

            expect(screen.queryByTestId('default-branch-notice')).not.toBeInTheDocument();
            expect(screen.getByRole('checkbox')).toBeEnabled();
        });

        it('says nothing for a repository that reports no default branch', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO }));

            expect(screen.queryByTestId('default-branch-notice')).not.toBeInTheDocument();
        });
    });
});
