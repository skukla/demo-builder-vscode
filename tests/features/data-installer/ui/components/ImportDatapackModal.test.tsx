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

        it('prefills the instance the project implies', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi', source: 'accs', verified: true });
            renderModal();

            // findByDisplayValue, not findByRole: the element exists immediately
            // and the VALUE arrives with the async target response.
            expect(await screen.findByDisplayValue('UoGYsHrcxMyeoVd2zUktZi')).toBeInTheDocument();
        });

        it('stays empty when the project implies nothing', async () => {
            withTarget({});
            renderModal();

            expect(await instanceField()).toHaveValue('');
        });

        // Derived, not imposed. The whole reason it is a field and not a label.
        it('lets the user replace the derived value', async () => {
            withTarget({ instance: 'UoGYsHrcxMyeoVd2zUktZi', source: 'accs', verified: true });
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

    describe('watching', () => {
        function withStatus(record: unknown) {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-status'
                    ? { success: true, data: record }
                    : { success: true, data: { activationId: 'act-1' } },
            );
        }

        it('shows per-type progress while running', async () => {
            withStatus({
                activationId: 'act-1',
                dataTypes: ['categories', 'products'],
                outcome: 'watching',
                perType: { categories: 'success', products: 'processing' },
            });
            renderModal();

            expect(await screen.findByText('categories')).toBeInTheDocument();
            expect(await screen.findByText(/processing/i)).toBeInTheDocument();
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

        it('reports success', async () => {
            finished('success', { categories: 'success' });
            renderModal();

            expect(await screen.findByText(/import finished/i)).toBeInTheDocument();
        });

        // Not a failure: a re-run legitimately skips items that already exist.
        it('reports partial as its own outcome, not as an error', async () => {
            finished('partial', { categories: 'success', products: 'error' });
            renderModal();

            expect(await screen.findByText(/some data types/i)).toBeInTheDocument();
        });

        it('explains a never-registered job with the service reason', async () => {
            finished('never-registered', {}, { reason: 'Invalid input. Must provide one of: (datapack_name)' });
            renderModal();

            expect(await screen.findByText(/never started/i)).toBeInTheDocument();
            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });
});
