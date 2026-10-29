/**
 * The wizard's creation install and project reset ask the same org question the screen's import
 * asks (`importHandlers-orgGuard.test.ts`): with Demo Builder's engine, a sign-in outside the org
 * that owns the store stops the job before it starts, in the guard's own words (DI-5).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({ resolveDataInstallerAccess: jest.fn() }));
jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));
jest.mock('@/features/data-installer/services/dataInstallerConfig', () => ({
    ...jest.requireActual('@/features/data-installer/services/dataInstallerConfig'),
    selectedDatapackEngine: jest.fn(),
}));

// The shared wall first (webview-test-authoring §3).
import { ACCS_PROJECT, importHarness } from './sampleDataInstallDeps.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedEngine = selectedDatapackEngine as jest.MockedFunction<typeof selectedDatapackEngine>;
const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const MISMATCH = 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';

beforeEach(() => {
    jest.clearAllMocks();
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
        mockedEngine.mockReturnValue('demo-builder');
        mockedGuard.mockResolvedValue({ error: MISMATCH });
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        await expect(deps.startImport(REQUEST)).rejects.toThrow(MISMATCH);
    });

    it('do not ask when the service is the engine', async () => {
        mockedEngine.mockReturnValue('service');
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        await deps.startImport(REQUEST).catch(() => undefined);

        expect(mockedGuard).not.toHaveBeenCalled();
    });
});
