/**
 * The creation install reads a pack from the store the project recorded (research
 * project-export-datapacks, 2026-10-29): its inventory asks that store, and Demo Builder's
 * engine is handed the library's reads, which it had never been given here, so a library
 * pack could not be installed by creation at all. The service engine installs only from its
 * own catalog, and says so rather than failing on a pack it cannot see.
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        resolveDataInstallerAccess,
        // The write path's door, as it answers with the Data Installer's address set.
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});
jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn(async () => undefined) }));
jest.mock('@/features/data-installer/services/dataInstallerConfig', () => ({
    ...jest.requireActual('@/features/data-installer/services/dataInstallerConfig'),
    selectedDatapackEngine: jest.fn(),
}));
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    buildDatapackEngine: jest.fn(),
}));

// The shared wall first (webview-test-authoring §3).
import { ACCS_PROJECT, INSTALLER_ADDRESS, dataInstallerAddress, importHarness } from './sampleDataInstallDeps.testUtils';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { buildDatapackEngine } from '@/features/data-installer/services/buildDatapackEngine';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import type { ImportRequest } from '@/features/data-installer/services/dataInstallerWriteClient';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';

const mockedEngine = selectedDatapackEngine as jest.MockedFunction<typeof selectedDatapackEngine>;
const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const mockedBuild = buildDatapackEngine as jest.MockedFunction<typeof buildDatapackEngine>;

type Access = Awaited<ReturnType<typeof resolveDataInstallerAccess>>;

function client(name: string) {
    return {
        name,
        getDatapackDetail: jest.fn().mockResolvedValue({ dataTypes: ['products'] }),
        batchGetDataItems: jest.fn().mockResolvedValue({ present: ['products'], missing: [] }),
        getDataItem: jest.fn(),
        getJobStatus: jest.fn(),
        getJobFailureReason: jest.fn(),
    };
}

const installer = client('installer');
const library = client('library');

const LIBRARY_REQUEST: ImportRequest = {
    id: { name: 'acme-demo-1a2b3c', version: '20261029-1000' },
    commerceInstance: 'TENANT123',
    dataTypes: ['products'],
    source: 'library',
};

beforeEach(() => {
    jest.clearAllMocks();
    dataInstallerAddress(INSTALLER_ADDRESS);
    mockedAccess.mockImplementation(async (_context, store) =>
        ({ ok: true, client: store === 'library' ? library : installer, baseUrl: 'https://x.test', getToken: async () => 'tok' }) as unknown as Access,
    );
    mockedBuild.mockReturnValue({ startImport: jest.fn().mockResolvedValue({ activationId: 'a1' }) } as unknown as ReturnType<typeof buildDatapackEngine>);
});

describe('the creation install reads the store the project recorded', () => {
    it('asks the library what it holds for a library pack', async () => {
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        await expect(deps.inventory({ name: 'acme-demo-1a2b3c', version: '20261029-1000', store: 'library' })).resolves.toStrictEqual(['products']);

        expect(mockedAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        expect(library.getDatapackDetail).toHaveBeenCalledWith({ name: 'acme-demo-1a2b3c', version: '20261029-1000' });
        expect(installer.getDatapackDetail).not.toHaveBeenCalled();
    });

    // As the install reads it (`readPackItems`): the datapack store's copy first, whatever the pack names.
    describe('a pack with no store recorded, or recorded in the Data Installer', () => {
        const FRESCOPA = { name: 'frescopa', version: 'main' };

        it.each([[undefined], ['installer' as const]])('answers from the datapack store when it holds the pack (store %s)', async (store) => {
            const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

            await expect(deps.inventory({ ...FRESCOPA, store })).resolves.toStrictEqual(['products']);

            expect(library.getDatapackDetail).toHaveBeenCalledWith(FRESCOPA);
            expect(installer.getDatapackDetail).not.toHaveBeenCalled();
        });

        it('asks the Data Installer when the datapack store holds none of it', async () => {
            library.getDatapackDetail.mockResolvedValue({ dataTypes: [] });
            const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

            await expect(deps.inventory(FRESCOPA)).resolves.toStrictEqual(['products']);

            expect(installer.getDatapackDetail).toHaveBeenCalledWith(FRESCOPA);
        });

        it('asks the Data Installer when the datapack store refuses', async () => {
            library.getDatapackDetail.mockRejectedValue(new Error('not found'));
            const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

            await expect(deps.inventory(FRESCOPA)).resolves.toStrictEqual(['products']);

            expect(installer.getDatapackDetail).toHaveBeenCalledWith(FRESCOPA);
        });
    });

    it("hands Demo Builder's engine the library's reads", async () => {
        mockedEngine.mockReturnValue('demo-builder');
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        await deps.startImport(LIBRARY_REQUEST);

        const access = mockedBuild.mock.calls[0][1];
        expect(mockedBuild.mock.calls[0][0]).toBe('demo-builder');
        await expect(access.libraryCatalog?.()).resolves.toBe(library);
    });

    it('refuses a library pack when the service is the engine, saying what to do', async () => {
        mockedEngine.mockReturnValue('service');
        const deps = buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn());

        await expect(deps.startImport(LIBRARY_REQUEST)).rejects.toThrow(
            'The Data Installer service installs only packs in its own catalog.',
        );
        expect(mockedBuild).not.toHaveBeenCalled();
    });
});
