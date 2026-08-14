/**
 * ImportDatapackModal tests — where an import is configured, started and watched.
 *
 * The two rules that must not be softened, both pinned here:
 *
 *   **The instance field stays the USER'S.** It is now seeded from the open
 *   project — the ACCS tenant id was always derivable, and `checkCredentials` can
 *   check a value read-only before anything is written — but a seed must never
 *   overwrite what the user typed, and a value that is a guess rather than a
 *   derivation has to say so. Importing into the wrong instance writes sample data
 *   into someone else's live demo, and there is no undo.
 *
 *   **"Stop watching" is not cancel.** There is no cancel endpoint. Stopping ends
 *   the WATCH; the job continues server-side, and the UI has to say so rather than
 *   implying the import was called off. Both strings are pinned.
 *
 * `partial` is displayed as its own outcome, not as a failure — a re-run
 * legitimately skips items that already exist.
 *
 * Spectrum comes from the repo-wide moduleNameMapper mock; `fireEvent` throughout,
 * so the fake-timer `userEvent` contract does not apply.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ImportDatapackModal } from '@/features/data-installer/ui/components/ImportDatapackModal';

const mockRequest = webviewClient.request as jest.Mock;

const DEFAULTS = {
    id: { name: 'bodea', version: 'main' },
    displayName: 'Bodea',
    availableTypes: ['categories', 'products'],
    onClose: jest.fn(),
};

function renderModal(over: Partial<React.ComponentProps<typeof ImportDatapackModal>> = {}) {
    return render(<ImportDatapackModal {...DEFAULTS} {...over} />);
}

// The shared Modal renders its actions as div[role="button"][aria-disabled],
// not <button disabled> — so jest-dom's toBeDisabled() does not apply.
const startButton = () => screen.getByRole('button', { name: /start import/i });
const expectStartDisabled = () => expect(startButton()).toHaveAttribute('aria-disabled', 'true');
const instanceField = () => screen.findByRole('textbox', { name: /commerce instance/i });

/** The payload of the start request, once one has been sent. */
function startPayload(): Record<string, unknown> | undefined {
    return mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import')?.[1];
}

describe('ImportDatapackModal', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({ success: true, data: null });
    });

    /**
     * A bare Spectrum `Dialog` renders NOTHING. `core/ui/Modal` is a `Dialog` with
     * no overlay of its own, so it must sit inside a `DialogContainer` — every
     * working modal in this repo has one somewhere up its tree.
     *
     * This modal shipped without one and never rendered: pressing Import did
     * nothing at all, first in the flyout and then at view level. No test caught it
     * because the suites mock `Modal`, so the body rendered happily into a stub
     * where a real Spectrum Dialog would have swallowed it. Mount-level hosting is
     * invisible to a mocked child by construction, which is why it gets its own
     * assertion rather than being trusted to the other 25 tests.
     */
    it('hosts itself in a DialogContainer — a bare Dialog renders nothing', async () => {
        renderModal();

        expect(await screen.findByTestId('spectrum-dialog-container')).toBeInTheDocument();
    });

    describe('the instance field', () => {
        // The default mock answers `get-datapack-import-target` with null, i.e. a
        // project that implies nothing — so this pins the no-project case, not a
        // "never derive" rule. The derivation has its own describe below.
        it('is empty when there is nothing to derive', async () => {
            renderModal();

            expect(await instanceField()).toHaveValue('');
        });

        it('will not start without one', async () => {
            renderModal();
            await instanceField();

            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            expectStartDisabled();
        });

        it('sends exactly what was typed, untrimmed and unformatted', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: '  Weird Value  ' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ commerceInstance: '  Weird Value  ' }),
            );
        });
    });

    /**
     * The target is DERIVED from the open project, and says so.
     *
     * It used to start empty on the reasoning that a prefilled write target with no
     * undo would be a guess. That held while the derivation was unproven — but the
     * tenant id has been extracted from `ACCS_GRAPHQL_ENDPOINT` all along to build
     * the admin URL, and `checkCredentials` can now check a value read-only before
     * anything is written. So it is offered, sourced, and still editable.
     */
    describe('the derived target', () => {
        function withTarget(target: unknown) {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-target'
                    ? { success: true, data: target }
                    : { success: true, data: null },
            );
        }

        // The id is what gets WRITTEN to and what nobody can read. Leading with the
        // project name gives the user something they can actually confirm, without
        // hiding the value that decides where the data lands.
        it('leads with the project name, keeping the id visible', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi', projectName: 'bodea-demo' });
            renderModal();

            expect(await screen.findByText('bodea-demo')).toBeInTheDocument();
            expect(screen.getByText(/UoGYsHrcxMyeoVd2zUktZi/)).toBeInTheDocument();
        });

        // Hand-typing a 22-character nanoid into a field with no undo is all risk
        // and no benefit when the project already knows the answer.
        it('is read-only once the project has supplied one', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi', projectName: 'bodea-demo' });
            renderModal();
            await screen.findByText('bodea-demo');

            expect(screen.queryByRole('textbox', { name: /commerce instance/i })).not.toBeInTheDocument();
        });

        it('opens an editable field on Change, carrying the derived value in', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi', projectName: 'bodea-demo' });
            renderModal();
            fireEvent.click(await screen.findByRole('button', { name: /change/i }));

            expect(await screen.findByDisplayValue('UoGYsHrcxMyeoVd2zUktZi')).toBeInTheDocument();
        });

        // A project that derives nothing — PaaS with no URL, or misconfigured —
        // must still be importable, so the fallback is the editable field.
        it('falls back to an editable field when nothing is derived', async () => {
            withTarget({});
            renderModal();

            expect(await instanceField()).toBeInTheDocument();
        });

        it('sends the derived instance without the user touching it', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi', projectName: 'bodea-demo' });
            renderModal();
            await screen.findByText('bodea-demo');

            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));
            fireEvent.click(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi' }),
            );
        });

        it('prefills the instance the project implies', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi' });
            renderModal();

            // No projectName, so there is nothing human to lead with and the
            // editable field is what shows — still seeded.
            expect(await screen.findByDisplayValue('UoGYsHrcxMyeoVd2zUktZi')).toBeInTheDocument();
        });

        it('stays empty when the project implies nothing', async () => {
            withTarget({});
            renderModal();

            expect(await instanceField()).toHaveValue('');
        });

        // Derived, not imposed. The whole reason it is a field and not a label.
        it('lets the user replace the derived value', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi' });
            renderModal();
            const field = await screen.findByDisplayValue('UoGYsHrcxMyeoVd2zUktZi');

            fireEvent.change(field, { target: { value: 'something-else' } });

            expect(field).toHaveValue('something-else');
        });
    });

    /** 14 types is the real cardinality — Bodea ships 14 — so bulk selection is not a nicety. */
    describe('selecting every type', () => {
        it('offers a select-all affordance', async () => {
            renderModal();
            await instanceField();

            expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
        });

        it('selects every available type at once', async () => {
            renderModal();
            await instanceField();

            fireEvent.click(screen.getByRole('button', { name: /select all/i }));

            expect(screen.getByRole('checkbox', { name: 'categories' })).toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'products' })).toBeChecked();
        });

        it('turns into a clear-all once everything is selected', async () => {
            renderModal();
            await instanceField();

            fireEvent.click(screen.getByRole('button', { name: /select all/i }));
            fireEvent.click(screen.getByRole('button', { name: /clear all/i }));

            expect(screen.getByRole('checkbox', { name: 'categories' })).not.toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'products' })).not.toBeChecked();
        });

        it('sends every type when all are selected', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });

            fireEvent.click(screen.getByRole('button', { name: /select all/i }));
            fireEvent.click(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ dataTypes: ['categories', 'products'] }),
            );
        });
    });

    describe('data types', () => {
        it('starts with none selected — an import is opt-in per type', async () => {
            renderModal();
            await instanceField();

            expect(screen.getByRole('checkbox', { name: 'categories' })).not.toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'products' })).not.toBeChecked();
        });

        it('will not start with none selected', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });

            expectStartDisabled();
        });

        it('sends only the selected types', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'products' }));

            fireEvent.click(startButton());

            await waitFor(() => expect(startPayload()).toMatchObject({ dataTypes: ['products'] }));
        });
    });

    describe('starting', () => {
        it('sends the datapack identity', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ datapackName: 'bodea', version: 'main' }),
            );
        });

        it('shows the service refusal verbatim when the start is rejected', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'start-datapack-import'
                    ? { success: false, error: 'Invalid input. Must provide one of: (datapack_name)' }
                    : { success: true, data: null },
            );
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(startButton());

            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });

    // "Validate" read as a second operation of equal standing to Import, which
    // invited "must I press this first?" — and the answer is no: the start handler
    // already validates server-side before it starts. "Dry run" names it as a
    // rehearsal of the same request.
    describe('the dry run', () => {
        const validateButton = () => screen.getByRole('button', { name: /^dry run$/i });

        it('is offered beside Start import, with the same requirements', async () => {
            renderModal();
            await instanceField();

            expect(validateButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('checks WITHOUT starting an import', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(validateButton());

            await waitFor(() =>
                expect(
                    mockRequest.mock.calls.some((c) => c[0] === 'validate-datapack-import'),
                ).toBe(true),
            );
            expect(mockRequest.mock.calls.some((c) => c[0] === 'start-datapack-import')).toBe(false);
        });

        it('sends the same body a start would', async () => {
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: '  Weird Value  ' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(validateButton());

            await waitFor(() => {
                const call = mockRequest.mock.calls.find((c) => c[0] === 'validate-datapack-import');
                expect(call?.[1]).toMatchObject({
                    datapackName: 'bodea',
                    version: 'main',
                    commerceInstance: '  Weird Value  ',
                    dataTypes: ['categories'],
                });
            });
        });

        it('says so when the service accepts the request', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? { success: true, data: { valid: true } }
                    : { success: true, data: null },
            );
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(validateButton());

            expect(await screen.findByText(/dry run passed/i)).toBeInTheDocument();
        });

        // The reason IS the payload — it is the service's own wording about why
        // the request will not run, and the only thing this button exists to get.
        it('shows the refusal reason verbatim', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? { success: true, data: { valid: false, reason: 'Invalid input. Must provide one of: (datapack_name)' } }
                    : { success: true, data: null },
            );
            renderModal();
            fireEvent.change(await instanceField(), { target: { value: 'inst' } });
            fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));

            fireEvent.click(validateButton());

            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });

    // Reset is how a project gets REUSED: it removes this datapack's data from the
    // instance so the same demo can be rebuilt. The service has no undo, so the
    // handler is confirm-gated and the UI must arm that confirm explicitly — one
    // press can never remove data.
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
