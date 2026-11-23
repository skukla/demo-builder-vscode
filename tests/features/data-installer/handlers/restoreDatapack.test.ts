/**
 * Restore (step-07 U1, J9-5 to J9-7; decisions "Where 'back' goes"): Commerce goes back to a previous
 * state of the datapack the demo uses, throwing away the SC's Commerce edits made since.
 *
 * The check comes first and starts nothing. It answers up to date (nothing would change), or the
 * question: one point for a Demo Builder datapack ("as it ships"); for the SC's own, the original, and
 * Last Saved too while there are unsaved edits, with those edits by type for Original's save question.
 *
 * A start (confirm) is one job through the import path: what is installed is uninstalled by its
 * install record and the point installed. The SC's changes are dropped, except Original over unsaved
 * edits, which must say keep (save first) or drop. A same-version restore is a real replace.
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
const INSTALLED = '20261110-090000';
const MIDDLE = '20261105-090000';
const ORIGINAL = '20261103-144000';
const INSTANCE = 'https://paas.example.test';

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
/** A Demo Builder datapack: the library lists it as a team pack, saved by its owner. */
const TEAM = [row(INSTALLED, { team: true, mine: false, displayName: 'Luma' }), row(MIDDLE, { team: true, mine: false })];

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
    mockLibrary.mockResolvedValue(access([row(INSTALLED), row(MIDDLE), row(ORIGINAL), row('main')]));
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

describe('up to date: nothing would change, so nothing starts', () => {
    it('a Demo Builder datapack Commerce matches', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access(TEAM, 'Luma'));
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response).toEqual({ success: true, data: { upToDate: true, displayName: 'Luma' } });
        expect(startImport).not.toHaveBeenCalled();
        // The check read the version installed, where it is installed.
        expect(mockPreview).toHaveBeenCalledWith(expect.anything(), { name: NAME, version: INSTALLED }, 'library');
    });

    it('the SC\'s own datapack whose only save is the one installed, matched, even confirmed', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        const { context } = makeImportHarness(projectOn());

        expect((await restore(context, { datapackName: NAME })).data).toEqual({ upToDate: true, displayName: 'My Luma' });
        expect((await restore(context, { datapackName: NAME, confirm: true })).data).toEqual({ upToDate: true, displayName: 'My Luma' });
        expect(startImport).not.toHaveBeenCalled();
    });
});

describe('the question (J9-5 to J9-7): the check starts nothing', () => {
    it('a Demo Builder datapack with edits has one point, as it ships', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access(TEAM, 'Luma'));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response).toEqual({ success: true, data: { asks: true, displayName: 'Luma', changes: [{ kind: 'products', count: 1 }] } });
        expect(startImport).not.toHaveBeenCalled();
    });

    it("the SC's own with nothing unsaved has the original alone", async () => {
        happyEngine();
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response.data).toEqual({ asks: true, displayName: 'My Luma', own: { original: ORIGINAL } });
    });

    it("the SC's own with unsaved edits has Last Saved and the original, and the edits by type", async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME });

        expect(response.data).toEqual({
            asks: true,
            displayName: 'My Luma',
            own: { lastSaved: INSTALLED, original: ORIGINAL },
            changes: [{ kind: 'products', count: 1 }],
        });
        expect(startImport).not.toHaveBeenCalled();
    });
});

describe('a start', () => {
    const started = (startImport: jest.Mock) => startImport.mock.calls[0]?.[0];

    it('a Demo Builder datapack: the version installed, uninstalled and installed again, edits dropped', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access(TEAM, 'Luma'));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response.data).toMatchObject({ activationId: 'act-1', target: { name: NAME, version: INSTALLED } });
        expect(settle).toHaveBeenCalledWith(context, expect.objectContaining({ pack: { name: NAME, version: INSTALLED }, answer: 'drop' }), expect.any(Function));
        expect(startImport).toHaveBeenCalledWith({
            id: { name: NAME, version: INSTALLED },
            source: 'library',
            commerceInstance: INSTANCE,
            dataTypes: ['categories', 'products'],
            target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
            replaces: { name: NAME, version: INSTALLED },
        });
    });

    // Review U1-4: the consent cannot name a point the agent did not choose, so none is picked for it.
    it.each([
        ['over unsaved edits', EDITED],
        ['with nothing unsaved', MATCHES],
    ])("the SC's own %s, confirmed with no point, answers the question and starts nothing", async (_label, preview) => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(preview);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true });

        expect(response).toMatchObject({ success: true, data: { asks: true, own: { original: ORIGINAL } } });
        expect(startImport).not.toHaveBeenCalled();
    });

    it("the SC's own, confirmed to Last Saved over unsaved edits, drops them", async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        await restore(context, { datapackName: NAME, confirm: true, to: 'lastSaved' });

        expect(started(startImport)).toMatchObject({ id: { name: NAME, version: INSTALLED }, replaces: { name: NAME, version: INSTALLED } });
        expect(settle).toHaveBeenCalledWith(context, expect.objectContaining({ answer: 'drop' }), expect.any(Function));
    });

    it('Original over unsaved edits with no answer about them asks, and starts nothing', async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true, to: 'original' });

        expect(response).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER, data: { asks: true } });
        expect(response.error).toContain('Send changes: keep');
        expect(startImport).not.toHaveBeenCalled();
    });

    it.each([
        ['keep', 'keep'],
        ['drop', 'drop'],
    ])('Original over unsaved edits with changes: %s installs the original, settling them that way', async (changes, answer) => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true, to: 'original', changes });

        expect(response.data).toMatchObject({ target: { name: NAME, version: ORIGINAL } });
        expect(started(startImport)).toMatchObject({ id: { name: NAME, version: ORIGINAL } });
        expect(settle).toHaveBeenCalledWith(context, expect.objectContaining({ answer }), expect.any(Function));
    });

    it("the SC's own with nothing unsaved, confirmed to its original, goes there asking nothing more", async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectOn());

        await restore(context, { datapackName: NAME, confirm: true, to: 'original' });

        expect(started(startImport)).toMatchObject({ id: { name: NAME, version: ORIGINAL } });
        expect(settle).toHaveBeenCalledWith(context, expect.objectContaining({ answer: 'drop' }), expect.any(Function));
    });

    it('refuses a point on a datapack that is not the SC\'s own', async () => {
        const { startImport } = happyEngine();
        mockLibrary.mockResolvedValue(access(TEAM, 'Luma'));
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true, to: 'original' });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('a Data Installer pack restores the version installed, read through the write access', async () => {
        const { startImport } = happyEngine();
        mockWriteAccess.mockResolvedValue(access([], 'Luma'));
        mockPreview.mockResolvedValue(EDITED);
        const { context } = makeImportHarness(projectOn({ name: 'luma', version: 'eds-compatible' }));

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
        // Never the library: the pack is read through the write access. (Its name may be read from the
        // Data Installer, owner 2026-11-16, which is not the library.)
        expect(mockLibrary).not.toHaveBeenCalledWith(expect.anything(), 'library');
    });

    // Step 03, S2: the job's record says it is a restore, for the window and agents.
    it('records the job as a restore', async () => {
        happyEngine();
        const { context } = makeImportHarness(projectOn());

        await restore(context, { datapackName: NAME, confirm: true, to: 'original' });

        const status = await importHandlers['get-datapack-import-status'](context, {});
        expect(status.data).toMatchObject({ purpose: 'restore' });
    });
});

describe('the agent waits', () => {
    it('with waitSeconds, waits for the job and carries it in the answer', async () => {
        happyEngine();
        const { context } = makeImportHarness(projectOn());

        const response = await restore(context, { datapackName: NAME, confirm: true, to: 'original', waitSeconds: 1 });

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

        await restore(context, { datapackName: NAME, confirm: true, to: 'original' });

        expect(startImport).toHaveBeenCalledTimes(1);
    });
});
