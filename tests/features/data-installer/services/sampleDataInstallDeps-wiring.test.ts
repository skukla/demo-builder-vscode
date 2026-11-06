/**
 * buildSampleDataDeps — the four closures behind creation's install and reset's removal.
 *
 * The sibling suite pins the two shape mismatches that shipped (the credential
 * dispatch and the client handed to the poller) and the progress wording. What
 * it never enters is `inventory`, `startImport`, `startDelete` and the engine they
 * build — 25 of this module's mutants sat in code no test reached (measured
 * 2026-09-06), including both halves of the "not reachable" refusal.
 *
 * `resolveDataInstallerAccess` is one seam: it decides reachable-or-not. The engine
 * (`buildDatapackEngine`) is the other, built once per job.
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        resolveDataInstallerAccess,
        // The write path's door, as it answers with the Data Installer's address set.
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    buildDatapackEngine: jest.fn(),
    installedByDemoBuilder: jest.fn(),
}));
jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn(async () => undefined) }));
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
}));

import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { buildDatapackEngine, installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { watchImportJob } from '@/features/data-installer/services/importJobRunner';
import type { DataTypeStatus } from '@/features/data-installer/types';
import {
    dataInstallerAddress,
    importHarness,
    ACCS_PROJECT,
    INSTALLER_ADDRESS,
    NOT_REACHABLE,
} from './sampleDataInstallDeps.testUtils';

const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<
    typeof resolveDataInstallerAccess
>;
const mockedBuild = buildDatapackEngine as unknown as jest.Mock;
const mockedInstalled = installedByDemoBuilder as jest.MockedFunction<typeof installedByDemoBuilder>;
const mockedWatch = watchImportJob as unknown as jest.Mock;

const PROJECT = ACCS_PROJECT;
const PACK = { name: 'citisignal', version: '1.2.0' };

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
    return buildSampleDataDeps(importHarness(), PROJECT, jest.fn(), mode);
}

beforeEach(() => {
    jest.clearAllMocks();
    dataInstallerAddress(INSTALLER_ADDRESS);
    mockedBuild.mockImplementation(() => ({
        startImport: jest.fn().mockResolvedValue({ activationId: 'imp-1' }),
        startDelete: jest.fn().mockResolvedValue({ activationId: 'del-1' }),
    }));
    mockedInstalled.mockResolvedValue(true);
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

    it('sends the request to the engine and returns its activation id', async () => {
        reachable(readClient());
        const d = deps();

        await expect(d.startImport(REQUEST)).resolves.toEqual({ activationId: 'imp-1' });

        expect(mockedBuild.mock.results[0].value.startImport).toHaveBeenCalledWith(REQUEST);
    });

    it('builds that engine for the project, reading packs through the access client', async () => {
        const client = readClient();
        reachable(client);

        await deps().startImport(REQUEST);

        expect(mockedBuild).toHaveBeenCalledWith(expect.objectContaining({ project: PROJECT, catalog: client }), expect.any(Function));
    });

    it('Reset takes the same request to the delete verb', async () => {
        reachable(readClient());
        const d = deps('remove');

        await expect(d.startDelete!(REQUEST)).resolves.toEqual({ activationId: 'del-1' });

        expect(mockedBuild.mock.results[0].value.startDelete).toHaveBeenCalledWith(REQUEST);
    });

    it('refuses rather than building an engine against nothing when unreachable', async () => {
        unreachable();

        await expect(deps().startImport(REQUEST)).rejects.toThrow(NOT_REACHABLE);
        expect(mockedBuild).not.toHaveBeenCalled();
    });

    // The Data Installer service installed it, before its engine was deleted (DI-12): no record, no removal by name.
    it('points to Clear Demo Data for a pack Demo Builder has no record of, building nothing', async () => {
        reachable(readClient());
        mockedInstalled.mockResolvedValue(false);
        const project = { ...PROJECT, datapack: PACK };

        await expect(buildSampleDataDeps(importHarness(), project, jest.fn(), 'remove').startDelete!(REQUEST)).rejects.toThrow(
            'The Data Installer installed this datapack, so Demo Builder has no record of what it added. Use Clear Demo Data to remove it.',
        );
        expect(mockedInstalled).toHaveBeenCalledWith(PROJECT.path, PACK);
        expect(mockedBuild).not.toHaveBeenCalled();
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

    // Demo Builder's engine keeps its jobs in memory, so the job is watched through the engine
    // that started it. Building a second one would answer "no such job" (DI-5).
    it('watches through the same engine that started the job', async () => {
        reachable(readClient());
        const d = deps();

        await d.startImport({ datapack: PACK, dataTypes: ['categories'] } as unknown as Parameters<typeof d.startImport>[0]);
        await d.watch({ activationId: 'imp-1', requestedTypes: ['categories'] });
        await d.watch({ activationId: 'imp-1', requestedTypes: ['categories'] });

        expect(mockedAccess).toHaveBeenCalledTimes(1);
        expect(mockedBuild).toHaveBeenCalledTimes(1);
        expect(mockedWatch.mock.calls[0][0].client).toBe(mockedWatch.mock.calls[1][0].client);
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
        buildSampleDataDeps(importHarness(), PROJECT, report).onProgress?.(perType);
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
