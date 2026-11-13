/**
 * The live wiring behind a build's sample-data install: which client each dep is
 * handed, and what it reports.
 *
 * It resolves no Commerce credentials. The service signs in with its own
 * (DEMOSYS-1698), so the install no longer gathers a pair to send (DI-6).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        resolveDataInstallerAccess,
        // The write path's door, as it answers with the Data Installer's address set.
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn(async () => undefined) }));
// The engine the job is started on, so a test can see the poller is handed that same one.
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    buildDatapackEngine: jest.fn(),
}));

import { buildDatapackEngine } from '@/features/data-installer/services/buildDatapackEngine';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import type { HandlerContext } from '@/types/handlers';
import type { DataTypeStatus } from '@/features/data-installer/types';
import { dataInstallerAddress, importHarness, ACCS_PROJECT, INSTALLER_ADDRESS } from './sampleDataInstallDeps.testUtils';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

const PROJECT = ACCS_PROJECT;

function makeImportHarness(): HandlerContext {
    return importHarness({
        authManager: createMockAuthenticationService({
            getTokenManager: jest.fn().mockReturnValue({ inspectToken: jest.fn() }),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

/**
 * `watch` must be handed a client that can answer.
 *
 * `watchImportJob` needs a `JobStatusSource` — `getJobStatus` and
 * `getJobFailureReason` — which live on the READ client. This passed the WRITE
 * client through `client as never`, so every poll threw
 * `TypeError: e.getJobStatus is not a function`.
 *
 * Observed live 2026-08-17: a reset's delete was accepted (202) and then polled
 * to nothing, once per backoff step, leaving the job unwatched. The third cast
 * of the night to hide a shape mismatch, which is why this asserts on the object
 * handed over rather than on any outcome. Since DI-5 the poller is handed the ENGINE,
 * which keeps its jobs in memory, so it must be the very engine the job started on.
 */
describe('buildSampleDataDeps — watch', () => {
    const { watchImportJob } = jest.requireMock(
        '@/features/data-installer/services/importJobRunner'
    );
    const { resolveDataInstallerAccess } = jest.requireMock(
        '@/features/data-installer/handlers/dataInstallerHandlers'
    );

    /** A read client, as the access hands over: the engine reads a pack's rows through it. */
    const readClient = {
        getDatapackDetail: jest.fn(),
        batchGetDataItems: jest.fn(),
        getDataItem: jest.fn(),
    };
    /** The engine the job runs on: the two methods the poller calls answer from its jobs. */
    const engine = {
        getJobStatus: jest.fn(),
        getJobFailureReason: jest.fn(),
        startImport: jest.fn(async () => ({ activationId: 'act-1' })),
    } as unknown as DatapackEngine;

    beforeEach(() => {
        dataInstallerAddress(INSTALLER_ADDRESS);
        resolveDataInstallerAccess.mockResolvedValue({
            ok: true,
            client: readClient,
            baseUrl: 'https://example.test/api',
            getToken: async () => 'tok',
        });
        watchImportJob.mockResolvedValue({ outcome: 'success', perType: {} });
        (buildDatapackEngine as jest.Mock).mockReturnValue(engine);
    });

    // `clearAllMocks` clears CALLS, not implementations, so the ok:true override
    // above would otherwise leak into every later describe in this file.
    afterEach(() => {
        resolveDataInstallerAccess.mockResolvedValue({ ok: false });
    });

    it('passes a client that can report job status', async () => {
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: ['categories'] });

        const passed = watchImportJob.mock.calls[0][0].client;
        expect(typeof passed.getJobStatus).toBe('function');
        expect(typeof passed.getJobFailureReason).toBe('function');
    });

    /**
     * CONTROL. The assertion above must be sensitive to WHICH object answers: a client
     * without the job has nothing to say about it. The job is started and watched on one
     * engine, built once for the whole job.
     */
    it('CONTROL — the polls reach the engine the job was started on, built once', async () => {
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn());

        await deps.startImport({ id: { name: 'frescopa', version: 'main' }, commerceInstance: 'x', dataTypes: ['categories'] });
        await deps.watch({ activationId: 'act-1', requestedTypes: ['categories'] });

        expect(watchImportJob.mock.calls[0][0].client).toBe(engine);
        expect(buildDatapackEngine).toHaveBeenCalledTimes(1);
    });

    // The poller names the job from this; a removal labelled `import` is what the
    // 2026-08-17 log said while deleting.
    it('labels the job with the operation it was given', async () => {
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: [], operation: 'reset' });

        expect(watchImportJob.mock.calls[0][0].operation).toBe('reset');
    });

    it('defaults the label to import when none is given', async () => {
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: [] });

        expect(watchImportJob.mock.calls[0][0].operation).toBe('import');
    });

    it("defaults to 'reset' when the deps were built for a removal", async () => {
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn(), 'remove');

        await deps.watch({ activationId: 'act-1', requestedTypes: [] });

        expect(watchImportJob.mock.calls[0][0].operation).toBe('reset');
    });

    // The run's reason is what a failed creation install records (step-04 S7).
    it('hands back the reason the job ended without success', async () => {
        watchImportJob.mockResolvedValue({ outcome: 'partial', perType: { products: 'error' }, reason: 'Products refused.' });
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn());

        const watched = await deps.watch({ activationId: 'act-1', requestedTypes: [] });

        expect(watched).toStrictEqual({ outcome: 'partial', perType: { products: 'error' }, reason: 'Products refused.' });
    });

    // The Datapacks screen's Uninstall reads the same flag (`importJobWatch`, step-05 R1).
    it('hands back that a removal left part of the pack in the store', async () => {
        watchImportJob.mockResolvedValue({ outcome: 'success', perType: { categories: 'success' }, leftInStore: true });
        const deps = buildSampleDataDeps(makeImportHarness(), PROJECT, jest.fn(), 'remove');

        const watched = await deps.watch({ activationId: 'act-1', requestedTypes: [] });

        expect(watched).toStrictEqual({ outcome: 'success', perType: { categories: 'success' }, leftInStore: true });
    });
});

/**
 * The progress line must name what is actually happening.
 *
 * It was hardcoded to "Installing", so a reset's REMOVAL reported
 * `Installing sample data — 2 of 14 types done` while deleting. Reported live
 * 2026-08-17 as apparent evidence that reset reinstalls sample data — it does
 * not, and a backlog item was nearly written around the label rather than the
 * behaviour. A message that states the opposite of the operation is worse than
 * no message: it is trusted.
 */
describe('buildSampleDataDeps — progress wording', () => {
    // Since 2026-08-22 the report is STRUCTURED (done/total/processing) and each
    // surface composes its own line under its own step; the wording that says
    // Installing or Removing is that step's, from the stage table (2026-10-16).
    const perType: Record<string, DataTypeStatus> = { categories: 'success', products: 'pending' };

    it('counts finished types, not pending ones', () => {
        const report = jest.fn();
        buildSampleDataDeps(makeImportHarness(), PROJECT, report, 'remove').onProgress?.(perType);

        expect(report).toHaveBeenCalledWith(expect.objectContaining({ done: 1, total: 2 }));
    });

    it('names the types processing right now, with friendly labels', () => {
        const report = jest.fn();
        const live: Record<string, DataTypeStatus> = {
            categories: 'success',
            customer_groups: 'processing',
        };
        buildSampleDataDeps(makeImportHarness(), PROJECT, report, 'install').onProgress?.(live);

        expect(report).toHaveBeenCalledWith(
            expect.objectContaining({ processing: ['Customer Groups'] })
        );
    });
});
