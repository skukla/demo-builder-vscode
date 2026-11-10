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
    mockPostMessage,
} from './ImportDatapackModal.testUtils';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';

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
    version: 'main',
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
            await screen.findByRole('button', { name: 'Run in Background' });

            const before = statusCalls();
            await tick(2000);

            expect(statusCalls()).toBeGreaterThan(before);
        });

        // One way out while a job runs (owner, 2026-11-07): a Close beside Run in Background did
        // the same thing. It hands the job to a notification and closes the window.
        it('offers only Run in Background while a job runs, which hands the job over and closes', async () => {
            const onClose = jest.fn();
            withStatus(runningRecord());
            renderModal({ onClose });
            await settle();

            expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
            await press(await screen.findByRole('button', { name: 'Run in Background' }));

            expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', expect.objectContaining({ id: DATAPACK_OPERATION_ID }));
            expect(onClose).toHaveBeenCalled();
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
            await screen.findByRole('button', { name: 'Run in Background' });
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
            await press(screen.getByRole('checkbox', { name: 'Select All' }));

            const before = statusCalls();
            await press(screen.getByRole('button', { name: /^import$/i }));

            expect(statusCalls()).toBeGreaterThan(before);
        });
    });

    /**
     * The watching view says what the JOB is, and the job can be a removal.
     * Three strings are derived from one `operation` field — the spinner's
     * message, the progress verb and the "continues in the background" noun — and a
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

            expect(await screen.findByText(OPERATION_STAGES.removingDatapack.label)).toBeInTheDocument();
            expect(screen.getByText('0 of 2 data types: Categories')).toBeInTheDocument();
        });

        // An import runs on its steps (owner, 2026-11-09): the type in progress under Install.
        it('draws a running import as its steps, the type in progress installing', async () => {
            withStatus(runningRecord({ perType: { categories: 'processing' } }));
            renderModal();
            await settle();

            // The row in progress spins; with no count yet its second line is the word alone (walk F133).
            const row = (await screen.findByText('Categories')).closest('.work-row');
            expect(row).toHaveAttribute('data-state', 'checking');
            expect(screen.getByText('Installing').closest('.work-row')).toBe(row);
            expect(screen.getByText('0 of 2 data types').closest('.work-row')).toHaveTextContent('Install Bodea, main');
            expect(screen.queryByText(OPERATION_STAGES.installingDatapack.label)).not.toBeInTheDocument();
        });

        it('gives a removal’s ring the measured percentage once a type has reported', async () => {
            withStatus(runningRecord({ operation: 'reset', perType: { categories: 'success' } }));
            renderModal();
            await settle();
            await screen.findByText(OPERATION_STAGES.removingDatapack.label);

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

            expect(screen.queryByText('Checking the import')).not.toBeInTheDocument();
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

    // Remove Data opens the window on the confirm (`opensOn: 'remove'`, walk F118).
    describe('the removal confirmation', () => {
        async function openRemoval(availableTypes: string[]): Promise<void> {
            renderModal({ availableTypes, opensOn: 'remove' });
            await settle();
            await settle();
        }

        // The confirm's one sentence names what goes, the warning a word in it (dialog design
        // rules, owner 2026-10-31).
        it('names one type in its sentence', async () => {
            await openRemoval(['categories']);

            expect(screen.getByText(/^Permanently deletes .+’s categories\.$/)).toBeInTheDocument();
        });

        // A pack Demo Builder installed: what goes is what its record lists, every type named.
        it('names several types, joined as a sentence joins them', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-removal-scope'
                    ? { success: true, data: { recordedKinds: ['attribute_sets', 'categories', 'products'] } }
                    : defaultResponse(type),
            );
            await openRemoval(['attribute_sets', 'categories', 'products']);

            expect(screen.getByText('Permanently deletes what Bodea installed: attribute sets, categories and products.')).toBeInTheDocument();
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
            renderModal({ availableTypes: ['categories'], opensOn: 'remove' });
            await settle();

            await press(await screen.findByRole('button', { name: /^uninstall$/i }));

            expect(screen.getByText('Uninstalling the datapack')).toBeInTheDocument();
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

        it('offers Back and nothing else', async () => {
            await passedDryRun();

            // Every button, unfiltered: an extra footer entry with no label is
            // exactly what a broken actions array produces, and dropping the
            // nameless ones would hide it.
            const labels = screen.getAllByRole('button').map((button) => button.textContent);
            expect(labels).toEqual(['Close', 'Back']);
        });
    });

    /**
     * Closing stops nothing: a RUNNING job is handed to a progress notification
     * so the SC keeps seeing it, and the close button says so. With no job
     * running, closing just closes.
     */
    describe('closing the modal', () => {
        beforeEach(() => {
            mockPostMessage.mockClear();
        });

        it('hands a running import to a notification named for it, then closes', async () => {
            const onClose = jest.fn();
            withStatus(runningRecord());
            renderModal({ onClose });
            await settle();

            await press(await screen.findByRole('button', { name: 'Run in Background' }));

            expect(mockPostMessage.mock.calls).toStrictEqual([
                ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Importing Bodea' }],
            ]);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('names a running removal as a removal', async () => {
            withStatus(runningRecord({ operation: 'reset' }));
            renderModal({ onClose: jest.fn() });
            await settle();

            await press(await screen.findByRole('button', { name: 'Run in Background' }));

            expect(mockPostMessage.mock.calls).toStrictEqual([
                ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Uninstalling Bodea' }],
            ]);
        });

        it('just closes when no job is running', async () => {
            const onClose = jest.fn();
            renderModal({ onClose });
            await awaitForm();

            await press(screen.getByRole('button', { name: 'Close' }));

            expect(mockPostMessage.mock.calls).toStrictEqual([]);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('titles the dialog with the pack it imports', async () => {
            renderModal();
            await awaitForm();

            expect(screen.getByText('Import Bodea')).toBeInTheDocument();
        });
    });

    describe('what makes an import startable', () => {
        // Reading the project is part of what the form needs, so nothing can be started until it
        // has answered. It also sets the first box: a form drawn before the answer set the height
        // the wait then kept (407px), even when the stores answered first.
        it('waits, with no form, while the project has named no instance yet', async () => {
            mockRequest.mockImplementation(async (type: string) =>
                type === 'get-datapack-import-target'
                    ? new Promise(() => undefined)
                    : { success: true, data: null },
            );
            renderModal();
            await settle();

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^import$/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });
    });

    describe('select all', () => {
        // Nothing to select "all" of with fewer than two types (owner, 2026-10-31).
        it.each([[[]], [['categories']]])('offers no Select All for a pack of %j', async (availableTypes) => {
            renderModal({ availableTypes });
            await settle();

            expect(screen.queryByRole('checkbox', { name: 'Select All' })).not.toBeInTheDocument();
        });

        it('clearing everything leaves the import unstartable', async () => {
            renderModal();
            await awaitForm();
            await press(screen.getByRole('checkbox', { name: 'Select All' }));

            await press(screen.getByRole('checkbox', { name: 'Select All' }));

            expect(screen.getByRole('button', { name: /^import$/i })).toHaveAttribute(
                'aria-disabled',
                'true',
            );
        });
    });

    describe('the type list can change under the modal', () => {
        it('pulls in a dependency the pack only gained on a later render', async () => {
            const view = renderModal({ availableTypes: ['products', 'customers'] });
            await settle();
            await screen.findByRole('checkbox', { name: 'Products' });

            view.rerender(
                <ImportDatapackModal
                    {...DEFAULTS}
                    availableTypes={['categories', 'products', 'customers']}
                />,
            );
            await settle();
            await press(screen.getByRole('checkbox', { name: 'Products' }));

            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
        });
    });
});
