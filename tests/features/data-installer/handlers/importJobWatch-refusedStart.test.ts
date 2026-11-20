/**
 * `runAndWatch` when the service will not start the job: its dry run refuses, or the start
 * throws. The reason reaches the screen and no job is recorded. Split from
 * `importJobWatch.test.ts` (2026-11-18) by describe, to keep that file under the size limit.
 *
 * Imports the harness first: it owns the module wall the handler map must bind to.
 */

import { importHandlers, makeImportHarness, PAYLOAD, resetImportHandlerMocks, stubEngine } from './importHandlers.testUtils';

beforeEach(() => {
    resetImportHandlerMocks();
});

describe('a start the service refuses', () => {
    it('reports the service reason and records no job', async () => {
        const { context, stores } = makeImportHarness();
        stubEngine({
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
        stubEngine({
            validateImport: jest.fn().mockResolvedValue({ valid: false }),
            startImport: jest.fn(),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.error).toBe('The Data Installer rejected this install request.');
    });

    it('reports a thrown start as a failure rather than losing it', async () => {
        const { context } = makeImportHarness();
        stubEngine({
            validateImport: jest.fn().mockResolvedValue({ valid: true }),
            startImport: jest.fn().mockRejectedValue(new Error('runtime 503')),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toMatchObject({ success: false, error: 'runtime 503' });
    });

    it('uses the operation-specific wording when the thrown value is not an Error', async () => {
        const { context } = makeImportHarness();
        stubEngine({
            validateImport: jest.fn().mockResolvedValue({ valid: true }),
            startDelete: jest.fn().mockRejectedValue('not an error object'),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['reset-datapack'](context, {
            ...PAYLOAD,
            confirm: true,
        });

        expect(result.error).toBe('The uninstall could not be started.');
    });
});
