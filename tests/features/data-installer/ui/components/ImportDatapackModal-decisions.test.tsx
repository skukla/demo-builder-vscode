/**
 * ImportDatapackModal — the decisions nothing else constrains.
 *
 * The existing suites drive the modal and read what it shows. What they do not
 * do is separate a decision from its absence: the poll runs or it does not, the
 * watch is cleaned up or it leaks, the busy line names the operation in hand or
 * some other one. Each test here pins one of those, through the DOM the user
 * reads or the requests the modal sends — never through a log line.
 *
 * Split from the lifecycle suite rather than added to it: that file is already
 * near the 750-line ceiling.
 */

import React from 'react';
import { act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    press,
    settle,
    mockRequest,
    renderModal,
    resetModalMocks,
    awaitForm,
    defaultResponse,
    DEFAULTS,
    ImportDatapackModal,
} from './ImportDatapackModal.testUtils';

const STATUS = 'get-datapack-import-status';

/** How many times the modal has asked for the job's status. */
const statusCalls = (): number => mockRequest.mock.calls.filter((c) => c[0] === STATUS).length;

/** Let the poll interval fire, then let its response land. */
async function tick(ms: number): Promise<void> {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
    await settle();
}

/** Answer the status request with `record`, everything else with an activation. */
function withStatus(record: unknown): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-import-target') {
            return defaultResponse(type);
        }
        return type === STATUS
            ? { success: true, data: record }
            : { success: true, data: { activationId: 'act-1' } };
    });
}

const runningRecord = (over: Record<string, unknown> = {}) => ({
    activationId: 'act-1',
    dataTypes: ['categories', 'products'],
    outcome: 'watching',
    operation: 'import',
    perType: {},
    ...over,
});

describe('ImportDatapackModal — decisions', () => {
    beforeEach(() => {
        resetModalMocks();
    });

    /**
     * The poll is the only thing that moves a running job's screen forward, and
     * it is the only thing that must STOP moving it. Both directions are here:
     * a test that only proves it starts passes just as well when the guard that
     * stops it is gone.
     */
    describe('the status poll', () => {
        it('re-reads the job while it is running', async () => {
            withStatus(runningRecord());
            renderModal();
            await settle();
            await screen.findByRole('button', { name: /stop watching/i });

            const before = statusCalls();
            await tick(2000);

            expect(statusCalls()).toBeGreaterThan(before);
        });

        it('stops re-reading once the user stops watching', async () => {
            withStatus(runningRecord());
            renderModal();
            await settle();
            await press(await screen.findByRole('button', { name: /stop watching/i }));

            const before = statusCalls();
            await tick(6000);

            expect(statusCalls()).toBe(before);
            expect(screen.getByText('Stopped watching.')).toBeInTheDocument();
        });

        it('never starts a poll for a job that is not running', async () => {
            withStatus(runningRecord({ outcome: 'success', perType: { categories: 'success' } }));
            renderModal();
            await awaitForm();

            const before = statusCalls();
            await tick(6000);

            expect(statusCalls()).toBe(before);
        });

        it('tears the poll down when the job reaches a terminal outcome', async () => {
            withStatus(runningRecord());
            renderModal();
            await settle();
            await screen.findByRole('button', { name: /stop watching/i });
            await tick(2000);

            withStatus(runningRecord({ outcome: 'success', perType: { categories: 'success' } }));
            await tick(2000);
            const afterTerminal = statusCalls();
            await tick(6000);

            expect(statusCalls()).toBe(afterTerminal);
        });

        it('reads the status exactly once on mount, before any job is started', async () => {
            renderModal();
            await awaitForm();

            expect(statusCalls()).toBe(1);
        });

        it('re-reads the status as soon as a start is accepted', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-target'
                    ? defaultResponse(type)
                    : type === STATUS
                      ? { success: true, data: null }
                      : { success: true, data: { activationId: 'act-9' } },
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('button', { name: /select all/i }));

            const before = statusCalls();
            await press(screen.getByRole('button', { name: /start import/i }));

            expect(statusCalls()).toBeGreaterThan(before);
        });
    });

    /**
     * The watching view says what the JOB is, and the job can be a removal.
     * Three strings are derived from one `operation` field — the spinner's
     * message, the progress verb and the "continues on the server" noun — and a
     * single test of the import path leaves all three free to say "import" for a
     * removal, which is the wording bug this surface already shipped once.
     */
    describe('the watching view is worded for its operation', () => {
        it('narrates a running removal as a removal', async () => {
            withStatus(
                runningRecord({ operation: 'reset', perType: { categories: 'processing' } })
            );
            renderModal();
            await settle();

            expect(await screen.findByText('Removing…')).toBeInTheDocument();
            expect(screen.getByText(/Removing Categories… 0 of 2 done/)).toBeInTheDocument();
        });

        it('CONTROL — narrates a running import as an import', async () => {
            withStatus(runningRecord({ perType: { categories: 'processing' } }));
            renderModal();
            await settle();

            expect(await screen.findByText('Importing…')).toBeInTheDocument();
            expect(screen.getByText(/Importing Categories… 0 of 2 done/)).toBeInTheDocument();
        });

        it('says the REMOVAL continues on the server once watching stops', async () => {
            withStatus(runningRecord({ operation: 'reset' }));
            renderModal();
            await settle();

            await press(await screen.findByRole('button', { name: /stop watching/i }));

            expect(screen.getByText('The removal continues on the server.')).toBeInTheDocument();
        });

        it('CONTROL — says the IMPORT continues on the server once watching stops', async () => {
            withStatus(runningRecord());
            renderModal();
            await settle();

            await press(await screen.findByRole('button', { name: /stop watching/i }));

            expect(screen.getByText('The import continues on the server.')).toBeInTheDocument();
        });

        it('gives the ring the measured percentage once a type has reported', async () => {
            withStatus(runningRecord({ perType: { categories: 'success' } }));
            renderModal();
            await settle();
            await screen.findByText('Importing…');

            expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50');
        });
    });

    /**
     * One view at a time IS the state machine, so each body must check the view
     * it belongs to. Rendering on the DATA alone — "there is a record, so show
     * the watch" — is the pile the state machine replaced.
     */
    describe('one view at a time', () => {
        it('shows no busy spinner while the form is on screen', async () => {
            renderModal();
            await awaitForm();

            expect(screen.queryByText('Checking with the service…')).not.toBeInTheDocument();
        });

        it('does not show the watch for a record whose job has already finished', async () => {
            withStatus(
                runningRecord({ outcome: 'success', perType: { categories: 'success' } })
            );
            renderModal();
            await awaitForm();

            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        });
    });

    describe('the removal confirmation', () => {
        async function armReset(types: string[]): Promise<void> {
            renderModal();
            await awaitForm();
            for (const type of types) {
                await press(screen.getByRole('checkbox', { name: type }));
            }
            await press(screen.getByRole('button', { name: /^remove data/i }));
        }

        it('counts a single type in the singular', async () => {
            await armReset(['Categories']);

            expect(screen.getByText(/^1 data\s+type$/)).toBeInTheDocument();
        });

        it('counts several types in the plural', async () => {
            await armReset(['Products']);

            expect(screen.getByText(/^2 data\s+types$/)).toBeInTheDocument();
        });
    });

    describe('the busy line names the operation in hand', () => {
        /** A request type that never settles, so the in-flight view stays put. */
        function hang(hangingType: string): void {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === hangingType) {
                    return new Promise(() => undefined);
                }
                return defaultResponse(type);
            });
        }

        it('says a removal is starting, not an import', async () => {
            hang('reset-datapack');
            renderModal();
            await awaitForm();
            await press(screen.getByRole('button', { name: /select all/i }));
            await press(screen.getByRole('button', { name: /^remove data/i }));

            await press(screen.getByRole('button', { name: /remove the data/i }));

            expect(screen.getByText('Starting removal…')).toBeInTheDocument();
        });

        it('says credentials are being set up, and labels Start for that wait', async () => {
            mockRequest.mockImplementation(async (type: string) => {
                if (type === 'validate-datapack-import') {
                    return {
                        success: false,
                        error: 'ACCS imports need credentials.',
                        code: 'INVALID_OPERATION',
                        data: { needsAccsCredentials: true },
                    };
                }
                if (type === 'provision-accs-credentials') {
                    return new Promise(() => undefined);
                }
                return defaultResponse(type);
            });
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^dry run$/i }));

            await press(
                await screen.findByRole('button', { name: /set up credentials automatically/i })
            );

            expect(screen.getByText('Setting up credentials…')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Setting up…' })).toBeInTheDocument();
        });
    });

    describe('the result footer', () => {
        async function passedDryRun(): Promise<void> {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'validate-datapack-import'
                    ? { success: true, data: { valid: true } }
                    : defaultResponse(type),
            );
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Categories' }));
            await press(screen.getByRole('button', { name: /^dry run$/i }));
            await screen.findByText(/dry run passed/i);
        }

        it('offers Back and nothing else when the outcome carries no credentials offer', async () => {
            await passedDryRun();

            expect(
                screen.queryByRole('button', { name: /set up credentials automatically/i })
            ).not.toBeInTheDocument();
            // Every button, unfiltered: an extra footer entry with no label is
            // exactly what a broken actions array produces, and dropping the
            // nameless ones would hide it.
            const labels = screen.getAllByRole('button').map((button) => button.textContent);
            expect(labels).toEqual(['Close', 'Back']);
        });
    });

    describe('what makes an import startable', () => {
        it('stays disabled while the project has named no instance yet', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-target'
                    ? new Promise(() => undefined)
                    : { success: true, data: null },
            );
            renderModal();
            await settle();
            await press(await screen.findByRole('button', { name: /select all/i }));

            expect(screen.getByRole('button', { name: /start import/i })).toHaveAttribute(
                'aria-disabled',
                'true',
            );
        });
    });

    describe('select all', () => {
        it('offers nothing to select when the pack lists no types', async () => {
            renderModal({ availableTypes: [] });
            await settle();

            expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
        });

        it('clearing everything leaves the import unstartable', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('button', { name: /select all/i }));

            await press(screen.getByRole('button', { name: /clear all/i }));

            expect(screen.getByRole('button', { name: /start import/i })).toHaveAttribute(
                'aria-disabled',
                'true',
            );
        });
    });

    describe('the type list can change under the modal', () => {
        it('pulls in a dependency the pack only gained on a later render', async () => {
            const view = renderModal({ availableTypes: ['products'] });
            await settle();
            await screen.findByRole('checkbox', { name: 'Products' });

            view.rerender(
                <ImportDatapackModal
                    {...DEFAULTS}
                    availableTypes={['categories', 'products']}
                />,
            );
            await settle();
            await press(screen.getByRole('checkbox', { name: 'Products' }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
        });
    });
});
