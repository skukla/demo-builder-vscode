/**
 * The one place the datapack engine is built (DI-5): it reads a pack's rows from Demo Builder's
 * datapack store first, else the Data Installer's catalog, and signs with the project's own
 * Commerce access. The service's engine, and the setting that chose it, were deleted on
 * 2026-11-06 (DI-12).
 */

import {
    buildDatapackEngine,
    installedByDemoBuilder,
    layerFinder,
    projectCommerce,
    readPackItems,
    type DatapackEngineAccess,
} from '@/features/data-installer/services/buildDatapackEngine';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { DatapackId } from '@/types/datapack';
import type { DatapackQuery } from '@/features/data-installer/services/dataInstallerClient';
import { InstallRecordError, installRecordPath, openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine/demoBuilderEngine.testUtils';
import { nodeActivityFiles, readEngineActivity } from '@/features/data-installer/services/engineActivityLog';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockProject } from '../../../helpers/projectFake';
import { forgetPackReads } from '@/features/data-installer/services/packReadCache';
import { forgetReadWindows } from '@/features/data-installer/services/commerceReadWindow';

// Pack reads are kept between callers (`packReadCache`, walk F82): each test reads its own.
beforeEach(() => forgetPackReads());

const mockCommerceClientForProject = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    commerceClientForProject: (...a: unknown[]) => mockCommerceClientForProject(...a),
}));

function access(overrides: Partial<DatapackEngineAccess> = {}): DatapackEngineAccess {
    return {
        catalog: { getDatapackDetail: jest.fn(), getDataItem: jest.fn() },
        project: createMockProject({ path: '/projects/frescopa' }),
        authManager: undefined,
        secrets: undefined,
        ...overrides,
    };
}

describe('buildDatapackEngine', () => {
    it('says the store cannot be written without an Adobe sign-in, rather than trying', async () => {
        const engine = buildDatapackEngine(access(), jest.fn());

        await expect(
            engine.checkCredentials({
                id: { name: 'frescopa', version: 'main' },
                commerceInstance: 'unused',
                dataTypes: ['categories'],
            }),
        ).resolves.toEqual({ usable: false, reason: "Adobe sign-in is required to write to this project's store." });
    });
});

describe('buildDatapackEngine and a settings layer (step 09)', () => {
    it('finds a layer in the library, whichever store holds the pack', async () => {
        const library = {
            getDatapackDetail: jest.fn(),
            getDataItem: jest.fn(async () => ({ dataType: 'store_config', records: [] })),
            findDatapacks: jest.fn(async () => ({
                items: [{ id: { name: 'frescopa-settings', version: 'v1' }, displayName: 'Frescopa settings', shared: false, dataTypes: ['store_config'], art: {} }],
                count: 1,
            })),
        };

        const found = await layerFinder({ libraryCatalog: async () => library }).findLayer?.({ name: 'frescopa', version: 'main' });

        expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: 'frescopa-settings' });
        expect(found?.id).toEqual({ name: 'frescopa-settings', version: 'v1' });
    });

    it('looks nowhere without a library', () => {
        expect(layerFinder({})).toStrictEqual({});
    });
});

describe('buildDatapackEngine activity log', () => {
    // Step 14, item 17: every job Demo Builder's engine finishes is appended beside the project,
    // so the Activity tab and get_datapack_activity can show it after the record is gone.
    it("appends each job Demo Builder's engine finishes to the project's activity log", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-engine-activity-'));
        try {
            const engine = buildDatapackEngine(access({ project: createMockProject({ path: dir }) }), jest.fn());

            // No target: the job stops at once, which is a job that ended all the same.
            await engine.startImport({ id: PACK, commerceInstance: 'unused', dataTypes: ['categories'] });
            // The log is written after the job ends, through the real file system, so it is
            // waited for in REAL time: up to 200 looks 10ms apart. It used to be 100 turns of the
            // event loop, which a full-suite run outpaced while the write sat in the file system's
            // queue, failing the push gate at random (2026-11-04). Normally the first look finds it.
            let entries = await readEngineActivity(nodeActivityFiles, dir);
            for (let i = 0; i < 200 && entries.length === 0; i += 1) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                entries = await readEngineActivity(nodeActivityFiles, dir);
            }

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({ pack: PACK, operation: 'import', outcome: 'failed' });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('projectCommerce', () => {
    // A pack lands on the website and store view the install names, which need not be the
    // project's own. Writing through the project's store view put a reinstall's price change on
    // JustRite's store view while the test website kept the old one (live, 2026-10-29). The
    // service writes store-wide too (catalog spec §0).
    it("writes store-wide, never through the project's own store view", async () => {
        mockCommerceClientForProject.mockResolvedValue({ get: jest.fn(), send: jest.fn() });
        const project = createMockProject({ path: '/projects/frescopa' });
        const authManager = {} as AuthenticationService;

        await projectCommerce({ project, authManager, secrets: undefined })();

        expect(mockCommerceClientForProject).toHaveBeenCalledWith(project, authManager, undefined, undefined, 'all');
    });
});

// Walk F128: a changes check keeps what it reads; the save and the run after it reuse it.
describe('projectCommerce sharing one read of Commerce', () => {
    beforeEach(() => forgetReadWindows());

    it('answers a save from what the changes check just read, and a plain open reads Commerce', async () => {
        const get = jest.fn(async (p: string) => ({ p }));
        mockCommerceClientForProject.mockResolvedValue({ get, send: jest.fn() });
        const project = createMockProject({ path: '/projects/frescopa' });
        const authManager = {} as AuthenticationService;
        const open = (reads?: Parameters<typeof projectCommerce>[1]) => projectCommerce({ project, authManager, secrets: undefined }, reads)();
        const client = async (reads?: Parameters<typeof projectCommerce>[1]) => {
            const opened = await open(reads);
            if ('refusal' in opened) throw new Error(opened.refusal);
            return opened;
        };

        await (await client({ use: 'remember' })).get('categories/12');
        await (await client({ use: 'reuse' })).get('categories/12');
        expect(get).toHaveBeenCalledTimes(1);

        // CONTROL: opened without a window, as every other reader is, it reads Commerce.
        await (await client()).get('categories/12');
        expect(get).toHaveBeenCalledTimes(2);
    });
});

describe('readPackItems, the datapack store first whatever the pack names', () => {
    const ID = { name: 'frescopa', version: 'main' };

    /** A store holding the pack with these rows; with none, one that refuses it. */
    function store(rows?: Record<string, unknown>): jest.Mocked<Required<DatapackEngineAccess>['libraryCatalog'] extends () => Promise<infer C> ? C : never> {
        return {
            findDatapacks: jest.fn(async (_query: DatapackQuery) => ({ items: [], count: 0 })),
            getDatapackDetail: jest.fn(async (_id: DatapackId) => {
                if (!rows) throw new Error('not found');
                return { id: ID, displayName: 'Frescopa', shared: true, dataTypes: Object.keys(rows), art: {} };
            }),
            getDataItem: jest.fn(async (_id, dataType) => ({ dataType, records: rows?.[dataType] })),
        };
    }

    const OURS = { products: ['from the store'] };
    const THEIRS = { products: ['from the Data Installer'] };

    it('reads a pack named in the Data Installer from the store when the store holds it', async () => {
        const installer = store(THEIRS);
        const library = store(OURS);

        await expect(readPackItems({ catalog: installer, libraryCatalog: async () => library }, ID, 'installer')).resolves.toEqual(OURS);

        expect(library.getDatapackDetail).toHaveBeenCalledWith(ID);
        expect(installer.getDatapackDetail).not.toHaveBeenCalled();
    });

    it('falls through to the Data Installer when the store has no such pack', async () => {
        const installer = store(THEIRS);

        await expect(readPackItems({ catalog: installer, libraryCatalog: async () => store() }, ID, 'installer')).resolves.toEqual(THEIRS);

        expect(installer.getDatapackDetail).toHaveBeenCalledWith(ID);
    });

    it('falls through when the store cannot even be opened', async () => {
        const libraryCatalog = async () => {
            throw new Error('The store is not reachable.');
        };

        await expect(readPackItems({ catalog: store(THEIRS), libraryCatalog }, ID, 'installer')).resolves.toEqual(THEIRS);
    });

    it('reads the Data Installer alone when there is no store to ask', async () => {
        await expect(readPackItems({ catalog: store(THEIRS) }, ID, 'installer')).resolves.toEqual(THEIRS);
    });

    it("gives the Data Installer's failure when neither has it", async () => {
        const installer = store();
        installer.getDatapackDetail.mockRejectedValue(new Error('the Data Installer has none'));

        await expect(readPackItems({ catalog: installer, libraryCatalog: async () => store() }, ID, 'installer')).rejects.toThrow('the Data Installer has none');
    });

    it('never falls through for a pack named in the store: its failure is the answer', async () => {
        const installer = store(THEIRS);

        await expect(readPackItems({ catalog: installer, libraryCatalog: async () => store() }, ID, 'library')).rejects.toThrow('not found');

        expect(installer.getDatapackDetail).not.toHaveBeenCalled();
    });

    it('refuses a pack named in the store when there is no store to ask', async () => {
        await expect(readPackItems({ catalog: store(THEIRS) }, ID, 'library')).rejects.toThrow(/cannot be read from here/);
    });
});

describe('installedByDemoBuilder', () => {
    it('is true when its install record is beside the project', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).record({ kind: 'categories', id: '40' });

        await expect(installedByDemoBuilder(PROJECT, PACK, files)).resolves.toBe(true);
    });

    it('is false when there is no record: the Data Installer service installed it', async () => {
        await expect(installedByDemoBuilder(PROJECT, PACK, memoryFiles())).resolves.toBe(false);
    });

    it('refuses to guess when a record is there but cannot be read', async () => {
        const files = memoryFiles({ [installRecordPath(PROJECT, PACK)]: 'not json' });

        await expect(installedByDemoBuilder(PROJECT, PACK, files)).rejects.toThrow(InstallRecordError);
    });
});
