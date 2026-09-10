/**
 * ImportDatapackModal — job lifecycle: reset, pending states, records across
 * sessions, watching, outcomes, and automatic credential setup.
 *
 * Split from the form/configuration suite at the 500-line ceiling; the shared
 * preamble (mocks + SUT) lives in ImportDatapackModal.testUtils.
 */

import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    press,
    mockRequest,
    renderModal,
    resetModalMocks,
    awaitForm,
    defaultResponse,
} from './ImportDatapackModal.testUtils';

const startButton = () => screen.getByRole('button', { name: /start import/i });

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
        // "Remove data…", not "Reset…": a project RESET restores the pack, so the
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

        it('names the instance the data will be removed from, and says there is no undo', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());

            expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();
            // The instance id exactly ('inst', per the shared fixture). This was
            // /inst/, which also matches the word "instance" in the prose — so it
            // would have passed with the id absent, the one thing it checks.
            expect(screen.getByText('inst')).toBeInTheDocument();
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

            await screen.findByText(/cannot be undone/i);
            expect(screen.getByText(/1 data type\b/)).toBeInTheDocument();
            expect(screen.queryByText(/stock_source_links|b2b_shared/)).not.toBeInTheDocument();
        });

        it('can be backed out of without removing anything', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());
            await press(screen.getByRole('button', { name: /keep the data/i }));

            expect(resetCalls()).toHaveLength(0);
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument();
        });

        // The handler refuses anything without `confirm: true`, so the armed press
        // is the ONLY thing that may send it.
        it('sends confirm with the same body a start would, only from the confirmation', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(resetButton());
            await press(screen.getByRole('button', { name: /remove the data/i }));

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
     * their label and disable (ManageApisModal's 'Applying…' pattern), and the
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

        it('shows a busy Dry run button while the check is in flight', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(screen.getByRole('button', { name: /^dry run$/i }));

            expect(await screen.findByRole('button', { name: /checking…/i })).toBeInTheDocument();
        });

        it('shows a spinner while an import is starting', async () => {
            neverResolve('start-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(startButton());

            expect(await screen.findByText(/starting import/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /starting…/i })).toBeInTheDocument();
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

        it('disables every action while one is in flight', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(screen.getByRole('button', { name: /^dry run$/i }));
            await screen.findByRole('button', { name: /checking…/i });

            expect(screen.getByRole('button', { name: /start import/i })).toHaveAttribute(
                'aria-disabled',
                'true'
            );
            expect(screen.getByRole('button', { name: /^remove data/i })).toHaveAttribute(
                'aria-disabled',
                'true'
            );
        });
    });

    /**
     * A record OUTLIVES the modal on purpose — the watch is detached, so
     * reopening must pick a RUNNING job back up. But a TERMINAL record is
     * history, and history must not greet a fresh modal wearing a success icon:
     * live verification opened the modal to a full-size "Import finished" for an
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
        function refuseNeedingCredentials() {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? {
                          success: false,
                          error: 'ACCS imports need an Adobe OAuth Server-to-Server client id and secret. Add them before importing.',
                          code: 'INVALID_OPERATION',
                          data: { needsAccsCredentials: true },
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
            refuseNeedingCredentials();
            await dryRun();

            expect(await screen.findByText(/dry run failed/i)).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
        });

        it('offers Back, which returns to the form with selections intact', async () => {
            refuseNeedingCredentials();
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

        it('puts the contextual action in the FOOTER of the credentials refusal', async () => {
            refuseNeedingCredentials();
            await dryRun();
            await screen.findByText(/dry run failed/i);

            expect(
                screen.getByRole('button', { name: /set up credentials automatically/i })
            ).toBeInTheDocument();
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
            await press(screen.getByRole('button', { name: /remove the data/i }));

            expect(await screen.findByText(/removal finished/i)).toBeInTheDocument();
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

            expect(await screen.findByText(/continues on the server/i)).toBeInTheDocument();
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

    /**
     * The needs-accs-credentials refusal offers console-free provisioning — the
     * loop proven live 2026-08-13. The offer keys off the refusal's DATA flag,
     * not its message string, and the pair lands in the project's config where a
     * hand-pasted one would, so the user just runs the dry run again.
     */
    describe('automatic credential setup', () => {
        function refuseNeedingCredentials() {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? {
                          success: false,
                          error: 'ACCS imports need an Adobe OAuth Server-to-Server client id and secret. Add them before importing.',
                          code: 'INVALID_OPERATION',
                          data: { needsAccsCredentials: true },
                      }
                    : defaultResponse(type)
            );
        }

        async function refuse() {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^dry run$/i }));
        }

        it('offers automatic setup on the credential refusal', async () => {
            refuseNeedingCredentials();
            await refuse();

            expect(
                await screen.findByRole('button', { name: /set up credentials automatically/i })
            ).toBeInTheDocument();
        });

        it('does NOT offer it on other refusals', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? {
                          success: false,
                          error: 'The Data Installer is turned off.',
                          code: 'INVALID_OPERATION',
                      }
                    : defaultResponse(type)
            );
            await refuse();

            await screen.findByText(/turned off/i);
            expect(
                screen.queryByRole('button', { name: /set up credentials automatically/i })
            ).not.toBeInTheDocument();
        });

        // Measured live 2026-08-14: the loop takes ~50s (the Console subscribe
        // PUT alone took 46s), and the DEFAULT request timeout gave up first —
        // the modal showed "Request timeout" over an operation that completed
        // and saved. A false failure over a real success.
        it('gives the provisioning request a timeout sized to the measured loop', async () => {
            refuseNeedingCredentials();
            await refuse();
            await screen.findByText(/dry run failed/i);

            await press(screen.getByRole('button', { name: /set up credentials automatically/i }));

            await waitFor(() => {
                const call = mockRequest.mock.calls.find(
                    (entry) => entry[0] === 'provision-accs-credentials'
                );
                expect(call?.[2]).toBeGreaterThanOrEqual(180_000);
            });
        });

        it('runs the provisioning handler on press', async () => {
            refuseNeedingCredentials();
            await refuse();

            await press(
                await screen.findByRole('button', { name: /set up credentials automatically/i })
            );

            await waitFor(() =>
                expect(
                    mockRequest.mock.calls.some((call) => call[0] === 'provision-accs-credentials')
                ).toBe(true)
            );
        });

        it('says what to do next once provisioning succeeds', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'validate-datapack-import') {
                    return {
                        success: false,
                        error: 'needs credentials',
                        data: { needsAccsCredentials: true },
                    };
                }
                if (type === 'provision-accs-credentials') {
                    return { success: true };
                }
                return defaultResponse(type);
            });
            await refuse();

            await press(
                await screen.findByRole('button', { name: /set up credentials automatically/i })
            );

            expect(await screen.findByText(/credentials configured/i)).toBeInTheDocument();
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
         * raw state ("categories: success · products: processing"), a line that
         * grew as the job ran and answered neither "how far along" nor "what is
         * happening now". It is a count and the type in hand instead.
         */
        it('shows a count and the type being worked on while running', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories', 'products'],
                outcome: 'watching',
                perType: { categories: 'success', products: 'processing' },
            });
            renderModal();

            expect(await screen.findByText(/Importing Products… 1 of 2 done/i)).toBeInTheDocument();
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

            await screen.findByRole('button', { name: /stop watching/i });
            expect(screen.queryByText(/of 2 done/i)).not.toBeInTheDocument();
        });

        // There is NO cancel endpoint. Both strings are pinned, because softening
        // either turns "we stopped looking" into "we cancelled your import".
        it('offers Stop watching, and says the job continues on the server', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories'],
                outcome: 'watching',
                perType: {},
            });
            renderModal();

            expect(
                await screen.findByRole('button', { name: /stop watching/i })
            ).toBeInTheDocument();
            expect(screen.getByText(/continues on the server/i)).toBeInTheDocument();
        });

        it('never offers a Cancel affordance — there is no such endpoint', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories'],
                outcome: 'watching',
                perType: {},
            });
            renderModal();

            await screen.findByRole('button', { name: /stop watching/i });

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
         * A clean success says so once and shows the check.
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

            expect(await screen.findByText(/All 2 data types succeeded/i)).toBeInTheDocument();
            expect(screen.queryByText(/categories: success/i)).not.toBeInTheDocument();
        });

        /**
         * A partial run is the opposite case: the successes are the noise and the
         * failures are the answer, so only the troubled types are named.
         */
        it('names only the types that need attention when the run is partial', async () => {
            finished('partial', { categories: 'success', products: 'error' });
            await startAJob();

            expect(await screen.findByText(/products: error/i)).toBeInTheDocument();
            expect(screen.queryByText(/categories: success/i)).not.toBeInTheDocument();
        });

        // Superseded contract, recorded: an earlier version restored the form
        // BENEATH a compact success card. Live use showed coexisting fragments
        // are exactly what made outcomes unreadable, so success is now a result
        // view like everything else, and Back is the explicit way home.
        it('shows a terminal success as a result view; Back restores the form', async () => {
            finished('success', { categories: 'success' });
            await startAJob();

            expect(await screen.findByText(/import finished/i)).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();

            await press(screen.getByRole('button', { name: /back/i }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument();
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
            await press(screen.getByRole('button', { name: /remove the data/i }));

            expect(await screen.findByText(/removal finished/i)).toBeInTheDocument();
            expect(screen.queryByText(/import finished/i)).not.toBeInTheDocument();
        });

        it('reports success', async () => {
            finished('success', { categories: 'success' });
            await startAJob();

            expect(await screen.findByText(/import finished/i)).toBeInTheDocument();
        });

        // Not a failure: a re-run legitimately skips items that already exist.
        it('reports partial as its own outcome, not as an error', async () => {
            finished('partial', { categories: 'success', products: 'error' });
            await startAJob();

            expect(await screen.findByText(/some data types/i)).toBeInTheDocument();
        });

        it('explains a never-registered job with the service reason', async () => {
            finished(
                'never-registered',
                {},
                { reason: 'Invalid input. Must provide one of: (datapack_name)' }
            );
            await startAJob();

            expect(await screen.findByText(/never started/i)).toBeInTheDocument();
            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });
});
