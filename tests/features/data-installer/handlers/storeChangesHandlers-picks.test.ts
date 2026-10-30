/**
 * Saving with picks, and a store Demo Builder did not fill (datapack-engine step 14, items 10 and
 * 11): what the handlers hand the save, which pack they decide it is of, what they record on the
 * project, and the export door's two message types with Demo Builder's engine.
 *
 * The service (`saveStore.ts`) is mocked and its ARGUMENTS asserted, as in
 * `storeChangesHandlers.test.ts`; the install record on disk is mocked by its one read.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));
jest.mock('@/features/data-installer/services/demoBuilderEngine/saveStore', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/saveStore'),
    saveStoreChanges: jest.fn(),
    listPickable: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/datapackStoreWriter');

import { makeImportHarness } from './importHandlers.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { exportHandlers } from '@/features/data-installer/handlers/exportHandlers';
import { storeChangesHandlers } from '@/features/data-installer/handlers/storeChangesHandlers';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import { type InstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { type SaveResult, listPickable, saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import type { StoreItemPage } from '@/features/data-installer/pickableKinds';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const mockedSave = saveStoreChanges as jest.MockedFunction<typeof saveStoreChanges>;
const mockedList = listPickable as jest.MockedFunction<typeof listPickable>;
const mockedRecord = readInstallRecord as jest.MockedFunction<typeof readInstallRecord>;

const LIBRARY = 'https://example-namespace.adobeioruntime.net/api/v1/web/datapack-store';
const BODEA = { name: 'bodea', version: 'main' };

/** A fresh project each time: a save records onto the project it is handed. */
function project(): Partial<Project> {
    return {
        name: 'acme',
        path: '/nonexistent/projects/acme',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'acme', ACCS_STORE_VIEW_CODE: 'acme_en' } },
        datapack: { ...BODEA, store: 'library' },
    };
}

const RECORD: InstallRecord = { format: 1, pack: BODEA, engine: 'demo-builder', startedAt: '2026-10-30T00:00:00.000Z', created: [] };

function saved(target: { saveAs: { id: { name: string; version: string } } }): SaveResult {
    return { saved: target.saveAs.id, counts: { products: 1 }, sentence: 'Saved to the acme pack.', unnamed: [], leftOut: [] };
}

const PICKS = { products: { sku: ['VR-Rack'] }, cart_rules: { rule_id: [7] } };

beforeEach(() => {
    jest.clearAllMocks();
    (orgGuard as jest.Mock).mockResolvedValue(undefined);
    (selectedDatapackEngine as jest.Mock).mockReturnValue('demo-builder');
    mockedRecord.mockResolvedValue(undefined);
    mockedSave.mockImplementation(async (_deps, target) => saved(target));
    (resolveDataInstallerAccess as jest.Mock).mockResolvedValue({
        ok: true,
        baseUrl: LIBRARY,
        getToken: async () => 'tok',
        client: new DataInstallerClient({ baseUrl: LIBRARY, getToken: async () => 'tok' }),
    });
});

describe('save-store-changes-to-pack with picks', () => {
    it('hands the save the picks, by kind, as strings', async () => {
        await storeChangesHandlers['save-store-changes-to-pack'](makeImportHarness(project()).context, { datapackName: 'bodea', version: 'main', selections: PICKS, confirm: true });

        expect(mockedSave.mock.calls[0][1]).toMatchObject({ pack: BODEA, picks: { products: ['VR-Rack'], cart_rules: ['7'] } });
    });

    it('refuses a kind that cannot be picked, asking nothing of the store', async () => {
        const result = await storeChangesHandlers['save-store-changes-to-pack'](makeImportHarness(project()).context, { selections: { orders: { id: [1] } }, confirm: true });

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^orders cannot be picked/u) });
        expect(mockedSave).not.toHaveBeenCalled();
    });

    it("with no pack named, saves the project's own pack when Demo Builder installed it", async () => {
        mockedRecord.mockResolvedValue(RECORD);

        await storeChangesHandlers['save-store-changes-to-pack'](makeImportHarness(project()).context, { selections: PICKS, confirm: true });

        expect(mockedRecord).toHaveBeenCalledWith(expect.anything(), '/nonexistent/projects/acme', BODEA);
        expect(mockedSave.mock.calls[0][1]).toMatchObject({ pack: BODEA, source: 'library' });
    });

    it('with no pack named and none Demo Builder installed, saves the picks alone and records only the own pack', async () => {
        const { context } = makeImportHarness(project());

        const result = await storeChangesHandlers['save-store-changes-to-pack'](context, { selections: PICKS, confirm: true });

        expect(mockedSave.mock.calls[0][1]).not.toHaveProperty('pack');
        const recorded = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project;
        // The pack the project installs from is left as it was: the store is not the new version.
        expect(recorded.datapack).toEqual({ ...BODEA, store: 'library' });
        expect(recorded.ownDatapack).toEqual({ name: expect.stringMatching(/^acme-[0-9a-f]{6}$/u), displayName: 'acme' });
        expect(result).toMatchObject({ success: true, data: expect.not.objectContaining({ previous: expect.anything() }) });
    });
});

describe('the export door with Demo Builder engine', () => {
    it('saves what is picked through the same save, confirmed by the same flag', async () => {
        const { context } = makeImportHarness(project());

        const result = await exportHandlers['start-datapack-export'](context, { selections: PICKS, confirm: true });

        expect(result.success).toBe(true);
        expect(mockedSave.mock.calls[0][1]).toMatchObject({ picks: { products: ['VR-Rack'], cart_rules: ['7'] } });
    });

    it('needs confirm, as the save does', async () => {
        const result = await exportHandlers['start-datapack-export'](makeImportHarness(project()).context, { selections: PICKS });

        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockedSave).not.toHaveBeenCalled();
    });

    it("refuses the service's fields, which would name a pack this save never writes", async () => {
        const result = await exportHandlers['start-datapack-export'](makeImportHarness(project()).context, { datapackName: 'mine', version: '1', selections: PICKS, confirm: true });

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/datapackName, version cannot be sent/u) });
        expect(mockedSave).not.toHaveBeenCalled();
    });

    it("lists one kind of the project's store, less what the project's own pack holds", async () => {
        mockedRecord.mockResolvedValue(RECORD);
        const page: StoreItemPage = { items: [{ id: 'VR-Rack', displayName: 'VR Rack', detail: 'VR-Rack', key: 'VR-Rack' }], totalCount: 3, excludedCount: 0, inPackCount: 2 };
        mockedList.mockResolvedValue(page);

        const result = await exportHandlers['list-datapack-export-items'](makeImportHarness(project()).context, { dataType: 'products' });

        expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ projectPath: '/nonexistent/projects/acme' }), 'products', BODEA, 'library');
        expect(result).toEqual({ success: true, data: page });
    });

    it('refuses a kind that cannot be listed for picking, naming those that can', async () => {
        const result = await exportHandlers['list-datapack-export-items'](makeImportHarness(project()).context, { dataType: 'orders' });

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Choose what to list: one of products, giftcards, categories/u) });
        expect(mockedList).not.toHaveBeenCalled();
    });
});
