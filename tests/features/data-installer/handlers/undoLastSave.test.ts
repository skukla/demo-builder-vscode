/**
 * Undo Last Save (Phase 2, step-02 slice 5): the project's own datapack goes back to the save before
 * its newest. One job through the import path: the newest save is uninstalled (it is the held pack)
 * and the previous one installed, with the SC's unsaved changes dropped, never saved (a save would
 * make a version the undo then deletes). Only once that job SUCCEEDS is the newest save deleted with
 * its store configuration; a failed job deletes nothing.
 *
 * The seams: the library's access guard (its client answers the SC's versions and what a save
 * holds), the install record, the settling of changes (asserted for the answer it is handed), and
 * the library delete (asserted for the version it is handed, and when).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/datapackLibraryHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/datapackLibraryHandlers'),
    deleteVersionWithLayer: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/removalChanges', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/removalChanges'),
    settleChangesBeforeRemoval: jest.fn(),
}));

import {
    PAAS_PROJECT,
    happyEngine,
    importHandlers,
    makeImportHarness,
    mockedWatch,
    resetImportHandlerMocks,
} from './importHandlers.testUtils';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { deleteVersionWithLayer } from '@/features/data-installer/handlers/datapackLibraryHandlers';
import { settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type {
    DataItemInventory,
    DatapackDetail,
    DatapackSummary,
    Page,
} from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';

const NAME = 'my-luma-1a2b3c';
const NEWEST = '20261110-120000';
const PREVIOUS = '20261109-090000';
const OLDER = '20261101-080000';
const INSTANCE = 'https://paas.example.test';

/** The access guard, mocked as the library suites mock it: the test answers the three reads the undo makes. */
const mockAccess = resolveDataInstallerAccess as jest.Mock;
const mockDelete = jest.mocked(deleteVersionWithLayer);
const settle = jest.mocked(settleChangesBeforeRemoval);

/** A library row of the SC's own, as `find-datapacks` answers it. */
function row(version: string, over: Partial<DatapackSummary> = {}): DatapackSummary {
    return {
        id: { name: NAME, version },
        displayName: 'My Luma',
        shared: false,
        dataTypes: ['categories', 'products'],
        art: {},
        store: 'library',
        mine: true,
        ...over,
    };
}

/** The library client: the rows it lists, and what each version holds. */
function libraryClient(rows: DatapackSummary[]) {
    const page: Page<DatapackSummary> = { items: rows, count: rows.length };
    return {
        findDatapacks: jest.fn(async () => page),
        getDatapackDetail: jest.fn(
            async (id: DatapackId): Promise<DatapackDetail> => row(id.version)
        ),
        batchGetDataItems: jest.fn(
            async (): Promise<DataItemInventory> => ({
                present: ['categories', 'products'],
                missing: [],
                presentCount: 2,
                missingCount: 0,
                requestedCount: 2,
            })
        ),
    };
}

function grantLibrary(rows: DatapackSummary[]) {
    const client = libraryClient(rows);
    const access = {
        ok: true as const,
        client,
        baseUrl: 'https://library.example.test',
        getToken: async () => 'tok',
    };
    mockAccess.mockResolvedValue(access);
    return { client, access };
}

/** A project on the newest save of its own datapack, with a Commerce instance to write to. */
function projectOn(
    version = NEWEST,
    over: Partial<NonNullable<Project['datapack']>> = {}
): Partial<Project> {
    return {
        ...PAAS_PROJECT,
        componentConfigs: {
            'adobe-commerce-paas': {
                ...PAAS_PROJECT.componentConfigs?.['adobe-commerce-paas'],
                ADOBE_COMMERCE_URL: INSTANCE,
            },
        },
        datapack: { name: NAME, version, store: 'library', ...over },
    };
}

const RECORD: InstallRecord = {
    format: 1,
    pack: { name: NAME, version: NEWEST },
    engine: 'demo-builder',
    startedAt: '2026-11-10T12:00:00.000Z',
    target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
    created: [],
};

/** Let the detached watch run to its end. */
const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const THREE_SAVES = [row(NEWEST), row(PREVIOUS), row(OLDER), row('main')];

beforeEach(() => {
    resetImportHandlerMocks();
    jest.mocked(readInstallRecord).mockResolvedValue(RECORD);
    settle.mockResolvedValue({});
    mockDelete.mockResolvedValue('deleted');
});

describe('confirm', () => {
    it('without confirm, says what it does and starts nothing', async () => {
        const { startImport } = happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());

        const response = await importHandlers['undo-last-save'](context, { datapackName: NAME });

        expect(response).toMatchObject({
            success: false,
            code: ErrorCode.INVALID_OPERATION,
            error:
                'Commerce goes back to My Luma as it was before your last save. Anything you changed since is lost. ' +
                'Send confirm:true to proceed.',
        });
        expect(startImport).not.toHaveBeenCalled();
        expect(mockDelete).not.toHaveBeenCalled();
    });
});

describe('the job', () => {
    it('installs the previous save over the newest, dropping unsaved changes', async () => {
        const { startImport } = happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());

        const response = await importHandlers['undo-last-save'](context, {
            datapackName: NAME,
            confirm: true,
        });

        expect(response.success).toBe(true);
        expect(settle).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ pack: { name: NAME, version: NEWEST }, answer: 'drop' }),
            expect.any(Function)
        );
        expect(startImport).toHaveBeenCalledWith({
            id: { name: NAME, version: PREVIOUS },
            source: 'library',
            commerceInstance: INSTANCE,
            dataTypes: ['categories', 'products'],
            // Where the held save is installed, from its install record.
            target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
            replaces: { name: NAME, version: NEWEST },
        });
    });

    // Step 03, S2: the job's record says it is an undo, for the window and agents.
    it('records the job as an undo', async () => {
        happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());

        await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });

        const status = await importHandlers['get-datapack-import-status'](context, {});
        expect(status.data).toMatchObject({ purpose: 'undo' });
    });

    it('deletes the newest save, with its store configuration, once the job succeeds', async () => {
        happyEngine();
        const { access } = grantLibrary(THREE_SAVES);
        const project = projectOn();
        const { context } = makeImportHarness(project);
        mockedWatch.mockResolvedValue({
            outcome: 'success',
            perType: { categories: 'success', products: 'success' },
            replacing: 'success',
        });

        await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });
        await flush();

        expect(mockDelete).toHaveBeenCalledTimes(1);
        expect(mockDelete).toHaveBeenCalledWith(context, access, { name: NAME, version: NEWEST });
        expect(project.datapack).toEqual({ name: NAME, version: PREVIOUS, store: 'library' });
    });

    // A colleague's project file may name the newest save; deleting it would drop them back a save.
    it('keeps the newest save when this SC shared it in a project file, as the save trim does', async () => {
        happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());
        (context.context.globalState.get as jest.Mock).mockImplementation((key: string) =>
            key === 'demoBuilder.datapacksSharedInFiles' ? { [`${NAME}@${NEWEST}`]: { at: '2026-11-12T09:00:00Z' } } : undefined,
        );
        mockedWatch.mockResolvedValue({ outcome: 'success', perType: { categories: 'success', products: 'success' }, replacing: 'success' });

        await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });
        await flush();

        expect(mockDelete).not.toHaveBeenCalled();
    });

    // The agent tool offers waitSeconds (WAIT_FOR_JOB), so the handler must hand it to the start.
    it('with waitSeconds, waits for the job and carries it in the answer', async () => {
        happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());

        const response = await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true, waitSeconds: 1 });

        expect(response.data).toHaveProperty('job');
    });

    it('deletes nothing while the job is still running', async () => {
        happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());
        mockedWatch.mockReturnValue(new Promise(() => undefined));

        await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });
        await flush();

        expect(mockDelete).not.toHaveBeenCalled();
    });

    it('a failed job deletes nothing and leaves the project naming the newest save', async () => {
        happyEngine();
        grantLibrary(THREE_SAVES);
        const project = projectOn();
        const { context } = makeImportHarness(project);
        mockedWatch.mockResolvedValue({
            outcome: 'error',
            perType: { categories: 'error', products: 'error' },
            replacing: 'error',
            stoppedAt: 'replacing',
        });

        await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });
        await flush();

        expect(mockDelete).not.toHaveBeenCalled();
        expect(project.datapack).toEqual({ name: NAME, version: NEWEST, store: 'library' });
    });
});

describe('refusals', () => {
    it('refuses with one save: a named version is not a save', async () => {
        const { startImport } = happyEngine();
        grantLibrary([row(NEWEST), row('main')]);
        const { context } = makeImportHarness(projectOn());

        const response = await importHandlers['undo-last-save'](context, {
            datapackName: NAME,
            confirm: true,
        });

        expect(response).toMatchObject({
            success: false,
            error: 'There is no earlier save to go back to.',
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it.each([
        ['another datapack than the project uses', projectOn(), 'someone-elses-pack', THREE_SAVES],
        [
            'a datapack in the Data Installer',
            projectOn(NEWEST, { store: 'installer' }),
            NAME,
            THREE_SAVES,
        ],
        [
            "a datapack that is not the user's",
            projectOn(),
            NAME,
            THREE_SAVES.map((r) => ({ ...r, mine: false })),
        ],
        ['a team datapack', projectOn(), NAME, THREE_SAVES.map((r) => ({ ...r, team: true }))],
    ])('refuses %s', async (_label, project, datapackName, rows) => {
        const { startImport } = happyEngine();
        grantLibrary(rows);
        const { context } = makeImportHarness(project);

        const response = await importHandlers['undo-last-save'](context, {
            datapackName,
            confirm: true,
        });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(response.error).toContain('Undo Last Save');
        expect(startImport).not.toHaveBeenCalled();
        expect(mockDelete).not.toHaveBeenCalled();
    });

    it('refuses when the project is on an earlier save than the newest', async () => {
        const { startImport } = happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn(PREVIOUS));

        const response = await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(response.error).toContain('no last save to undo');
        expect(startImport).not.toHaveBeenCalled();
    });

    it('refuses when Demo Builder has no install record to take the newest save out by', async () => {
        const { startImport } = happyEngine();
        grantLibrary(THREE_SAVES);
        jest.mocked(readInstallRecord).mockResolvedValue(undefined);
        const { context } = makeImportHarness(projectOn());

        const response = await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(response.error).toContain('no record of installing');
        expect(startImport).not.toHaveBeenCalled();
    });

    it('CONTROL: the same project and rows, confirmed, do start', async () => {
        const { startImport } = happyEngine();
        grantLibrary(THREE_SAVES);
        const { context } = makeImportHarness(projectOn());

        await importHandlers['undo-last-save'](context, { datapackName: NAME, confirm: true });

        expect(startImport).toHaveBeenCalledTimes(1);
    });
});
