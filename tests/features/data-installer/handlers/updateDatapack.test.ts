/**
 * Update (step-07 U1, J9-2): Commerce takes what a newer version of the project's datapack changed,
 * for the data types chosen, keeping the SC's own edits.
 *
 * The check answers what changed by type, read against the version installed's record, or up to date.
 * A start is one import of the newer version over the installed one, in place: nothing uninstalled,
 * nothing saved, the installed version's record carried over (`updates`), and the types left out
 * noted on the record so the amber dot stays.
 *
 * The seams: the library's access guard (its client lists the datapack's versions), the install
 * record (read, carried, its `behind` note), and the store comparison (`previewChanges`).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
    forgetInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecordUpdate', () => ({
    markUpdateBehind: jest.fn(),
    copyInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/storeChanges', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/storeChanges'),
    previewChanges: jest.fn(),
}));

import {
    PAAS_PROJECT,
    happyEngine,
    importHandlers,
    makeImportHarness,
    resetImportHandlerMocks,
} from './importHandlers.testUtils';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import {
    type CreatedObject,
    type InstallRecord,
    forgetInstallRecord,
    readInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { copyInstallRecord, markUpdateBehind } from '@/features/data-installer/services/demoBuilderEngine/installRecordUpdate';
import {
    type ChangePreview,
    type KindChanges,
    previewChanges,
} from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { onDatapacksChanged } from '@/features/data-installer/services/datapackChanges';
import type { DatapackSummary, Page } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const NAME = 'luma-7f3e21';
const INSTALLED = '20261101-090000';
const NEWER = '20261112-120000';
const INSTANCE = 'https://paas.example.test';

const mockLibrary = resolveDataInstallerAccess as jest.Mock;
const mockPreview = jest.mocked(previewChanges);
const mockBehind = jest.mocked(markUpdateBehind);
const mockCopy = jest.mocked(copyInstallRecord);
const mockForget = jest.mocked(forgetInstallRecord);
const HELD = { name: NAME, version: INSTALLED };
const TARGET = { name: NAME, version: NEWER };
/** The call order of a mock's first call, to prove one write came before another. */
const order = (mock: jest.Mock | jest.MockedFunction<never>, nth = 0): number => (mock).mock.invocationCallOrder[nth];

/** A Demo Builder datapack's version, as `find-datapacks` lists it. */
function row(version: string): DatapackSummary {
    return {
        id: { name: NAME, version },
        displayName: 'Luma',
        shared: false,
        dataTypes: [],
        art: {},
        store: 'library',
        team: true,
    };
}

function access(rows: DatapackSummary[]) {
    const page: Page<DatapackSummary> = { items: rows, count: rows.length };
    return {
        ok: true as const,
        client: { findDatapacks: jest.fn(async () => page) },
        baseUrl: 'https://store.example.test',
        getToken: async () => 'tok',
    };
}

const NONE = { count: 0, names: [] };
const named = (...names: string[]) => ({ count: names.length, names });
const kind = (over: Partial<KindChanges>): KindChanges => ({
    kind: 'products',
    update: NONE,
    add: NONE,
    inStore: NONE,
    remove: NONE,
    keep: NONE,
    ...over,
});

/** What the newer Luma changed (J9's scenario, cut down): products added and updated, a kept edit, a cart rule. */
const CHANGED: ChangePreview = {
    installed: true,
    kinds: [
        kind({ kind: 'categories' }),
        kind({ add: named('MS-01'), update: named('MH01', 'MH02'), keep: named('MJ09') }),
        kind({ kind: 'cart_rules', update: named('Spring Sale') }),
    ],
};

/** The installed version's objects as the check hashed them afresh where the store holds the newer rows. */
const REBASED: CreatedObject[] = [{ kind: 'categories', id: '41', key: 'ZZ Customer Picks 3', fingerprint: 'f3', wrote: 'w3', adopted: true }];

const project = (over: Partial<Project> = {}): Partial<Project> => ({
    ...PAAS_PROJECT,
    componentConfigs: {
        'adobe-commerce-paas': {
            ...PAAS_PROJECT.componentConfigs?.['adobe-commerce-paas'],
            ADOBE_COMMERCE_URL: INSTANCE,
        },
    },
    datapack: { name: NAME, version: INSTALLED, store: 'library' },
    ...over,
});

const record = (version: string, behind?: string[], instance?: string): InstallRecord => ({
    format: 1,
    pack: { name: NAME, version },
    engine: 'demo-builder',
    startedAt: '2026-11-01T09:00:00.000Z',
    target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
    created: [],
    ...(behind ? { behind } : {}),
    ...(instance ? { instance } : {}),
});

const update = (
    context: Parameters<(typeof importHandlers)['update-datapack']>[0],
    payload: object
) => importHandlers['update-datapack'](context, payload);

beforeEach(() => {
    resetImportHandlerMocks();
    jest.mocked(readInstallRecord).mockImplementation(async (_files, _path, pack) =>
        record(pack.version)
    );
    mockLibrary.mockResolvedValue(access([row(INSTALLED), row(NEWER)]));
    mockPreview.mockResolvedValue(CHANGED);
    mockBehind.mockResolvedValue(undefined);
    mockCopy.mockResolvedValue(true);
    mockForget.mockResolvedValue(undefined);
});

describe('the check', () => {
    it("answers what the newer version changed by type, against the installed version's record, starting nothing", async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, records: true });

        expect(response).toEqual({
            success: true,
            data: {
                displayName: 'Luma',
                target: { name: NAME, version: NEWER },
                changes: [
                    {
                        type: 'products',
                        added: 1,
                        updated: 2,
                        removed: 0,
                        changed: ['MS-01', 'MH01', 'MH02'],
                        kept: ['MJ09'],
                    },
                    {
                        type: 'cart_rules',
                        added: 0,
                        updated: 1,
                        removed: 0,
                        changed: ['Spring Sale'],
                        kept: [],
                    },
                ],
            },
        });
        expect(mockPreview).toHaveBeenCalledWith(
            expect.anything(),
            { name: NAME, version: NEWER },
            'library',
            undefined,
            {
                recordOf: { name: NAME, version: INSTALLED },
                allNames: true,
                rebase: true,
            }
        );
        expect(startImport).not.toHaveBeenCalled();
        expect(mockBehind).not.toHaveBeenCalled();
        expect(mockCopy).not.toHaveBeenCalled();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it("an agent's check (no records asked for) names each type's first few, as a preview does", async () => {
        happyEngine();
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME });

        expect(mockPreview).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'library', undefined, expect.objectContaining({ allNames: false }));
    });

    it('is up to date with no newer version and nothing left behind, reading nothing of Commerce', async () => {
        happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME });

        expect(response).toEqual({ success: true, data: { upToDate: true, displayName: 'Luma' } });
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it('finishes the types an earlier update left behind, against the version installed', async () => {
        happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        jest.mocked(readInstallRecord).mockResolvedValue(record(INSTALLED, ['cart_rules']));
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME });

        expect(response.data).toMatchObject({ target: { name: NAME, version: INSTALLED } });
    });

    // Review U1-3: a failed install of the held version means Commerce may lack rows; no shortcut.
    it('reads Commerce rather than answering up to date when the held version failed to install', async () => {
        happyEngine();
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        const failed = { name: NAME, version: INSTALLED, reason: 'Commerce answered 500', at: '2026-11-14T10:00:00.000Z', retries: 0 };
        const { context } = makeImportHarness(project({ datapackInstallFailure: failed }));

        const response = await update(context, { datapackName: NAME });

        expect(mockPreview).toHaveBeenCalledTimes(1);
        expect(response.data).toMatchObject({ target: HELD });
    });
});

// J9-4: a newer version that writes nothing here becomes the version installed, so the dot goes; but
// only once confirmed (review U1-1): a check writes nothing.
describe('nothing to write', () => {
    const NOTHING: ChangePreview = { installed: true, kinds: [kind({ keep: named('MJ09') })], rebased: REBASED };

    it('the check answers up to date and that it would move, writing nothing', async () => {
        happyEngine();
        mockPreview.mockResolvedValue(NOTHING);
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME });

        expect(response).toEqual({ success: true, data: { upToDate: true, displayName: 'Luma', movesTo: NEWER } });
        expect(mockCopy).not.toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
        expect(mockBehind).not.toHaveBeenCalled();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('confirmed, moves the record and the project: the new record, then the project, then the old record goes', async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue(NOTHING);
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response).toEqual({ success: true, data: { upToDate: true, displayName: 'Luma' } });
        // The check's objects hashed afresh from the store go onto the newer record (walk F223).
        expect(mockCopy).toHaveBeenCalledWith(expect.anything(), expect.any(String), HELD, TARGET, REBASED);
        const save = context.stateManager.saveProject as jest.Mock;
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ datapack: { name: NAME, version: NEWER, store: 'library' } }));
        expect(mockForget).toHaveBeenCalledWith(expect.anything(), expect.any(String), HELD);
        expect(order(mockCopy)).toBeLessThan(order(save));
        expect(order(save)).toBeLessThan(order(mockForget));
        expect(mockBehind).toHaveBeenCalledWith(expect.anything(), expect.any(String), TARGET, []);
        expect(startImport).not.toHaveBeenCalled();
    });

    it('confirmed over a stale record of the newer version, adopts nothing and moves nothing', async () => {
        happyEngine();
        mockPreview.mockResolvedValue(NOTHING);
        mockCopy.mockResolvedValue(false);
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true });

        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
    });

    it('confirmed, a project that cannot be saved keeps its old record and loses the new copy', async () => {
        happyEngine();
        mockPreview.mockResolvedValue(NOTHING);
        const { context } = makeImportHarness(project());
        (context.stateManager.saveProject as jest.Mock).mockRejectedValue(new Error('disk full'));

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response.success).toBe(true);
        expect(mockForget.mock.calls.map(([, , pack]) => pack)).toEqual([TARGET]);
    });
});

describe('a start', () => {
    it('installs the newer version over the installed one in place, every changed type, nothing uninstalled', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response.data).toMatchObject({ activationId: 'act-1', target: TARGET });
        expect(startImport).toHaveBeenCalledWith({
            id: TARGET,
            source: 'library',
            commerceInstance: INSTANCE,
            dataTypes: ['products', 'cart_rules'],
            target: { websiteCode: 'luma_site', storeCode: 'luma_en' },
            updates: HELD,
        });
        const status = await importHandlers['get-datapack-import-status'](context, {});
        expect(status.data).toMatchObject({ purpose: 'update' });
    });

    // Review U1-2: the record is the newer version's before the job is accepted, and the project names
    // the newer version once it is, so the two agree at every point; the old record goes last.
    it('copies the record onto the newer version before the start, and forgets the old one after it', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true });

        // The check hashed nothing afresh, so the record goes over as it is.
        expect(mockCopy).toHaveBeenCalledWith(expect.anything(), expect.any(String), HELD, TARGET, undefined);
        expect(mockBehind).toHaveBeenCalledWith(expect.anything(), expect.any(String), TARGET, []);
        expect(order(mockCopy)).toBeLessThan(order(startImport));
        expect(mockForget.mock.calls.map(([, , pack]) => pack)).toEqual([HELD]);
        expect(order(startImport)).toBeLessThan(order(mockForget));
    });

    // Walk F223: what the update does not write keeps the store's hash now where it holds the newer rows.
    it("carries the check's objects hashed afresh onto the newer record before the start", async () => {
        const { startImport } = happyEngine();
        mockPreview.mockResolvedValue({ ...CHANGED, rebased: REBASED });
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true });

        expect(mockCopy).toHaveBeenCalledWith(expect.anything(), expect.any(String), HELD, TARGET, REBASED);
        expect(order(mockCopy)).toBeLessThan(order(startImport));
    });

    it('installs only the types chosen, and notes the rest on the record so the dot stays', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true, dataTypes: ['products'] });

        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ dataTypes: ['products'] }));
        expect(mockBehind).toHaveBeenCalledWith(expect.anything(), expect.any(String), TARGET, ['cart_rules']);
    });

    it('a start that is refused forgets the copy and leaves the old record as it was', async () => {
        const { validateImport } = happyEngine();
        validateImport.mockResolvedValue({ valid: false, reason: 'Refused.' });
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response.success).toBe(false);
        expect(mockForget.mock.calls.map(([, , pack]) => pack)).toEqual([TARGET]);
    });

    it('a start that throws forgets the copy too', async () => {
        const { validateImport } = happyEngine();
        validateImport.mockRejectedValue(new Error('the engine fell over'));
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true }).catch(() => undefined);

        expect(mockForget.mock.calls.map(([, , pack]) => pack)).toEqual([TARGET]);
    });

    it('finishing types left behind: a refused start puts the note back as it was', async () => {
        const { validateImport } = happyEngine();
        validateImport.mockResolvedValue({ valid: false, reason: 'Refused.' });
        mockLibrary.mockResolvedValue(access([row(INSTALLED)]));
        jest.mocked(readInstallRecord).mockResolvedValue(record(INSTALLED, ['cart_rules', 'products']));
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true, dataTypes: ['products'] });

        expect(mockBehind.mock.calls.map(([, , , types]) => types)).toEqual([['cart_rules'], ['cart_rules', 'products']]);
        expect(mockCopy).not.toHaveBeenCalled();
    });

    it('refuses over a stale record of the newer version, starting nothing', async () => {
        const { startImport } = happyEngine();
        mockCopy.mockResolvedValue(false);
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(startImport).not.toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
    });

    it('refuses when a newer version arrived since the check, starting nothing', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true, version: '20261105-090000' });

        expect(response).toMatchObject({ success: false });
        expect(response.error).toContain('changed since');
        expect(startImport).not.toHaveBeenCalled();
    });

    it('refuses a type that did not change and was not left behind, or none, starting nothing', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        const unchanged = await update(context, { datapackName: NAME, confirm: true, dataTypes: ['categories'] });
        const none = await update(context, { datapackName: NAME, confirm: true, dataTypes: [] });

        expect(unchanged).toMatchObject({ success: false, error: 'Nothing changed in categories. The data types to update are products, cart_rules.' });
        expect(none).toMatchObject({ success: false, error: 'Choose at least one data type to update.' });
        expect(startImport).not.toHaveBeenCalled();
    });

    // A retry of an update that stopped asks again for a type it finished: nothing is left to write
    // there, but it was asked and noted behind, so it is allowed (it writes nothing).
    it('allows a type left behind that no longer changes', async () => {
        const { startImport } = happyEngine();
        jest.mocked(readInstallRecord).mockImplementation(async (_f, _p, pack) => record(pack.version, ['categories']));
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true, dataTypes: ['categories', 'products'] });

        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ dataTypes: ['categories', 'products'] }));
    });
});

describe('refusals', () => {
    it.each([
        ['another datapack than the project uses', 'someone-elses-pack'],
        ['no datapack is named', undefined],
    ])('refuses when %s', async (_label, datapackName) => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName, confirm: true });

        expect(response).toMatchObject({
            success: false,
            code: ErrorCode.INVALID_OPERATION,
            error: 'Update works on the datapack this project uses.',
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('refuses when Demo Builder has no install record to update by', async () => {
        happyEngine();
        jest.mocked(readInstallRecord).mockResolvedValue(undefined);
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response.error).toContain('no record of installing');
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it('refuses when the datapack is installed on another Commerce instance', async () => {
        const { startImport } = happyEngine();
        jest.mocked(readInstallRecord).mockImplementation(async (_f, _p, pack) => record(pack.version, undefined, 'https://other.example.test'));
        const { context } = makeImportHarness(project());

        const response = await update(context, { datapackName: NAME, confirm: true });

        expect(response.success).toBe(false);
        expect(response.error).toContain('installed on another Commerce instance');
        expect(startImport).not.toHaveBeenCalled();
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it('CONTROL: the same project, confirmed, does start', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME, confirm: true });

        expect(startImport).toHaveBeenCalledTimes(1);
    });
});

// Review U1-iii: every open Datapacks screen reads its list, its project and the open flyout again when
// the packs change (`useDatapackCatalog`, the Refresh button spinning). A check changes nothing.
describe('what it announces', () => {
    it('a check announces nothing; a confirmed start announces the change', async () => {
        happyEngine();
        const heard = jest.fn();
        const following = onDatapacksChanged(heard);
        const { context } = makeImportHarness(project());

        await update(context, { datapackName: NAME });
        expect(heard).not.toHaveBeenCalled();
        await importHandlers['restore-datapack'](context, { datapackName: NAME });
        expect(heard).not.toHaveBeenCalled();
        await update(context, { datapackName: NAME, confirm: true });
        expect(heard).toHaveBeenCalled();
        following.dispose();
    });
});
