/**
 * The ACO choice of `start-datapack-export` (`aco: true`, step 14 item 19): how the export is
 * called, which Commerce reads it is handed, and where its pack is written.
 *
 * The export itself (`acoPackExport.ts`) has its own suite; here it is mocked and its ARGUMENTS
 * asserted, since what this layer owns is how it is called: the pack named, the store views,
 * the project's own Commerce client per store view, and a write into the LIBRARY, never `update`.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));
jest.mock('@/features/data-installer/services/acoExport/acoPackExport', () => ({
    ...jest.requireActual('@/features/data-installer/services/acoExport/acoPackExport'),
    exportAcoPack: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    commerceClientForProject: jest.fn(),
}));
jest.mock('@/features/data-installer/services/datapackStoreWriter');
jest.mock('@/features/data-installer/services/datapackTransfer', () => ({
    ...jest.requireActual('@/features/data-installer/services/datapackTransfer'),
    writePackToStore: jest.fn(),
}));

// The shared wall first (it chooses the SERVICE engine), then the subject.
import { importHandlers, makeImportHarness } from './importHandlers.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import {
    type AcoExportOutcome,
    exportAcoPack,
} from '@/features/data-installer/services/acoExport/acoPackExport';
import { AcoExportError } from '@/features/data-installer/services/acoExport/acoStoreReads';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import { DatapackStoreWriter } from '@/features/data-installer/services/datapackStoreWriter';
import { writePackToStore } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { commerceClientForProject } from '@/features/project-creation/services/erpFillForProject';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<
    typeof resolveDataInstallerAccess
>;
const mockedExport = exportAcoPack as jest.MockedFunction<typeof exportAcoPack>;
const mockedClient = commerceClientForProject as jest.MockedFunction<
    typeof commerceClientForProject
>;
const mockedWrite = writePackToStore as jest.MockedFunction<typeof writePackToStore>;
const MockedWriter = DatapackStoreWriter as jest.MockedClass<typeof DatapackStoreWriter>;
const mockedEngine = selectedDatapackEngine as jest.MockedFunction<typeof selectedDatapackEngine>;

const INSTALLER = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const LIBRARY = 'https://example-namespace.adobeioruntime.net/api/v1/web/datapack-store';

const PROJECT: Partial<Project> = {
    name: 'acme',
    path: '/nonexistent/projects/acme',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'acme', ACCS_STORE_VIEW_CODE: 'acme_en' },
    },
};

const OUTCOME: AcoExportOutcome = {
    success: true,
    perType: [{ dataType: 'aco_products', success: true, exported: 3, excluded: 1 }],
    saved: { name: 'aco_acme', version: 'main' },
    storeViews: ['default'],
    sentence: 'Saved the ACO pack aco_acme@main to your datapack library: 1 kinds for default.',
};

const send = (payload: Record<string, unknown>) =>
    importHandlers['start-datapack-export'](makeImportHarness(PROJECT).context, {
        datapackName: 'aco_acme',
        version: 'main',
        aco: true,
        ...payload,
    });

beforeEach(() => {
    jest.clearAllMocks();
    mockedGuard.mockResolvedValue(undefined);
    mockedExport.mockResolvedValue(OUTCOME);
    mockedAccess.mockImplementation(async (_context, store = 'installer') => ({
        ok: true,
        baseUrl: store === 'library' ? LIBRARY : INSTALLER,
        getToken: async () => 'tok',
        orgCode: 'ORG@AdobeOrg',
        client: new DataInstallerClient({
            baseUrl: store === 'library' ? LIBRARY : INSTALLER,
            getToken: async () => 'tok',
        }),
    }));
});

describe('start-datapack-export with aco', () => {
    it('makes the pack named, for the store views and kinds asked, and answers its outcome', async () => {
        const result = await send({ storeViews: ['default'], dataTypes: ['aco_products'] });

        expect(mockedExport).toHaveBeenCalledWith(
            expect.any(Object),
            {
                id: { name: 'aco_acme', version: 'main' },
                storeViews: ['default'],
                dataTypes: ['aco_products'],
            },
            expect.any(Function)
        );
        expect(result).toEqual({ success: true, note: OUTCOME.sentence, data: OUTCOME });
    });

    it("runs with Demo Builder's engine chosen, where the Commerce export is refused", async () => {
        mockedEngine.mockReturnValueOnce('demo-builder');

        const result = await send({});

        expect(result.success).toBe(true);
        expect(mockedExport).toHaveBeenCalled();
    });

    it("hands it the project's own Commerce reads: store-wide as `all`, else through the store view named", async () => {
        const get = jest.fn();
        mockedClient.mockResolvedValue({ get, send: jest.fn() });
        await send({});
        const { commerce } = mockedExport.mock.calls[0][0];

        await expect(commerce()).resolves.toBe(get);
        await commerce('fr');

        expect(mockedClient.mock.calls.map((call) => call[4])).toEqual(['all', 'fr']);
        expect(mockedClient.mock.calls[0][0]).toMatchObject({ name: 'acme' });
    });

    it("passes the client's refusal on as it is", async () => {
        mockedClient.mockResolvedValue({ refusal: 'No Commerce credential for this project.' });
        await send({});
        await expect(mockedExport.mock.calls[0][0].commerce()).resolves.toEqual({
            refusal: 'No Commerce credential for this project.',
        });
    });

    it('writes the pack into the LIBRARY, with no update', async () => {
        await send({});
        const write = mockedExport.mock.calls[0][2];
        const file: DatapackFile = {
            id: { name: 'aco_acme', version: 'main' },
            displayName: 'aco_acme',
            items: [],
        };

        await write(file);

        expect(MockedWriter).toHaveBeenCalledWith(
            expect.objectContaining({ baseUrl: LIBRARY, orgCode: 'ORG@AdobeOrg' })
        );
        expect(mockedWrite).toHaveBeenCalledWith(MockedWriter.mock.instances[0], file);
    });

    it('refuses without a name and version, before anything is read', async () => {
        const result = await send({ version: '' });

        expect(result).toEqual({
            success: false,
            error: 'An export needs a datapack name and a version — together they name what it writes.',
        });
        expect(mockedExport).not.toHaveBeenCalled();
    });

    // Merging G3 (the pick screen's `selections`) with G5: the other two exports' fields would
    // be silently ignored by an ACO pack, which reads the project's own store and picks nothing.
    it.each(['service', 'demo-builder'] as const)(
        'refuses commerceInstance and selections with the %s engine, before anything is read',
        async (engine) => {
            // Not `Once`: the ACO branch never asks for the engine, so a queued value would leak.
            mockedEngine.mockImplementation(() => engine);
            const result = await send({ commerceInstance: 'tenant-1', selections: { products: { sku: ['VR-Rack'] } } })
                .finally(() => mockedEngine.mockImplementation(() => 'service'));

            expect(result).toEqual({
                success: false,
                error: "An ACO pack is made from this project's own store, so commerceInstance and selections cannot be sent with aco.",
                code: ErrorCode.INVALID_OPERATION,
            });
            expect(mockedExport).not.toHaveBeenCalled();
            expect(mockedGuard).not.toHaveBeenCalled();
        },
    );

    it("refuses when the sign-in is not in the store's org", async () => {
        mockedGuard.mockResolvedValue({ error: 'Signed in to another organization.' } as Awaited<
            ReturnType<typeof orgGuard>
        >);

        const result = await send({});

        expect(result).toEqual({
            success: false,
            error: 'Signed in to another organization.',
            code: ErrorCode.ORG_MISMATCH,
        });
        expect(mockedExport).not.toHaveBeenCalled();
    });

    it('refuses, saying why, when the library cannot be opened, before anything is read', async () => {
        mockedAccess.mockImplementation(async (_context, store = 'installer') =>
            store === 'library'
                ? { ok: false, response: { success: false, error: 'The datapack library is not configured.' } }
                : {
                      ok: true,
                      baseUrl: INSTALLER,
                      getToken: async () => 'tok',
                      client: new DataInstallerClient({ baseUrl: INSTALLER, getToken: async () => 'tok' }),
                  },
        );

        await expect(send({})).resolves.toEqual({ success: false, error: 'The datapack library is not configured.' });
        expect(mockedExport).not.toHaveBeenCalled();
    });

    it('answers an export refusal in its own words', async () => {
        mockedExport.mockRejectedValue(
            new AcoExportError('The store has no store view nl. It has default.')
        );
        await expect(send({ storeViews: ['nl'] })).resolves.toEqual({
            success: false,
            error: 'The store has no store view nl. It has default.',
        });
    });

    it('answers anything else with a sentence and the details in the logs', async () => {
        mockedExport.mockRejectedValue(new Error('socket hang up'));
        await expect(send({})).resolves.toEqual({
            success: false,
            error: 'The ACO pack could not be made. Details are in Debug Logs.',
            code: ErrorCode.UNKNOWN,
        });
    });
});
