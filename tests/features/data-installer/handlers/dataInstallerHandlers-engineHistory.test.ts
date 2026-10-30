/**
 * "What is installed" and "what happened" answer from both engines (datapack step 14, item 17):
 * Demo Builder's install records and activity log beside the open project come first, the
 * service's tracking and request log after, each row tagged with its source, paged as one list.
 *
 * The project is a real folder in the temp dir, its records written by the engine's own record
 * writer and its log by the engine's own log writer, so the files read here are the files the
 * engine leaves.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    dataInstallerHandlers,
    makeAccessContext,
    MockedClient,
    resetDataInstallerHandlerMocks,
    setupSettings,
} from './dataInstallerHandlers.testUtils';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import {
    installRecordPath,
    nodeRecordFiles,
    openInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    type EngineActivityEntry,
    appendEngineActivity,
    nodeActivityFiles,
} from '@/features/data-installer/services/engineActivityLog';
import type { ActivityEntry, HistoryPage, InstalledDatapack, Page } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

/** The tenant id `deriveImportInstance` reads off this endpoint. */
const INSTANCE = 'UoGYsHrcxMyeoVd2zUktZi';
const PACK = { name: 'bodea-main', version: '1.2.0' };

let dir: string;

function project(): Project {
    return createMockProject({
        path: dir,
        componentConfigs: {
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: `https://na1-sandbox.api.commerce.adobe.com/${INSTANCE}/graphql` },
        },
    });
}

function context() {
    return makeAccessContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project()) }),
    });
}

async function installed(objects: Array<{ kind: string; id: string }>, pack = PACK): Promise<void> {
    const recorder = await openInstallRecord(nodeRecordFiles, dir, pack, () => '2026-10-30T09:00:00.000Z');
    for (const object of objects) await recorder.record(object);
}

function entry(overrides: Partial<EngineActivityEntry> = {}): EngineActivityEntry {
    return {
        format: 1,
        activationId: 'demo-builder-1',
        pack: PACK,
        operation: 'import',
        dataTypes: ['categories'],
        outcome: 'success',
        startedAt: '2026-10-30T09:00:00.000Z',
        finishedAt: '2026-10-30T09:01:00.000Z',
        commerceInstance: INSTANCE,
        ...overrides,
    };
}

const SERVICE_INSTALLED: Page<InstalledDatapack> = {
    items: [{ commerceInstance: INSTANCE, id: { name: 'citisignal', version: 'main' }, dataTypes: ['products'], art: {} }],
    count: 1,
    total: 7,
};

const SERVICE_ACTIVITY: Page<ActivityEntry> = {
    items: [{ id: { name: 'citisignal', version: 'main' }, dataTypes: ['products'], mode: 'import', at: '2026-10-01T00:00:00.000Z' }],
    count: 1,
    total: 40,
};

beforeEach(() => {
    resetDataInstallerHandlerMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-history-'));
    MockedClient.prototype.getInstalledDatapacks = jest.fn().mockResolvedValue(SERVICE_INSTALLED);
    MockedClient.prototype.getActivityLog = jest.fn().mockResolvedValue(SERVICE_ACTIVITY);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('list-installed-datapacks from both engines', () => {
    it("lists Demo Builder's installs first, each saying which engine and how many objects, then the service's", async () => {
        await installed([
            { kind: 'categories', id: '40' },
            { kind: 'products', id: 'ABC' },
            { kind: 'products', id: 'DEF' },
        ]);

        const res = await dataInstallerHandlers['list-installed-datapacks'](context(), { commerceInstance: INSTANCE, limit: 5 });

        expect(res).toStrictEqual({
            success: true,
            data: {
                items: [
                    {
                        commerceInstance: INSTANCE,
                        id: PACK,
                        dataTypes: ['categories', 'products'],
                        art: {},
                        installedAt: '2026-10-30T09:00:00.000Z',
                        source: 'demo-builder',
                        objectCount: 3,
                    },
                    { ...SERVICE_INSTALLED.items[0], source: 'service' },
                ],
                count: 2,
                total: 8,
                limit: 5,
            } satisfies HistoryPage<InstalledDatapack>,
        });
        // The service fills only what is left of the page.
        expect(MockedClient.prototype.getInstalledDatapacks).toHaveBeenCalledWith({ commerceInstance: INSTANCE, limit: 4 });
    });

    it("lists none of the project's installs for another store's instance", async () => {
        await installed([{ kind: 'categories', id: '40' }]);

        const res = await dataInstallerHandlers['list-installed-datapacks'](context(), { commerceInstance: 'another-instance' });

        expect((res.data as HistoryPage<InstalledDatapack>).items.map((row) => row.source)).toStrictEqual(['service']);
    });

    it('filters by pack name, as the service does', async () => {
        await installed([{ kind: 'categories', id: '40' }]);
        await installed([{ kind: 'categories', id: '41' }], { name: 'other-pack', version: 'main' });

        const res = await dataInstallerHandlers['list-installed-datapacks'](context(), { datapackName: 'other-pack' });

        const ours = (res.data as HistoryPage<InstalledDatapack>).items.filter((row) => row.source === 'demo-builder');
        expect(ours.map((row) => row.id)).toStrictEqual([{ name: 'other-pack', version: 'main' }]);
    });

    it("still lists Demo Builder's installs when the service cannot be read, and says why the rest are missing", async () => {
        await installed([{ kind: 'categories', id: '40' }]);
        setupSettings({ enabled: false });

        const res = await dataInstallerHandlers['list-installed-datapacks'](context(), {});

        expect(res.success).toBe(true);
        const data = res.data as HistoryPage<InstalledDatapack>;
        expect(data.items.map((row) => row.source)).toStrictEqual(['demo-builder']);
        expect(data.total).toBe(1);
        expect(data.serviceError).toMatch(/turned off/);
    });

    it('answers a service refusal unchanged when Demo Builder installed nothing here', async () => {
        setupSettings({ enabled: false });

        const res = await dataInstallerHandlers['list-installed-datapacks'](context(), {});

        expect(res.success).toBe(false);
        expect(res.code).toBe(ErrorCode.INVALID_OPERATION);
    });

    it("says Demo Builder's records could not be read rather than listing as if there were none", async () => {
        const recordPath = installRecordPath(dir, PACK);
        fs.mkdirSync(path.dirname(recordPath), { recursive: true });
        fs.writeFileSync(recordPath, 'not json');

        const res = await dataInstallerHandlers['list-installed-datapacks'](context(), {});

        const data = res.data as HistoryPage<InstalledDatapack>;
        expect(data.items.map((row) => row.source)).toStrictEqual(['service']);
        expect(data.engineError).toMatch(/cannot be read/);
    });

    it("tags the service's rows when there is no project open", async () => {
        const res = await dataInstallerHandlers['list-installed-datapacks'](makeAccessContext(), { limit: 5 });

        expect((res.data as HistoryPage<InstalledDatapack>).items).toStrictEqual([{ ...SERVICE_INSTALLED.items[0], source: 'service' }]);
        expect(MockedClient.prototype.getInstalledDatapacks).toHaveBeenCalledWith({ limit: 5 });
    });
});

describe('get-datapack-activity from both engines', () => {
    it("lists Demo Builder's runs first, newest first, with how each ended, then the service's", async () => {
        await appendEngineActivity(nodeActivityFiles, dir, entry({ activationId: 'install' }));
        await appendEngineActivity(
            nodeActivityFiles,
            dir,
            entry({ activationId: 'removal', operation: 'delete', outcome: 'failed', detail: 'Commerce answered 500', finishedAt: '2026-10-30T10:00:00.000Z' }),
        );

        const res = await dataInstallerHandlers['get-datapack-activity'](context(), { commerceInstance: INSTANCE, limit: 50 });

        const data = res.data as HistoryPage<ActivityEntry>;
        expect(data.items).toStrictEqual([
            {
                id: PACK,
                dataTypes: ['categories'],
                commerceInstance: INSTANCE,
                mode: 'delete',
                source: 'demo-builder',
                outcome: 'failed',
                detail: 'Commerce answered 500',
                at: '2026-10-30T10:00:00.000Z',
                activationId: 'removal',
            },
            {
                id: PACK,
                dataTypes: ['categories'],
                commerceInstance: INSTANCE,
                mode: 'import',
                source: 'demo-builder',
                outcome: 'success',
                at: '2026-10-30T09:01:00.000Z',
                activationId: 'install',
            },
            { ...SERVICE_ACTIVITY.items[0], source: 'service' },
        ]);
        expect(data.total).toBe(42);
    });

    it('keeps a removal in the history after its install record is gone', async () => {
        // The engine deletes the record when a removal took everything; only the log remains.
        await appendEngineActivity(nodeActivityFiles, dir, entry({ operation: 'delete' }));

        const res = await dataInstallerHandlers['get-datapack-activity'](context(), {});

        expect((res.data as HistoryPage<ActivityEntry>).items[0]).toMatchObject({ mode: 'delete', source: 'demo-builder' });
    });

    it('filters by operation, as the service does', async () => {
        await appendEngineActivity(nodeActivityFiles, dir, entry({ activationId: 'install' }));
        await appendEngineActivity(nodeActivityFiles, dir, entry({ activationId: 'removal', operation: 'delete' }));

        const res = await dataInstallerHandlers['get-datapack-activity'](context(), { operationMode: 'delete' });

        const ours = (res.data as HistoryPage<ActivityEntry>).items.filter((row) => row.source === 'demo-builder');
        expect(ours.map((row) => row.activationId)).toStrictEqual(['removal']);
        expect(MockedClient.prototype.getActivityLog).toHaveBeenCalledWith({ operationMode: 'delete' });
    });

    describe('paged as one list', () => {
        beforeEach(async () => {
            await appendEngineActivity(nodeActivityFiles, dir, entry({ activationId: 'older' }));
            await appendEngineActivity(nodeActivityFiles, dir, entry({ activationId: 'newer' }));
        });

        it('a page our rows fill asks the service for one row, only for its total', async () => {
            const res = await dataInstallerHandlers['get-datapack-activity'](context(), { limit: 1, skip: 0 });

            const data = res.data as HistoryPage<ActivityEntry>;
            expect(data.items.map((row) => row.activationId)).toStrictEqual(['newer']);
            expect(data.total).toBe(42);
            expect(MockedClient.prototype.getActivityLog).toHaveBeenCalledWith({ limit: 1, skip: 0 });
        });

        it("the next page starts the service's rows where ours ended", async () => {
            const res = await dataInstallerHandlers['get-datapack-activity'](context(), { limit: 50, skip: 2 });

            expect((res.data as HistoryPage<ActivityEntry>).items.map((row) => row.source)).toStrictEqual(['service']);
            expect(MockedClient.prototype.getActivityLog).toHaveBeenCalledWith({ limit: 50, skip: 0 });
        });

        it('a page that straddles both takes the rest of ours and the start of theirs', async () => {
            const res = await dataInstallerHandlers['get-datapack-activity'](context(), { limit: 50, skip: 1 });

            expect((res.data as HistoryPage<ActivityEntry>).items.map((row) => row.activationId ?? row.source)).toStrictEqual(['older', 'service']);
            expect(MockedClient.prototype.getActivityLog).toHaveBeenCalledWith({ limit: 49, skip: 0 });
        });
    });
});
