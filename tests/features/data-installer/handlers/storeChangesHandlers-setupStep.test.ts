/**
 * The handlers behind a pack's one Admin step in its flyout (datapack-engine step 12): the get
 * reads only the install record of the open project; the Check opens the store as every datapack
 * action does (org guard first) and hands the check the project's path and the pack. The check
 * itself has its own suite (`runPack-packRoot.test.ts`); here it is mocked and its arguments
 * asserted.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/packRootCheck', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/packRootCheck'),
    recordedRootStep: jest.fn(),
    checkRecordedRootStep: jest.fn(),
}));

import { makeImportHarness } from './importHandlers.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { storeChangesHandlers } from '@/features/data-installer/handlers/storeChangesHandlers';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import { checkRecordedRootStep, recordedRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedRead = recordedRootStep as jest.MockedFunction<typeof recordedRootStep>;
const mockedCheck = checkRecordedRootStep as jest.MockedFunction<typeof checkRecordedRootStep>;

const PROJECT: Partial<Project> = {
    name: 'scratch',
    path: '/nonexistent/projects/scratch',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite_test_website', ACCS_STORE_VIEW_CODE: 'justrite_test_view' } },
    datapack: { name: 'frescopa', version: 'main' },
};
const ID = { datapackName: 'frescopa', version: 'main' };
const STEP: PackRootStep = {
    state: 'open',
    storeCode: 'justrite_test_store',
    storeName: 'JustRite Test Store',
    rootId: 300,
    rootName: 'Frescopa',
    storeRootId: 119,
    sharedWith: 'the store justrite_store (website justrite)',
};

const INSTALLER = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const harness = () => makeImportHarness(PROJECT).context;

beforeEach(() => {
    jest.clearAllMocks();
    mockedGuard.mockResolvedValue(undefined);
    (resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>).mockResolvedValue({
        ok: true,
        baseUrl: INSTALLER,
        getToken: async () => 'tok',
        orgCode: 'ORG@AdobeOrg',
        client: new DataInstallerClient({ baseUrl: INSTALLER, getToken: async () => 'tok' }),
    });
});

describe('get-datapack-setup-step', () => {
    it("answers the open project's recorded step in the setup guide's step format", async () => {
        mockedRead.mockResolvedValue(STEP);

        const result = await storeChangesHandlers['get-datapack-setup-step'](harness(), ID);

        expect(mockedRead).toHaveBeenCalledWith(expect.anything(), '/nonexistent/projects/scratch', { name: 'frescopa', version: 'main' });
        expect(result).toEqual({
            success: true,
            data: {
                datapackName: 'frescopa',
                version: 'main',
                step: expect.objectContaining({ id: 'pack-root-category', state: 'open', enter: ['Root Category: Frescopa'], checkable: true, checkState: 'unchecked' }),
            },
        });
        expect(mockedGuard).not.toHaveBeenCalled();
    });

    it('answers no step when the pack left none, and refuses a payload with no pack', async () => {
        mockedRead.mockResolvedValue(undefined);

        await expect(storeChangesHandlers['get-datapack-setup-step'](harness(), ID)).resolves.toEqual({ success: true, data: { ...ID, step: null } });
        await expect(storeChangesHandlers['get-datapack-setup-step'](harness(), {})).resolves.toMatchObject({ success: false });
    });
});

describe('check-datapack-setup-step', () => {
    it("checks the step for the open project's pack and answers it as it now stands", async () => {
        mockedCheck.mockResolvedValue({ ...STEP, state: 'done', note: "The store JustRite Test Store shows Frescopa's categories." });

        const result = await storeChangesHandlers['check-datapack-setup-step'](harness(), ID);

        expect(mockedCheck).toHaveBeenCalledWith(expect.objectContaining({ projectPath: '/nonexistent/projects/scratch' }), { name: 'frescopa', version: 'main' });
        expect(result).toMatchObject({ success: true, data: { step: { state: 'done', checkState: 'passed' } } });
    });

    it('refuses before reading the store when the sign-in is in another org', async () => {
        mockedGuard.mockResolvedValue({ error: 'Use "Switch IMS Org" to continue.' });

        const result = await storeChangesHandlers['check-datapack-setup-step'](harness(), ID);

        expect(result).toMatchObject({ success: false, code: ErrorCode.ORG_MISMATCH });
        expect(mockedCheck).not.toHaveBeenCalled();
    });

    it("says the step could not be checked, in words, when the project's store cannot be opened", async () => {
        mockedCheck.mockRejectedValue(new Error('Adobe sign-in is required'));

        const result = await storeChangesHandlers['check-datapack-setup-step'](harness(), ID);

        expect(result).toMatchObject({ success: false, error: 'The step could not be checked. Details are in Debug Logs.' });
    });
});
