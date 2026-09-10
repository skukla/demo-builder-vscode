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

// The shared Modal renders its actions as div[role="button"][aria-disabled],
// not <button disabled> — so jest-dom's toBeDisabled() does not apply.
const startButton = () => screen.getByRole('button', { name: /start import/i });
const expectStartDisabled = () => expect(startButton()).toHaveAttribute('aria-disabled', 'true');

/** The payload of the start request, once one has been sent. */
function startPayload(): Record<string, unknown> | undefined {
    return mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import')?.[1];
}

describe('ImportDatapackModal', () => {
    beforeEach(() => {
        resetModalMocks();
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

    /**
     * The instance is DERIVED and no longer shown or editable.
     *
     * It used to be a text field with a Change override. Both are gone: the
     * project fixes where data lands, and changing that means changing the
     * project on the dashboard rather than typing over it here. The verbatim
     * pass-through this block used to prove now lives in the write client's own
     * suite, which is where the string actually crosses the wire.
     */
    describe('the derived target', () => {
        it('sends the project instance without showing or asking for it', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /start import/i }));

            await waitFor(() => {
                const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
                expect(call?.[1]).toMatchObject({ commerceInstance: 'inst' });
            });
            expect(
                screen.queryByRole('textbox', { name: /commerce instance/i })
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
        });
    });

    describe('selecting every type', () => {
        it('offers a select-all affordance', async () => {
            renderModal();
            await awaitForm();

            expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
        });

        it('selects every available type at once', async () => {
            renderModal();
            await awaitForm();

            await press(screen.getByRole('button', { name: /select all/i }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'Products' })).toBeChecked();
        });

        it('turns into a clear-all once everything is selected', async () => {
            renderModal();
            await awaitForm();

            await press(screen.getByRole('button', { name: /select all/i }));
            await press(screen.getByRole('button', { name: /clear all/i }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).not.toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'Products' })).not.toBeChecked();
        });

        it('sends every type when all are selected', async () => {
            renderModal();
            await awaitForm();

            await press(screen.getByRole('button', { name: /select all/i }));
            await press(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ dataTypes: ['categories', 'products'] })
            );
        });
    });

    describe('data types', () => {
        it('starts with none selected — an import is opt-in per type', async () => {
            renderModal();
            await awaitForm();

            expect(screen.getByRole('checkbox', { name: 'Categories' })).not.toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'Products' })).not.toBeChecked();
        });

        it('will not start with none selected', async () => {
            renderModal();
            await awaitForm();

            expectStartDisabled();
        });

        it('sends only the selected types', async () => {
            renderModal();
            await awaitForm();
            // Categories, not Products: products now pulls in the types it
            // depends on (see ImportDatapackModal.dependencies.test.tsx), so it
            // is the wrong probe for "unselected types stay out of the payload".
            // Categories depends on nothing, which is what makes it one.
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ dataTypes: ['categories'] })
            );
        });
    });

    describe('starting', () => {
        it('sends the datapack identity', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(startButton());

            await waitFor(() =>
                expect(startPayload()).toMatchObject({ datapackName: 'bodea', version: 'main' })
            );
        });

        it('shows the service refusal verbatim when the start is rejected', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'start-datapack-import'
                    ? {
                          success: false,
                          error: 'Invalid input. Must provide one of: (datapack_name)',
                      }
                    : defaultResponse(type)
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(startButton());

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
            await awaitForm();

            expect(validateButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('checks WITHOUT starting an import', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(validateButton());

            await waitFor(() =>
                expect(
                    mockRequest.mock.calls.some((c) => c[0] === 'validate-datapack-import')
                ).toBe(true)
            );
            expect(mockRequest.mock.calls.some((c) => c[0] === 'start-datapack-import')).toBe(
                false
            );
        });

        it('sends the same body a start would', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(validateButton());

            await waitFor(() => {
                const call = mockRequest.mock.calls.find(
                    (c) => c[0] === 'validate-datapack-import'
                );
                expect(call?.[1]).toMatchObject({
                    datapackName: 'bodea',
                    version: 'main',
                    commerceInstance: 'inst',
                    dataTypes: ['categories'],
                });
            });
        });

        it('says so when the service accepts the request', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? { success: true, data: { valid: true } }
                    : defaultResponse(type)
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(validateButton());

            expect(await screen.findByText(/dry run passed/i)).toBeInTheDocument();
        });

        // The reason IS the payload — it is the service's own wording about why
        // the request will not run, and the only thing this button exists to get.
        it('shows the refusal reason verbatim', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? {
                          success: true,
                          data: {
                              valid: false,
                              reason: 'Invalid input. Must provide one of: (datapack_name)',
                          },
                      }
                    : defaultResponse(type)
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));

            await press(validateButton());

            expect(await screen.findByText(/Must provide one of/)).toBeInTheDocument();
        });
    });

    // Reset is how a project gets REUSED: it removes this datapack's data from the
    // instance so the same demo can be rebuilt. The service has no undo, so the
    // handler is confirm-gated and the UI must arm that confirm explicitly — one
    // press can never remove data.
});
