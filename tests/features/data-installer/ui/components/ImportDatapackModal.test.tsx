/**
 * ImportDatapackModal tests — where an import is configured, started and watched.
 *
 * The two rules that must not be softened, both pinned here:
 *
 *   **The instance field starts EMPTY.** No prefill, no derivation. A spike tried
 *   to establish that `commerce_instance` equals the ACCS tenant id and could not
 *   — there was no overlap to compare — so a prefilled value would be a guess,
 *   and importing into the wrong instance writes sample data into someone else's
 *   live demo. The user types it, every time.
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

    describe('the instance field', () => {
        it('starts EMPTY — never prefilled or derived', async () => {
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

    describe('the dry run', () => {
        const validateButton = () => screen.getByRole('button', { name: /^validate$/i });

        it('is offered beside Start, with the same requirements', async () => {
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

            expect(await screen.findByText(/would be accepted/i)).toBeInTheDocument();
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
