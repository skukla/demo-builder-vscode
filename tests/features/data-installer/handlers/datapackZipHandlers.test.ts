/**
 * Datapack files through the handlers: save from a store, open, load into a store.
 *
 * The access guard and the store are the boundaries. The access guard is mocked to
 * hand back a fake catalog client, and the store's HTTP is a fetch fake that
 * records what was sent. Files are real, written into a temp project.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import {
    datapackZipHandlers,
    INSTALLER_UPDATE_REFUSED,
    installerEchoRefusal,
} from '@/features/data-installer/handlers/datapackZipHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { buildDatapackZip, readDatapackZip } from '@/features/data-installer/services/datapackZip';
import type { DatapackDetail } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));

const mockAccess = resolveDataInstallerAccess as jest.Mock;
const mockSave = vscode.window.showSaveDialog as jest.Mock;
const mockOpen = vscode.window.showOpenDialog as jest.Mock;

const ID = { name: 'justrite', version: 'v1' };
const DETAIL: DatapackDetail = {
    id: ID,
    displayName: 'Justrite B2B',
    shared: true,
    dataTypes: ['categories'],
    art: {},
};
const ROWS = [{ category: { name: 'Signs' } }];
const STORE = 'https://store.example.test/api/v1/web/datapack-store';

const catalog = {
    getDatapackDetail: jest.fn(),
    getDataItem: jest.fn(),
};

let dir: string;
let fetchMock: jest.Mock;

function contextFor(project: Project | null, withPanel: boolean) {
    const context = createMockHandlerContext(withPanel ? { panel: createMockWebviewPanel() } : {});
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return context;
}

function packFile(name = 'pack.datapack.zip'): string {
    const file = path.join(dir, name);
    fs.writeFileSync(
        file,
        buildDatapackZip({
            id: ID,
            displayName: 'Justrite B2B',
            items: [{ dataType: 'categories', records: ROWS }],
        })
    );
    return file;
}

beforeEach(() => {
    jest.clearAllMocks();
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datapack-zip-')));
    catalog.getDatapackDetail.mockResolvedValue(DETAIL);
    catalog.getDataItem.mockResolvedValue({ dataType: 'categories', records: ROWS });
    mockAccess.mockResolvedValue({
        ok: true,
        client: catalog,
        baseUrl: STORE,
        getToken: async () => 'tok',
    });
    fetchMock = jest.fn(async () => ({
        ok: true,
        status: 201,
        text: async () => '{"success":true}',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

it("is reachable through the panel's one handler map", () => {
    for (const type of [
        'save-datapack-zip',
        'open-datapack-zip',
        'load-datapack-zip',
        'delete-library-datapack',
    ]) {
        expect(importHandlers).toHaveProperty([type]);
    }
});

describe('save-datapack-zip', () => {
    const save = datapackZipHandlers['save-datapack-zip'];

    it('reads the pack from the named store and writes the file an agent named, inside the project', async () => {
        const result = await save(contextFor(createMockProject({ path: dir }), false), {
            source: 'library',
            datapackName: 'justrite',
            version: 'v1',
            path: 'out',
        });

        expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        const written = path.join(dir, 'out');
        expect(result).toMatchObject({
            success: true,
            data: { path: written, dataTypes: ['categories'] },
        });
        const pack = readDatapackZip(fs.readFileSync(written));
        expect(pack).toMatchObject({
            id: ID,
            source: 'library',
            items: [{ dataType: 'categories', records: ROWS }],
        });
    });

    it('names the file after the pack when an agent gives a folder', async () => {
        await save(contextFor(createMockProject({ path: dir }), false), {
            datapackName: 'justrite',
            version: 'v1',
            path: '.',
        });

        expect(fs.existsSync(path.join(dir, 'justrite-v1.datapack.zip'))).toBe(true);
    });

    it('refuses an agent path outside the project, and writes nothing', async () => {
        const result = await save(contextFor(createMockProject({ path: dir }), false), {
            datapackName: 'justrite',
            version: 'v1',
            path: path.join(os.tmpdir(), 'elsewhere.zip'),
        });

        expect(result.success).toBe(false);
        expect(fs.existsSync(path.join(os.tmpdir(), 'elsewhere.zip'))).toBe(false);
    });

    it('asks with the save dialog from the panel, offering the pack name; cancelled when dismissed', async () => {
        mockSave.mockResolvedValue(undefined);

        const result = await save(contextFor(null, true), {
            datapackName: 'justrite',
            version: 'v1',
        });

        expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({ filters: { 'Datapack file': ['zip'] } })
        );
        expect(
            (mockSave.mock.calls[0][0] as { defaultUri: { fsPath: string } }).defaultUri.fsPath
        ).toContain('justrite-v1.datapack.zip');
        expect(result).toEqual({ success: true, data: { cancelled: true } });
    });

    it('defaults the source to the Data Installer, and passes the guard refusal through untouched', async () => {
        const refusal = { success: false, error: 'Adobe sign-in is required.' };
        mockAccess.mockResolvedValue({ ok: false, response: refusal });

        const result = await save(contextFor(null, true), {
            datapackName: 'justrite',
            version: 'v1',
        });

        expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'installer');
        expect(result).toBe(refusal);
    });

    it('refuses without a name and version, before asking anything', async () => {
        expect(await save(contextFor(null, true), { datapackName: 'justrite' })).toMatchObject({
            success: false,
        });
        expect(mockAccess).not.toHaveBeenCalled();
    });
});

describe('open-datapack-zip', () => {
    const open = datapackZipHandlers['open-datapack-zip'];

    it('says what is in the file the panel picked, writing nothing', async () => {
        const file = packFile();
        mockOpen.mockResolvedValue([{ fsPath: file }]);

        const result = await open(contextFor(null, true), {});

        expect(result).toEqual({
            success: true,
            data: {
                path: file,
                datapackName: 'justrite',
                version: 'v1',
                displayName: 'Justrite B2B',
                dataTypes: ['categories'],
            },
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('explains a file that is not a datapack file', async () => {
        const file = path.join(dir, 'notes.zip');
        fs.writeFileSync(file, 'not a zip');

        const result = await open(contextFor(createMockProject({ path: dir }), false), {
            path: file,
        });

        expect(result).toMatchObject({ success: false, error: 'This file is not a zip archive.' });
    });

    it('needs a path from an agent', async () => {
        expect(await open(contextFor(createMockProject({ path: dir }), false), {})).toMatchObject({
            success: false,
        });
        expect(mockOpen).not.toHaveBeenCalled();
    });
});

describe('load-datapack-zip', () => {
    const load = datapackZipHandlers['load-datapack-zip'];

    function sentRoutes(): string[] {
        return fetchMock.mock.calls.map(([url]) => String(url).replace(`${STORE}/`, ''));
    }

    it("writes the file's pack into the library by default: create, then each type", async () => {
        const result = await load(contextFor(createMockProject({ path: dir }), false), {
            path: packFile(),
        });

        expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        expect(sentRoutes()).toEqual(['create-datapack', 'add-data-item']);
        const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
        expect(body).toEqual({
            datapack_name: 'justrite',
            version: 'v1',
            data_type: 'categories',
            data: JSON.stringify(ROWS),
        });
        expect(result).toEqual({
            success: true,
            data: {
                datapackName: 'justrite',
                version: 'v1',
                target: 'library',
                pack: 'created',
                stored: ['categories'],
                failed: [],
            },
        });
    });

    it('loads a file the panel opened through its dialog, wherever it lives', async () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'datapack-outside-'));
        const file = path.join(outside, 'pack.zip');
        fs.copyFileSync(packFile(), file);
        mockOpen.mockResolvedValue([{ fsPath: file }]);
        const context = contextFor(null, true);
        await datapackZipHandlers['open-datapack-zip'](context, {});

        expect(await load(context, { path: file })).toMatchObject({ success: true });
    });

    it('refuses a path the panel did not open and that is outside the project', async () => {
        const result = await load(contextFor(createMockProject({ path: dir }), true), {
            path: '/etc/hosts',
        });

        expect(result.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an update into the Data Installer, before reading the file or calling anything', async () => {
        const result = await load(contextFor(createMockProject({ path: dir }), false), {
            path: packFile(),
            target: 'installer',
            update: true,
        });

        expect(result).toMatchObject({ success: false, error: INSTALLER_UPDATE_REFUSED });
        expect(mockAccess).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an existing pack without update, in words that say what to do', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 409,
            text: async () => '{"success":false}',
        });

        const result = await load(contextFor(createMockProject({ path: dir }), false), {
            path: packFile(),
        });

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('already exists'),
        });
        expect(sentRoutes()).toEqual(['create-datapack']);
    });

    it('is a failure when no type could be stored, carrying which and why', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: true, status: 201, text: async () => '{}' })
            .mockResolvedValueOnce({ ok: false, status: 413, text: async () => '' });

        const result = await load(contextFor(createMockProject({ path: dir }), false), {
            path: packFile(),
        });

        expect(result).toMatchObject({
            success: false,
            error: 'No data type could be stored.',
            data: {
                failed: [
                    {
                        dataType: 'categories',
                        reason: 'categories: too large to send in one request',
                    },
                ],
            },
        });
    });

    it('into the Data Installer, refuses until the pack name is sent back, then writes it', async () => {
        const context = contextFor(createMockProject({ path: dir }), false);
        const file = packFile();

        const refused = await load(context, {
            path: file,
            target: 'installer',
            confirmName: 'wrong',
        });
        expect(refused).toMatchObject({
            success: false,
            error: installerEchoRefusal('justrite'),
            data: { sharedCatalog: true },
        });
        expect(fetchMock).not.toHaveBeenCalled();

        const loaded = await load(context, {
            path: file,
            target: 'installer',
            confirmName: 'justrite',
        });
        expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'installer');
        expect(loaded).toMatchObject({
            success: true,
            data: { target: 'installer', pack: 'created' },
        });
    });
});

describe('delete-library-datapack', () => {
    const remove = datapackZipHandlers['delete-library-datapack'];

    it('deletes the caller pack from the LIBRARY, never asking for any other store', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => '{"success":true}',
        });

        const result = await remove(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
            confirm: true,
        });

        expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${STORE}/delete-datapack?datapack_name=justrite&version=v1`);
        expect(init.method).toBe('DELETE');
        expect(result).toEqual({
            success: true,
            data: { datapackName: 'justrite', version: 'v1', deleted: true },
        });
    });

    it('refuses without confirm:true, before calling anything', async () => {
        const result = await remove(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
        });

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('confirm:true'),
        });
        expect(mockAccess).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says plainly when the library holds no pack of the caller by that name', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => '{"success":false}',
        });

        const result = await remove(contextFor(null, false), {
            datapackName: 'theirs',
            version: 'v1',
            confirm: true,
        });

        expect(result).toMatchObject({
            success: false,
            error: 'The datapack library has no pack of yours named theirs@v1.',
        });
    });

    it('refuses without a name and version', async () => {
        expect(await remove(contextFor(null, false), { confirm: true })).toMatchObject({
            success: false,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
