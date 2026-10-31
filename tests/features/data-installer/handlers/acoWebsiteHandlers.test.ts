/**
 * "From a website" (PL-60 slice A), the two handlers:
 *
 * - `make-aco-pack-from-products` (the agent's `make_aco_pack_from_products`): validates the typed
 *   products, opens the library as every library write does, and saves through
 *   `writePackToStore` into the LIBRARY, never `update`. The pack-making itself has its own
 *   suite, so here the assertions are on the write's ARGUMENTS and on refusals before any write.
 * - `scrape-website-to-aco-pack` (the Create datapack dialog): checks the URL and opens the
 *   project's AI with the prompt, through the house command (`demoBuilder.openInClaude`).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/datapackStoreWriter');
jest.mock('@/features/data-installer/services/datapackTransfer', () => ({
    ...jest.requireActual('@/features/data-installer/services/datapackTransfer'),
    writePackToStore: jest.fn(),
}));

import * as vscode from 'vscode';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { acoWebsiteHandlers } from '@/features/data-installer/handlers/acoWebsiteHandlers';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import { DatapackStoreWriter } from '@/features/data-installer/services/datapackStoreWriter';
import { DatapackTransferError, writePackToStore } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import type { ScrapedProduct } from '@/types/scrapedProduct';

const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<typeof resolveDataInstallerAccess>;
const mockedWrite = writePackToStore as jest.MockedFunction<typeof writePackToStore>;
const MockedWriter = DatapackStoreWriter as jest.MockedClass<typeof DatapackStoreWriter>;
const executeCommand = vscode.commands.executeCommand as jest.Mock;

const LIBRARY = 'https://example-namespace.adobeioruntime.net/api/v1/web/datapack-store';
const LISTING = 'https://shop.example.com/collections/boots';

const PRODUCT: ScrapedProduct = {
    origin: LISTING,
    readFrom: 'page',
    data: { name: 'Trail Boot', image: 'https://cdn.example.com/a.jpg', price: 129, sku: 'TB-1' },
};

const PAYLOAD = {
    datapackName: 'aco_boots_shop',
    version: 'v1',
    locale: 'en-US',
    currency: 'USD',
    products: [PRODUCT],
    confirm: true,
};

const make = (payload: unknown) =>
    acoWebsiteHandlers['make-aco-pack-from-products'](createMockHandlerContext(), payload);
const scrape = (payload: unknown) =>
    acoWebsiteHandlers['scrape-website-to-aco-pack'](createMockHandlerContext(), payload);

beforeEach(() => {
    jest.clearAllMocks();
    mockedAccess.mockResolvedValue({
        ok: true,
        baseUrl: LIBRARY,
        getToken: async () => 'tok',
        orgCode: 'ORG@AdobeOrg',
        client: new DataInstallerClient({ baseUrl: LIBRARY, getToken: async () => 'tok' }),
    });
    mockedWrite.mockImplementation(async (_writer, file: DatapackFile) => ({
        pack: 'created',
        stored: file.items.map((i) => i.dataType),
        failed: [],
    }));
});

describe('make-aco-pack-from-products', () => {
    it('saves the pack into the LIBRARY, with no update, and answers the outcome', async () => {
        const result = await make(PAYLOAD);

        expect(mockedAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        expect(MockedWriter).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: LIBRARY, orgCode: 'ORG@AdobeOrg' }));
        expect(mockedWrite).toHaveBeenCalledTimes(1);
        const [writer, file, opts] = mockedWrite.mock.calls[0];
        expect(writer).toBe(MockedWriter.mock.instances[0]);
        expect(opts).toBeUndefined();
        expect(file.id).toEqual({ name: 'aco_boots_shop', version: 'v1' });
        expect(file.source).toBe('library');
        expect(result.success).toBe(true);
        expect(result.note).toMatch(/Saved the ACO pack aco_boots_shop@v1/);
        expect(result.data).toMatchObject({ saved: { name: 'aco_boots_shop', version: 'v1' }, proposed: [] });
    });

    it('refuses products that do not match the type, naming the field, before the library is opened', async () => {
        const result = await make({ ...PAYLOAD, products: [{ origin: LISTING, data: { name: 'No image' } }] });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/image/);
        expect(mockedAccess).not.toHaveBeenCalled();
    });

    it('refuses a pack with no name or version', async () => {
        const result = await make({ ...PAYLOAD, version: '' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/version/);
        expect(mockedWrite).not.toHaveBeenCalled();
    });

    it("passes the pack-maker's refusal on in its own words, with nothing written", async () => {
        const euro = { ...PRODUCT, data: { ...PRODUCT.data, currency: 'EUR' } };

        const result = await make({ ...PAYLOAD, products: [euro] });

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/Trail Boot is priced in EUR/) });
        expect(mockedWrite).not.toHaveBeenCalled();
    });

    it('says the pack is already in the library when it is', async () => {
        mockedWrite.mockRejectedValueOnce(new DatapackTransferError('exists'));

        const result = await make(PAYLOAD);

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/already in your datapack library/) });
    });

    it('passes on why the library cannot be opened', async () => {
        mockedAccess.mockResolvedValueOnce({ ok: false, response: { success: false, error: 'Sign in to Adobe first.' } });

        const result = await make(PAYLOAD);

        expect(result).toEqual({ success: false, error: 'Sign in to Adobe first.' });
        expect(mockedWrite).not.toHaveBeenCalled();
    });
});

describe('scrape-website-to-aco-pack', () => {
    it("opens the project's AI with a prompt naming the URL, the skill and the tool", async () => {
        const result = await scrape({ url: 'https://shop.example.com/collections/boots' });

        expect(result).toEqual({ success: true });
        expect(executeCommand).toHaveBeenCalledTimes(1);
        const [command, arg] = executeCommand.mock.calls[0];
        expect(command).toBe('demoBuilder.openInClaude');
        expect(arg.prompt).toContain('https://shop.example.com/collections/boots');
        expect(arg.prompt).toContain('scrape-products-to-aco');
        expect(arg.prompt).toContain('make_aco_pack_from_products');
    });

    it.each(['', 'not a url', 'ftp://shop.example.com/x', 'javascript:alert(1)'])(
        'refuses %p without opening anything',
        async (url) => {
            const result = await scrape({ url });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/http/);
            expect(executeCommand).not.toHaveBeenCalled();
        },
    );
});

it("is reachable from the Data Installer panel's handler map", () => {
    expect(importHandlers).toHaveProperty(['make-aco-pack-from-products']);
    expect(importHandlers).toHaveProperty(['scrape-website-to-aco-pack']);
});
