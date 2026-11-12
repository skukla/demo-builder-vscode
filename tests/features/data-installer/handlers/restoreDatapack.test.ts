/**
 * Restore (Phase 3/5, owner 2026-11-12, J4-3): Commerce goes back to the datapack the demo uses as
 * its latest save, throwing away the SC's Commerce edits made since.
 *
 * The check comes first and writes nothing. It answers one of three ways:
 * - up to date: the target is the version installed and Commerce matches it, so nothing starts;
 * - unsaved edits: without confirm it asks ("Restore My Luma?"), with confirm it starts;
 * - only a newer save: it starts straight away, as nothing of the SC's is lost.
 *
 * A start is one job through the import path: what is installed is uninstalled by its install
 * record and the target installed, with the SC's changes dropped, never saved. A same-version
 * restore is a real replace, not the update in place an ordinary import of the same version does.
 *
 * The seams: the library's access guard (its client answers the SC's versions and what a save
 * holds), the install record, the store comparison (`previewChanges`, which reads Commerce), and
 * the settling of changes (asserted for the answer it is handed).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
    resolveDatapackAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/storeChanges', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/storeChanges'),
    previewChanges: jest.fn(),
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
    resetImportHandlerMocks,
} from './importHandlers.testUtils';
import {
    resolveDataInstallerAccess,
    resolveDatapackAccess,
} from '@/features/data-installer/handlers/dataInstallerHandlers';
import { settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type {
    ChangePreview,
    KindChanges,
} from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
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
const NEWEST = '20261112-120000';
const INSTALLED = '20261110-090000';
const INSTANCE = 'https://paas.example.test';
const ASKS =
    'Commerce goes back to My Luma as you last saved it. Anything you changed since is lost. Send confirm:true to proceed.';

const mockLibrary = resolveDataInstallerAccess as jest.Mock;
const mockWriteAccess = resolveDatapackAccess as jest.Mock;
const mockPreview = jest.mocked(previewChanges);
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

/** A store client: the rows it lists, and what each version holds. */
function client(rows: DatapackSummary[], displayName = 'My Luma') {
    const page: Page<DatapackSummary> = { items: rows, count: rows.length };
    return {
        findDatapacks: jest.fn(async () => page),
        getDatapackDetail: jest.fn(
            async (id: DatapackId): Promise<DatapackDetail> => ({
                ...row(id.version),
                id,
                displayName,
            })
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

function access(rows: DatapackSummary[], displayName?: string) {
    return {
        ok: true as const,
        client: client(rows, displayName),
        baseUrl: 'https://store.example.test',
        getToken: async () => 'tok',
    };
}

/** A project using `datapack`, with a Commerce instance to write to. */
function projectOn(
    datapack: Project['datapack'] = { name: NAME, version: INSTALLED, store: 'library' }
): Partial<Project> {
    return {
        ...PAAS_PROJECT,
        componentConfigs: {
            'adobe-commerce-paas': {
                ...PAAS_PROJECT.componentConfigs?.['adobe-commerce-paas'],
                ADOBE_COMMERCE_URL: INSTANCE,
            },
        },
        ...(datapack ? { datapack } : {}),
    };
}

const record = (version: string, name = NAME): InstallRecord => ({
    format: 1,
    pack: { name, version },
    engine: 'demo-builder',
    startedAt: '2026-11-10T09:00:00.000Z',
    target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
    created: [],
});

const NONE = { count: 0, names: [] };

/** One kind of what installing again would do. */
function kind(over: Partial<KindChanges> = {}): KindChanges {
    return {
        kind: 'products',
        update: NONE,
        add: NONE,
        inStore: NONE,
        remove: NONE,
        keep: NONE,
        ...over,
    };
}

/** Commerce as the installed save left it: nothing to update, add, remove or keep. */
const MATCHES: ChangePreview = { installed: true, kinds: [kind(), kind({ kind: 'categories' })] };
/** The SC changed a product in the Admin since the install. */
const EDITED: ChangePreview = {
    installed: true,
    kinds: [kind({ keep: { count: 1, names: ['MH01'] } })],
};

beforeEach(() => {
    resetImportHandlerMocks();
    jest.mocked(readInstallRecord).mockImplementation(async (_files, _path, pack) =>
        record(pack.version, pack.name)
    );
    settle.mockResolvedValue({});
    mockLibrary.mockResolvedValue(access([row(NEWEST), row(INSTALLED), row('main')]));
    mockPreview.mockResolvedValue(MATCHES);
    // The write gate reads through this too; it stays real unless a test hands in a store.
    mockWriteAccess.mockImplementation(
        jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers').resolveDatapackAccess,
    );
});

const restore = (
    context: Parameters<(typeof importHandlers)['restore-datapack']>[0],
    payload: object
) => importHandlers['restore-datapack'](context, payload);

describe('up to date', () => {
    it('answers upToDate and starts nothing when the installed save is the newest and Commerce matches it', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED), row('main')]));
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response).toEqual({
            success: true,
            data: { upToDate: true, displayName: 'My Luma' },
        });
        expect(startImport).not.toHaveBeenCalled();
        // The check read the version installed, where it is installed.
        expect(mockPreview).toHaveBeenCalledWith(
            expect.anything(),
            { name: NAME, version: INSTALLED },
            'library'
        );
    });

    it('is up to date even with confirm: nothing to put back means nothing to run', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response.data).toEqual({ upToDate: true, displayName: 'My Luma' });
        expect(startImport).not.toHaveBeenCalled();
    });
});

describe('unsaved edits', () => {
    it('without confirm, asks and starts nothing', async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response).toMatchObject({
            success: false,
            code: ErrorCode.CHANGES_NEED_ANSWER,
            error: ASKS,
            data: { asks: true, displayName: 'My Luma' },
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('asks on the same save too: Commerce differs from what it put there', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response.data).toEqual({ asks: true, displayName: 'My Luma' });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('with confirm, starts: the newest save over the installed one, changes dropped', async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response.success).toBe(true);
        expect(response.data).toMatchObject({
            activationId: 'act-1',
            target: { name: NAME, version: NEWEST },
        });
        expect(settle).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ pack: { name: NAME, version: INSTALLED }, answer: 'drop' }),
            expect.any(Function)
        );
        expect(startImport).toHaveBeenCalledWith({
            id: { name: NAME, version: NEWEST },
            source: 'library',
            commerceInstance: INSTANCE,
            dataTypes: ['categories', 'products'],
            target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
            replaces: { name: NAME, version: INSTALLED },
        });
    });
});

describe('only a newer save', () => {
    it('starts straight away without confirm, as nothing of the SC is lost', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response.success).toBe(true);
        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: NAME, version: NEWEST },
                replaces: { name: NAME, version: INSTALLED },
            })
        );
    });
});

describe('a same-version restore is a real replace', () => {
    it('uninstalls the version installed and installs it again, where an import of it would update in place', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        await restore(context, { datapackName: NAME, confirm: true });

        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: NAME, version: INSTALLED },
                replaces: { name: NAME, version: INSTALLED },
            })
        );
        expect(settle).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ answer: 'drop' }),
            expect.any(Function)
        );
    });

    it('a team pack restores the version installed, read through the library', async () => {
        const { startImport } = happyEngine();
        const team = [row('main', { team: true, mine: false, displayName: 'Bodea' })];
        mockLibrary.mockResolvedValue(access(team, 'Bodea'));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(
            projectOn({ name: NAME, version: 'main', store: 'library' })
        );

        await restore(context, { datapackName: NAME, confirm: true });

        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: NAME, version: 'main' },
                replaces: { name: NAME, version: 'main' },
            })
        );
    });

    it("a colleague's save restores the save installed, not their newest", async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(
            access([row(NEWEST, { mine: false }), row(INSTALLED, { mine: false })])
        );
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        await restore(context, { datapackName: NAME, confirm: true });

        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({ id: { name: NAME, version: INSTALLED } })
        );
    });

    it('a Data Installer pack restores the version installed, read through the write access', async () => {
        const { startImport } = happyEngine();
        mockWriteAccess.mockResolvedValue(access([], 'Luma'));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(
            projectOn({ name: 'luma', version: 'eds-compatible' })
        );

        const response = await restore(context, { datapackName: 'luma' });

        expect(response).toMatchObject({ data: { asks: true, displayName: 'Luma' } });
        await restore(context, { datapackName: 'luma', confirm: true });
        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: 'luma', version: 'eds-compatible' },
                source: 'installer',
                replaces: { name: 'luma', version: 'eds-compatible' },
            })
        );
        expect(mockLibrary).not.toHaveBeenCalled();
    });
});

describe('the agent waits', () => {
    it('with waitSeconds, waits for the job and carries it in the answer', async () => {
        happyEngine();
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true, waitSeconds: 1 });

        expect(response.data).toHaveProperty('job');
    });
});

describe('refusals', () => {
    it.each([
        ['the project has no datapack', { ...projectOn(), datapack: undefined }, NAME, 'datapack this project uses'],
        [
            'another datapack than the project uses',
            projectOn(),
            'someone-elses-pack',
            'datapack this project uses',
        ],
        ['no datapack is named', projectOn(), undefined, 'datapack this project uses'],
    ])('refuses when %s', async (_label, project, datapackName, says) => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project);

        const response = await restore(context, { datapackName, confirm: true });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(response.error).toContain(says);
        expect(startImport).not.toHaveBeenCalled();
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it('refuses when Demo Builder has no install record to take it out by', async () => {
        const { startImport } = happyEngine();
        jest.mocked(readInstallRecord).mockResolvedValue(undefined);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(response.error).toContain('no record of installing');
        expect(startImport).not.toHaveBeenCalled();
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it('refuses when the project names no Commerce instance', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness({ ...projectOn(), componentConfigs: {} });

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(response.error).toContain('no Commerce instance');
        expect(startImport).not.toHaveBeenCalled();
    });

    it('a check that could not read Commerce is never "up to date", and starts nothing', async () => {
        const { startImport } = happyEngine();
        mockPreview.mockRejectedValue(new Error('Commerce said 503'));
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response.success).toBe(false);
        expect(response.data).toBeUndefined();
        expect(startImport).not.toHaveBeenCalled();
    });

    it('CONTROL: the same project, confirmed, does start', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectOn());

        await restore(context, { datapackName: NAME, confirm: true });

        expect(startImport).toHaveBeenCalledTimes(1);
    });
});
