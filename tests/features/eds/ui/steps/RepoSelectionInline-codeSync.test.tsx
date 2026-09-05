/**
 * RepoSelectionInline — repository readiness and the AEM Code Sync gate.
 *
 * Which requests the two probes send and when they are skipped, the Check Again
 * path, the install link, and what has to happen when the state moves under the
 * component — a new selection, or a late answer for one it has left behind.
 *
 * The choose/load half lives in RepoSelectionInline-selection.test.tsx; both
 * drive the component through the shared harness.
 */

import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { settle } from '../../../../helpers/reactSettle';
import {
    createHarness,
    resetSelectionMocks,
    stateWith,
    mockPostMessage,
    mockRequest,
    REPO,
    OTHER,
    type SelectionHarness,
} from './RepoSelectionInline-selection.testUtils';
import type { GitHubRepoItem } from '@/types/webview';

describe('RepoSelectionInline — readiness and the Code Sync gate', () => {
    let h: SelectionHarness;

    beforeEach(() => {
        resetSelectionMocks();
        h = createHarness();
    });


    describe('the readiness probe', () => {
        it('asks about the selected repository by owner and name', async () => {
            await h.renderInline(stateWith({ selectedRepo: REPO }));

            expect(h.requestsOf('check-repo-readiness')).toEqual([
                { owner: 'testuser', repo: 'my-store' },
            ]);
        });

        it('asks nothing while no repository is selected', async () => {
            await h.renderInline(stateWith());

            expect(h.requestsOf('check-repo-readiness')).toEqual([]);
        });

        it('asks nothing in new-repo mode', async () => {
            await h.renderInline(stateWith({ repoMode: 'new', selectedRepo: REPO }));

            expect(h.requestsOf('check-repo-readiness')).toEqual([]);
        });

        it('treats a failed readiness request as undetermined and still probes Code Sync', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') throw new Error('offline');
                return { success: true, isInstalled: true };
            });

            await h.renderInline(stateWith({ selectedRepo: REPO }));

            await waitFor(() => {
                expect(h.requestsOf('check-github-app')).toHaveLength(1);
            });
        });

        it('treats a readiness response with no verdict as undetermined', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') return { success: true };
                return { success: true, isInstalled: true };
            });

            await h.renderInline(stateWith({ selectedRepo: REPO }));

            await waitFor(() => {
                expect(h.requestsOf('check-github-app')).toHaveLength(1);
            });
        });
    });

    describe('the Code Sync probe', () => {
        it('checks the selected repository leniently, without triggering a sync', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'ready' } };
                }
                return { success: true, isInstalled: true };
            });

            await h.renderInline(stateWith({ selectedRepo: REPO }));

            await waitFor(() => {
                expect(h.requestsOf('check-github-app')).toEqual([
                    { owner: 'testuser', repo: 'my-store', lenient: true, skipTrigger: true },
                ]);
            });
        });

        it.each([
            { kind: 'not-a-storefront', missing: ['fstab.yaml'] },
            { kind: 'empty' },
        ])('never asks about a repo that cannot have a site yet (%s)', async (readiness) => {
                mockRequest.mockImplementation(async (type: string) => {
                    if (type === 'check-repo-readiness') {
                        return { success: true, readiness };
                    }
                    return { success: true, isInstalled: true };
                });

                await h.renderInline(stateWith({ selectedRepo: REPO }));
                await settle();

                expect(h.requestsOf('check-github-app')).toEqual([]);
        });
    });

    describe('Check Again', () => {
        /** Land on the needs-install view, which is the one carrying the button. */
        function routeNeedsInstall(): void {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'storefront' } };
                }
                return { success: true, isInstalled: false, codeStatus: 404 };
            });
        }

        it('re-checks the SELECTED repository, split out of its full name', async () => {
            routeNeedsInstall();
            await h.renderInline(stateWith({ selectedRepo: REPO }), 'code-sync');

            fireEvent.click(await screen.findByRole('button', { name: /check again/i }));
            await settle();

            // The re-check is the polling form: no skipTrigger.
            expect(h.requestsOf('check-github-app')).toContainEqual({
                owner: 'testuser',
                repo: 'my-store',
                lenient: true,
            });
        });

        it('re-checks the repository selected NOW, not the one it mounted with', async () => {
            routeNeedsInstall();
            const rerenderWith = await h.renderWithRerender(
                stateWith({ selectedRepo: REPO }),
                'code-sync'
            );

            await rerenderWith(stateWith({ selectedRepo: OTHER }));

            fireEvent.click(await screen.findByRole('button', { name: /check again/i }));
            await settle();

            expect(h.requestsOf('check-github-app')).toContainEqual({
                owner: 'testuser',
                repo: 'other-store',
                lenient: true,
            });
        });

        it('re-checks the CREATED repository in preference to any selection', async () => {
            routeNeedsInstall();
            await h.renderInline(
                stateWith({
                    repoMode: 'new',
                    selectedRepo: REPO,
                    createdRepo: {
                        owner: 'testuser',
                        name: 'fresh-repo',
                        url: 'https://github.com/testuser/fresh-repo',
                        fullName: 'testuser/fresh-repo',
                    },
                }),
                'code-sync'
            );

            fireEvent.click(await screen.findByRole('button', { name: /check again/i }));
            await settle();

            expect(h.requestsOf('check-github-app')).toContainEqual({
                owner: 'testuser',
                repo: 'fresh-repo',
                lenient: true,
            });
        });

        it('reports the verdict it gets back', async () => {
            routeNeedsInstall();
            await h.renderInline(stateWith({ selectedRepo: REPO }), 'code-sync');
            mockRequest.mockResolvedValue({ success: true, isInstalled: true });

            fireEvent.click(await screen.findByRole('button', { name: /check again/i }));
            await settle();

            await waitFor(() => {
                expect(h.onCodeSyncValidChange).toHaveBeenLastCalledWith(true);
            });
        });
    });

    describe('after a re-check', () => {
        it('leaves the checking view and reports the answer', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'storefront' } };
                }
                return { success: true, isInstalled: false, codeStatus: 404 };
            });
            await h.renderInline(stateWith({ selectedRepo: REPO }), 'code-sync');

            const button = await screen.findByRole('button', { name: /check again/i });
            mockRequest.mockResolvedValue({ success: true, isInstalled: true, codeStatus: 200 });
            fireEvent.click(button);
            await settle();

            await waitFor(() => {
                expect(
                    screen.queryByText(/Checking AEM Code Sync/i)
                ).not.toBeInTheDocument();
            });
        });

        it('forgets the previous verdict the moment the selection changes', async () => {
            const pending: Array<(v: unknown) => void> = [];
            mockRequest.mockImplementation(
                (type: string, payload: { repo?: string }) =>
                    new Promise((resolve) => {
                        if (type === 'check-repo-readiness') {
                            resolve({ success: true, readiness: { kind: 'storefront' } });
                            return;
                        }
                        if (payload.repo === 'my-store') {
                            resolve({ success: true, isInstalled: true, codeStatus: 200 });
                            return;
                        }
                        pending.push(resolve);
                    })
            );

            const rerenderWith = await h.renderWithRerender(stateWith({ selectedRepo: REPO }));
            await waitFor(() => {
                expect(h.onCodeSyncValidChange).toHaveBeenLastCalledWith(true);
            });

            // The new repository has not answered yet: the verdict must go back
            // to "not yet", not inherit the previous repository's yes.
            await rerenderWith(stateWith({ selectedRepo: OTHER }));

            expect(h.onCodeSyncValidChange).toHaveBeenLastCalledWith(false);
        });
    });

    describe('the install page', () => {
        it('posts nothing when the check reported no install URL', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'storefront' } };
                }
                return { success: true, isInstalled: false, codeStatus: 404 };
            });

            await h.renderInline(stateWith({ selectedRepo: REPO }), 'code-sync');

            fireEvent.click(await screen.findByRole('button', { name: /install app/i }));
            await settle();

            expect(mockPostMessage.mock.calls.some((c) => c[0] === 'openExternal')).toBe(false);
        });

        it('opens the URL the check reported, externally', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'ready' } };
                }
                return {
                    success: true,
                    isInstalled: false,
                    codeStatus: 404,
                    installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
                };
            });

            await h.renderInline(stateWith({ selectedRepo: REPO }), 'code-sync');

            const install = await screen.findByRole('button', { name: /install/i });
            fireEvent.click(install);
            await settle();

            expect(mockPostMessage).toHaveBeenCalledWith('openExternal', {
                url: 'https://github.com/apps/aem-code-sync/installations/new',
            });
        });
    });

    describe('when the state moves under it', () => {
        it('asks about the NEW repository when the selection changes', async () => {
            const rerenderWith = await h.renderWithRerender(stateWith({ selectedRepo: REPO }));

            await rerenderWith(stateWith({ selectedRepo: OTHER }));

            expect(h.requestsOf('check-repo-readiness')).toEqual([
                { owner: 'testuser', repo: 'my-store' },
                { owner: 'testuser', repo: 'other-store' },
            ]);
        });

        it('re-reports the repository verdict when a selection appears', async () => {
            const rerenderWith = await h.renderWithRerender(stateWith());
            expect(h.onRepoValidChange).toHaveBeenLastCalledWith(false);

            await rerenderWith(stateWith({ selectedRepo: REPO }));

            expect(h.onRepoValidChange).toHaveBeenLastCalledWith(true);
        });

        it('re-reports the Code Sync verdict when a selection appears', async () => {
            const rerenderWith = await h.renderWithRerender(stateWith());
            expect(h.onCodeSyncValidChange).toHaveBeenLastCalledWith(false);

            await rerenderWith(stateWith({ selectedRepo: REPO }));

            await waitFor(() => {
                expect(h.onCodeSyncValidChange).toHaveBeenLastCalledWith(true);
            });
        });

        it('forgets the previous repository App verdict when the selection changes', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'storefront' } };
                }
                return { success: true, isInstalled: true, codeStatus: 200 };
            });
            const rerenderWith = await h.renderWithRerender(
                stateWith({ repoMode: 'new', createdRepo: undefined, selectedRepo: REPO })
            );

            // A fresh selection must start from "not asked", not inherit the last
            // repository's answer.
            await rerenderWith(
                stateWith({ repoMode: 'new', createdRepo: undefined, selectedRepo: OTHER })
            );

            expect(h.onCodeSyncValidChange).toHaveBeenLastCalledWith(false);
        });

        it('drops a selection that disappears from a list it has already loaded', async () => {
            const gone = { ...REPO, id: 'repo-gone', name: 'gone' } as GitHubRepoItem;
            const rerenderWith = await h.renderWithRerender(stateWith({ selectedRepo: REPO }));
            expect(h.clearedSelection()).toBe(false);

            await rerenderWith(stateWith({ selectedRepo: gone }));

            expect(h.clearedSelection()).toBe(true);
        });

        it('leaves a selection alone when the list has never loaded a thing', async () => {
            const rerenderWith = await h.renderWithRerender(stateWith({ selectedRepo: REPO }, []));

            await rerenderWith(stateWith({ selectedRepo: OTHER }, []));

            expect(h.clearedSelection()).toBe(false);
        });
    });

    describe('a late readiness answer for a repository no longer selected', () => {
        it('does not overwrite the current one', async () => {
            const answers: Record<string, (v: unknown) => void> = {};
            mockRequest.mockImplementation(
                (type: string, payload: { repo?: string }) =>
                    new Promise((resolve) => {
                        if (type === 'check-repo-readiness') {
                            answers[payload.repo as string] = resolve;
                            return;
                        }
                        resolve({ success: true, isInstalled: true, codeStatus: 200 });
                    })
            );

            const rerenderWith = await h.renderWithRerender(stateWith({ selectedRepo: REPO }));
            await rerenderWith(stateWith({ selectedRepo: OTHER }));

            // The SECOND repository answers first, then the abandoned first one
            // answers with something that would change the screen if it landed.
            answers['other-store']?.({ success: true, readiness: { kind: 'storefront' } });
            await settle();
            answers['my-store']?.({
                success: true,
                readiness: { kind: 'not-a-storefront', missing: ['fstab.yaml'] },
            });
            await settle();

            // The abandoned answer would have printed its own warning line.
            expect(screen.queryByText(/Missing fstab.yaml/i)).not.toBeInTheDocument();
        });
    });

    describe('switching to a repository whose full name has no owner', () => {
        it('asks nothing further about Code Sync', async () => {
            const ODD = {
                ...REPO,
                id: 'repo-odd',
                name: 'odd',
                fullName: 'noslash',
            } as GitHubRepoItem;
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') {
                    return { success: true, readiness: { kind: 'storefront' } };
                }
                return { success: true, isInstalled: true, codeStatus: 200 };
            });

            const rerenderWith = await h.renderWithRerender(stateWith({ selectedRepo: REPO }));
            await waitFor(() => {
                expect(h.requestsOf('check-github-app')).toHaveLength(1);
            });

            await rerenderWith(stateWith({ selectedRepo: ODD }, [ODD, OTHER]));

            expect(h.requestsOf('check-github-app')).toHaveLength(1);
        });
    });

    describe('a repository whose full name has no owner', () => {
        const ODD = { ...REPO, id: 'repo-odd', name: 'odd', fullName: 'noslash' } as GitHubRepoItem;

        it('is never asked about', async () => {
            await h.renderInline(stateWith({ selectedRepo: ODD }, [ODD, OTHER]));

            expect(h.requestsOf('check-repo-readiness')).toEqual([]);
        });
    });

    describe('a repository whose full name cannot be split', () => {
        const ODD = {
            ...REPO,
            id: 'repo-odd',
            name: 'odd',
            fullName: 'noslash',
        } as GitHubRepoItem;

        it('never reaches a view offering Check Again', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: false, codeStatus: 404 });

            await h.renderInline(stateWith({ selectedRepo: ODD }, [ODD, OTHER]), 'code-sync');

            expect(screen.queryByRole('button', { name: /check again/i })).not.toBeInTheDocument();
        });
    });

    describe('a readiness response that is not an object', () => {
        it('is treated as undetermined rather than crashing the step', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'check-repo-readiness') return undefined;
                return { success: true, isInstalled: true, codeStatus: 200 };
            });

            await h.renderInline(stateWith({ selectedRepo: REPO }));

            // Undetermined still lets the Code Sync probe have its turn.
            await waitFor(() => {
                expect(h.requestsOf('check-github-app')).toHaveLength(1);
            });
        });
    });
});
