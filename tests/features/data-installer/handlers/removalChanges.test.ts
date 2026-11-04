/**
 * A removal and the SC's changes (datapack-engine step 05), through the real `reset-datapack`
 * handler, with the store, the library and the engine at their edges. What this layer owns is the
 * ORDER and the ARGUMENTS: a save before a removal, of the version the save made, and no removal at
 * all when the save fails. A mock answers the same whatever it is handed, so those are asserted.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));
jest.mock('@/features/data-installer/services/demoBuilderEngine/storeChanges', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/storeChanges'),
    previewChanges: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/saveStore', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/saveStore'),
    saveStoreChanges: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
        resolveDataInstallerAccess,
        // The write path's door, as it answers with the Data Installer's address set.
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});
jest.mock('@/features/data-installer/services/datapackStoreWriter');
jest.mock('@/features/data-installer/services/datapackTransfer', () => ({
    ...jest.requireActual('@/features/data-installer/services/datapackTransfer'),
    writePackToStore: jest.fn(),
}));
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    buildDatapackEngine: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/importJobWatch', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/importJobWatch'),
    runAndWatch: jest.fn(),
}));

import * as vscode from 'vscode';
import { createMockProject } from '../../../helpers/projectFake';
import { makeImportHarness, setupSettings } from './importHandlers.testUtils';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { runAndWatch } from '@/features/data-installer/handlers/importJobWatch';
import { contextForProject, settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import type { StoreChangesPayload } from '@/features/data-installer/handlers/storeChangesHandlers';
import { buildDatapackEngine } from '@/features/data-installer/services/buildDatapackEngine';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { ImportRequest } from '@/features/data-installer/services/dataInstallerWriteClient';
import { type InstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { type SaveResult, saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { StoreChangesError } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { type ChangePreview, type KindChanges, previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const mockedPreview = previewChanges as jest.MockedFunction<typeof previewChanges>;
const mockedSave = saveStoreChanges as jest.MockedFunction<typeof saveStoreChanges>;
const mockedRecord = readInstallRecord as jest.MockedFunction<typeof readInstallRecord>;
const mockedEngine = buildDatapackEngine as jest.MockedFunction<typeof buildDatapackEngine>;
const mockedRun = runAndWatch as jest.MockedFunction<typeof runAndWatch>;

const BODEA: DatapackId = { name: 'bodea', version: 'main' };
const PROJECT: Partial<Project> = {
    name: 'acme',
    path: '/nonexistent/projects/acme',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'acme', ACCS_STORE_VIEW_CODE: 'acme_en' } },
    datapack: { ...BODEA, store: 'installer' },
};
const REQUEST = { datapackName: 'bodea', version: 'main', commerceInstance: 'inst', dataTypes: ['categories', 'products', 'store_config'], websiteCode: 'acme', storeCode: 'acme_en', confirm: true };
const RECORD: InstallRecord = { format: 1, pack: BODEA, engine: 'demo-builder', startedAt: '2026-11-01T00:00:00.000Z', created: [] };
const SAVED_ID: DatapackId = { name: 'acme-1a2b3c', version: '20261102-120000' };
const SAVED: SaveResult = { saved: SAVED_ID, counts: { categories: 1, products: 2 }, readFrom: 'installer', sentence: 'Saved to the acme pack. Bodea is unchanged.', unnamed: [], leftOut: [] };

const NONE = { count: 0, names: [] };
const keptKind = (kind: string, names: string[]): KindChanges => ({ kind, update: NONE, add: NONE, inStore: NONE, remove: NONE, keep: { count: names.length, names } });
const CHANGED: ChangePreview = { installed: true, kinds: [keptKind('categories', ['Power/Critical Power']), keptKind('products', ['A', 'B'])] };
const UNCHANGED: ChangePreview = { installed: true, kinds: [keptKind('products', [])] };

let events: string[];
let startDelete: jest.Mock<Promise<{ activationId: string }>, [ImportRequest]>;
let settingUpdate: jest.Mock;

function fakeEngine(): DatapackEngine {
    startDelete = jest.fn(async (request: ImportRequest) => {
        events.push(`remove ${request.id.name}@${request.id.version}`);
        return { activationId: 'act-1' };
    });
    return { startDelete } as unknown as DatapackEngine;
}

/** Answers `changesOnRemoval` with this; the Data Installer's own settings as the suite's helper does. */
function setting(value: 'ask' | 'save'): void {
    setupSettings();
    const base = (vscode.workspace.getConfiguration as jest.Mock)();
    settingUpdate = jest.fn().mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        ...base,
        update: settingUpdate,
        get: jest.fn((key: string, fallback?: unknown) => (key === 'changesOnRemoval' ? value : base.get(key, fallback))),
    });
}

/** Keep the changes: the demo's pack is Bodea, not the SC's, so they go to a new pack by this name. */
const KEEP = { changes: 'keep', saveAs: { displayName: 'My Bodea' } };

/** The SC's own pack, as the library lists it: Save writes into it, with no name to give. */
function ownedByTheSc(id: DatapackId, displayName: string): void {
    jest.spyOn(DataInstallerClient.prototype, 'findDatapacks').mockResolvedValue({
        items: [{ id, displayName, shared: false, dataTypes: [], art: {}, mine: true }],
        count: 1,
    });
}

const reset = (over: Record<string, unknown> = {}, project: Partial<Project> = PROJECT) =>
    importHandlers['reset-datapack'](makeImportHarness({ ...project }).context, { ...REQUEST, ...over });

/** The record exists for these packs, and no others. */
function recordsFor(...packs: DatapackId[]): void {
    mockedRecord.mockImplementation(async (_files, _path, pack) => (packs.some((p) => p.name === pack.name && p.version === pack.version) ? RECORD : undefined));
}

beforeEach(() => {
    jest.clearAllMocks();
    events = [];
    setting('ask');
    mockedGuard.mockResolvedValue(undefined);
    jest.spyOn(DataInstallerClient.prototype, 'checkHealth').mockResolvedValue({ reachable: true });
    mockedAccess.mockImplementation(async (_context, store = 'installer') => ({
        ok: true,
        baseUrl: `https://example.invalid/${store}`,
        getToken: async () => 'tok',
        orgCode: 'ORG@AdobeOrg',
        client: new DataInstallerClient({ baseUrl: `https://example.invalid/${store}`, getToken: async () => 'tok' }),
    }));
    recordsFor(BODEA);
    // The library's two reads a save makes: Bodea is a team pack, never the SC's.
    jest.spyOn(DataInstallerClient.prototype, 'findDatapacks').mockResolvedValue({ items: [], count: 0 });
    jest.spyOn(DataInstallerClient.prototype, 'getDatapackDetail').mockResolvedValue({ id: BODEA, displayName: 'Bodea', shared: true, dataTypes: [], art: {} });
    mockedPreview.mockResolvedValue(CHANGED);
    mockedSave.mockImplementation(async () => {
        events.push('save');
        // As the real save does: the record moves onto the new version.
        recordsFor(SAVED_ID);
        return SAVED;
    });
    mockedEngine.mockImplementation(fakeEngine);
    mockedRun.mockImplementation(async (_context, _engine, _request, spec) => ({ success: true, data: await spec.begin() }));
});

describe('no answer, and nothing changed', () => {
    it('removes as it always did, saving nothing', async () => {
        mockedPreview.mockResolvedValue(UNCHANGED);

        const result = await reset();

        expect(result).toEqual({ success: true, data: { activationId: 'act-1' } });
        expect(mockedSave).not.toHaveBeenCalled();
        expect(events).toEqual(['remove bodea@main']);
    });

    it('reads the whole pack, from the store the project recorded: a removal takes all of it', async () => {
        mockedPreview.mockResolvedValue(UNCHANGED);

        await reset({}, { ...PROJECT, datapack: { ...BODEA, store: 'library' } });

        expect(mockedPreview).toHaveBeenCalledWith(expect.objectContaining({ projectPath: PROJECT.path }), BODEA, 'library');
    });
});

describe('no answer, and something changed', () => {
    it('refuses, names the changes, says how to answer, and touches nothing', async () => {
        const result = await reset();

        expect(result).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER });
        expect(result.error).toContain('3 items changed since install: the category Critical Power, and 2 products.');
        expect(result.error).toContain('Nothing was removed.');
        expect(result.error).toContain('changes:"keep"');
        expect(result.error).toContain('changes:"drop"');
        expect(result.data).toMatchObject({ changes: [{ kind: 'categories', count: 1 }, { kind: 'products', count: 2 }] });
        expect(mockedSave).not.toHaveBeenCalled();
        expect(events).toStrictEqual([]);
    });
});

describe('keep', () => {
    it('saves, then removes the version the save made: the install record has moved onto it', async () => {
        const result = await reset(KEEP);

        expect(events).toEqual(['save', 'remove acme-1a2b3c@20261102-120000']);
        // The caller has already chosen, so nothing reads first.
        expect(mockedPreview).not.toHaveBeenCalled();
        expect(startDelete).toHaveBeenCalledWith(expect.objectContaining({ id: SAVED_ID, source: 'library', commerceInstance: 'inst', target: { websiteCode: 'acme', storeCode: 'acme_en' } }));
        expect(result).toEqual({ success: true, data: { activationId: 'act-1', savedNote: SAVED.sentence, saved: SAVED_ID } });
    });

    it('asks the removal only for the kinds the saved version holds: a kind it lacks is refused', async () => {
        await reset(KEEP);

        expect(startDelete.mock.calls[0][0].dataTypes).toEqual(['categories', 'products']);
    });

    it('saves the pack named, as a new pack under the name given', async () => {
        await reset({ ...KEEP, source: 'installer' });

        const [, target] = mockedSave.mock.calls[0];
        expect(target).toMatchObject({ pack: BODEA, source: 'installer' });
        expect(target.saveAs.id.name).toMatch(/^my-bodea-[0-9a-f]{6}$/u);
        expect(target.saveAs.displayName).toBe('My Bodea');
        expect(target.saveAs.id.version).toMatch(/^\d{8}-\d{6}$/u);
    });

    it('turns the setting on only when asked, and only once the save worked', async () => {
        await reset(KEEP);
        expect(settingUpdate).not.toHaveBeenCalled();

        recordsFor(BODEA);
        await reset({ ...KEEP, alwaysSave: true });
        expect(settingUpdate).toHaveBeenCalledWith('changesOnRemoval', 'save', vscode.ConfigurationTarget.Global);
    });

    it('still removes when the setting will not write: the save it was about has worked', async () => {
        settingUpdate.mockRejectedValue(new Error('read-only settings'));

        const result = await reset({ ...KEEP, alwaysSave: true });

        expect(result.success).toBe(true);
        expect(events).toEqual(['save', 'remove acme-1a2b3c@20261102-120000']);
    });

    it('says the changes are safe when the removal then cannot start', async () => {
        mockedRun.mockResolvedValue({ success: false, error: 'The library is not answering.' });

        const result = await reset(KEEP);

        expect(result.success).toBe(false);
        expect(result.error).toBe(`The library is not answering. Your changes are safe: ${SAVED.sentence}`);
    });
});

describe('a save that fails', () => {
    beforeEach(() => {
        mockedSave.mockRejectedValue(new StoreChangesError('The library did not take all of it. Delete that version and try again.'));
    });

    it('removes nothing, and says why', async () => {
        const result = await reset(KEEP);

        expect(result).toMatchObject({ success: false, code: ErrorCode.CHANGES_NOT_SAVED, error: 'The library did not take all of it. Delete that version and try again.' });
        expect(events).toStrictEqual([]);
        expect(mockedRun).not.toHaveBeenCalled();
    });

    it('leaves the setting alone', async () => {
        await reset({ ...KEEP, alwaysSave: true });

        expect(settingUpdate).not.toHaveBeenCalled();
    });

    it('removes nothing when the sign-in is in the wrong org either', async () => {
        mockedGuard.mockResolvedValue({ error: 'Use "Switch IMS Org" to continue.' });

        const result = await reset(KEEP);

        expect(result).toMatchObject({ success: false, code: ErrorCode.CHANGES_NOT_SAVED, error: 'Use "Switch IMS Org" to continue.' });
        expect(mockedSave).not.toHaveBeenCalled();
        expect(mockedRun).not.toHaveBeenCalled();
    });
});

describe('drop', () => {
    it('removes without reading or saving', async () => {
        const result = await reset({ changes: 'drop' });

        expect(mockedPreview).not.toHaveBeenCalled();
        expect(mockedSave).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(events).toEqual(['remove bodea@main']);
    });
});

describe('the setting answers', () => {
    beforeEach(() => setting('save'));

    it("saves without asking when something changed and the demo's pack is the SC's", async () => {
        const mine: Partial<Project> = { ...PROJECT, datapack: { ...BODEA, store: 'library' } };
        ownedByTheSc(BODEA, 'Acme Bodea');

        const result = await reset({}, mine);

        expect(events).toEqual(['save', 'remove acme-1a2b3c@20261102-120000']);
        expect(mockedSave.mock.calls[0][1].saveAs).toMatchObject({ id: { name: 'bodea' }, displayName: 'Acme Bodea' });
        expect(result.success).toBe(true);
    });

    it("still asks when the demo's pack is not the SC's: there is nowhere to save without a name", async () => {
        const result = await reset();

        expect(result).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER });
        expect(result.data).not.toHaveProperty('packName');
        expect(events).toStrictEqual([]);
    });

    it('saves nothing when nothing changed', async () => {
        mockedPreview.mockResolvedValue(UNCHANGED);

        await reset();

        expect(mockedSave).not.toHaveBeenCalled();
        expect(events).toEqual(['remove bodea@main']);
    });

    it('gives way to an explicit drop: the answer was asked for, and the consent dialog shows it', async () => {
        await reset({ changes: 'drop' });

        expect(mockedSave).not.toHaveBeenCalled();
        expect(events).toEqual(['remove bodea@main']);
    });

    it('anything unrecognised in settings reads as asking', async () => {
        setting('ask');
        (vscode.workspace.getConfiguration as jest.Mock)().get.mockImplementation((key: string) => (key === 'changesOnRemoval' ? 'yes please' : true));

        const result = await reset();

        expect(result.code).toBe(ErrorCode.CHANGES_NEED_ANSWER);
    });
});

describe('a read that fails', () => {
    it('is never "nothing changed": it refuses and says how to go on', async () => {
        mockedPreview.mockRejectedValue(new StoreChangesError('The pack cannot be read.'));

        const result = await reset();

        expect(result.success).toBe(false);
        expect(result.error).toContain('The pack cannot be read.');
        expect(result.error).toContain('Nothing was removed.');
        expect(result.error).toContain('changes:"drop"');
        expect(mockedRun).not.toHaveBeenCalled();
    });
});

describe('a pack the service installed', () => {
    beforeEach(() => recordsFor());

    it('has no record of changes, so it is removed as it always was, without opening the store', async () => {
        const result = await reset();

        expect(result.success).toBe(true);
        expect(mockedPreview).not.toHaveBeenCalled();
        expect(mockedGuard).not.toHaveBeenCalled();
        expect(events).toEqual(['remove bodea@main']);
    });

    it('ignores keep: there is nothing to save', async () => {
        await reset(KEEP);

        expect(mockedSave).not.toHaveBeenCalled();
        expect(events).toEqual(['remove bodea@main']);
    });

    const UNAVAILABLE = "The Data Installer installed this datapack, and it isn't available. Use Clear Demo Data to remove what it added.";

    it('says what to do instead when the Data Installer does not answer, and sends nothing', async () => {
        jest.spyOn(DataInstallerClient.prototype, 'checkHealth').mockRejectedValue(new Error('down'));

        const result = await reset();

        expect(result).toEqual({ success: false, error: UNAVAILABLE, code: ErrorCode.INVALID_OPERATION });
        expect(events).toHaveLength(0);
        expect(mockedRun).not.toHaveBeenCalled();
    });

    it('says the same when its address is gone, and asks the Data Installer rather than the store', async () => {
        // The gate opens first, as it does on the datapack store's access with no address set. The
        // next to ask is the health check, which wants the Data Installer's own.
        const opened = mockedAccess.getMockImplementation();
        let asked = 0;
        mockedAccess.mockImplementation(async (context, store) => {
            asked += 1;
            if (asked === 1) return opened!(context, store);
            return { ok: false, response: { success: false, error: 'No address', code: ErrorCode.INVALID_OPERATION } };
        });

        const result = await reset();

        expect(result).toEqual({ success: false, error: UNAVAILABLE, code: ErrorCode.INVALID_OPERATION });
        expect(mockedAccess.mock.calls[1]).toHaveLength(1);
        expect(DataInstallerClient.prototype.checkHealth).not.toHaveBeenCalled();
        expect(events).toHaveLength(0);
    });
});

describe('a pack whose record has moved onto a pack saved from it', () => {
    const own: Partial<Project> = {
        ...PROJECT,
        datapack: { ...SAVED_ID, store: 'library', origin: BODEA },
    };

    it('refuses by name, rather than ask the service to delete Bodea from the store', async () => {
        recordsFor(SAVED_ID);

        const result = await reset({}, own);

        expect(result.success).toBe(false);
        expect(result.error).toContain('saved to acme-1a2b3c@20261102-120000');
        expect(mockedRun).not.toHaveBeenCalled();
    });

    it('CONTROL: the pack that is unrelated to it goes through', async () => {
        recordsFor(SAVED_ID);

        const result = await reset({ datapackName: 'frescopa' }, own);

        expect(result.success).toBe(true);
    });
});

describe('what is refused before anything is saved', () => {
    it.each([
        ['no Commerce instance', { commerceInstance: undefined }],
        ['half a target', { storeCode: undefined }],
        ['an answer that is neither', { changes: 'maybe' }],
    ])('%s', async (_name, over) => {
        const result = await reset({ ...KEEP, ...over });

        expect(result.success).toBe(false);
        expect(mockedSave).not.toHaveBeenCalled();
    });

    it('CONTROL: the same request with an instance saves', async () => {
        await reset(KEEP);

        expect(mockedSave).toHaveBeenCalledTimes(1);
    });

    it('keeps the confirm gate first', async () => {
        const result = await reset({ confirm: false, changes: 'keep' });

        expect(result.code).toBe(ErrorCode.INVALID_OPERATION);
        expect(mockedRecord).not.toHaveBeenCalled();
    });
});

describe('the save\'s stages', () => {
    it('reach the window, then say the removal is starting', async () => {
        const { context } = makeImportHarness(PROJECT);
        mockedSave.mockImplementation(async (_deps, _target, _write, report) => {
            report?.('Saving to the library');
            recordsFor(SAVED_ID);
            return SAVED;
        });

        await importHandlers['reset-datapack'](context, { ...REQUEST, ...KEEP });

        const stages = (context.sendMessage as jest.Mock).mock.calls.filter(([type, payload]) => type === 'operationProgress' && payload.id === DATAPACK_OPERATION_ID).map(([, payload]) => payload.stage);
        expect(stages).toEqual(['Saving to the library', 'Removing the sample data']);
    });

    it('do not fire for a removal with nothing to save', async () => {
        const { context } = makeImportHarness(PROJECT);

        await importHandlers['reset-datapack'](context, { ...REQUEST, changes: 'drop' });

        const stages = (context.sendMessage as jest.Mock).mock.calls.filter(([type]) => type === 'operationProgress');
        expect(stages).toStrictEqual([]);
    });
});

describe('get-datapack-removal-changes', () => {
    const read = (payload: StoreChangesPayload = { datapackName: 'bodea', version: 'main' }, project: Partial<Project> = PROJECT) =>
        importHandlers['get-datapack-removal-changes'](makeImportHarness({ ...project }).context, payload);

    it("answers the sentence, the demo's pack by name when it is the SC's, and how the setting stands", async () => {
        ownedByTheSc(BODEA, 'Acme Bodea');

        const result = await read(undefined, { ...PROJECT, datapack: { ...BODEA, store: 'library' } });

        expect(result).toMatchObject({
            success: true,
            data: {
                count: 3,
                sentence: '3 items changed since install: the category Critical Power, and 2 products.',
                packName: 'Acme Bodea',
                alwaysSave: false,
            },
        });
    });

    it("names no pack to save into when the demo's pack is not the SC's (Save As, its name typed)", async () => {
        const result = await read();

        expect(result.data).not.toHaveProperty('packName');
        expect(result.data).not.toHaveProperty('suggestedName');
    });

    it('answers no sentence with nothing changed', async () => {
        mockedPreview.mockResolvedValue(UNCHANGED);

        const result = await read();

        expect(result).toMatchObject({ success: true, data: { count: 0 } });
        expect(result.data).not.toHaveProperty('sentence');
    });

    it('answers nothing for a service pack, without opening the store', async () => {
        recordsFor();

        const result = await read();

        expect(result).toMatchObject({ success: true, data: { count: 0 } });
        expect(mockedGuard).not.toHaveBeenCalled();
        expect(mockedPreview).not.toHaveBeenCalled();
    });

    it('fails, rather than answer nothing changed, when the store cannot be read', async () => {
        mockedPreview.mockRejectedValue(new StoreChangesError('The pack cannot be read.'));

        const result = await read();

        expect(result).toEqual({ success: false, error: 'The pack cannot be read.' });
    });

    it('needs a pack, and writes nothing', async () => {
        expect((await read({})).success).toBe(false);
        await read();
        expect(mockedSave).not.toHaveBeenCalled();
        expect(settingUpdate).not.toHaveBeenCalled();
    });
});

describe('a door whose own question was already asked', () => {
    const project = createMockProject({ ...PROJECT, datapack: { ...BODEA, store: 'installer' } });

    it('saves what it finds, with no answer needed, on the project it was handed', async () => {
        const { context } = makeImportHarness({ ...PROJECT, path: '/nonexistent/projects/other', name: 'other' });

        const settled = await settleChangesBeforeRemoval(
            contextForProject(context, project),
            { pack: BODEA, unanswered: 'keep', saveAs: { displayName: 'My Bodea' } },
            jest.fn(),
        );

        expect(settled).toMatchObject({ saved: { id: SAVED_ID } });
        expect(mockedPreview).toHaveBeenCalledWith(expect.objectContaining({ projectPath: project.path }), BODEA, 'installer');
        // The save's record lands on the object the door holds, so its removal reads the new version.
        expect(project.datapack).toMatchObject({ store: 'library' });
    });
});
