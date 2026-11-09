/**
 * What the removal handlers ask of a pack Demo Builder installed, with the real handler, engine and
 * record: the types sent do not decide what goes, the job reports the record's kinds, and a pack
 * that can no longer be read can still be removed. The Data Installer's gate and the job's poller
 * are the only fakes above the store.
 */

// First, on purpose: it owns the Commerce mock, and the handlers below load the engine that uses it.
import { type TicksHarness, PACK, ROWS, ticksHarness } from '../services/buildDatapackEngine-ticks.testUtils';
import { makeImportHarness, importHandlers, mockedBuildEngine, mockedInstalledByDemoBuilder, mockedWatch } from './importHandlers.testUtils';
import { createMockProject } from '../../../helpers/projectFake';
import { resolveDatapackWriteAccess } from '@/features/data-installer/handlers/datapackWriteGate';
import type { DatapackEngineAccess } from '@/features/data-installer/services/buildDatapackEngine';
import { installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn(async () => undefined) }));
jest.mock('@/features/data-installer/handlers/datapackWriteGate', () => ({ resolveDatapackWriteAccess: jest.fn() }));

const mockedGate = resolveDatapackWriteAccess as jest.MockedFunction<typeof resolveDatapackWriteAccess>;
/** The real engine and record check: the shared wall stubs both for the suites that drive the handlers' order. */
const actual = jest.requireActual<typeof import('@/features/data-installer/services/buildDatapackEngine')>('@/features/data-installer/services/buildDatapackEngine');

const unreadable: DatapackEngineAccess['catalog'] = {
    getDatapackDetail: async () => {
        throw new Error('The pack is gone from its store.');
    },
    getDataItem: async () => {
        throw new Error('The pack is gone from its store.');
    },
};

let h: TicksHarness;

const projectOf = () => createMockProject({ path: h.dir, datapack: { ...PACK, store: 'installer' }, componentSelections: { backend: 'adobe-commerce-paas' } });
const RESET = { datapackName: PACK.name, version: PACK.version, commerceInstance: 'inst', websiteCode: 'base', storeCode: 'default', confirm: true, changes: 'drop' };

beforeEach(() => {
    jest.clearAllMocks();
    h = ticksHarness();
    mockedBuildEngine.mockImplementation(actual.buildDatapackEngine);
    mockedInstalledByDemoBuilder.mockImplementation(actual.installedByDemoBuilder);
    mockedGate.mockImplementation(async () => ({
        baseUrl: 'https://installer.test/api',
        getToken: async () => 'tok',
        catalog: unreadable,
        project: projectOf(),
        backend: 'paas',
    }));
    // As the runner does: follow the job the engine started until it has ended.
    mockedWatch.mockImplementation(async ({ client, activationId }) => {
        for (;;) {
            const status = await client.getJobStatus(activationId);
            if (status.processingTimeMs !== undefined) return { outcome: 'success', perType: status.perType };
            await new Promise((resolve) => setImmediate(resolve));
        }
    });
});

afterEach(() => h.cleanUp());

const whenWatchEnds = async () => {
    await Promise.all(mockedWatch.mock.results.map((r) => r.value));
    await new Promise((resolve) => setImmediate(resolve));
};

describe('reset-datapack on a pack Demo Builder installed', () => {
    beforeEach(async () => {
        await h.importTypes(Object.keys(ROWS));
    });

    it.each([
        ['nothing named', {}],
        ['one type ticked', { dataTypes: ['categories'] }],
    ])('with %s takes all the record lists, and the job reports its kinds', async (_name, over) => {
        const result = await importHandlers['reset-datapack'](makeImportHarness(projectOf()).context, { ...RESET, ...over });
        await whenWatchEnds();

        expect(result.success).toBe(true);
        expect(mockedWatch.mock.calls[0][0].requestedTypes).toEqual(['categories', 'products']);
        expect(h.store.products.size).toBe(0);
        expect(await h.onRecord()).toStrictEqual([]);
    });

    // The pack's own store is what the mocked gate's catalog stands for, and it throws: a removal
    // that read the pack could not run, and a thing that cannot be undone is a finding.
    it('runs when the pack can no longer be read', async () => {
        const result = await importHandlers['reset-datapack'](makeImportHarness(projectOf()).context, RESET);
        await whenWatchEnds();

        expect(result.success).toBe(true);
        expect(h.store.products.size).toBe(0);
    });

    it('refuses a store other than the recorded one, and removes nothing', async () => {
        const result = await importHandlers['reset-datapack'](makeImportHarness(projectOf()).context, { ...RESET, websiteCode: 'other' });

        expect(result).toMatchObject({ success: false, error: 'racks@1.0.0 is installed on the website base. Choose that one to remove it.' });
        expect(h.store.products.size).toBe(1);
        expect(mockedWatch).not.toHaveBeenCalled();
    });

    it('clears the project, once it is the pack the project names', async () => {
        const project = projectOf();

        await importHandlers['reset-datapack'](makeImportHarness(project).context, RESET);
        await whenWatchEnds();

        expect(project.datapack).toBeUndefined();
    });
});

describe('reset-datapack on a pack with no record', () => {
    // The Data Installer service installed it, before its engine was deleted (DI-12): nothing is removed by name.
    it('is refused with Clear Demo Data, and nothing is sent', async () => {
        const result = await importHandlers['reset-datapack'](makeImportHarness(projectOf()).context, { ...RESET, dataTypes: ['categories'] });

        expect(result).toEqual({
            success: false,
            error: 'The Data Installer installed this datapack, so Demo Builder has no record of what it added. Use Clear Demo Data to remove it.',
            code: 'INVALID_OPERATION',
        });
        expect(h.store.sent).toStrictEqual([]);
    });
});

describe('get-datapack-removal-scope', () => {
    const scope = (payload: Record<string, unknown> = { datapackName: PACK.name, version: PACK.version }) =>
        importHandlers['get-datapack-removal-scope'](makeImportHarness(projectOf()).context, payload);

    /** Where the record says the pack went: the form locks its pickers to it (owner, 2026-11-08). */
    const AT = { websiteCode: 'base', storeCode: 'default' };

    it('names the kinds on the record, in install order, however little was asked for', async () => {
        await h.importTypes(['categories']);
        await expect(scope()).resolves.toEqual({ success: true, data: { recordedKinds: ['categories'], installedAt: AT } });

        await h.importTypes(['products']);
        await expect(scope()).resolves.toEqual({ success: true, data: { recordedKinds: ['categories', 'products'], installedAt: AT } });
    });

    it('is null with no record: the service would remove it', async () => {
        await expect(scope()).resolves.toEqual({ success: true, data: { recordedKinds: null } });
    });

    it('fails rather than guess when the record cannot be read', async () => {
        const file = installRecordPath(h.dir, PACK);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'not json');

        await expect(scope()).resolves.toMatchObject({ success: false, error: expect.any(String) });
    });

    it('needs the pack', async () => {
        await expect(scope({})).resolves.toEqual({ success: false, error: 'A datapack name and version are required.' });
    });

    it('reads no store: it answers with the Data Installer down', async () => {
        await scope();

        expect(mockedGate).not.toHaveBeenCalled();
    });
});
