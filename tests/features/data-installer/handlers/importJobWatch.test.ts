/**
 * `runAndWatch` — validate, begin, record, and detach the watch.
 *
 * The half import and reset share, moved out of `importHandlers.ts` into
 * `importJobWatch.ts` (2026-10-08); these tests moved with it from the spine's
 * suites. They drive it through the merged `importHandlers` map, because that is
 * the only door it has: the handlers decide WHICH write runs, this decides what
 * happens once the service accepts.
 *
 * Three claims carry the weight: the watch is DETACHED (the request returns while
 * the job runs), every exit of the watch writes the record (a lost watch is never a
 * silent "watching" forever), and progress reaches BOTH the modal and the shared
 * operation channel.
 */

import {
    happyClient,
    importHandlers,
    makeImportHarness,
    stubWriteClient,
    mockedWatch,
    PAYLOAD,
    resetImportHandlerMocks,
    setupSettings,
} from './importHandlers.testUtils';
import * as vscode from 'vscode';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { startModalRun } from '@/core/vscode/operationProgress';

beforeEach(() => {
    resetImportHandlerMocks();
});

/**
 * The push that turns a bare "Importing" into live progress.
 *
 * The runner already saw every poll; nothing forwarded them. These pin the
 * forwarding rather than the polling — the runner's own suite covers when
 * the callback fires, this covers what reaches the webview when it does.
 */
describe('progress push', () => {
    /**
     * The handler returns as soon as the job is REGISTERED; the watch runs
     * fire-and-forget behind it and awaits access resolution first. So the
     * call to watchImportJob has not happened yet when the handler's promise
     * settles, and asserting straight away reads an empty mock.
     */
    const settleWatch = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

    it('forwards each poll to the webview as it arrives', async () => {
        happyClient();
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settleWatch();

        const onProgress = mockedWatch.mock.calls[0]?.[0]?.onProgress;
        expect(onProgress).toBeInstanceOf(Function);

        onProgress?.({ categories: 'processing' });

        expect(context.sendMessage).toHaveBeenCalledWith(
            'datapack-import-progress',
            expect.objectContaining({ perType: { categories: 'processing' } })
        );
    });

    /**
     * The modal must be able to tell ITS job's progress from another's. The
     * activation id is the only thing that distinguishes them, and a reset
     * started while an import watches would otherwise drive the wrong ring.
     */
    it('stamps the push with the activation it belongs to', async () => {
        happyClient();
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settleWatch();
        mockedWatch.mock.calls[0]?.[0]?.onProgress?.({ categories: 'success' });

        expect(context.sendMessage).toHaveBeenCalledWith(
            'datapack-import-progress',
            expect.objectContaining({ activationId: 'act-1' })
        );
    });

    /** A reset watches the same way and must say so, for the wording. */
    it('names the operation, so a reset is not worded as an import', async () => {
        happyClient();
        const { context } = makeImportHarness();

        // `confirm` is the destructive-action guard; without it the reset
        // refuses before it ever reaches the watch.
        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });
        await settleWatch();
        mockedWatch.mock.calls[0]?.[0]?.onProgress?.({ categories: 'success' });

        expect(context.sendMessage).toHaveBeenCalledWith(
            'datapack-import-progress',
            expect.objectContaining({ operation: 'reset' })
        );
    });
});

describe('the detached watch', () => {
    it('does NOT await the watch — the request returns while the job runs', async () => {
        happyClient();
        const { context } = makeImportHarness();
        let settled = false;
        mockedWatch.mockImplementation(
            () =>
                new Promise((resolve) =>
                    setTimeout(() => {
                        settled = true;
                        resolve({ outcome: 'success', perType: {} });
                    }, 50)
                )
        );

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(true);
        expect(settled).toBe(false);
        // What the panel reads while the job runs: the record says so.
        const status = await importHandlers['get-datapack-import-status'](context);
        expect(status.data).toMatchObject({ activationId: 'act-1', outcome: 'watching' });
    });

    it('records the job so a closed panel does not lose it', async () => {
        happyClient();
        const { context, stores } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(stores.globalState.update).toHaveBeenCalled();
    });
});
/**
 * The SAME progress on the shared operation channel (PL-59 R8), so closing the
 * modal can hand the job to a notification that keeps narrating. These reach the
 * channel the way the handover does: a screen registered for the datapack id.
 *
 * Unconstrained from 2026-09-20 (when the push landed) until the watch was
 * measured on its own in the 2026-10-08 split — the stage counter read `.status`
 * off entries that are plain status strings, and nothing could see it.
 */
describe('the shared progress channel', () => {
    const settleWatch = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
    let screen: jest.Mock;

    beforeEach(() => {
        screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);
        startModalRun(DATAPACK_OPERATION_ID, screen);
    });

    /** Every payload pushed on the shared operation channel. */
    function pushes(): Array<Record<string, unknown>> {
        return screen.mock.calls
            .filter(([type]) => type === 'operationProgress')
            .map(([, payload]) => payload as Record<string, unknown>);
    }

    async function progressOf(handler: 'start-datapack-import' | 'reset-datapack') {
        happyClient();
        const { context } = makeImportHarness();
        await importHandlers[handler](context, { ...PAYLOAD, confirm: true });
        await settleWatch();
        const onProgress = mockedWatch.mock.calls[0]?.[0]?.onProgress;
        expect(onProgress).toBeInstanceOf(Function);
        return onProgress!;
    }

    it('narrates an import as a running stage with how many types are done', async () => {
        const onProgress = await progressOf('start-datapack-import');

        onProgress({ categories: 'success', products: 'processing', orders: 'pending' });
        await settleWatch();

        expect(pushes()).toContainEqual({
            id: DATAPACK_OPERATION_ID,
            state: 'running',
            stage: 'Importing the sample data',
            position: { index: 1, total: 3 },
        });
    });

    it('counts every finished type, not only the first', async () => {
        const onProgress = await progressOf('start-datapack-import');

        onProgress({ categories: 'success', products: 'success', orders: 'processing' });
        await settleWatch();

        expect(pushes()).toContainEqual(
            expect.objectContaining({ position: { index: 2, total: 3 } }),
        );
    });

    it('never says 0 of N — the first type counts from one', async () => {
        const onProgress = await progressOf('start-datapack-import');

        onProgress({ categories: 'processing', products: 'pending' });
        await settleWatch();

        expect(pushes()).toContainEqual(
            expect.objectContaining({ position: { index: 1, total: 2 } }),
        );
    });

    it('words a reset as removing, not importing', async () => {
        const onProgress = await progressOf('reset-datapack');

        onProgress({ categories: 'processing' });
        await settleWatch();

        expect(pushes()).toContainEqual(
            expect.objectContaining({ state: 'running', stage: 'Removing the sample data' }),
        );
    });

    it('gives no position before the runner has named any type', async () => {
        const onProgress = await progressOf('start-datapack-import');

        onProgress({});
        await settleWatch();

        const running = pushes().find((p) => p.state === 'running');
        expect(running).toEqual({
            id: DATAPACK_OPERATION_ID,
            state: 'running',
            stage: 'Importing the sample data',
        });
    });

    it('closes the notice as succeeded when the job succeeds', async () => {
        happyClient();
        mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((r) => setTimeout(r, 25));

        expect(pushes()).toContainEqual({ id: DATAPACK_OPERATION_ID, state: 'succeeded' });
    });

    it('closes the notice as failed with the runner reason', async () => {
        happyClient();
        mockedWatch.mockResolvedValue({ outcome: 'error', perType: {}, reason: 'two types failed' });
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((r) => setTimeout(r, 25));

        expect(pushes()).toContainEqual({
            id: DATAPACK_OPERATION_ID,
            state: 'failed',
            error: 'two types failed',
        });
    });

    it('still names a failure when the runner gave no reason', async () => {
        happyClient();
        mockedWatch.mockResolvedValue({ outcome: 'error', perType: {} });
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((r) => setTimeout(r, 25));

        const failed = pushes().find((p) => p.state === 'failed');
        expect(failed).toBeDefined();
        expect(typeof failed?.error).toBe('string');
        expect((failed?.error as string).length).toBeGreaterThan(0);
    });
});

/**
 * The watch is detached, so when it cannot run there is nobody to tell.
 *
 * It used to return silently if the guard refused, and warn to a log channel if
 * the runner threw. Either way the record stayed `outcome: 'watching'` forever and
 * the modal showed "Importing this can take several minutes" indefinitely — a
 * failure invisible to the user AND to this suite, which is how a logger bug that
 * killed every watch survived five green gates.
 *
 * A failure that reaches nobody cannot be tested for. So it lands in the record.
 */
describe('a watch that cannot run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupSettings();
    });

    /** Let the detached watch get past its own setup before asserting. */
    const settle = () => new Promise((r) => setTimeout(r, 25));

    /** The record written by the LAST transient set. */
    function lastRecord(
        stores: ReturnType<typeof makeImportHarness>['stores']
    ): Record<string, unknown> {
        const calls = stores.globalState.update.mock.calls;
        return calls[calls.length - 1]?.[1] as Record<string, unknown>;
    }

    it('records that it stopped watching when the runner throws', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('the service went away'));
        const { context, stores } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(lastRecord(stores).outcome).toBe('unwatchable');
    });

    // The reason IS the payload: "we stopped looking" is not actionable without
    // saying why, and this is the only place the cause exists.
    it('keeps the reason so the panel can say what went wrong', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('the service went away'));
        const { context, stores } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(lastRecord(stores)).toMatchObject({
            outcome: 'unwatchable',
            reason: expect.stringContaining('the service went away'),
        });
    });

    // NOT 'stopped'. That means the user chose to stop looking; this means we
    // could not look, and they never asked for that.
    it('does not disguise a broken watch as the user stopping one', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('boom'));
        const { context, stores } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(lastRecord(stores).outcome).not.toBe('stopped');
    });

    // The import is unaffected — it is already running server-side. Only the
    // watching failed, and the handler had already returned success.
    it('still reports the import as started', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('boom'));
        const { context } = makeImportHarness();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(result.success).toBe(true);
    });
});

describe('what the finished watch records', () => {
    it('keeps the reason the runner gave for a non-success outcome', async () => {
        const { context, stores } = makeImportHarness();
        happyClient();
        mockedWatch.mockResolvedValue({
            outcome: 'error',
            perType: {},
            reason: 'the worker rejected two types',
        });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        expect(stores.peek('dataInstaller.import.current')).toMatchObject({
            outcome: 'error',
            reason: 'the worker rejected two types',
        });
    });

    it('keeps the processing time when the runner measured one', async () => {
        const { context, stores } = makeImportHarness();
        happyClient();
        mockedWatch.mockResolvedValue({
            outcome: 'success',
            perType: {},
            processingTimeMs: 91_000,
        });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        expect(stores.peek('dataInstaller.import.current')).toMatchObject({
            processingTimeMs: 91_000,
        });
    });

    it('omits both fields when the runner reported neither', async () => {
        const { context, stores } = makeImportHarness();
        happyClient();
        mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        const record = stores.peek('dataInstaller.import.current') as Record<string, unknown>;
        // Present-but-undefined reads to a consumer as "measured, and it was
        // nothing" — the fields are spread in conditionally for that reason.
        expect('reason' in record).toBe(false);
        expect('processingTimeMs' in record).toBe(false);
    });

    it('carries the operation into the watch so a reset is watched as a reset', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockedWatch).toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'reset', activationId: 'act-9' }),
        );
    });
});

describe('the feature turned off mid-import', () => {
    it('records that the watch could not run, and says why', async () => {
        // resolveDataInstallerAccess runs twice: once to prepare the request and
        // once inside the detached watch. Turning the feature off between them is
        // the only way the second can refuse after the first allowed — and the
        // record must not sit at "watching" forever.
        let enabledReads = 0;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string) => {
                if (key === 'apiBaseUrl') {
                    return 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
                }
                enabledReads += 1;
                return enabledReads === 1;
            }),
        });
        const { context, stores } = makeImportHarness();
        happyClient();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        // The import itself was accepted — this reports a lost WATCH, not a
        // failed import.
        expect(result.success).toBe(true);
        expect(stores.peek('dataInstaller.import.current')).toMatchObject({
            outcome: 'unwatchable',
            reason: 'The Data Installer could not be reached to watch this job.',
        });
        expect(mockedWatch).not.toHaveBeenCalled();
    });
});

describe('a start the service refuses', () => {
    it('reports the service reason and records no job', async () => {
        const { context, stores } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: false, reason: 'unknown pack' }),
            startImport: jest.fn(),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toEqual({ success: false, error: 'unknown pack' });
        expect(stores.peek('dataInstaller.import.current')).toBeUndefined();
    });

    it('falls back to its own wording when the service gives no reason', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: false }),
            startImport: jest.fn(),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.error).toBe('The Data Installer rejected this import request.');
    });

    it('reports a thrown start as a failure rather than losing it', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: true }),
            startImport: jest.fn().mockRejectedValue(new Error('runtime 503')),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toMatchObject({ success: false, error: 'runtime 503' });
    });

    it('uses the operation-specific wording when the thrown value is not an Error', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: true }),
            startDelete: jest.fn().mockRejectedValue('not an error object'),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['reset-datapack'](context, {
            ...PAYLOAD,
            confirm: true,
        });

        expect(result.error).toBe('The reset could not be started.');
    });
});

describe('recording the datapack on the project', () => {
    it('writes the pack the import was accepted for', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(context.stateManager.saveProject).toHaveBeenCalledWith(
            expect.objectContaining({ datapack: { name: 'bodea', version: 'main' } }),
        );
    });

    it('CLEARS it on a reset, so removal is not offered for data that is gone', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });

        expect(context.stateManager.saveProject).toHaveBeenCalledWith(
            expect.objectContaining({ datapack: undefined }),
        );
    });

    it('still reports the import as started when the project write throws', async () => {
        // The service has already accepted the job. Failing the handler over
        // bookkeeping would report a started import as a failed one.
        const { context } = makeImportHarness();
        happyClient();
        (context.stateManager.saveProject as jest.Mock).mockRejectedValue(
            new Error('manifest locked'),
        );

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toEqual({ success: true, data: { activationId: 'act-1' } });
    });

    it('records nothing, and still succeeds, when the project vanishes mid-flight', async () => {
        const { context } = makeImportHarness();
        happyClient();
        // Present for prepareImport, gone by the time the record is written.
        (context.stateManager.getCurrentProject as jest.Mock)
            .mockResolvedValueOnce({
                name: 'demo-a',
                componentSelections: { backend: 'adobe-commerce-paas' },
                componentConfigs: {
                    'adobe-commerce-paas': {
                        ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                        ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                    },
                },
            })
            .mockResolvedValue(null);

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });
});
