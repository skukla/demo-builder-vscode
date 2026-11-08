/**
 * ImportDatapackModal — job lifecycle: reset, pending states, records across
 * sessions, watching, outcomes, and automatic credential setup.
 *
 * Split from the form/configuration suite at the 500-line ceiling; the shared
 * preamble (mocks + SUT) lives in ImportDatapackModal.testUtils.
 */

import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { settle } from '../../../../helpers/reactSettle';
import {
    press,
    mockRequest,
    renderModal,
    resetModalMocks,
    awaitForm,
    defaultResponse,
} from './ImportDatapackModal.testUtils';

const startButton = () => screen.getByRole('button', { name: /^import$/i });

/**
 * An activation id for the write calls, but the real target for the target call.
 *
 * The modal derives its Commerce instance from the open project, so a fallback
 * that answers EVERY non-status request with an activation id leaves it with no
 * instance — and the modal then shows its no-instance notice instead of the job.
 */
async function activationOrTarget(type: string): Promise<unknown> {
    if (type === 'get-datapack-import-target') {
        return defaultResponse(type);
    }
    return { success: true, data: { activationId: 'act-1' } };
}

describe('ImportDatapackModal — job lifecycle', () => {
    beforeEach(() => {
        resetModalMocks();
    });

    describe('resetting', () => {
        // "Remove data", not "Reset…": a project RESET restores the pack, so the
        // same word meant opposite things one menu apart.
        const resetButton = () => screen.getByRole('button', { name: /^remove data/i });
        const resetCalls = () => mockRequest.mock.calls.filter((c) => c[0] === 'reset-datapack');

        it('is offered once an instance and types are chosen', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            expect(resetButton()).not.toHaveAttribute('aria-disabled', 'true');
        });

        it('needs the same instance and types a start does', async () => {
            renderModal();
            await awaitForm();

            expect(resetButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('sends NOTHING on the first press — it arms a confirmation', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());

            expect(resetCalls()).toHaveLength(0);
        });

        // The question is the title and names where; the warning is a word in the sentence
        // (dialog design rules, owner 2026-10-31: one removal nearly went to the real website).
        it('asks with where the data will be removed from in the title, and says it is permanent', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());

            // With no websites discovered (this fixture), the instance id names the store.
            expect(await screen.findByRole('heading', { name: 'Remove from inst?' })).toBeInTheDocument();
            expect(screen.getByText(/^Permanently deletes Bodea’s categories\.$/)).toBeInTheDocument();
        });

        /**
         * The chosen types are listed, as the LABELS they were chosen by.
         *
         * This confirmation printed raw service codes — fourteen of them, joined
         * by commas into one sentence with a 22-character tenant id at the end.
         * The list is what a user checks before an irreversible press, so it
         * reads like the checkboxes it came from.
         */
        it('lists the chosen data types by their labels, not their codes', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());

            expect(await screen.findByText(/^Permanently deletes Bodea’s categories\.$/)).toBeInTheDocument();
            expect(screen.queryByText(/stock_source_links|b2b_shared/)).not.toBeInTheDocument();
        });

        it('can be backed out of without removing anything', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());
            await press(screen.getByRole('button', { name: 'Cancel' }));

            expect(resetCalls()).toHaveLength(0);
            expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument();
        });

        // The handler refuses anything without `confirm: true`, so the armed press
        // is the ONLY thing that may send it.
        it('sends confirm with the same body a start would, only from the confirmation', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());
            await press(screen.getByRole('button', { name: /^remove$/i }));

            await waitFor(() => expect(resetCalls()).toHaveLength(1));
            expect(resetCalls()[0][1]).toMatchObject({
                datapackName: 'bodea',
                version: 'main',
                commerceInstance: 'inst',
                dataTypes: ['categories'],
                confirm: true,
            });
        });
    });

    /**
     * In-flight states use the HOUSE vocabulary, not silence: busy buttons swap
     * their label and disable (ManageApisModal's 'Applying' pattern), and the
     * body shows a LoadingDisplay while a start/reset is in flight. Both exist
     * because the first live dry run gave the user NO feedback of any kind
     * between the press and the verdict.
     */
    describe('pending states', () => {
        /** A request for `type` that never resolves, so loading stays true. */
        function neverResolve(type: string) {
            mockRequest.mockImplementation((t: string) =>
                t === type ? new Promise(() => undefined) : defaultResponse(t)
            );
        }

        // The dialog is the wait: nothing but the spinner and the way out (owner, 2026-11-01).
        it('offers no actions while the check is in flight', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(screen.getByRole('button', { name: /^dry run$/i }));

            await screen.findByText(/checking with the service/i);
            expect(screen.queryByRole('button', { name: /^dry run$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^checking$/i })).not.toBeInTheDocument();
        });

        // The rows show at once, Preparing Import spinning: a spinner screen first, then the rows,
        // changed the window's layout under the SC (owner, 2026-11-07).
        it('shows the run’s rows and no actions while an import is starting', async () => {
            neverResolve('start-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(startButton());

            expect((await screen.findByText('Preparing Import')).closest('.work-row')).toHaveTextContent('Starting');
            expect(screen.getByText('Categories').closest('.work-row')).toHaveTextContent('Waiting');
            expect(screen.queryByRole('button', { name: /^import$/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
        });

        // All three in-flight states share one visual: the form swaps for a
        // centered spinner (the ManageApisModal/AiCapabilitiesModal treatment).
        // The dry run briefly had its own small inline row under the form.
        it('replaces the form with the spinner while checking, like Start does', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(screen.getByRole('button', { name: /^dry run$/i }));

            expect(await screen.findByText(/checking with the service/i)).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
        });

        it('leaves only the way out while one is in flight', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(screen.getByRole('button', { name: /^dry run$/i }));
            await screen.findByText(/checking with the service/i);

            expect(screen.queryByRole('button', { name: /^import$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^remove data$/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
        });
    });

    /**
     * A record OUTLIVES the modal on purpose — the watch is detached, so
     * reopening must pick a RUNNING job back up. But a TERMINAL record is
     * history, and history must not greet a fresh modal wearing a success icon:
     * live verification opened the modal to a full-size "Import finished" (now "Imported") for an
     * import pressed minutes earlier.
     */
    /**
     * The modal shows ONE view at a time — form, busy, confirm-reset, watching,
     * or result — with the footer narrating each. The previous shape let form,
     * verdicts, failures and notices coexist as conditional fragments, and that
     * produced a live bug nobody could localize: a bare error icon with its
     * words lost somewhere in the pile. A state machine makes that class
     * unwritable. Every outcome is a RESULT view with an explicit Back.
     */
    describe('the result view', () => {
        function refuseDryRun() {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? {
                          success: false,
                          error: 'This project has no Adobe Commerce backend, so there is nothing to import into.',
                          code: 'INVALID_OPERATION',
                      }
                    : defaultResponse(type)
            );
        }

        async function dryRun() {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^dry run$/i }));
        }

        it('replaces the form — one view at a time, never a pile', async () => {
            refuseDryRun();
            await dryRun();

            expect(await screen.findByText(/dry run failed/i)).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
        });

        it('offers Back, which returns to the form with selections intact', async () => {
            refuseDryRun();
            await dryRun();
            await screen.findByText(/dry run failed/i);

            await press(screen.getByRole('button', { name: /back/i }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
            expect(screen.queryByText(/dry run failed/i)).not.toBeInTheDocument();
        });

        it('a passed dry run is a result view with Back too', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? { success: true, data: { valid: true } }
                    : defaultResponse(type)
            );
            await dryRun();

            expect(await screen.findByText(/dry run passed/i)).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
        });

        // The job is accepted before its first status read answers. Nothing to show yet is still a
        // wait: this fell through to the import form, at the form's width, mid-removal (2026-11-02).
        it('stays on the wait, not the form, until the accepted job\'s status answers', async () => {
            let statusCalls = 0;
            let answerStatus: (value: unknown) => void = () => undefined;
            mockRequest.mockImplementation(async (type: string) => {
                if (type !== 'get-datapack-import-status') return activationOrTarget(type);
                statusCalls += 1;
                if (statusCalls === 1) return { success: true, data: null };
                return new Promise((resolve) => {
                    answerStatus = resolve;
                });
            });
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^remove data/i }));
            await press(screen.getByRole('button', { name: /^remove$/i }));

            await waitFor(() => expect(statusCalls).toBe(2));
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Remove Bodea' })).toBeInTheDocument();
            expect(screen.getByText('Starting removal')).toBeInTheDocument();

            answerStatus({
                success: true,
                data: {
                    activationId: 'act-1',
                    dataTypes: ['categories'],
                    outcome: 'watching',
                    perType: {},
                    operation: 'reset',
                },
            });
            expect((await settle(), screen.getByRole('button', { name: 'Run in Background' }))).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
        });

        it('CONTROL: still lets go of the wait if the status read finds no record', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status' ? { success: true, data: null } : activationOrTarget(type),
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^remove data/i }));
            await press(screen.getByRole('button', { name: /^remove$/i }));

            expect(await screen.findByRole('checkbox', { name: 'Categories' })).toBeInTheDocument();
        });

        it('a terminal outcome is a result view with Back', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'get-datapack-import-status') {
                    return {
                        success: true,
                        data: {
                            activationId: 'act-1',
                            dataTypes: ['categories'],
                            outcome: 'success',
                            perType: { categories: 'success' },
                            operation: 'reset',
                        },
                    };
                }
                return activationOrTarget(type);
            });
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^remove data/i }));
            await press(screen.getByRole('button', { name: /^remove$/i }));

            expect(await screen.findByRole('heading', { name: 'Removed Bodea' })).toBeInTheDocument();
            await press(screen.getByRole('button', { name: /back/i }));
            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeInTheDocument();
        });
    });

    describe('a fresh modal', () => {
        it('resumes a RUNNING job from a previous session', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? {
                          success: true,
                          data: {
                              activationId: 'old',
                              dataTypes: ['categories'],
                              outcome: 'watching',
                              perType: {},
                          },
                      }
                    : defaultResponse(type)
            );
            renderModal();

            expect((await settle(), screen.getByRole('button', { name: 'Run in Background' }))).toBeInTheDocument();
        });

        it('does NOT show a finished record from a previous session', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? {
                          success: true,
                          data: {
                              activationId: 'old',
                              dataTypes: ['categories'],
                              outcome: 'success',
                              perType: { categories: 'success' },
                          },
                      }
                    : defaultResponse(type)
            );
            renderModal();

            // Polling and REQUIRING the timeout: a plain queryBy cannot fail
            // here, because the record needs several settle rounds to render —
            // measured: two flush-based versions of this test passed against
            // code that provably showed the stale outcome. findByText gives the
            // outcome every chance to appear; only its absence-after-polling is
            // a statement about behaviour.
            await expect(
                screen.findByText(/import finished/i, undefined, { timeout: 1500 })
            ).rejects.toThrow();
            // The form is what greets a fresh modal.
            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeInTheDocument();
        });
    });

    describe('watching', () => {
        function withStatus(record: unknown) {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'get-datapack-import-target') {
                    // The instance is derived now; without it the modal shows
                    // its no-instance notice instead of the job.
                    return defaultResponse(type);
                }
                return type === 'get-datapack-import-status'
                    ? { success: true, data: record }
                    : { success: true, data: { activationId: 'act-1' } };
            });
        }

        /**
         * Progress rides in LoadingDisplay's subMessage slot — the house
         * component's own place for it, not a parallel row list.
         *
         * The WORDING changed deliberately. This used to dump every type and its
         * raw state ("categories: success, products: processing"), a line that
         * grew as the job ran and answered neither "how far along" nor "what is
         * happening now". It is a count and the type in hand instead, in the words
         * every datapack surface uses (progress vocabulary slice 5, 2026-10-16).
         */
        it('shows each type where it stands, on its row, while running', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories', 'products'],
                outcome: 'watching',
                perType: { categories: 'success', products: 'processing' },
            });
            renderModal();

            expect(await screen.findByText('Installing')).toBeInTheDocument();
            expect(screen.getByText('Categories').closest('.work-row')).toHaveTextContent('Done');
        });

        /** Before any type reports there is no honest count, so the line stays away. */
        it('says nothing about progress before the first poll lands', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories', 'products'],
                outcome: 'watching',
                perType: {},
            });
            renderModal();

            await settle();
            expect(screen.getByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
            // The two types and Finishing Import; Preparing Import is under way.
            expect(screen.getAllByText('Waiting')).toHaveLength(3);
        });

        // There is NO cancel endpoint. Closing says "Run in Background", never "Cancel": the
        // footer is what says the job carries on while it is watched (dialog design rules: no hint
        // repeating a button). A Close beside it did the same thing (owner, 2026-11-07).
        it('offers Run in Background, and no Close beside it', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories'],
                outcome: 'watching',
                perType: {},
            });
            renderModal();
            await settle();

            expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
        });

        it('never offers a Cancel affordance — there is no such endpoint', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories'],
                outcome: 'watching',
                perType: {},
            });
            renderModal();

            await settle();
            expect(screen.getByRole('button', { name: 'Run in Background' })).toBeInTheDocument();

            expect(
                screen.queryByRole('button', { name: /cancel import/i })
            ).not.toBeInTheDocument();
        });
    });

    describe('outcomes', () => {
        function finished(outcome: string, perType: Record<string, string>, extra: object = {}) {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? {
                          success: true,
                          data: {
                              activationId: 'act-1',
                              dataTypes: Object.keys(perType),
                              outcome,
                              perType,
                              ...extra,
                          },
                      }
                    : await activationOrTarget(type)
            );
        }

        /** Outcomes show for THIS session's job, so start one. */
        async function startAJob() {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(startButton());
        }

        /**
         * A clean success says so once, in the dialog's title, and lists nothing under it
         * (dialog design rules, owner 2026-10-31).
         *
         * This used to list every type with "success" beside it. Measured against
         * the live modal, a fourteen-type pack overran StatusDisplay's fixed
         * 350px box, which centres its content and so clipped BOTH ends — the
         * tick off the top and the last type off the bottom. The check had been
         * there all along, pushed out of frame by detail that only repeated the
         * title in longhand.
         */
        it('summarises a clean success instead of listing every type', async () => {
            finished('success', { categories: 'success', products: 'success' });
            await startAJob();

            expect(await screen.findByRole('heading', { name: 'Datapack Imported' })).toBeInTheDocument();
            expect(screen.queryByText(/categories: success/i)).not.toBeInTheDocument();
        });

        /**
         * A partial run is the opposite case: the successes are the noise and the
         * failures are the answer, so only the troubled types are named.
         */
        it('keeps the rows when the run stopped, the reason on the one it stopped on', async () => {
            finished('partial', { categories: 'success', products: 'error' }, { stoppedAt: 'products', reason: 'Commerce did not respond.' });
            await startAJob();

            expect(await screen.findByRole('heading', { name: 'Import Stopped' })).toBeInTheDocument();
            expect(screen.getByText('Commerce did not respond.')).toBeInTheDocument();
            expect(screen.getByText('Categories').closest('.work-row')).toHaveTextContent('Done');
        });

        // Superseded contract, recorded: an earlier version restored the form
        // BENEATH a compact success card. Live use showed coexisting fragments
        // are exactly what made outcomes unreadable, so success is now a result
        // view like everything else, and Back is the explicit way home.
        it('shows a terminal success as a result view; Back restores the form', async () => {
            finished('success', { categories: 'success' });
            await startAJob();

            expect(await screen.findByRole('heading', { name: 'Datapack Imported' })).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();

            await press(screen.getByRole('button', { name: /back/i }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
            expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument();
        });

        // The record knows its operation now — a reset must not call itself an
        // import, which it did live.
        it('announces a finished removal as a removal, never as an import', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? {
                          success: true,
                          data: {
                              activationId: 'act-1',
                              dataTypes: ['categories'],
                              outcome: 'success',
                              perType: { categories: 'success' },
                              operation: 'reset',
                          },
                      }
                    : await activationOrTarget(type)
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^remove data/i }));
            await press(screen.getByRole('button', { name: /^remove$/i }));

            expect(await screen.findByRole('heading', { name: 'Removed Bodea' })).toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'Imported Bodea' })).not.toBeInTheDocument();
        });

        it('reports success', async () => {
            finished('success', { categories: 'success' });
            await startAJob();

            expect(await screen.findByRole('heading', { name: 'Datapack Imported' })).toBeInTheDocument();
        });

        // Retry runs the same import again: what is in sends nothing (owner, 2026-11-07).
        it('offers Retry when the run stopped on a failure a retry can get past, and pressing it starts the import again', async () => {
            finished('partial', { categories: 'success', products: 'error' }, { stoppedAt: 'products', reason: 'Commerce did not respond.', retryable: true });
            await startAJob();
            const starts = () => mockRequest.mock.calls.filter((c) => c[0] === 'start-datapack-import').length;
            const before = starts();

            await press(await screen.findByRole('button', { name: 'Retry' }));

            expect(starts()).toBe(before + 1);
        });

        it('offers Fix with AI when a row has a problem, and pressing it asks the extension to open the AI', async () => {
            finished('success', { categories: 'success', products: 'success' }, { rowNotes: { products: 'The store refused 3.' } });
            await startAJob();

            await press(await screen.findByRole('button', { name: 'Fix with AI' }));

            expect(mockRequest).toHaveBeenCalledWith('fix-datapack-import-with-ai', {});
        });

        it('explains a never-registered job with the service reason', async () => {
            finished(
                'never-registered',
                {},
                { reason: 'Invalid input. Must provide one of: (datapack_name)' }
            );
            await startAJob();

            expect(await screen.findByText(/did not start/i)).toBeInTheDocument();
            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });
});
