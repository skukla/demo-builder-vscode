/**
 * Import handler spine — the one place that puts validate, start and watch in the
 * right order.
 *
 * Three rules carry the weight, and all three are easy to get wrong silently:
 *
 *   **Validate BEFORE start, every time.** A 202 from the async entry point is
 *   not an acceptance — it took an empty body with a 202 and an activation id,
 *   while the sync twin 400s the same request. Skipping validate means the user
 *   watches a job that was never going to run.
 *
 *   **The watch is DETACHED.** The handler returns as soon as the job is
 *   accepted; watching continues on the extension host and records into
 *   `TransientStateManager`, so closing the panel does not abandon an import.
 *   Awaiting it would block the webview request for up to ten minutes.
 *
 *   **No credentials, no network.** The gap is reported before anything is sent.
 *
 * Strict TDD: written BEFORE the handlers exist.
 */

import {
    happyClient,
    importHandlers,
    makeContext,
    MockedWriteClient,
    mockedWatch,
    PAYLOAD,
    resetImportHandlerMocks,
    setupSettings,
} from './importHandlers.testUtils';

describe('start-datapack-import', () => {
    beforeEach(() => {
        resetImportHandlerMocks();
    });

    it('records itself as an import', async () => {
        happyClient();
        const { context, stores } = makeContext();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(stores.globalState.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ operation: 'import' }),
        );
    });

    /**
     * The push that turns a bare "Importing…" into live progress.
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
        const settleWatch = (): Promise<void> =>
            new Promise((resolve) => setImmediate(resolve));

        it('forwards each poll to the webview as it arrives', async () => {
            happyClient();
            const { context } = makeContext();

            await importHandlers['start-datapack-import'](context, PAYLOAD);
            await settleWatch();

            const onProgress = mockedWatch.mock.calls[0]?.[0]?.onProgress;
            expect(onProgress).toBeInstanceOf(Function);

            onProgress?.({ categories: 'processing' });

            expect(context.sendMessage).toHaveBeenCalledWith(
                'datapack-import-progress',
                expect.objectContaining({ perType: { categories: 'processing' } }),
            );
        });

        /**
         * The modal must be able to tell ITS job's progress from another's. The
         * activation id is the only thing that distinguishes them, and a reset
         * started while an import watches would otherwise drive the wrong ring.
         */
        it('stamps the push with the activation it belongs to', async () => {
            happyClient();
            const { context } = makeContext();

            await importHandlers['start-datapack-import'](context, PAYLOAD);
            await settleWatch();
            mockedWatch.mock.calls[0]?.[0]?.onProgress?.({ categories: 'success' });

            expect(context.sendMessage).toHaveBeenCalledWith(
                'datapack-import-progress',
                expect.objectContaining({ activationId: 'act-1' }),
            );
        });

        /** A reset watches the same way and must say so, for the wording. */
        it('names the operation, so a reset is not worded as an import', async () => {
            happyClient();
            const { context } = makeContext();

            // `confirm` is the destructive-action guard; without it the reset
            // refuses before it ever reaches the watch.
            await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });
            await settleWatch();
            mockedWatch.mock.calls[0]?.[0]?.onProgress?.({ categories: 'success' });

            expect(context.sendMessage).toHaveBeenCalledWith(
                'datapack-import-progress',
                expect.objectContaining({ operation: 'reset' }),
            );
        });
    });

    it('validates BEFORE starting', async () => {
        const { validateImport, startImport } = happyClient();
        const { context } = makeContext();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(validateImport).toHaveBeenCalled();
        expect(startImport).toHaveBeenCalled();
        expect(validateImport.mock.invocationCallOrder[0]).toBeLessThan(
            startImport.mock.invocationCallOrder[0],
        );
    });

    it('never starts a request the sync twin rejected', async () => {
        const validateImport = jest
            .fn()
            .mockResolvedValue({ valid: false, reason: 'Invalid input. Must provide one of: …' });
        const startImport = jest.fn();
        MockedWriteClient.mockImplementation(() => ({ validateImport, startImport }) as never);
        const { context } = makeContext();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(startImport).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Must provide one of/);
    });

    it('returns the activation id once accepted', async () => {
        happyClient();
        const { context } = makeContext();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(true);
        expect((result.data as { activationId: string }).activationId).toBe('act-1');
    });

    it('passes the instance string through untouched', async () => {
        const { startImport } = happyClient();
        const { context } = makeContext();

        await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            commerceInstance: '  Not-An-Id  ',
        });

        expect(startImport.mock.calls[0][0].commerceInstance).toBe('  Not-An-Id  ');
    });

    describe('credentials', () => {
        it('refuses before any network call when a PaaS project has no admin pair', async () => {
            const { startImport, validateImport } = happyClient();
            const { context } = makeContext({
                name: 'demo-a',
                stack: { backend: 'adobe-commerce-paas' },
                componentConfigs: {},
            });

            const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

            expect(result.success).toBe(false);
            expect(validateImport).not.toHaveBeenCalled();
            expect(startImport).not.toHaveBeenCalled();
        });

        it('asks for ACCS credentials when none are stored', async () => {
            happyClient();
            const { context } = makeContext({
                name: 'demo-a',
                stack: { backend: 'adobe-commerce-accs' },
                componentConfigs: {},
            });

            const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.code).toBeDefined();
        });
    });

    describe('the detached watch', () => {
        it('does NOT await the watch — the request returns while the job runs', async () => {
            happyClient();
            const { context } = makeContext();
            let settled = false;
            mockedWatch.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => { settled = true; resolve({ outcome: 'success', perType: {} }); }, 50)),
            );

            const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

            expect(result.success).toBe(true);
            expect(settled).toBe(false);
        });

        it('records the job so a closed panel does not lose it', async () => {
            happyClient();
            const { context, stores } = makeContext();

            await importHandlers['start-datapack-import'](context, PAYLOAD);

            expect(stores.globalState.update).toHaveBeenCalled();
        });
    });

    describe('input', () => {
        it('requires both halves of the datapack identity', async () => {
            happyClient();
            const { context } = makeContext();

            const result = await importHandlers['start-datapack-import'](context, {
                ...PAYLOAD,
                version: undefined,
            });

            expect(result.success).toBe(false);
        });

        it('requires at least one data type', async () => {
            const { validateImport } = happyClient();
            const { context } = makeContext();

            const result = await importHandlers['start-datapack-import'](context, {
                ...PAYLOAD,
                dataTypes: [],
            });

            expect(result.success).toBe(false);
            expect(validateImport).not.toHaveBeenCalled();
        });

        /**
         * Targeting is the intended path (the service author, 2026-08-14:
         * create the website first, "then you can specify site and store on the
         * data pack import"). The handler's job is to pass a complete pair
         * through and refuse a half one — the service 400s on a half pair, and
         * a 400 arriving minutes after a 202 is the worst place to learn it.
         */
        it('passes a complete target through to the request', async () => {
            const { startImport } = happyClient();
            const { context } = makeContext();

            await importHandlers['start-datapack-import'](context, {
                ...PAYLOAD,
                websiteCode: 'bodea',
                storeCode: 'bodea_store_view',
            });

            expect(startImport).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: { websiteCode: 'bodea', storeCode: 'bodea_store_view' },
                }),
            );
        });

        it('sends NO target when neither code was chosen — the service defaults to base', async () => {
            const { startImport } = happyClient();
            const { context } = makeContext();

            await importHandlers['start-datapack-import'](context, PAYLOAD);

            // Absent or explicitly undefined both satisfy the client, which
            // emits the pair only when the target is truthy.
            expect(startImport.mock.calls[0][0].target).toBeUndefined();
        });

        it('refuses a half pair rather than letting the service 400 after the 202', async () => {
            const { startImport } = happyClient();
            const { context } = makeContext();

            const result = await importHandlers['start-datapack-import'](context, {
                ...PAYLOAD,
                websiteCode: 'bodea',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/store/i);
            expect(startImport).not.toHaveBeenCalled();
        });

        it('requires a commerce instance — it is the write target', async () => {
            happyClient();
            const { context } = makeContext();

            const result = await importHandlers['start-datapack-import'](context, {
                ...PAYLOAD,
                commerceInstance: '',
            });

            expect(result.success).toBe(false);
        });
    });
});

describe('validate-datapack-import', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupSettings();
    });

    // Credentials first: if the pair cannot reach the instance, whether the
    // request is well-formed is not the useful answer.
    it('checks credentials BEFORE the request shape', async () => {
        const { validateImport, checkCredentials } = happyClient();
        const { context } = makeContext();

        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(checkCredentials.mock.invocationCallOrder[0]).toBeLessThan(
            validateImport.mock.invocationCallOrder[0],
        );
    });

    it('stops at unusable credentials and says so', async () => {
        const validateImport = jest.fn();
        MockedWriteClient.mockImplementation(
            () =>
                ({
                    checkCredentials: jest
                        .fn()
                        .mockResolvedValue({ usable: false, reason: 'Authentication failed' }),
                    validateImport,
                    startImport: jest.fn(),
                }) as never,
        );
        const { context } = makeContext();

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(validateImport).not.toHaveBeenCalled();
        expect(result.data).toMatchObject({ valid: false, reason: expect.stringMatching(/Authentication/) });
    });

    it('validates WITHOUT starting anything', async () => {
        const { validateImport, startImport } = happyClient();
        const { context } = makeContext();

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(validateImport).toHaveBeenCalled();
        expect(startImport).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ valid: true });
    });

    it('never records a job — nothing ran', async () => {
        happyClient();
        const { context, stores } = makeContext();

        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(stores.globalState.update).not.toHaveBeenCalled();
    });

    it('never starts a watch', async () => {
        happyClient();
        const { context } = makeContext();

        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(mockedWatch).not.toHaveBeenCalled();
    });

    // A refusal is the ANSWER here, not a failure: the request reached the
    // service and the service said why it will not run.
    it('returns the service refusal as a verdict, not an error', async () => {
        const validateImport = jest
            .fn()
            .mockResolvedValue({ valid: false, reason: 'Invalid input. Must provide one of: …' });
        MockedWriteClient.mockImplementation(
            () =>
                ({
                    validateImport,
                    startImport: jest.fn(),
                    // Credentials pass, so the shape verdict is what comes back.
                    checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
                }) as never,
        );
        const { context } = makeContext();

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ valid: false, reason: expect.stringMatching(/Must provide/) });
    });

    it('checks credentials before sending, like the start path', async () => {
        const { validateImport } = happyClient();
        const { context } = makeContext({
            name: 'demo-a',
            stack: { backend: 'adobe-commerce-paas' },
            componentConfigs: {},
        });

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(false);
        expect(validateImport).not.toHaveBeenCalled();
    });
});

describe('reset-datapack', () => {
    /** A reset only proceeds with an explicit confirm — see the gate test. */
    const CONFIRMED = { ...PAYLOAD, confirm: true };

    beforeEach(() => {
        resetImportHandlerMocks();
    });

    it('removes the data rather than importing it', async () => {
        const { startDelete, startImport } = happyClient();
        const { context } = makeContext();

        const result = await importHandlers['reset-datapack'](context, CONFIRMED);

        expect(startDelete).toHaveBeenCalled();
        expect(startImport).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    // A reset is destructive and irreversible, so it requires the same explicit
    // opt-in the MCP action tools use. Nothing removes data by default.
    it('refuses without an explicit confirm', async () => {
        const { startDelete } = happyClient();
        const { context } = makeContext();

        const result = await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: false });

        expect(startDelete).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('validates before removing, as the import path does', async () => {
        const { validateImport, startDelete } = happyClient();
        const { context } = makeContext();

        await importHandlers['reset-datapack'](context, CONFIRMED);

        expect(validateImport.mock.invocationCallOrder[0]).toBeLessThan(
            startDelete.mock.invocationCallOrder[0],
        );
    });

    // The seam test: the runner watches a reset with no changes, because a reset
    // is an activation id like any other.
    it('watches the reset with the unchanged runner', async () => {
        happyClient();
        const { context } = makeContext();

        await importHandlers['reset-datapack'](context, CONFIRMED);

        // The watch is detached and its own setup awaits the guard, so give it
        // more than one tick before asserting it started.
        await new Promise((r) => setTimeout(r, 25));
        expect(mockedWatch).toHaveBeenCalledWith(
            expect.objectContaining({ activationId: 'act-9' }),
        );
    });

    // The record must know WHICH operation it was: the modal showed "Import
    // finished" for a completed reset, live, because nothing carried this.
    it('records itself as a reset, not an import', async () => {
        happyClient();
        const { context, stores } = makeContext();

        await importHandlers['reset-datapack'](context, CONFIRMED);

        expect(stores.globalState.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ operation: 'reset' }),
        );
    });

    it('records the reset so the panel can be closed', async () => {
        happyClient();
        const { context, stores } = makeContext();

        await importHandlers['reset-datapack'](context, CONFIRMED);

        expect(stores.globalState.update).toHaveBeenCalled();
    });
});

/**
 * The watch is detached, so when it cannot run there is nobody to tell.
 *
 * It used to return silently if the guard refused, and warn to a log channel if
 * the runner threw. Either way the record stayed `outcome: 'watching'` forever and
 * the modal showed "Importing… this can take several minutes" indefinitely — a
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
    function lastRecord(stores: { globalState: { update: jest.Mock } }): Record<string, unknown> {
        const calls = stores.globalState.update.mock.calls;
        return calls[calls.length - 1]?.[1] as Record<string, unknown>;
    }

    it('records that it stopped watching when the runner throws', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('the service went away'));
        const { context, stores } = makeContext();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(lastRecord(stores as never).outcome).toBe('unwatchable');
    });

    // The reason IS the payload: "we stopped looking" is not actionable without
    // saying why, and this is the only place the cause exists.
    it('keeps the reason so the panel can say what went wrong', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('the service went away'));
        const { context, stores } = makeContext();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(lastRecord(stores as never)).toMatchObject({
            outcome: 'unwatchable',
            reason: expect.stringContaining('the service went away'),
        });
    });

    // NOT 'stopped'. That means the user chose to stop looking; this means we
    // could not look, and they never asked for that.
    it('does not disguise a broken watch as the user stopping one', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('boom'));
        const { context, stores } = makeContext();

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(lastRecord(stores as never).outcome).not.toBe('stopped');
    });

    // The import is unaffected — it is already running server-side. Only the
    // watching failed, and the handler had already returned success.
    it('still reports the import as started', async () => {
        happyClient();
        mockedWatch.mockRejectedValue(new Error('boom'));
        const { context } = makeContext();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);
        await settle();

        expect(result.success).toBe(true);
    });
});

describe('get-datapack-import-status', () => {
    beforeEach(() => {
        resetImportHandlerMocks();
    });

    it('returns nothing when no import has been started', async () => {
        const { context } = makeContext();

        const result = await importHandlers['get-datapack-import-status'](context);

        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
    });

    it('returns the recorded job after a start', async () => {
        happyClient();
        const { context } = makeContext();
        await importHandlers['start-datapack-import'](context, PAYLOAD);

        const result = await importHandlers['get-datapack-import-status'](context);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ activationId: 'act-1', datapackName: 'bodea' });
    });
});
