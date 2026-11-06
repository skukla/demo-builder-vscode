/**
 * The wizard's creation install and project reset ask the same org question the screen's import
 * asks (`importHandlers-orgGuard.test.ts`): a sign-in outside the org
 * that owns the store stops the job before it starts, in the guard's own words (DI-5).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        resolveDataInstallerAccess,
        // The write path's door, as it answers with the Data Installer's address set.
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});
jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));

// The shared wall first (webview-test-authoring §3).
import { ACCS_PROJECT, INSTALLER_ADDRESS, dataInstallerAddress, importHarness } from './sampleDataInstallDeps.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const MISMATCH = 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';

beforeEach(() => {
    jest.clearAllMocks();
    dataInstallerAddress(INSTALLER_ADDRESS);
    mockedAccess.mockResolvedValue({
        ok: true,
        client: { getJobStatus: jest.fn(), getJobFailureReason: jest.fn(), getDatapackDetail: jest.fn(), getDataItem: jest.fn() },
        baseUrl: 'https://installer.test/api',
        getToken: async () => 'tok',
    } as unknown as Awaited<ReturnType<typeof resolveDataInstallerAccess>>);
});

describe('the creation install and reset ask the org question', () => {
    const REQUEST = { id: { name: 'frescopa', version: 'main' }, dataTypes: ['categories'] } as unknown as Parameters<
        ReturnType<typeof buildSampleDataDeps>['startImport']
    >[0];

    it('stop before starting when the sign-in is outside the store\'s org', async () => {
        mockedGuard.mockResolvedValue({ error: MISMATCH });
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        await expect(deps.startImport(REQUEST)).rejects.toThrow(MISMATCH);
    });

    it('CONTROL: go on to build the engine once the sign-in is in that org', async () => {
        mockedGuard.mockResolvedValue(undefined);
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        // Past the guard, the job stops on the request's missing target, not on the org.
        await expect(deps.startImport(REQUEST)).resolves.toMatchObject({ activationId: expect.any(String) });
        expect(mockedGuard).toHaveBeenCalled();
    });
});
