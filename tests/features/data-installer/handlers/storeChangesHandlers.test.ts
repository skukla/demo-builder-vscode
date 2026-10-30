/**
 * The handlers behind "What would installing again change?" and "Save store changes to this
 * pack" (step 05): what they hand the service, what they refuse before it is asked, and what
 * they record on the project once a save lands.
 *
 * The service (`storeChanges.ts`) has its own suite; here it is mocked and its ARGUMENTS
 * asserted, since what this layer owns is how it is called: which project, which install
 * target, which store the new version is written into, and with no `update`.
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
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/datapackStoreWriter');
jest.mock('@/features/data-installer/services/datapackTransfer', () => ({
    ...jest.requireActual('@/features/data-installer/services/datapackTransfer'),
    writePackToStore: jest.fn(),
}));

// The shared wall first, then the subject: the wall's own jest.mock calls must be registered
// before anything it mocks is loaded.
import { makeImportHarness } from './importHandlers.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { storeChangesHandlers } from '@/features/data-installer/handlers/storeChangesHandlers';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import { DatapackStoreWriter } from '@/features/data-installer/services/datapackStoreWriter';
import { writePackToStore } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { StoreChangesError } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const mockedPreview = previewChanges as jest.MockedFunction<typeof previewChanges>;
const mockedSave = saveStoreChanges as jest.MockedFunction<typeof saveStoreChanges>;
const mockedWrite = writePackToStore as jest.MockedFunction<typeof writePackToStore>;
const MockedWriter = DatapackStoreWriter as jest.MockedClass<typeof DatapackStoreWriter>;

const INSTALLER = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const LIBRARY = 'https://example-namespace.adobeioruntime.net/api/v1/web/datapack-store';

/** An ACCS project that chose a website and store view, shaped like a persisted one. */
const PROJECT: Partial<Project> = {
    name: 'acme',
    path: '/nonexistent/projects/acme',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'acme', ACCS_STORE_VIEW_CODE: 'acme_en' } },
    datapack: { name: 'bodea', version: 'main' },
};

const ID = { datapackName: 'bodea', version: 'main' };

function harness() {
    const { context } = makeImportHarness(PROJECT);
    return context;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedGuard.mockResolvedValue(undefined);
    mockedAccess.mockImplementation(async (_context, store = 'installer') => ({
        ok: true,
        baseUrl: store === 'library' ? LIBRARY : INSTALLER,
        getToken: async () => 'tok',
        orgCode: 'ORG@AdobeOrg',
        // A real read client: these cases never reach it, since the service is mocked.
        client: new DataInstallerClient({ baseUrl: store === 'library' ? LIBRARY : INSTALLER, getToken: async () => 'tok' }),
    }));
});

describe('preview-datapack-changes', () => {
    it('asks the service about this project\'s store, at the target it chose, for the pack named', async () => {
        mockedPreview.mockResolvedValue({ installed: true, kinds: [], kept: 'Kept 1 thing you had changed in the Admin.' });

        const result = await storeChangesHandlers['preview-datapack-changes'](harness(), { ...ID, source: 'library', dataTypes: ['products'] });

        expect(mockedPreview).toHaveBeenCalledWith(
            expect.objectContaining({ projectPath: '/nonexistent/projects/acme', target: { websiteCode: 'acme', storeCode: 'acme_en' } }),
            { name: 'bodea', version: 'main' },
            'library',
            ['products'],
        );
        expect(result).toEqual({
            success: true,
            data: { datapackName: 'bodea', version: 'main', installed: true, kinds: [], kept: 'Kept 1 thing you had changed in the Admin.' },
        });
    });

    it('refuses before reading anything when the sign-in is in another org than the store', async () => {
        mockedGuard.mockResolvedValue({ error: 'Use "Switch IMS Org" to continue.' });

        const result = await storeChangesHandlers['preview-datapack-changes'](harness(), ID);

        expect(result).toMatchObject({ success: false, code: ErrorCode.ORG_MISMATCH });
        expect(mockedPreview).not.toHaveBeenCalled();
    });

    it('refuses a store that is neither the Data Installer nor the library', async () => {
        const result = await storeChangesHandlers['preview-datapack-changes'](harness(), { ...ID, source: 'elsewhere' });

        expect(result.success).toBe(false);
        expect(mockedPreview).not.toHaveBeenCalled();
    });
});

describe('save-store-changes-to-pack', () => {
    const OWN_NAME = /^acme-[0-9a-f]{6}$/u;
    const VERSION = /^\d{8}-\d{6}$/u;
    const SAVED = {
        saved: { name: 'acme-1a2b3c', version: '20261029-183000' },
        counts: { products: 2 },
        readFrom: 'installer' as const,
        sentence: 'Saved to the acme pack. Bodea is unchanged.',
        unnamed: [],
        leftOut: [],
    };

    it('needs confirm, and asks nothing of the store without it', async () => {
        const result = await storeChangesHandlers['save-store-changes-to-pack'](harness(), ID);

        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockedSave).not.toHaveBeenCalled();
    });

    it('writes the new version into the LIBRARY, never updating one that is there', async () => {
        mockedSave.mockResolvedValue(SAVED);
        mockedWrite.mockResolvedValue({ pack: 'created', stored: ['products'], failed: [] });

        await storeChangesHandlers['save-store-changes-to-pack'](harness(), { ...ID, confirm: true });

        const [deps, target, write] = mockedSave.mock.calls[0];
        expect(deps).toMatchObject({ projectPath: '/nonexistent/projects/acme', target: { websiteCode: 'acme', storeCode: 'acme_en' } });
        // No store named: the service reads the installed version from the library, then the Data
        // Installer. It writes into the demo's own pack, named for the project (step 07).
        expect(target).toEqual({
            pack: { name: 'bodea', version: 'main' },
            saveAs: { id: { name: expect.stringMatching(OWN_NAME), version: expect.stringMatching(VERSION) }, displayName: 'acme' },
            picks: {},
        });
        const file: DatapackFile = { id: SAVED.saved, displayName: 'Bodea', items: [] };
        await write(file);
        expect(MockedWriter).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: LIBRARY, orgCode: 'ORG@AdobeOrg' }));
        expect(mockedWrite).toHaveBeenCalledWith(MockedWriter.mock.instances[0], file);
    });

    it('passes on which store holds the installed version, when the caller names one', async () => {
        mockedSave.mockResolvedValue(SAVED);

        await storeChangesHandlers['save-store-changes-to-pack'](harness(), { ...ID, source: 'library', confirm: true });

        expect(mockedSave.mock.calls[0][1]).toMatchObject({ pack: { name: 'bodea', version: 'main' }, source: 'library' });
    });

    it("records the new version as the demo's own pack, made from the one installed, and answers the one sentence", async () => {
        mockedSave.mockImplementation(async (_deps, target) => ({ ...SAVED, saved: target.saveAs.id }));
        const context = harness();

        const result = await storeChangesHandlers['save-store-changes-to-pack'](context, { ...ID, confirm: true });

        const { saveAs } = mockedSave.mock.calls[0][1];
        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project;
        expect(saved.datapack).toEqual({
            ...saveAs.id,
            store: 'library',
            // The store the rows were actually read from.
            origin: { name: 'bodea', version: 'main', store: 'installer' },
        });
        expect(saved.ownDatapack).toEqual({ name: saveAs.id.name, displayName: 'acme' });
        expect(result).toEqual({
            success: true,
            // The same sentence ends the progress window, which reads `note`.
            note: SAVED.sentence,
            data: {
                datapackName: saveAs.id.name,
                version: saveAs.id.version,
                displayName: 'acme',
                previous: { name: 'bodea', version: 'main' },
                counts: { products: 2 },
                message: SAVED.sentence,
                unnamed: [],
                leftOut: [],
            },
        });
    });

    it("saves into the demo's own pack it already has, keeping the pack it was first made from", async () => {
        const own = { name: 'acme-1a2b3c', version: '20261028-090000', store: 'library' as const, origin: { name: 'bodea', version: 'main' } };
        const { context } = makeImportHarness({ ...PROJECT, datapack: own, ownDatapack: { name: 'acme-1a2b3c', displayName: 'acme' } });
        mockedSave.mockImplementation(async (_deps, target) => ({ ...SAVED, saved: target.saveAs.id, readFrom: 'library' }));

        await storeChangesHandlers['save-store-changes-to-pack'](context, { datapackName: own.name, version: own.version, confirm: true });

        expect(mockedSave.mock.calls[0][1].saveAs.id.name).toBe('acme-1a2b3c');
        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project;
        expect(saved.datapack?.origin).toEqual({ name: 'bodea', version: 'main' });
    });

    it('tells the screen\'s progress window each stage, and ends it on the one sentence', async () => {
        mockedSave.mockImplementation(async (_deps, _id, _write, report) => {
            report?.('Reading the store');
            return SAVED;
        });
        const context = harness();

        await storeChangesHandlers['save-store-changes-to-pack'](context, { ...ID, confirm: true, progress: 'modal' });

        expect(context.sendMessage).toHaveBeenCalledWith('operationProgress', expect.objectContaining({ id: 'datapack-save', state: 'running', stage: 'Reading the store' }));
        expect(context.sendMessage).toHaveBeenCalledWith('operationProgress', expect.objectContaining({ id: 'datapack-save', state: 'succeeded', note: SAVED.sentence }));
    });

    it('answers what stopped it in the SC\'s words, and records nothing on the project', async () => {
        mockedSave.mockRejectedValue(new StoreChangesError('Demo Builder did not install bodea@main in this project, so there are no store changes of it to save.'));
        const context = harness();

        const result = await storeChangesHandlers['save-store-changes-to-pack'](context, { ...ID, confirm: true });

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/did not install bodea@main/) });
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});
