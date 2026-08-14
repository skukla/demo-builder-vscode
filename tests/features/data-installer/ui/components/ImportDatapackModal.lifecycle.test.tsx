/**
 * ImportDatapackModal — job lifecycle: reset, pending states, records across
 * sessions, watching, outcomes, and automatic credential setup.
 *
 * Split from the form/configuration suite at the 500-line ceiling; the shared
 * preamble (mocks + SUT) lives in ImportDatapackModal.testUtils.
 */

import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    mockRequest,
    renderModal,
    resetModalMocks,
} from './ImportDatapackModal.testUtils';

const startButton = () => screen.getByRole('button', { name: /start import/i });
const instanceField = () => screen.findByRole('textbox', { name: /commerce instance/i });

describe('ImportDatapackModal — job lifecycle', () => {
    beforeEach(() => {
        resetModalMocks();
    });

    describe('resetting', () => {
        const resetButton = () => screen.getByRole('button', { name: /^reset/i });
        const resetCalls = () => mockRequest.mock.calls.filter((c) => c[0] === 'reset-datapack');

        it('is offered once an instance and types are chosen', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            expect(resetButton()).not.toHaveAttribute('aria-disabled', 'true');
        });

        it('needs the same instance and types a start does', async () => {
            renderModal();
            await instanceField();

            expect(resetButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('sends NOTHING on the first press — it arms a confirmation', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(resetButton());

            expect(resetCalls()).toHaveLength(0);
        });

        it('names the instance the data will be removed from, and says there is no undo', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(resetButton());

            expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();
            expect(screen.getByText(/inst/)).toBeInTheDocument();
        });

        it('can be backed out of without removing anything', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(resetButton());
            fireEvent.click(screen.getByRole('button', { name: /keep the data/i }));

            expect(resetCalls()).toHaveLength(0);
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument();
        });

        // The handler refuses anything without `confirm: true`, so the armed press
        // is the ONLY thing that may send it.
        it('sends confirm with the same body a start would, only from the confirmation', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: '  Weird Value  ' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(resetButton());
            fireEvent.click(screen.getByRole('button', { name: /remove the data/i }));

            await waitFor(() => expect(resetCalls()).toHaveLength(1));
            expect(resetCalls()[0][1]).toMatchObject({
                datapackName: 'bodea',
                version: 'main',
                commerceInstance: '  Weird Value  ',
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
                t === type ? new Promise(() => undefined) : Promise.resolve({ success: true, data: null }),
            );
        }

        it('shows a busy Dry run button while the check is in flight', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(screen.getByRole('button', { name: /^dry run$/i }));

            expect(await screen.findByRole('button', { name: /checking…/i })).toBeInTheDocument();
        });

        it('shows a spinner while an import is starting', async () => {
            neverResolve('start-datapack-import');
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(startButton());

            expect(await screen.findByText(/starting import/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /starting…/i })).toBeInTheDocument();
        });

        // All three in-flight states share one visual: the form swaps for a
        // centered spinner (the ManageApisModal/AiCapabilitiesModal treatment).
        // The dry run briefly had its own small inline row under the form.
        it('replaces the form with the spinner while checking, like Start does', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(screen.getByRole('button', { name: /^dry run$/i }));

            expect(await screen.findByText(/checking with the service/i)).toBeInTheDocument();
            expect(screen.queryByRole('textbox', { name: /commerce instance/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'categories' })).not.toBeInTheDocument();
        });

        it('disables every action while one is in flight', async () => {
            neverResolve('validate-datapack-import');
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(screen.getByRole('button', { name: /^dry run$/i }));
            await screen.findByRole('button', { name: /checking…/i });

            expect(screen.getByRole('button', { name: /start import/i })).toHaveAttribute('aria-disabled', 'true');
            expect(screen.getByRole('button', { name: /reset/i })).toHaveAttribute('aria-disabled', 'true');
        });
    });

    /**
     * A record OUTLIVES the modal on purpose — the watch is detached, so
     * reopening must pick a RUNNING job back up. But a TERMINAL record is
     * history, and history must not greet a fresh modal wearing a success icon:
     * live verification opened the modal to a full-size "Import finished" for an
     * import pressed minutes earlier.
     */
    describe('a fresh modal', () => {
        it('resumes a RUNNING job from a previous session', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? { success: true, data: { activationId: 'old', dataTypes: ['categories'], outcome: 'watching', perType: {} } }
                    : { success: true, data: null },
            );
            renderModal();

            expect(await screen.findByText(/continues on the server/i)).toBeInTheDocument();
        });

        it('does NOT show a finished record from a previous session', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? { success: true, data: { activationId: 'old', dataTypes: ['categories'], outcome: 'success', perType: { categories: 'success' } } }
                    : { success: true, data: null },
            );
            renderModal();

            // Polling and REQUIRING the timeout: a plain queryBy cannot fail
            // here, because the record needs several settle rounds to render —
            // measured: two flush-based versions of this test passed against
            // code that provably showed the stale outcome. findByText gives the
            // outcome every chance to appear; only its absence-after-polling is
            // a statement about behaviour.
            await expect(
                screen.findByText(/import finished/i, undefined, { timeout: 1500 }),
            ).rejects.toThrow();
            // The form is what greets a fresh modal.
            expect(screen.getByRole('textbox', { name: /commerce instance/i })).toBeInTheDocument();
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
                    : { success: true, data: null },
            );
        }

        async function refuse() {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));
            fireEvent.click(screen.getByRole('button', { name: /^dry run$/i }));
        }

        it('offers automatic setup on the credential refusal', async () => {
            refuseNeedingCredentials();
            await refuse();

            expect(
                await screen.findByRole('button', { name: /set up credentials automatically/i }),
            ).toBeInTheDocument();
        });

        it('does NOT offer it on other refusals', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? { success: false, error: 'The Data Installer is turned off.', code: 'INVALID_OPERATION' }
                    : { success: true, data: null },
            );
            await refuse();

            await screen.findByText(/turned off/i);
            expect(
                screen.queryByRole('button', { name: /set up credentials automatically/i }),
            ).not.toBeInTheDocument();
        });

        it('runs the provisioning handler on press', async () => {
            refuseNeedingCredentials();
            await refuse();

            fireEvent.click(
                await screen.findByRole('button', { name: /set up credentials automatically/i }),
            );

            await waitFor(() =>
                expect(
                    mockRequest.mock.calls.some((call) => call[0] === 'provision-accs-credentials'),
                ).toBe(true),
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
                return { success: true, data: null };
            });
            await refuse();

            fireEvent.click(
                await screen.findByRole('button', { name: /set up credentials automatically/i }),
            );

            expect(await screen.findByText(/credentials configured/i)).toBeInTheDocument();
        });
    });

    describe('watching', () => {
        function withStatus(record: unknown) {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? { success: true, data: record }
                    : { success: true, data: { activationId: 'act-1' } },
            );
        }

        // Per-type progress rides in LoadingDisplay's subMessage slot — the
        // house component's own place for it, not a parallel row list.
        it('shows per-type progress while running', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories', 'products'],
                outcome: 'watching',
                perType: { categories: 'success', products: 'processing' },
            });
            renderModal();

            expect(await screen.findByText(/categories: success/i)).toBeInTheDocument();
            expect(screen.getByText(/products: processing/i)).toBeInTheDocument();
        });

        // There is NO cancel endpoint. Both strings are pinned, because softening
        // either turns "we stopped looking" into "we cancelled your import".
        it('offers Stop watching, and says the job continues on the server', async () => {
            withStatus({ activationId: 'act-1', dataTypes: ['categories'], outcome: 'watching', perType: {} });
            renderModal();

            expect(await screen.findByRole('button', { name: /stop watching/i })).toBeInTheDocument();
            expect(screen.getByText(/continues on the server/i)).toBeInTheDocument();
        });

        it('never offers a Cancel affordance — there is no such endpoint', async () => {
            withStatus({ activationId: 'act-1', dataTypes: ['categories'], outcome: 'watching', perType: {} });
            renderModal();

            await screen.findByRole('button', { name: /stop watching/i });

            expect(screen.queryByRole('button', { name: /cancel import/i })).not.toBeInTheDocument();
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
                    : { success: true, data: { activationId: 'act-1' } },
            );
        }

        /** Outcomes show for THIS session's job, so start one. */
        async function startAJob() {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));
            fireEvent.click(startButton());
        }

        it('shows the per-type result in the message slot, not a row list', async () => {
            finished('success', { categories: 'success' });
            await startAJob();

            expect(await screen.findByText(/categories: success/i)).toBeInTheDocument();
        });

        // Success gets OUT OF THE WAY; problems stand in it. A terminal success
        // is a midpoint in the reuse flow (reset → pick types → import), so it
        // renders as a compact StatusCard with the form restored beneath it —
        // live review found a full-bleed success block displacing the form the
        // user needed next.
        it('restores the form beneath a terminal success', async () => {
            finished('success', { categories: 'success' });
            await startAJob();

            expect(await screen.findByText(/import finished/i)).toBeInTheDocument();
            expect(screen.getByRole('checkbox', { name: 'categories' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument();
        });

        // The record knows its operation now — a reset must not call itself an
        // import, which it did live.
        it('announces a finished reset as a reset', async () => {
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
                    : { success: true, data: { activationId: 'act-1' } },
            );
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));
            fireEvent.click(screen.getByRole('button', { name: /^reset/i }));
            fireEvent.click(screen.getByRole('button', { name: /remove the data/i }));

            expect(await screen.findByText(/reset finished/i)).toBeInTheDocument();
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
            finished('never-registered', {}, { reason: 'Invalid input. Must provide one of: (datapack_name)' });
            await startAJob();

            expect(await screen.findByText(/never started/i)).toBeInTheDocument();
            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });
});
