/**
 * A pack's settings layer through the datapack file (datapack-engine step 09, decisions 1 and 3):
 * saving carries it as a second section; loading puts the data where the SC chose and the layer in
 * the library. The access guard hands back per-store clients; the stores' HTTP is a fetch fake, and
 * every test asserts what reached which store, in order. Files are real, in a temp project.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { datapackZipHandlers } from '@/features/data-installer/handlers/datapackZipHandlers';
import { buildDatapackZip, type DatapackFile, readDatapackZip } from '@/features/data-installer/services/datapackZip';
import type { DatapackDetail } from '@/features/data-installer/types';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { GRID, fileLayer, libraryRow, settingRow } from '../../../helpers/settingsLayerFixtures';

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));

const mockAccess = resolveDataInstallerAccess as jest.Mock;

const ID = { name: 'justrite', version: 'v1' };
const DETAIL: DatapackDetail = { id: ID, displayName: 'Justrite B2B', shared: true, dataTypes: ['categories'], art: {} };
const ROWS = [{ category: { name: 'Signs' } }];
const INSTALLER = 'https://installer.example.test/api/v1/web/data-installer';
const LIBRARY = 'https://library.example.test/api/v1/web/datapack-store';

const PACK: DatapackFile = { id: ID, displayName: 'Justrite B2B', items: [{ dataType: 'categories', records: ROWS }] };

const library = { getDatapackDetail: jest.fn(), getDataItem: jest.fn(), findDatapacks: jest.fn() };
const installer = { getDatapackDetail: jest.fn(), getDataItem: jest.fn(), findDatapacks: jest.fn() };

let dir: string;
let fetchMock: jest.Mock;

const context = () => {
    const made = createMockHandlerContext();
    (made.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(createMockProject({ path: dir }));
    return made;
};

/** Each store write, in order: which store, and which route, pack and type. */
function writes(): string[] {
    return fetchMock.mock.calls.map(([url, init]) => {
        const address = String(url);
        const store = address.startsWith(LIBRARY) ? 'library' : 'installer';
        const body = JSON.parse(String((init as RequestInit).body)) as { datapack_name: string; version: string; data_type?: string };
        const route = address.slice(address.lastIndexOf('/') + 1);
        return `${store} ${route} ${body.datapack_name}@${body.version}${body.data_type ? ` ${body.data_type}` : ''}`;
    });
}

const fileWith = (pack: DatapackFile): string => {
    const file = path.join(dir, 'pack.datapack.zip');
    fs.writeFileSync(file, buildDatapackZip(pack));
    return file;
};

beforeEach(() => {
    jest.clearAllMocks();
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datapack-layer-')));
    installer.getDatapackDetail.mockResolvedValue(DETAIL);
    installer.getDataItem.mockResolvedValue({ dataType: 'categories', records: ROWS });
    library.findDatapacks.mockResolvedValue({ items: [], count: 0 });
    library.getDataItem.mockResolvedValue({ dataType: 'store_config', records: [settingRow(GRID, '24')] });
    mockAccess.mockImplementation(async (_context: unknown, store: string) =>
        store === 'library'
            ? { ok: true, client: library, baseUrl: LIBRARY, getToken: async () => 'tok' }
            : { ok: true, client: installer, baseUrl: INSTALLER, getToken: async () => 'tok' },
    );
    fetchMock = jest.fn(async () => ({ ok: true, status: 201, text: async () => '{"success":true}' }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('save-datapack-zip', () => {
    const save = datapackZipHandlers['save-datapack-zip'];
    const body = { datapackName: 'justrite', version: 'v1', path: 'out.zip' };

    it('carries the newest layer from the library as the second section, and says so', async () => {
        library.findDatapacks.mockResolvedValue({ items: [libraryRow('justrite-settings', '3', { displayName: 'Justrite settings' })], count: 1 });

        const result = await save(context(), body);

        expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: 'justrite-settings' });
        expect(result).toMatchObject({ success: true, data: { dataTypes: ['categories'], settingsLayer: { datapackName: 'justrite-settings', version: '3', settings: 1 } } });
        expect(readDatapackZip(fs.readFileSync(path.join(dir, 'out.zip'))).settingsLayer).toEqual({
            id: { name: 'justrite-settings', version: '3' },
            displayName: 'Justrite settings',
            records: [settingRow(GRID, '24')],
        });
    });

    it('writes a plain file, and does not look, when the pack holds settings of its own', async () => {
        installer.getDatapackDetail.mockResolvedValue({ ...DETAIL, dataTypes: ['categories', 'store_config'] });

        const result = await save(context(), body);

        expect(library.findDatapacks).not.toHaveBeenCalled();
        expect(result.data).not.toHaveProperty('settingsLayer');
        expect(readDatapackZip(fs.readFileSync(path.join(dir, 'out.zip')))).not.toHaveProperty('settingsLayer');
    });

    it('writes no file a load would refuse, naming the path', async () => {
        library.findDatapacks.mockResolvedValue({ items: [libraryRow('justrite-settings', '3')], count: 1 });
        library.getDataItem.mockResolvedValue({ dataType: 'store_config', records: [settingRow('web/secure/base_url', 'x')] });

        const result = await save(context(), body);

        expect(result).toMatchObject({ success: false, error: expect.stringContaining('web/secure/base_url') });
        expect(fs.existsSync(path.join(dir, 'out.zip'))).toBe(false);
    });

    it('writes a plain file when the pack has no layer', async () => {
        const result = await save(context(), body);

        expect(result.data).not.toHaveProperty('settingsLayer');
        expect(readDatapackZip(fs.readFileSync(path.join(dir, 'out.zip')))).not.toHaveProperty('settingsLayer');
    });

    it('saves the pack, and says the layer may be missing, when the library cannot be asked', async () => {
        library.findDatapacks.mockRejectedValue(new Error('unreachable'));

        const result = await save(context(), body);

        expect(result).toMatchObject({ success: true, data: { settingsLayerNote: 'The datapack library could not be asked for justrite-settings, so any store settings it holds are not in this file.' } });
        expect(fs.existsSync(path.join(dir, 'out.zip'))).toBe(true);
    });
});

describe('open-datapack-zip', () => {
    const open = datapackZipHandlers['open-datapack-zip'];

    it('says what the file holds, the layer by name and by path, writing nothing', async () => {
        const result = await open(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }) });

        expect(result).toMatchObject({
            success: true,
            data: { dataTypes: ['categories'], settingsLayer: { datapackName: 'justrite-settings', version: '3', settings: 1, paths: [GRID] } },
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says the same as ever for an older file', async () => {
        const result = await open(context(), { path: fileWith(PACK) });

        expect(result.data).not.toHaveProperty('settingsLayer');
    });

    it('refuses a file whose layer a pack may not carry, by path', async () => {
        const result = await open(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer([settingRow('web/secure/base_url', 'x')]) }) });

        expect(result).toMatchObject({ success: false, error: expect.stringContaining('web/secure/base_url') });
    });
});

describe('load-datapack-zip', () => {
    const load = datapackZipHandlers['load-datapack-zip'];

    it('puts the data in the library and the layer in the library, data first', async () => {
        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }) });

        expect(writes()).toEqual([
            'library create-datapack justrite@v1',
            'library add-data-item justrite@v1 categories',
            'library create-datapack justrite-settings@3',
            'library add-data-item justrite-settings@3 store_config',
        ]);
        expect(result).toMatchObject({ success: true, data: { target: 'library', pack: 'created', settingsLayer: { datapackName: 'justrite-settings', version: '3', outcome: 'created' } } });
    });

    it('with the data going to the Data Installer, still puts the layer in the library', async () => {
        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }), target: 'installer', confirmName: 'justrite' });

        expect(writes()).toEqual([
            'installer create-datapack justrite@v1',
            'installer add-data-item justrite@v1 categories',
            'library create-datapack justrite-settings@3',
            'library add-data-item justrite-settings@3 store_config',
        ]);
        expect(result).toMatchObject({ success: true, data: { target: 'installer', settingsLayer: { outcome: 'created' } } });
    });

    it('loads an older file with no section exactly as before: one store, two writes', async () => {
        const result = await load(context(), { path: fileWith(PACK) });

        expect(writes()).toEqual(['library create-datapack justrite@v1', 'library add-data-item justrite@v1 categories']);
        expect(result.data).not.toHaveProperty('settingsLayer');
    });

    it('refuses a layer a pack may not carry before anything is written, by path', async () => {
        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer([settingRow('design/head/default_title', 'x')]) }) });

        expect(result).toMatchObject({ success: false, error: expect.stringContaining('design/head/default_title') });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never touches a layer already in the library unless asked to replace it, and says so', async () => {
        fetchMock.mockImplementation(async (url: string) => {
            const exists = String(url).endsWith('/create-datapack') && fetchMock.mock.calls.length > 1;
            return exists ? { ok: false, status: 409, text: async () => '{}' } : { ok: true, status: 201, text: async () => '{}' };
        });

        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }) });

        expect(writes()).not.toContain('library add-data-item justrite-settings@3 store_config');
        expect(result).toMatchObject({ success: true, data: { pack: 'created', settingsLayer: { outcome: 'left', reason: expect.stringContaining('already') } } });
    });

    it('replaces it when the SC asked to update', async () => {
        fetchMock.mockImplementation(async (url: string) => (String(url).endsWith('/create-datapack') ? { ok: false, status: 409, text: async () => '{}' } : { ok: true, status: 201, text: async () => '{}' }));

        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }), update: true });

        expect(writes()).toContain('library add-data-item justrite-settings@3 store_config');
        expect(result).toMatchObject({ data: { pack: 'updated', settingsLayer: { outcome: 'updated' } } });
    });

    it('keeps the data and says why when the library refuses the layer', async () => {
        fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
            const refused = String(init.body).includes('justrite-settings');
            return refused ? { ok: false, status: 403, text: async () => '{"error":"not yours"}' } : { ok: true, status: 201, text: async () => '{}' };
        });

        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }) });

        expect(result).toMatchObject({ success: true, data: { stored: ['categories'], settingsLayer: { outcome: 'failed', reason: expect.stringContaining('not yours') } } });
    });

    it('keeps the data and says why when the library cannot be opened for the layer', async () => {
        mockAccess.mockImplementation(async (_context: unknown, store: string) =>
            store === 'library' ? { ok: false, response: { success: false, error: 'The datapack library is not set up.' } } : { ok: true, client: installer, baseUrl: INSTALLER, getToken: async () => 'tok' },
        );

        const result = await load(context(), { path: fileWith({ ...PACK, settingsLayer: fileLayer() }), target: 'installer', confirmName: 'justrite' });

        expect(writes()).toEqual(['installer create-datapack justrite@v1', 'installer add-data-item justrite@v1 categories']);
        expect(result).toMatchObject({ success: true, data: { settingsLayer: { outcome: 'failed', reason: 'The datapack library is not set up.' } } });
    });
});
