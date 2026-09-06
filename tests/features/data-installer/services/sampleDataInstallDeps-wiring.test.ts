/**
 * buildSampleDataDeps — the four closures that talk to the service.
 *
 * The sibling suite pins the two shape mismatches that shipped (the credential
 * dispatch and the client handed to the poller) and the progress wording. What
 * it never enters is `inventory`, `startImport`, `startDelete` and the private
 * `writeClient` — 25 of this module's mutants sat in code no test reached
 * (measured 2026-09-06), including both halves of the "the Data Installer is not
 * reachable" refusal.
 *
 * `resolveDataInstallerAccess` is the seam: it decides reachable-or-not, and
 * every closure here is a different answer to that question.
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient', () => ({
    DataInstallerWriteClient: jest.fn(),
}));
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
}));
// Its constructor calls getLogger(), which throws unless the extension has
// activated. The poller itself is mocked above, so the instance is never used.
jest.mock('@/core/shell/pollingService', () => ({
    PollingService: jest.fn().mockImplementation(() => ({})),
}));

import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';
import { watchImportJob } from '@/features/data-installer/services/importJobRunner';
import type { HandlerContext } from '@/types/handlers';
import type { DataTypeStatus } from '@/features/data-installer/types';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<
    typeof resolveDataInstallerAccess
>;
const MockedWriteClient = DataInstallerWriteClient as unknown as jest.Mock;
const mockedWatch = watchImportJob as unknown as jest.Mock;

const PROJECT = { componentSelections: { backend: 'adobe-commerce-accs' } };
const PACK = { name: 'citisignal', version: '1.2.0' };
const NOT_REACHABLE = 'The Data Installer is not reachable for this project.';

function harness(): HandlerContext {
    return createMockHandlerContext({ debugLogger: createMockLogger() });
}

/** The read client, with the two catalog calls `inventory` makes. */
function readClient(overrides: Record<string, unknown> = {}) {
    return {
        getDatapackDetail: jest.fn().mockResolvedValue({ dataTypes: ['categories', 'products'] }),
        batchGetDataItems: jest.fn().mockResolvedValue({ present: ['categories'], missing: [] }),
        getJobStatus: jest.fn(),
        getJobFailureReason: jest.fn(),
        ...overrides,
    };
}

function reachable(client: ReturnType<typeof readClient>): void {
    mockedAccess.mockResolvedValue({
        ok: true,
        client,
        baseUrl: 'https://installer.test/api',
        getToken: async () => 'tok',
    } as unknown as Awaited<ReturnType<typeof resolveDataInstallerAccess>>);
}

function unreachable(): void {
    mockedAccess.mockResolvedValue({ ok: false } as unknown as Awaited<
        ReturnType<typeof resolveDataInstallerAccess>
    >);
}

function deps(mode: 'install' | 'remove' = 'install') {
    return buildSampleDataDeps(harness(), PROJECT, jest.fn(), mode);
}

beforeEach(() => {
    jest.clearAllMocks();
    MockedWriteClient.mockImplementation(() => ({
        startImport: jest.fn().mockResolvedValue({ activationId: 'imp-1' }),
        startDelete: jest.fn().mockResolvedValue({ activationId: 'del-1' }),
    }));
    mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });
});

describe('inventory', () => {
    it('asks the service what it HOLDS for the pack, not what the pack declares', async () => {
        const client = readClient();
        reachable(client);

        await expect(deps().inventory(PACK)).resolves.toStrictEqual(['categories']);

        expect(client.getDatapackDetail).toHaveBeenCalledWith(PACK);
        expect(client.batchGetDataItems).toHaveBeenCalledWith(PACK, ['categories', 'products']);
    });

    it('answers empty — not an exception — when the service is unreachable', async () => {
        unreachable();

        await expect(deps().inventory(PACK)).resolves.toStrictEqual([]);
    });

    it('does not ask for items when the pack declares no data types', async () => {
        const client = readClient({ getDatapackDetail: jest.fn().mockResolvedValue({ dataTypes: [] }) });
        reachable(client);

        await expect(deps().inventory(PACK)).resolves.toStrictEqual([]);

        expect(client.batchGetDataItems).not.toHaveBeenCalled();
    });
});

describe('startImport / startDelete', () => {
    const REQUEST = {
        datapack: PACK,
        dataTypes: ['categories'],
        target: { backend: 'accs' },
    } as unknown as Parameters<ReturnType<typeof deps>['startImport']>[0];

    it('sends the request to the write client and returns its activation id', async () => {
        reachable(readClient());
        const d = deps();

        await expect(d.startImport(REQUEST)).resolves.toEqual({ activationId: 'imp-1' });

        expect(MockedWriteClient.mock.results[0].value.startImport).toHaveBeenCalledWith(REQUEST);
    });

    it('builds that client against the resolved base URL and token source', async () => {
        reachable(readClient());

        await deps().startImport(REQUEST);

        expect(MockedWriteClient).toHaveBeenCalledWith(
            expect.objectContaining({
                baseUrl: 'https://installer.test/api',
                getToken: expect.any(Function),
            }),
        );
    });

    it('Reset takes the same request to the delete verb', async () => {
        reachable(readClient());
        const d = deps('remove');

        await expect(d.startDelete!(REQUEST)).resolves.toEqual({ activationId: 'del-1' });

        expect(MockedWriteClient.mock.results[0].value.startDelete).toHaveBeenCalledWith(REQUEST);
    });

    it('refuses rather than building a client against nothing when unreachable', async () => {
        unreachable();

        await expect(deps().startImport(REQUEST)).rejects.toThrow(NOT_REACHABLE);
        expect(MockedWriteClient).not.toHaveBeenCalled();
    });
});

describe('watch', () => {
    it('returns the poller outcome and its per-type record', async () => {
        reachable(readClient());
        mockedWatch.mockResolvedValue({
            outcome: 'partial',
            perType: { categories: 'success', products: 'error' },
            extra: 'not part of the contract',
        });

        await expect(
            deps().watch({ activationId: 'act-1', requestedTypes: ['categories'] }),
        ).resolves.toEqual({
            outcome: 'partial',
            perType: { categories: 'success', products: 'error' },
        });
    });

    it('forwards the progress callback it was given', async () => {
        reachable(readClient());
        const onProgress = jest.fn();

        await deps().watch({ activationId: 'act-1', requestedTypes: [], onProgress });

        expect(mockedWatch.mock.calls[0][0].onProgress).toBe(onProgress);
    });

    it('refuses when the service is unreachable, rather than polling nothing', async () => {
        unreachable();

        await expect(
            deps().watch({ activationId: 'act-1', requestedTypes: [] }),
        ).rejects.toThrow(NOT_REACHABLE);
        expect(mockedWatch).not.toHaveBeenCalled();
    });
});

/**
 * The done/total split, which drives the progress bar's fraction.
 *
 * The sibling suite's fixture (one success, one pending) cannot see the
 * difference between "finished" and "not finished" — both readings count one
 * type — so these use fixtures where the two disagree.
 */
describe('onProgress counting', () => {
    function reported(perType: Record<string, DataTypeStatus>) {
        const report = jest.fn();
        buildSampleDataDeps(harness(), PROJECT, report).onProgress?.(perType);
        return report.mock.calls[0][0];
    }

    it('counts every SUCCESS as done', () => {
        expect(
            reported({ categories: 'success', products: 'success', prices: 'pending' }),
        ).toEqual(expect.objectContaining({ done: 2, total: 3 }));
    });

    it('counts an ERROR as done too — the type is finished, badly', () => {
        expect(reported({ categories: 'error', products: 'pending' })).toEqual(
            expect.objectContaining({ done: 1, total: 2 }),
        );
    });

    it('counts nothing as done while every type is still queued', () => {
        expect(reported({ categories: 'pending', products: 'processing' })).toEqual(
            expect.objectContaining({ done: 0, total: 2 }),
        );
    });
});
