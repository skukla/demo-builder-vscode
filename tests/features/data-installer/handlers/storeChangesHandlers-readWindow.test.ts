/**
 * Save Changes reads Commerce itself (live run 2, 2026-11-15). A changes check keeps what it reads
 * for five minutes so the save inside the job that follows it need not read again (walk F128). The
 * plain Save reused that copy too, after ANY check: the SC opened the Datapacks screen, changed a
 * price in the Admin, pressed Save, and got "No Changes to Save" while the price was changed.
 *
 * Here the project's Commerce client is a fake that counts its reads, and the check and the save are
 * mocked to make one read each through the client the handler hands them.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({
    orgGuard: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    ...jest.requireActual('@/features/project-creation/services/erpFillForProject'),
    commerceClientForProject: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/storeChanges', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/storeChanges'),
    previewChanges: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/saveStore', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/saveStore'),
    saveStoreChanges: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
        resolveDataInstallerAccess,
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});

import { makeImportHarness } from './importHandlers.testUtils';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import {
    openSave,
    storeChangesHandlers,
} from '@/features/data-installer/handlers/storeChangesHandlers';
import { forgetReadWindows } from '@/features/data-installer/services/commerceReadWindow';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import type { StoreChangesDeps } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { commerceClientForProject } from '@/features/project-creation/services/erpFillForProject';
import type { Project } from '@/types/base';

const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<
    typeof resolveDataInstallerAccess
>;
const mockedClient = commerceClientForProject as jest.MockedFunction<
    typeof commerceClientForProject
>;
const mockedPreview = previewChanges as jest.MockedFunction<typeof previewChanges>;
const mockedSave = saveStoreChanges as jest.MockedFunction<typeof saveStoreChanges>;

const INSTALLER = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const PRODUCTS = 'products?searchCriteria[pageSize]=100';
const ID = { datapackName: 'bodea', version: 'main' };
const PROJECT: Partial<Project> = {
    name: 'acme',
    path: '/nonexistent/projects/acme-read-window',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'acme', ACCS_STORE_VIEW_CODE: 'acme_en' },
    },
    datapack: { name: 'bodea', version: 'main' },
};

/** Commerce's reads, counted: a read answered from the check's copy never reaches it. */
const commerceGet = jest.fn();

/** One read of the products through the client the handler built. */
async function readProducts(deps: StoreChangesDeps): Promise<void> {
    const commerce = await deps.commerce();
    if ('refusal' in commerce) throw new Error(commerce.refusal);
    await commerce.get(PRODUCTS);
}

beforeEach(() => {
    jest.clearAllMocks();
    forgetReadWindows();
    mockedAccess.mockResolvedValue({
        ok: true,
        baseUrl: INSTALLER,
        getToken: async () => 'tok',
        orgCode: 'ORG@AdobeOrg',
        client: new DataInstallerClient({ baseUrl: INSTALLER, getToken: async () => 'tok' }),
    });
    // Here, not at the declaration: the jest config resets every mock's implementation per test.
    commerceGet.mockImplementation(async () => ({ items: [] }));
    mockedClient.mockResolvedValue({ get: commerceGet, send: jest.fn() });
    // The library's two reads a Save makes: whose the pack is, and what it is called.
    jest.spyOn(DataInstallerClient.prototype, 'findDatapacks').mockResolvedValue({ items: [], count: 0 });
    jest.spyOn(DataInstallerClient.prototype, 'getDatapackDetail').mockResolvedValue({
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        shared: true,
        dataTypes: [],
        art: {},
    });
    mockedPreview.mockImplementation(async (deps) => {
        await readProducts(deps);
        return { installed: true, kinds: [] };
    });
    mockedSave.mockImplementation(async (deps) => {
        await readProducts(deps);
        throw new Error('stop after the read');
    });
});

it('a Save after a changes check reads Commerce again, so an edit made since is seen', async () => {
    const context = makeImportHarness(PROJECT).context;
    await storeChangesHandlers['preview-datapack-changes'](context, ID);
    expect(commerceGet).toHaveBeenCalledTimes(1);

    await storeChangesHandlers['save-store-changes-to-pack'](context, { ...ID, saveAs: { displayName: 'My Bodea' }, confirm: true });

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(commerceGet).toHaveBeenCalledTimes(2);
});

it("CONTROL: a save opened to reuse, as the one inside a removal is, takes the check's copy", async () => {
    const context = makeImportHarness(PROJECT).context;
    await storeChangesHandlers['preview-datapack-changes'](context, ID);

    const opened = await openSave(context, { ...ID }, 'reuse');
    if ('response' in opened) throw new Error(String(opened.response.error));
    await readProducts(opened.deps);

    expect(commerceGet).toHaveBeenCalledTimes(1);
});
