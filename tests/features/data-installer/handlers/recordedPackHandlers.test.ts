/**
 * The live wiring behind a recorded pack (step 07): which store each read goes to, and what
 * the copy into this SC's library hands the writer. The check itself has its own suite.
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({ resolveDataInstallerAccess: jest.fn() }));
jest.mock('@/features/data-installer/services/datapackStoreWriter');
jest.mock('@/features/data-installer/services/datapackTransfer', () => ({
    readPackFromStore: jest.fn(),
    writePackToStore: jest.fn(),
}));

import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { arrivalDepsFor, packReadsFor, recordedPackHandlers } from '@/features/data-installer/handlers/recordedPackHandlers';
import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';
import { DatapackStoreWriter } from '@/features/data-installer/services/datapackStoreWriter';
import { readPackFromStore, writePackToStore } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const mockedRead = readPackFromStore as jest.MockedFunction<typeof readPackFromStore>;
const mockedWrite = writePackToStore as jest.MockedFunction<typeof writePackToStore>;
const MockedWriter = DatapackStoreWriter as jest.MockedClass<typeof DatapackStoreWriter>;

type Access = Awaited<ReturnType<typeof resolveDataInstallerAccess>>;

const clients = {
    installer: { getDatapackDetail: jest.fn(), findDatapacks: jest.fn() },
    library: { getDatapackDetail: jest.fn(), findDatapacks: jest.fn() },
};

const context = () => createMockHandlerContext({ debugLogger: createMockLogger() });

beforeEach(() => {
    jest.clearAllMocks();
    mockedAccess.mockImplementation(async (_c, store = 'installer') =>
        ({ ok: true, client: clients[store], baseUrl: `https://${store}.test`, getToken: async () => 'tok', orgCode: 'ORG@AdobeOrg' }) as unknown as Access,
    );
});

describe('packReadsFor', () => {
    it('asks the store named, by the pair', async () => {
        clients.library.getDatapackDetail.mockResolvedValue({ id: { name: 'a', version: '1' } });

        await packReadsFor(context()).detail({ name: 'a', version: '1' }, 'library');

        expect(mockedAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        expect(clients.library.getDatapackDetail).toHaveBeenCalledWith({ name: 'a', version: '1' });
        expect(clients.installer.getDatapackDetail).not.toHaveBeenCalled();
    });

    it('lists versions by name', async () => {
        clients.installer.findDatapacks.mockResolvedValue({ items: [], count: 0 });

        await packReadsFor(context()).versions('bodea', 'installer');

        expect(clients.installer.findDatapacks).toHaveBeenCalledWith({ datapackName: 'bodea' });
    });
});

describe('arrivalDepsFor — the copy', () => {
    const FILE: DatapackFile = { id: { name: 'priya-acme', version: '1' }, displayName: 'Priya Acme', items: [{ dataType: 'products', records: [] }] };
    const TO = { id: { name: 'acme-1a2b3c', version: '20261029-183005' }, displayName: 'Acme' };

    it("reads the colleague's pack from the library and writes it as this demo's own, under its own name", async () => {
        mockedRead.mockResolvedValue(FILE);
        mockedWrite.mockResolvedValue({ pack: 'created', stored: ['products'], failed: [] });

        await arrivalDepsFor(context()).copy(FILE.id, TO);

        expect(mockedRead).toHaveBeenCalledWith(clients.library, FILE.id, 'library');
        expect(MockedWriter).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://library.test', orgCode: 'ORG@AdobeOrg' }));
        // No update: a pack of that name and version is refused, never written over.
        expect(mockedWrite).toHaveBeenCalledWith(MockedWriter.mock.instances[0], { ...FILE, id: TO.id, displayName: 'Acme' });
    });

    it('fails, naming the kinds, when the library refuses any of them', async () => {
        mockedRead.mockResolvedValue(FILE);
        mockedWrite.mockResolvedValue({ pack: 'created', stored: [], failed: [{ dataType: 'products', reason: 'too large' }] });

        await expect(arrivalDepsFor(context()).copy(FILE.id, TO)).rejects.toThrow('products: too large');
    });
});

describe('check-recorded-datapack', () => {
    it('answers the check for the pack the step holds', async () => {
        clients.library.getDatapackDetail.mockRejectedValue(new DataInstallerApiError('not found', 404, 'get-datapack-metadata'));

        const result = await recordedPackHandlers['check-recorded-datapack'](context(), { datapack: { name: 'gone', version: '1', store: 'library' } });

        expect(result).toEqual({ success: true, data: { verdict: 'none', note: expect.stringContaining("can't be read") } });
    });

    it('refuses half a pack, or a store that is not one of the two', async () => {
        expect((await recordedPackHandlers['check-recorded-datapack'](context(), { datapack: { name: 'a' } })).success).toBe(false);
        const odd = JSON.parse('{"datapack":{"name":"a","version":"1","store":"elsewhere"}}');
        expect((await recordedPackHandlers['check-recorded-datapack'](context(), odd)).success).toBe(false);
    });
});
